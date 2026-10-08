'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { buildFieldMesh, controlIllustration, schematicPerturbation, torusVertex } from './architecture-visual-data';
import './architecture-visuals.css';

function useDiagramMotion(root: RefObject<HTMLElement | null>) {
  const [paused, setPaused] = useState(false);
  const [active, setActive] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = false;
    const sync = () => { setReduced(media.matches); setActive(inView && !document.hidden); };
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { threshold: .15 });
    if (root.current) observer.observe(root.current);
    media.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => { observer.disconnect(); media.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, [root]);
  return { paused, reduced, running: active && !paused && !reduced, toggle: () => setPaused(p => !p) };
}

function RsiEvolution({ en }: { en: boolean }) {
  const arrow = useId();
  return <svg className="ssArchitectureSvg ssRsiSvg" viewBox="0 0 360 246" role="img" aria-label={en ? 'Recursive self-improvement: an agent modifies its own tools and workflow, evaluates candidates, and carries validated updates into the next iteration.' : '递归自我改进：智能体修改自身工具和工作流，评估候选版本，将通过验证的更新带入下一轮。'}>
    <defs><marker id={arrow} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L8 4L0 8" fill="var(--color-info-strong)"/></marker></defs>
    <text className="ssVisualEyebrow" x="10" y="19">RSI / {en ? 'RECURSIVE SELF-IMPROVEMENT' : '递归自我改进'}</text>
    <g className="ssRsiEdges" markerEnd={`url(#${arrow})`}>
      <path d="M58 89V57Q58 49 68 49H126"/><path d="M230 49H290Q302 49 302 61V86"/>
      <path d="M302 131V158Q302 170 290 170H233"/><path d="M126 170H69Q58 170 58 158V134"/>
    </g>
    <path className="ssRsiRecursion" d="M58 90V57Q58 49 68 49H292Q302 49 302 60V158Q302 170 290 170H70Q58 170 58 158V134" pathLength="100"/>
    <rect className="ssRsiNode ssRsiAgent" x="9" y="90" width="99" height="42" rx="5"/>
    <text className="ssRsiAgentText" x="59" y="117" textAnchor="middle">Agent Aₙ</text>
    <rect className="ssRsiNode" x="128" y="28" width="103" height="42" rx="5"/>
    <text className="ssVisualLabel" x="179" y="46" textAnchor="middle">{en ? 'Self-modify' : '改写自身'}</text>
    <text className="ssVisualSmall" x="179" y="62" textAnchor="middle">{en ? 'Tools · workflow' : '工具 · 工作流'}</text>
    <rect className="ssRsiNode" x="251" y="90" width="101" height="42" rx="5"/>
    <text className="ssVisualLabel" x="302" y="116" textAnchor="middle">{en ? 'Evaluate' : '独立评测'}</text>
    <rect className="ssRsiNode" x="128" y="149" width="103" height="42" rx="5"/>
    <text className="ssVisualLabel" x="179" y="166" textAnchor="middle">{en ? 'Select & update' : '择优更新'}</text>
    <text className="ssVisualSmall" x="179" y="183" textAnchor="middle">Aₙ → Aₙ₊₁</text>
    <path className="ssRsiRetain" d="M249 111H113" markerEnd={`url(#${arrow})`}/>
    <text className="ssVisualSmall" x="180" y="102" textAnchor="middle">{en ? 'Retain if rejected' : '未通过，保留原版本'}</text>
    <path className="ssRsiArchive" d="M58 209V227H303M179 193V227"/>
    <g className="ssGeneration"><circle cx="83" cy="227" r="4"/><circle cx="180" cy="227" r="4"/><circle cx="280" cy="227" r="4"/></g>
    <text className="ssVisualSmall" x="83" y="216" textAnchor="middle">A₀</text><text className="ssVisualSmall" x="280" y="216" textAnchor="middle">A₁ · A₂ · …</text>
  </svg>;
}

