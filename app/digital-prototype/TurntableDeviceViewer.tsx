'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type TurntableFrame = { src: string; azimuthDeg: number };
type TurntableManifest = {
  schemaVersion: string;
  poster?: string;
  width?: number;
  height?: number;
  frames: TurntableFrame[];
};

function safeImagePath(value: unknown) {
  return typeof value === 'string'
    && value.startsWith('/models/')
    && !value.includes('..')
    && !/^[a-z]+:/i.test(value);
}

function parseTurntableManifest(value: unknown): TurntableManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid turntable manifest');
  const item = value as Record<string, unknown>;
  if (typeof item.schemaVersion !== 'string' || !Array.isArray(item.frames) || item.frames.length < 2) throw new Error('turntable frames are unavailable');
  const frames = item.frames.map((frame) => {
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new Error('invalid turntable frame');
    const candidate = frame as Record<string, unknown>;
    if (!safeImagePath(candidate.src) || typeof candidate.azimuthDeg !== 'number') throw new Error('invalid turntable frame metadata');
    return { src: candidate.src as string, azimuthDeg: candidate.azimuthDeg };
  });
  return {
    schemaVersion: item.schemaVersion,
    poster: safeImagePath(item.poster) ? item.poster as string : undefined,
    width: typeof item.width === 'number' ? item.width : undefined,
    height: typeof item.height === 'number' ? item.height : undefined,
    frames,
  };
}

export default function TurntableDeviceViewer({ title, manifestEndpoint }: { title: string; manifestEndpoint: string }) {
  const [manifest, setManifest] = useState<TurntableManifest | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'pending'>('loading');
  const dragRef = useRef<{ x: number; index: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(manifestEndpoint, {
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    }).then((response) => {
      if (!response.ok) throw new Error('preview package not ready');
      return response.json();
    }).then((data) => {
      setManifest(parseTurntableManifest(data));
      setFrameIndex(0);
      setStatus('ready');
    }).catch((error: unknown) => {
      if ((error as { name?: string }).name !== 'AbortError') setStatus('pending');
    });
    return () => controller.abort();
  }, [manifestEndpoint]);

  const selectFrame = useCallback((next: number) => {
    if (!manifest) return;
    setFrameIndex((next + manifest.frames.length) % manifest.frames.length);
  }, [manifest]);

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!manifest || !dragRef.current) return;
    const delta = Math.round((event.clientX - dragRef.current.x) / 12);
    selectFrame(dragRef.current.index - delta);
  };

  if (status !== 'ready' || !manifest) return <div className="turntablePending" role="status">
    <div className="deviceLockGlyph" aria-hidden="true"><i /><i /><i /></div>
    <p>SECURE TURNTABLE PREVIEW</p>
    <h3>{status === 'loading' ? '正在读取受控预览清单' : `${title} 安全转台预览正在生成`}</h3>
    <span>这里只接收渲染帧，不下发源 CAD、STEP 或工程 GLB。预览包就绪后无需修改组件即可自动接入。</span>
  </div>;

  const frame = manifest.frames[frameIndex];
  return <div
    className="turntableViewer"
    onContextMenu={(event) => event.preventDefault()}
    onPointerDown={(event) => {
      dragRef.current = { x: event.clientX, index: frameIndex };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={onPointerMove}
    onPointerUp={() => { dragRef.current = null; }}
    onPointerCancel={() => { dragRef.current = null; }}
  >
    <div className="turntableCanvas">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={frame.src} alt={`${title} ${Math.round(frame.azimuthDeg)}° 三维转台预览`} draggable={false} referrerPolicy="no-referrer" />
      <div className="turntableHud"><span>AZIMUTH</span><b>{Math.round(frame.azimuthDeg).toString().padStart(3, '0')}°</b></div>
    </div>
    <div className="turntableControls">
      <button type="button" onClick={() => selectFrame(frameIndex - 1)} aria-label="向左旋转">←</button>
      <label><span>拖动或滑动查看 {manifest.frames.length} 个角度</span><input type="range" min="0" max={manifest.frames.length - 1} value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))} /></label>
      <button type="button" onClick={() => selectFrame(frameIndex + 1)} aria-label="向右旋转">→</button>
    </div>
    <p className="turntableNotice">PREVIEW ONLY · NO SOURCE CAD / ENGINEERING MESH DELIVERY</p>
  </div>;
}
