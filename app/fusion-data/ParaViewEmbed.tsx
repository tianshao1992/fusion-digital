'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FusionShotRecord } from './fusionDataContract';
import { CaeFieldPreview } from './FusionDataCharts';

type ParaViewEmbedProps = {
  endpoint: string | null;
  shot: FusionShotRecord;
  selectedIndex: number;
  selectedTime: number;
  en: boolean;
};

type ViewerState = 'disconnected' | 'connecting' | 'ready';

export default function ParaViewEmbed({ endpoint, shot, selectedIndex, selectedTime, en }: ParaViewEmbedProps) {
  const [mode, setMode] = useState<'preview' | 'trame'>('preview');
  const [viewerState, setViewerState] = useState<ViewerState>(endpoint ? 'connecting' : 'disconnected');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const artifact = shot.artifacts[0];
  const viewerOrigin = useMemo(() => endpoint ? new URL(endpoint).origin : null, [endpoint]);

  const postViewerContext = useCallback(() => {
    if (mode !== 'trame' || !iframeRef.current?.contentWindow || !viewerOrigin) return;
    iframeRef.current.contentWindow.postMessage({
      type: 'fusiondigital:set-context',
      version: 1,
      shot: { facility: shot.summary.facility, pulse: shot.summary.pulse, run: shot.summary.run },
      artifactId: artifact.id,
      timestep: selectedIndex,
      time: selectedTime,
      field: 'von_mises_stress',
    }, viewerOrigin);
  }, [artifact.id, mode, selectedIndex, selectedTime, shot.summary.facility, shot.summary.pulse, shot.summary.run, viewerOrigin]);

  useEffect(() => {
    if (!viewerOrigin) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== viewerOrigin || event.source !== iframeRef.current?.contentWindow || !event.data || typeof event.data !== 'object') return;
      const message = event.data as { type?: string };
      if (message.type === 'fusiondigital:viewer-ready') {
        setViewerState('ready');
        postViewerContext();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [postViewerContext, viewerOrigin]);

  useEffect(() => {
    postViewerContext();
  }, [postViewerContext]);

  return <article className="fusionPanel fusionCaePanel">
    <div className="fusionPanelHeading"><div><span>06</span><h2>CAE / ParaView</h2></div><small>{mode === 'preview' ? 'ECharts fixture' : `trame · ${viewerState}`}</small></div>
    <div className="fusionViewerToolbar" role="group" aria-label={en ? 'CAE viewer mode' : 'CAE 查看模式'}>
      <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>{en ? 'Synthetic field' : '合成场预览'}</button>
      <button type="button" aria-pressed={mode === 'trame'} onClick={() => setMode('trame')}>ParaView / trame</button>
      <span>von_mises_stress · MPa</span>
    </div>
    {mode === 'preview' ? <CaeFieldPreview shot={shot} selectedIndex={selectedIndex} en={en} /> : endpoint ? <div className="fusionTrameFrame">
      <iframe
        ref={iframeRef}
        src={endpoint}
        title={en ? 'Trusted ParaView trame result viewer' : '可信 ParaView trame 结果查看器'}
        sandbox="allow-downloads allow-forms allow-pointer-lock allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        allow="fullscreen"
        allowFullScreen
        onLoad={() => { setViewerState('connecting'); postViewerContext(); }}
      />
      <div><span className={`fusionViewerState fusionViewerState--${viewerState}`} />{viewerState === 'ready' ? (en ? 'Viewer handshake ready' : '查看器握手就绪') : (en ? 'Waiting for the trusted viewer handshake' : '等待可信查看器握手')}</div>
    </div> : <div className="fusionViewerDisconnected">
      <b>PARAVIEW / TRAME · DISCONNECTED</b>
      <h3>{en ? 'A trusted rendering endpoint has not been configured' : '尚未配置可信渲染端点'}</h3>
      <p>{en ? 'Set NEXT_PUBLIC_PARAVIEW_TRAME_URL at build time. The page never accepts an arbitrary viewer URL or exposes MDSplus credentials.' : '构建时设置 NEXT_PUBLIC_PARAVIEW_TRAME_URL。页面不接受任意查看器 URL，也不会向浏览器暴露 MDSplus 凭据。'}</p>
      <code>IMAS → IMAS-ParaView → ParaView/trame → read-only embed</code>
    </div>}
    <footer><div><span>{en ? 'ARTIFACT' : '数据产品'}</span><b>{artifact.id}</b></div><div><span>{en ? 'FORMAT' : '格式'}</span><b>{artifact.format}</b></div><div><span>{en ? 'VERSION' : '版本'}</span><b>{artifact.version}</b></div><div><span>{en ? 'TIMESTEP' : '时间步'}</span><b>{selectedIndex} / {artifact.timeSteps - 1}</b></div></footer>
  </article>;
}