const fieldMesh = buildFieldMesh();
function MhdEvolution({ en, running }: { en: boolean; running: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const phase = useRef(0);
  useEffect(() => {
    const node = canvas.current;
    const ctx = node?.getContext('2d');
    if (!node || !ctx) return;
    let request = 0, last = 0;
    const rgb = (hex: string) => { const s = hex.trim().replace('#', ''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); };
    let base: number[], positive: number[], negative: number[];
    const palette = () => {
      const styles = getComputedStyle(node);
      base = rgb(styles.getPropertyValue('--color-surface'));
      positive = rgb(styles.getPropertyValue('--color-accent-strong'));
      negative = rgb(styles.getPropertyValue('--color-info-strong'));
    };
    const draw = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      if (node.width !== 720 * scale) { node.width = 720 * scale; node.height = 420 * scale; }
      ctx.setTransform(scale * 2, 0, 0, scale * 2, 0, 0);
      ctx.clearRect(0, 0, 360, 210);
      for (const cell of fieldMesh) {
        const value = schematicPerturbation(cell.rho, cell.theta, cell.phi, phase.current);
        const mix = Math.min(.95, Math.abs(value) * 1.6 + .12);
        const color = value >= 0 ? positive : negative;
        ctx.fillStyle = `rgb(${base.map((v, i) => Math.round(v + (color[i] - v) * mix)).join(',')})`;
        ctx.beginPath(); cell.vertices.forEach((v, i) => i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)); ctx.closePath(); ctx.fill();
        if (!cell.cap) { ctx.strokeStyle = 'rgba(120,140,126,.18)'; ctx.lineWidth = .35; ctx.stroke(); }
      }
    };
    const repaint = () => { palette(); draw(); };
    const frame = (time: number) => {
      if (time - last >= 80) { phase.current += Math.min((time - (last || time)) / 1000, .15) * .85; last = time; draw(); }
      request = requestAnimationFrame(frame);
    };
    repaint();
    const theme = new MutationObserver(repaint);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', repaint);
    if (running) request = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(request); theme.disconnect(); media.removeEventListener('change', repaint); };
  }, [running]);
  return <div className="ssMhdVisual" role="img" aria-label={en ? 'Toroidal cross-sections show an illustrative evolving pressure perturbation. Analytic animation, not an MHD solution or a solver latency benchmark.' : '环形截面展示压力扰动随时间演化。解析动画示意，并非 MHD 求解结果或求解器时延测试。'}>
    <div className="ssMhdTitle"><span>{en ? 'MHD / FIELD EVOLUTION' : 'MHD / 磁流体场演化'}</span><span>tₙ → tₙ₊₁</span></div>
    <div className="ssMhdCanvas">
      <svg viewBox="0 0 360 210" aria-hidden="true">{[.83, 1.1, 1.4, 1.7, 2.17].map(p => <path key={p} d={Array.from({ length: 65 }, (_, i) => { const v = torusVertex(1, i / 64 * Math.PI * 2, p * Math.PI); return `${i ? 'L' : 'M'}${v.x.toFixed(2)},${v.y.toFixed(2)}`; }).join(' ')} fill="none" stroke="var(--color-info)" strokeWidth=".6"/>)}</svg>
      <canvas ref={canvas} width="720" height="420" aria-hidden="true"/>
    </div>
    <div className="ssFieldLegend"><span>−</span><i/><span>+</span><span>{en ? 'Normalized δp*' : '归一化 δp*'}</span></div>
    <div className="ssMhdSteps"><span>{en ? 'MHD solver' : '高保真 MHD'}</span><b>→</b><span>{en ? 'Surrogate' : '校准代理模型'}</span><b>→</b><span>{en ? 'Online inference' : '在线推演'}</span></div>
  </div>;
}

