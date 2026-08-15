'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n, type MessageKey } from '../i18n';

type TurntableFrame = { src: string; azimuthDeg: number };
type TurntableControl = {
  type: 'appearance' | 'section' | 'detail';
  axis?: 'x' | 'y' | 'z';
};
type TurntableMode = {
  id: string;
  label: string;
  description: string;
  poster?: string;
  width?: number;
  height?: number;
  frames: TurntableFrame[];
  controls: TurntableControl;
};
type TurntableManifest = {
  schemaVersion: string;
  defaultMode: string;
  modes: TurntableMode[];
};

function safeImagePath(value: unknown) {
  return typeof value === 'string'
    && value.startsWith('/models/exl50u-secure-preview/')
    && /\.webp$/i.test(value)
    && !value.includes('..')
    && !value.includes('%')
    && !value.includes('//')
    && !/^[a-z]+:/i.test(value);
}

function finiteNumber(value: unknown, fallback?: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseFrames(value: unknown, path: string) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 36) throw new Error(`${path} frames are unavailable`);
  return value.map((frame, index) => {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new Error(`${path}.frames[${index}] is invalid`);
    const candidate = frame as Record<string, unknown>;
    const angle = finiteNumber(candidate.azimuthDeg);
    if (!safeImagePath(candidate.src) || angle === undefined || angle < 0 || angle >= 360) {
      throw new Error(`${path}.frames[${index}] metadata is invalid`);
    }
    return { src: candidate.src as string, azimuthDeg: angle };
  });
}

function parseTurntableManifest(value: unknown): TurntableManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid turntable manifest');
  const item = value as Record<string, unknown>;
  if (typeof item.schemaVersion !== 'string') throw new Error('turntable schema is unavailable');

  const legacyFrames = Array.isArray(item.frames) ? parseFrames(item.frames, 'legacy') : null;
  const rawModes = Array.isArray(item.modes) ? item.modes : [];
  const ids = new Set<string>();
  const modes = rawModes.map((mode, index): TurntableMode => {
    if (!mode || typeof mode !== 'object' || Array.isArray(mode)) throw new Error(`modes[${index}] is invalid`);
    const candidate = mode as Record<string, unknown>;
    const controls = candidate.controls as Record<string, unknown> | undefined;
    const id = typeof candidate.id === 'string' ? candidate.id : '';
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id)) throw new Error(`modes[${index}].id is invalid`);
    ids.add(id);
    if (typeof candidate.label !== 'string' || typeof candidate.description !== 'string') throw new Error(`${id} copy is invalid`);
    if (!controls || !['appearance', 'section', 'detail'].includes(String(controls.type))) throw new Error(`${id} controls are invalid`);
    const type = controls.type as TurntableControl['type'];
    const axis = controls.axis;
    if (type === 'section' && !['x', 'y', 'z'].includes(String(axis))) throw new Error(`${id} section axis is invalid`);
    return {
      id,
      label: candidate.label,
      description: candidate.description,
      poster: safeImagePath(candidate.poster) ? candidate.poster as string : undefined,
      width: finiteNumber(candidate.width),
      height: finiteNumber(candidate.height),
      frames: parseFrames(candidate.frames, id),
      controls: { type, axis: type === 'section' ? axis as 'x' | 'y' | 'z' : undefined },
    };
  });

  // Schema 1.0 packages remain readable while schema 1.1 adds safe preset views.
  if (modes.length === 0 && legacyFrames) {
    modes.push({
      id: 'exterior',
      label: '完整外观',
      description: '完整装置的受控 360° 外观转台。',
      poster: safeImagePath(item.poster) ? item.poster as string : undefined,
      width: finiteNumber(item.width),
      height: finiteNumber(item.height),
      frames: legacyFrames,
      controls: { type: 'appearance' },
    });
  }
  if (modes.length === 0 || modes.length > 12) throw new Error('turntable modes are unavailable');
  const requestedDefault = typeof item.defaultMode === 'string' ? item.defaultMode : modes[0].id;
  return {
    schemaVersion: item.schemaVersion,
    defaultMode: ids.has(requestedDefault) || modes.some((mode) => mode.id === requestedDefault) ? requestedDefault : modes[0].id,
    modes,
  };
}

function nearestFrameIndex(frames: TurntableFrame[], azimuthDeg: number) {
  return frames.reduce((best, frame, index) => {
    const distance = Math.abs(((frame.azimuthDeg - azimuthDeg + 540) % 360) - 180);
    const bestDistance = Math.abs(((frames[best].azimuthDeg - azimuthDeg + 540) % 360) - 180);
    return distance < bestDistance ? index : best;
  }, 0);
}

const GROUP_LABEL_KEYS: Record<TurntableControl['type'], MessageKey> = {
  appearance: 'turntable.appearance',
  section: 'turntable.section',
  detail: 'turntable.detail',
};

