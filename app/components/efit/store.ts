import type {
  EfitDataSource,
  EfitFrame,
  EfitFrameSummary,
  EfitGap,
  EfitManifest,
  EfitShotId,
} from './types';

export type EfitLoadStatus = 'idle' | 'loading-index' | 'loading-shot' | 'loading-frame' | 'ready' | 'error';

export type EfitStoreSnapshot = {
  manifest: EfitManifest | null;
  activeShot: EfitShotId | null;
  timeline: readonly EfitFrameSummary[];
  currentFrameIndex: number;
  currentTimeMs: number;
  currentFrame: EfitFrame | null;
  status: EfitLoadStatus;
  error: string | null;
  isPlaying: boolean;
  playbackRate: number;
  loop: boolean;
  gapNotice: EfitGap | null;
};

export type EfitStoreActions = {
  initialize(preferredShot?: EfitShotId): Promise<void>;
  selectShot(shot: EfitShotId): Promise<void>;
  seekTimeMs(timeMs: number): Promise<void>;
  seekFrame(frameIndex: number): Promise<void>;
  step(delta: number): Promise<void>;
  play(): void;
  pause(): void;
  togglePlayback(): void;
  setPlaybackRate(rate: number): void;
  setLoop(loop: boolean): void;
  clearError(): void;
};

export type EfitStore = {
  getSnapshot(): EfitStoreSnapshot;
  getServerSnapshot(): EfitStoreSnapshot;
  subscribe(listener: () => void): () => void;
  readonly actions: EfitStoreActions;
  readonly currentFrame: EfitFrame | null;
  destroy(): void;
};

type FrameReason = 'initial' | 'shot' | 'seek' | 'step' | 'playback';

export const EFIT_PLAYBACK_PRESENTATION_INTERVAL_MS = 1000 / 30;
export const EFIT_PLAYBACK_PREFETCH_STEPS = 4;

export type EfitPlaybackRuntime = {
  now(): number;
  schedule(callback: (timestamp: number) => void): unknown;
  cancel(handle: unknown): void;
};

const INITIAL_SNAPSHOT: EfitStoreSnapshot = Object.freeze({
  manifest: null,
  activeShot: null,
  timeline: Object.freeze([]) as readonly EfitFrameSummary[],
  currentFrameIndex: -1,
  currentTimeMs: 0,
  currentFrame: null,
  status: 'idle',
  error: null,
  isPlaying: false,
  playbackRate: 1,
  loop: true,
  gapNotice: null,
});

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'EFIT 数据加载失败。';
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  return Math.min(length - 1, Math.max(0, Math.trunc(index)));
}

function closestFrameIndex(timeline: readonly EfitFrameSummary[], timeMs: number): number {
  if (timeline.length === 0) return -1;
  if (timeMs <= timeline[0].timeMs) return 0;
  if (timeMs >= timeline[timeline.length - 1].timeMs) return timeline.length - 1;

  let low = 0;
  let high = timeline.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const value = timeline[middle].timeMs;
    if (value === timeMs) return middle;
    if (value < timeMs) low = middle + 1;
    else high = middle - 1;
  }
  const before = Math.max(0, high);
  const after = Math.min(timeline.length - 1, low);
  return timeMs - timeline[before].timeMs <= timeline[after].timeMs - timeMs ? before : after;
}

function frameAtOrBeforeIndex(timeline: readonly EfitFrameSummary[], timeMs: number): number {
  if (timeline.length === 0) return -1;
  if (timeMs <= timeline[0].timeMs) return 0;
  if (timeMs >= timeline[timeline.length - 1].timeMs) return timeline.length - 1;

  let low = 0;
  let high = timeline.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (timeline[middle].timeMs <= timeMs) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(0, high);
}

function crossedGap(
  gaps: readonly EfitGap[],
  fromTimeMs: number,
  toTimeMs: number,
  requestedTimeMs?: number,
): EfitGap | null {
  const low = Math.min(fromTimeMs, toTimeMs);
  const high = Math.max(fromTimeMs, toTimeMs);
  return gaps.find((gap) => {
    const requestInside = requestedTimeMs !== undefined && requestedTimeMs > gap.afterMs && requestedTimeMs < gap.beforeMs;
    const crossed = low <= gap.afterMs && high >= gap.beforeMs;
    const touchesBoundary = toTimeMs === gap.afterMs || toTimeMs === gap.beforeMs;
    return requestInside || crossed || touchesBoundary;
  }) ?? null;
}

function animationNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

const DEFAULT_PLAYBACK_RUNTIME: EfitPlaybackRuntime = {
  now: animationNow,
  schedule(callback) {
    if (typeof requestAnimationFrame === 'function') {
      return { kind: 'animation-frame', id: requestAnimationFrame(callback) };
    }
    return { kind: 'timeout', id: setTimeout(() => callback(animationNow()), 32) };
  },
  cancel(handle) {
    if (!handle || typeof handle !== 'object' || !('kind' in handle) || !('id' in handle)) return;
    if (handle.kind === 'animation-frame' && typeof handle.id === 'number' && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(handle.id);
      return;
    }
    if (handle.kind === 'timeout') clearTimeout(handle.id as ReturnType<typeof setTimeout>);
  },
};

export function createEfitStore(
  dataSource: EfitDataSource,
  playbackRuntime: EfitPlaybackRuntime = DEFAULT_PLAYBACK_RUNTIME,
): EfitStore {
  let snapshot = INITIAL_SNAPSHOT;
  const listeners = new Set<() => void>();
  let destroyed = false;
  let requestSequence = 0;
  let requestController: AbortController | null = null;
  let playbackHandle: unknown | null = null;
  let playbackAnchorClock = 0;
  let playbackAnchorTimeMs = 0;
  let playbackLastPresentationClock = 0;

  function emit(patch: Partial<EfitStoreSnapshot>): void {
    if (destroyed) return;
    snapshot = Object.freeze({ ...snapshot, ...patch });
    listeners.forEach((listener) => listener());
  }

  function activeShotManifest() {
    return snapshot.manifest?.shots.find((shot) => shot.shot === snapshot.activeShot) ?? null;
  }

  function cancelPlaybackFrame(): void {
    if (playbackHandle === null) return;
    playbackRuntime.cancel(playbackHandle);
    playbackHandle = null;
  }

  function schedulePlaybackFrame(callback: (timestamp: number) => void): void {
    playbackHandle = playbackRuntime.schedule(callback);
  }

  function wrappedPlaybackTime(timeMs: number, timeline: readonly EfitFrameSummary[]): number {
    if (timeline.length === 0) return timeMs;
    const minTime = timeline[0].timeMs;
    const maxTime = timeline[timeline.length - 1].timeMs;
    const duration = maxTime - minTime;
    if (timeMs <= maxTime || !snapshot.loop || duration <= 0) return Math.min(maxTime, Math.max(minTime, timeMs));
    return minTime + ((timeMs - minTime) % duration);
  }

  function prefetchPlaybackWindow(fromTimeMs: number): void {
    const shot = snapshot.activeShot;
    const timeline = snapshot.timeline;
    if (shot === null || timeline.length === 0 || !dataSource.prefetchFrame) return;
    const indices = new Set<number>();
    for (let step = 1; step <= EFIT_PLAYBACK_PREFETCH_STEPS; step += 1) {
      const futureTime = wrappedPlaybackTime(
        fromTimeMs + step * EFIT_PLAYBACK_PRESENTATION_INTERVAL_MS * snapshot.playbackRate,
        timeline,
      );
      indices.add(frameAtOrBeforeIndex(timeline, futureTime));
    }
    indices.delete(snapshot.currentFrameIndex);
    indices.forEach((index) => {
      if (index >= 0) dataSource.prefetchFrame?.(shot, index);
    });
  }

  async function commitFrame(frameIndex: number, reason: FrameReason, requestedTimeMs?: number): Promise<void> {
    const shot = snapshot.activeShot;
    const timeline = snapshot.timeline;
    const nextIndex = clampIndex(frameIndex, timeline.length);
    if (shot === null || nextIndex < 0) return;
    const summary = timeline[nextIndex];
    if (snapshot.currentFrame?.shot === shot && snapshot.currentFrame.index === nextIndex) {
      const gaps = activeShotManifest()?.gaps ?? [];
      emit({
        currentFrameIndex: nextIndex,
        currentTimeMs: summary.timeMs,
        gapNotice: crossedGap(gaps, snapshot.currentTimeMs, summary.timeMs, requestedTimeMs),
      });
      return;
    }

    const previousTime = snapshot.currentTimeMs;
    const sequence = ++requestSequence;
    requestController?.abort();
    requestController = new AbortController();
    emit({ status: 'loading-frame', error: null });

    try {
      const frame = await dataSource.loadFrame(shot, nextIndex, { signal: requestController.signal });
      if (destroyed || sequence !== requestSequence || snapshot.activeShot !== shot) return;
      const gaps = activeShotManifest()?.gaps ?? [];
      emit({
        currentFrame: frame,
        currentFrameIndex: nextIndex,
        currentTimeMs: frame.timeMs,
        status: 'ready',
        error: null,
        gapNotice: crossedGap(gaps, previousTime, frame.timeMs, requestedTimeMs),
      });
      if (reason === 'playback') {
        // Source timelines are commonly sampled at 1 kHz while a display can
        // present only tens of frames per second. Preserve wall-clock discharge
        // time and deterministically sample the latest published frame at the
        // fixed presentation cadence instead of stretching every source frame.
        prefetchPlaybackWindow(requestedTimeMs ?? frame.timeMs);
      } else {
        dataSource.prefetchFrame?.(shot, Math.min(timeline.length - 1, nextIndex + 1));
      }
    } catch (error) {
      if (destroyed || sequence !== requestSequence || isAbortError(error)) return;
      emit({ status: 'error', error: errorMessage(error), isPlaying: false });
      cancelPlaybackFrame();
    }
  }

  async function selectShot(shot: EfitShotId): Promise<void> {
    const manifest = snapshot.manifest;
    if (!manifest?.shots.some((candidate) => candidate.shot === shot)) {
      emit({ status: 'error', error: `索引中没有 EXL-50U #${shot}。`, isPlaying: false });
      return;
    }

    cancelPlaybackFrame();
    requestController?.abort();
    const sequence = ++requestSequence;
    requestController = new AbortController();
    emit({
      activeShot: shot,
      timeline: [],
      currentFrame: null,
      currentFrameIndex: -1,
      currentTimeMs: 0,
      status: 'loading-shot',
      error: null,
      isPlaying: false,
      gapNotice: null,
    });

    try {
      const timeline = await dataSource.loadTimeline(shot, { signal: requestController.signal });
      if (destroyed || sequence !== requestSequence || snapshot.activeShot !== shot) return;
      if (timeline.length === 0) throw new Error(`EXL-50U #${shot} 没有可播放的 EFIT 帧。`);
      emit({
        timeline,
        currentTimeMs: timeline[0].timeMs,
        status: 'loading-frame',
      });
      await commitFrame(0, 'shot');
    } catch (error) {
      if (destroyed || sequence !== requestSequence || isAbortError(error)) return;
      emit({ status: 'error', error: errorMessage(error), isPlaying: false });
    }
  }

  async function initialize(preferredShot?: EfitShotId): Promise<void> {
    if (snapshot.status !== 'idle' && snapshot.manifest) return;
    const sequence = ++requestSequence;
    requestController?.abort();
    requestController = new AbortController();
    emit({ status: 'loading-index', error: null });
    try {
      const manifest = await dataSource.loadManifest({ signal: requestController.signal });
      if (destroyed || sequence !== requestSequence) return;
      emit({ manifest, status: 'loading-shot' });
      const selected = preferredShot !== undefined && manifest.shots.some((shot) => shot.shot === preferredShot)
        ? preferredShot
        : manifest.shots[0].shot;
      await selectShot(selected);
    } catch (error) {
      if (destroyed || sequence !== requestSequence || isAbortError(error)) return;
      emit({ status: 'error', error: errorMessage(error), isPlaying: false });
    }
  }

  function playbackTick(timestamp: number): void {
    playbackHandle = null;
    if (destroyed || !snapshot.isPlaying || snapshot.timeline.length === 0) return;
    const timeline = snapshot.timeline;
    const minTime = timeline[0].timeMs;
    const maxTime = timeline[timeline.length - 1].timeMs;
    const duration = Math.max(0, maxTime - minTime);
    if (timestamp - playbackLastPresentationClock < EFIT_PLAYBACK_PRESENTATION_INTERVAL_MS) {
      schedulePlaybackFrame(playbackTick);
      return;
    }
    playbackLastPresentationClock = timestamp;
    let targetTime = playbackAnchorTimeMs + (timestamp - playbackAnchorClock) * snapshot.playbackRate;

    if (targetTime > maxTime) {
      if (!snapshot.loop || duration === 0) {
        void commitFrame(timeline.length - 1, 'playback');
        emit({ isPlaying: false });
        return;
      }
      targetTime = minTime + ((targetTime - minTime) % duration);
      playbackAnchorClock = timestamp;
      playbackAnchorTimeMs = targetTime;
    }

    // Hold the last published frame inside a declared time gap. Selecting the
    // nearest frame would show a future equilibrium before its source time.
    const nextIndex = frameAtOrBeforeIndex(timeline, targetTime);
    if (nextIndex !== snapshot.currentFrameIndex
      && snapshot.status !== 'loading-frame') {
      void commitFrame(nextIndex, 'playback', targetTime).finally(() => {
        if (!destroyed && snapshot.isPlaying && playbackHandle === null) schedulePlaybackFrame(playbackTick);
      });
      return;
    }
    schedulePlaybackFrame(playbackTick);
  }

  const actions: EfitStoreActions = {
    initialize,
    selectShot,
    async seekTimeMs(timeMs) {
      const index = closestFrameIndex(snapshot.timeline, timeMs);
      if (index < 0) return;
      await commitFrame(index, 'seek', timeMs);
      if (snapshot.isPlaying) {
        playbackAnchorClock = playbackRuntime.now();
        playbackAnchorTimeMs = snapshot.currentTimeMs;
        playbackLastPresentationClock = playbackAnchorClock;
      }
    },
    async seekFrame(frameIndex) {
      await commitFrame(frameIndex, 'seek');
      if (snapshot.isPlaying) {
        playbackAnchorClock = playbackRuntime.now();
        playbackAnchorTimeMs = snapshot.currentTimeMs;
        playbackLastPresentationClock = playbackAnchorClock;
      }
    },
    async step(delta) {
      if (snapshot.timeline.length === 0) return;
      actions.pause();
      let next = snapshot.currentFrameIndex + Math.trunc(delta);
      if (snapshot.loop) next = (next + snapshot.timeline.length) % snapshot.timeline.length;
      await commitFrame(clampIndex(next, snapshot.timeline.length), 'step');
    },
    play() {
      if (snapshot.isPlaying || snapshot.timeline.length === 0 || snapshot.status === 'error') return;
      const atEnd = snapshot.currentFrameIndex >= snapshot.timeline.length - 1;
      if (atEnd && snapshot.loop) void commitFrame(0, 'playback');
      playbackAnchorClock = playbackRuntime.now();
      playbackAnchorTimeMs = atEnd && snapshot.loop ? snapshot.timeline[0].timeMs : snapshot.currentTimeMs;
      playbackLastPresentationClock = playbackAnchorClock;
      emit({ isPlaying: true });
      prefetchPlaybackWindow(playbackAnchorTimeMs);
      schedulePlaybackFrame(playbackTick);
    },
    pause() {
      if (!snapshot.isPlaying) return;
      cancelPlaybackFrame();
      emit({ isPlaying: false });
    },
    togglePlayback() {
      if (snapshot.isPlaying) actions.pause();
      else actions.play();
    },
    setPlaybackRate(rate) {
      if (!Number.isFinite(rate) || rate <= 0) return;
      if (snapshot.isPlaying) {
        const now = playbackRuntime.now();
        playbackAnchorTimeMs += (now - playbackAnchorClock) * snapshot.playbackRate;
        playbackAnchorClock = now;
        playbackLastPresentationClock = now;
      }
      emit({ playbackRate: Math.min(16, Math.max(0.1, rate)) });
      if (snapshot.isPlaying) prefetchPlaybackWindow(playbackAnchorTimeMs);
    },
    setLoop(loop) {
      emit({ loop });
    },
    clearError() {
      if (snapshot.status === 'error') emit({ status: snapshot.currentFrame ? 'ready' : 'idle', error: null });
    },
  };

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => INITIAL_SNAPSHOT,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions,
    get currentFrame() {
      return snapshot.currentFrame;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelPlaybackFrame();
      requestController?.abort();
      listeners.clear();
    },
  };
}
