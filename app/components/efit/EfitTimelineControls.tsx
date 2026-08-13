'use client';

import type { EfitStore, EfitStoreSnapshot } from './store';

type EfitTimelineControlsProps = {
  store: EfitStore;
  snapshot: EfitStoreSnapshot;
};

const SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

function formatTime(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(3)} s`;
}
export default function EfitTimelineControls({ store, snapshot }: EfitTimelineControlsProps) {
  const { actions } = store;
  const first = snapshot.timeline[0];
  const last = snapshot.timeline.at(-1);
  const disabled = snapshot.timeline.length === 0;

  return (
    <div className="efitTransport" aria-label="EFIT 位形播放控制">
      <div className="efitTransportTopline">
        <div className="efitTransportButtons">
          <button
            type="button"
            className="efitIconButton"
            onClick={() => void actions.step(-1)}
            disabled={disabled}
            aria-label="上一帧"
            title="上一帧（←）"
          >
            <span aria-hidden="true">|‹</span>
          </button>
          <button
            type="button"
            className="efitPlayButton"
            onClick={actions.togglePlayback}
            disabled={disabled}
            aria-label={snapshot.isPlaying ? '暂停 EFIT 动画' : '播放 EFIT 动画'}
            aria-pressed={snapshot.isPlaying}
          >
            <span aria-hidden="true">{snapshot.isPlaying ? 'Ⅱ' : '▶'}</span>
            {snapshot.isPlaying ? '暂停' : '播放'}
          </button>
          <button
            type="button"
            className="efitIconButton"
            onClick={() => void actions.step(1)}
            disabled={disabled}
            aria-label="下一帧"
            title="下一帧（→）"
          >
            <span aria-hidden="true">›|</span>
          </button>
        </div>

        <output className="efitTimeReadout" aria-live="off">
          <strong>{formatTime(snapshot.currentTimeMs)}</strong>
          <span>{snapshot.currentFrameIndex >= 0 ? snapshot.currentFrameIndex + 1 : 0} / {snapshot.timeline.length}</span>
        </output>
      </div>

      <label className="efitScrubber">
        <span className="srOnly">EFIT 真实时间</span>
        <input
          type="range"
          min={first?.timeMs ?? 0}
          max={last?.timeMs ?? 1}
          step={1}
          value={snapshot.currentTimeMs}
          disabled={disabled}
          onChange={(event) => void actions.seekTimeMs(Number(event.currentTarget.value))}
          aria-valuetext={formatTime(snapshot.currentTimeMs)}
        />
        <span className="efitScrubberLabels" aria-hidden="true">
          <span>{formatTime(first?.timeMs ?? 0)}</span>
          <span>真实 EFIT 时间轴</span>
          <span>{formatTime(last?.timeMs ?? 0)}</span>
        </span>
      </label>

      <div className="efitTransportSettings">
        <label>
          <span>速度</span>
          <select value={snapshot.playbackRate} onChange={(event) => actions.setPlaybackRate(Number(event.currentTarget.value))}>
            {SPEEDS.map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
          </select>
        </label>
        <label className="efitLoopToggle">
          <input type="checkbox" checked={snapshot.loop} onChange={(event) => actions.setLoop(event.currentTarget.checked)} />
          <span>循环播放</span>
        </label>
        <span className="efitKeyboardHint">空格 播放/暂停 · ← → 逐帧</span>
      </div>
    </div>
  );
}