export default function TurntableDeviceViewer({ title, manifestEndpoint }: { title: string; manifestEndpoint: string }) {
  const { content, t } = useI18n();
  const [manifest, setManifest] = useState<TurntableManifest | null>(null);
  const [modeId, setModeId] = useState('');
  const [frameIndex, setFrameIndex] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'pending'>('loading');
  const dragRef = useRef<{ x: number; index: number } | null>(null);
  const mode = useMemo(() => manifest?.modes.find((candidate) => candidate.id === modeId) ?? manifest?.modes[0] ?? null, [manifest, modeId]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(manifestEndpoint, { cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('preview package not ready');
        return response.json();
      })
      .then((data) => {
        const parsed = parseTurntableManifest(data);
        setManifest(parsed);
        setModeId(parsed.defaultMode);
        setFrameIndex(0);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== 'AbortError') setStatus('pending');
      });
    return () => controller.abort();
  }, [manifestEndpoint]);

  const selectFrame = useCallback((next: number) => {
    if (!mode) return;
    setFrameIndex((next + mode.frames.length) % mode.frames.length);
  }, [mode]);

  const selectMode = useCallback((nextMode: TurntableMode) => {
    const currentAzimuth = mode?.frames[frameIndex]?.azimuthDeg ?? 0;
    setModeId(nextMode.id);
    setFrameIndex(nearestFrameIndex(nextMode.frames, currentAzimuth));
  }, [frameIndex, mode]);

  useEffect(() => {
    if (!mode || mode.frames.length < 2) return;
    const next = new Image();
    next.referrerPolicy = 'no-referrer';
    next.src = mode.frames[(frameIndex + 1) % mode.frames.length].src;
  }, [frameIndex, mode]);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!mode || !dragRef.current || mode.frames.length < 2) return;
    const delta = Math.round((event.clientX - dragRef.current.x) / 12);
    selectFrame(dragRef.current.index - delta);
  };

  if (status !== 'ready' || !manifest || !mode) return <div className="turntablePending" role="status">
    <div className="deviceLockGlyph" aria-hidden="true"><i /><i /><i /></div>
    <p>SECURE TURNTABLE PREVIEW</p>
    <h3>{status === 'loading' ? t('turntable.loading') : t('turntable.pending', { title: content(title) })}</h3>
    <span>{t('turntable.pendingCopy')}</span>
  </div>;

  const frame = mode.frames[Math.min(frameIndex, mode.frames.length - 1)];
  const groupedModes = (['appearance', 'section', 'detail'] as const)
    .map((type) => ({ type, modes: manifest.modes.filter((candidate) => candidate.controls.type === type) }))
    .filter((group) => group.modes.length > 0);
  const canRotate = mode.frames.length > 1;

  return <div
    className="turntableViewer"
    tabIndex={0}
    aria-label={t('turntable.aria', { title: content(title), mode: content(mode.label) })}
    onKeyDown={(event) => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); selectFrame(frameIndex - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); selectFrame(frameIndex + 1); }
    }}
    onContextMenu={(event) => event.preventDefault()}
    onPointerDown={(event) => {
      if (!canRotate || (event.target as HTMLElement).closest('button,input')) return;
      dragRef.current = { x: event.clientX, index: frameIndex };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={onPointerMove}
    onPointerUp={() => { dragRef.current = null; }}
    onPointerCancel={() => { dragRef.current = null; }}
  >
    <div className="turntableModeControls" aria-label={t('turntable.presets')}>
      {groupedModes.map((group) => <div className="turntableModeGroup" key={group.type}>
        <span>{t(GROUP_LABEL_KEYS[group.type])}</span>
        <div>{group.modes.map((candidate) => <button
          type="button"
          key={candidate.id}
          className={candidate.id === mode.id ? 'active' : ''}
          aria-pressed={candidate.id === mode.id}
          title={content(candidate.description)}
          onClick={() => selectMode(candidate)}
        >{content(candidate.label)}</button>)}</div>
      </div>)}
    </div>
    <div className="turntableCanvas">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frame.src} alt={t('turntable.alt', { title: content(title), mode: content(mode.label), angle: Math.round(frame.azimuthDeg) })} draggable={false} referrerPolicy="no-referrer" />
      <div className="turntableHud"><span>{mode.controls.type === 'section' ? `SECTION ${mode.controls.axis?.toUpperCase()}` : mode.controls.type.toUpperCase()}</span><b>{Math.round(frame.azimuthDeg).toString().padStart(3, '0')}°</b></div>
      <div className="turntableModeReadout" aria-live="polite"><b>{content(mode.label)}</b><span>{content(mode.description)}</span></div>
    </div>
    {canRotate ? <div className="turntableControls">
      <button type="button" onClick={() => selectFrame(frameIndex - 1)} aria-label={t('turntable.left')}>←</button>
      <label><span>{t('turntable.angleHint', { count: mode.frames.length })}</span><input type="range" min="0" max={mode.frames.length - 1} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} /></label>
      <button type="button" onClick={() => selectFrame(frameIndex + 1)} aria-label={t('turntable.right')}>→</button>
    </div> : <div className="turntableDetailHint"><span>DETAIL PRESET</span><b>{t('turntable.detailHint')}</b></div>}
    <p className="turntableNotice">PREVIEW ONLY · PRE-RENDERED TRANSPARENCY / SECTION VIEWS · NO SOURCE CAD OR ENGINEERING MESH DELIVERY</p>
  </div>;
}