function ControlTracking({ en }: { en: boolean }) {
  const heat = useId();
  const line = (key: 'target' | 'response' | 'error') => controlIllustration.map((point, i) => `${i ? 'L' : 'M'}${(143 + point.t * 205).toFixed(2)},${(key === 'error' ? 188 - point.error * 58 : 123 - point[key] * 87).toFixed(2)}`).join(' ');
  const shape = 'M52 41C20 35 17 91 24 126C29 146 51 157 58 181C66 158 106 136 108 98C110 69 76 44 52 41Z';
  return <svg className="ssArchitectureSvg ssControlSvg" viewBox="0 0 360 246" role="img" aria-label={en ? 'Synthetic shape and control response: dashed reference, solid response, and normalized tracking error. Not an experimental trace.' : '位形与控制响应示意：虚线目标、实线响应，以及归一化跟踪误差。不是实验波形。'}>
    <defs><radialGradient id={heat}><stop stopColor="var(--color-accent)" stopOpacity=".85"/><stop offset=".7" stopColor="var(--color-accent)" stopOpacity=".22"/><stop offset="1" stopColor="var(--color-accent)" stopOpacity="0"/></radialGradient></defs>
    <text className="ssVisualEyebrow" x="10" y="19">{en ? 'SHAPE & TRACKING' : '位形与跟踪控制'}</text>
    <path d={shape} fill={`url(#${heat})`} stroke="var(--color-info-strong)" strokeWidth="1.8" strokeDasharray="5 4"/>
    <path d="M54 43C23 36 19 92 26 126C31 145 53 158 59 180C68 157 104 135 106 99C108 70 77 45 54 43Z" fill="none" stroke="var(--color-accent-strong)" strokeWidth="1.7"/>
    <path className="ssTrackingAxis" d="M136 40V137H350M136 158V215H350"/>
    <text className="ssVisualSmall" x="144" y="38">{en ? 'Normalized response' : '归一化响应'}</text>
    <path className="ssTrackingTarget" d={line('target')}/>
    <g className="ssControlTrace"><path className="ssTrackingResponse" d={line('response')}/></g>
    <rect x="137" y="182" width="213" height="12" fill="var(--color-info)" opacity=".15"/>
    <path className="ssTrackingTarget" d="M137 188H350"/>
    <g className="ssControlTrace"><path className="ssTrackingResponse" d={line('error')}/></g>
    <text className="ssVisualSmall" x="143" y="168">e(t)</text><text className="ssVisualSmall" x="344" y="232">t</text>
    <path className="ssTrackingTarget" d="M12 221H30"/><text className="ssVisualSmall" x="35" y="225">{en ? 'Target' : '目标'}</text>
    <path className="ssTrackingResponse" d="M12 238H30"/><text className="ssVisualSmall" x="35" y="242">{en ? 'Response' : '响应'}</text>
  </svg>;
}

export function LayerDiagram({ layer, en }: { layer: 'agent' | 'twin' | 'control'; en: boolean }) {
  const root = useRef<HTMLElement>(null);
  const { paused, reduced, running, toggle } = useDiagramMotion(root);
  const labels = { agent: ['RSI 演化', 'RSI evolution'], twin: ['MHD 场演化', 'MHD field evolution'], control: ['控制响应', 'Control response'] };
  const notes = { agent: ['递归进化范式示意', 'Recursive improvement concept'], twin: ['解析场示意 · 非求解结果', 'Analytic illustration · not solver output'], control: ['合成响应 · 非实验波形', 'Synthetic response · not an experiment'] };
  return <figure className="ssLayerVisual" ref={root} data-layer={layer} data-running={running}>
    {layer === 'agent' ? <RsiEvolution en={en}/> : layer === 'twin' ? <MhdEvolution en={en} running={running}/> : <ControlTracking en={en}/>}
    <figcaption><span>{notes[layer][en ? 1 : 0]}</span><button type="button" disabled={reduced} aria-pressed={paused} aria-label={`${paused ? (en ? 'Play' : '播放') : (en ? 'Pause' : '暂停')} ${labels[layer][en ? 1 : 0]}`} onClick={toggle}>{reduced ? (en ? 'Still' : '静态') : paused ? (en ? 'Play' : '播放') : (en ? 'Pause' : '暂停')}</button></figcaption>
  </figure>;
}
