'use client';

import { useEffect, useRef, useState } from 'react';

/** Shared projection for the field geometry and conceptual emission volume. */
function plasmaPoint(phi: number, theta: number, radius: number) {
  const x = (172 + radius * Math.cos(theta)) * Math.cos(phi);
  const y = (172 + radius * Math.cos(theta)) * Math.sin(phi);
  const z = 1.35 * radius * Math.sin(theta);
  const yp = y * Math.cos(.83) - z * Math.sin(.83);
  return { x: 360 + x * Math.cos(-.25) - yp * Math.sin(-.25), y: 310 + x * Math.sin(-.25) + yp * Math.cos(-.25) };
}

/** Idealized helical field-line geometry on a toroidal surface, not particle tracing. */
export function fieldLinePath(phase: number, radius = 78) {
  const points = Array.from({ length: 421 }, (_, i) => {
    const phi = i / 420 * Math.PI * 6;
    const theta = phi / 1.618 + phase;
    const point = plasmaPoint(phi, theta, radius);
    return `${i ? 'L' : 'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  });
  return points.join(' ');
}

// Keep a few representative field lines legible instead of filling the volume with a wire cage.
const fieldLines = Array.from({ length: 7 }, (_, i) => fieldLinePath(i / 7 * Math.PI * 2));
const coreLines = Array.from({ length: 5 }, (_, i) => fieldLinePath(i / 5 * Math.PI * 2, 46));
const emissionRings = Array.from({ length: 9 }, (_, index) => Array.from({ length: 121 }, (_, i) => {
  const point = plasmaPoint(i / 120 * Math.PI * 2, index / 9 * Math.PI * 2, 31);
  return `${i ? 'L' : 'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
}).join(' ') + 'Z');
// Fixed, dispersed positions: visual emission cues, not traced reacting particles.
const reactionSites = Array.from({ length: 8 }, (_, i) => ({
  ...plasmaPoint(i / 8 * Math.PI * 2 + .16, i * 2.39996, 12 + i % 4 * 6),
  delay: `${-(i * 1.37).toFixed(2)}s`, duration: `${7.5 + i % 5 * .8}s`,
}));
const emissionGrains = Array.from({ length: 40 }, (_, i) => plasmaPoint(i * 2.39996, i * 1.718, 12 + i % 7 * 4));

export default function PlasmaTrajectories({ en }: { en: boolean }) {
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    let visible = false;
    const update = () => setActive(visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update(); }, { threshold: .1 });
    if (root.current) observer.observe(root.current);
    document.addEventListener('visibilitychange', update);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', update); };
  }, []);
  return <figure className="ssPlasma" ref={root} data-paused={paused} data-active={active}>
    <svg viewBox="0 0 720 620" role="img" aria-labelledby="plasma-title plasma-description">
      <title id="plasma-title">{en ? 'Toward burning plasma: confinement, fusion and energy deposition' : '迈向燃烧等离子体：约束、聚变与能量沉积'}</title>
      <desc id="plasma-description">{en ? 'Idealized helical field lines surround a luminous toroidal plasma. Dispersed bright regions and soft local halos suggest fusion energy release and deposited-product self-heating. All light, colors and motion are conceptual, not measured particle trajectories, reaction rates, temperatures or an achieved burning plasma.' : '理想化螺旋磁力线围绕发光的环形等离子体。分散亮区与局部柔和光晕示意聚变能量释放及产物沉积带来的自加热。亮度、颜色和动效均为概念表达，非实测粒子轨迹，不对应反应率、温度，也不表示已实现燃烧等离子体。'}</desc>
      <defs>
        <linearGradient id="plasma-line" x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--ss-field-line)"/><stop offset=".5" stopColor="var(--ss-field-highlight)"/><stop offset="1" stopColor="var(--ss-field-line)"/></linearGradient>
        <linearGradient id="plasma-heat" x1="0" y1="1" x2="1" y2="0"><stop stopColor="var(--ss-plasma-violet)"/><stop offset=".3" stopColor="var(--ss-plasma-magenta)"/><stop offset=".56" stopColor="var(--ss-plasma-rose)"/><stop offset=".78" stopColor="var(--ss-plasma-magenta)"/><stop offset="1" stopColor="var(--ss-plasma-violet)"/></linearGradient>
        <linearGradient id="plasma-hot-core" x1="0" y1="1" x2="1" y2="0"><stop stopColor="var(--ss-plasma-magenta)"/><stop offset=".35" stopColor="#ffb9ee"/><stop offset=".55" stopColor="var(--ss-plasma-core)"/><stop offset=".78" stopColor="#ffdbea"/><stop offset="1" stopColor="var(--ss-plasma-violet)"/></linearGradient>
        <radialGradient id="plasma-stage"><stop stopColor="#080b20" stopOpacity=".98"/><stop offset=".5" stopColor="#10132e" stopOpacity=".97"/><stop offset=".72" stopColor="#171b3c" stopOpacity=".82"/><stop offset=".9" stopColor="#242642" stopOpacity=".2"/><stop offset="1" stopColor="#242642" stopOpacity="0"/></radialGradient>
        <filter id="plasma-bloom" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="15"/></filter>
        <filter id="plasma-halo" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>
        <filter id="plasma-volume-soft" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
        <radialGradient id="plasma-reaction-glow"><stop stopColor="var(--ss-plasma-core)" stopOpacity=".95"/><stop offset=".23" stopColor="#ffdbea" stopOpacity=".72"/><stop offset=".58" stopColor="var(--ss-plasma-magenta)" stopOpacity=".3"/><stop offset="1" stopColor="var(--ss-plasma-violet)" stopOpacity="0"/></radialGradient>
      </defs>
      <ellipse className="ssPlasmaStage" cx="360" cy="310" rx="335" ry="285" fill="url(#plasma-stage)"/>
      <g className="ssPlasmaField" fill="none" stroke="url(#plasma-line)">{fieldLines.map((d, i) => <path key={i} d={d} opacity={.16 + i % 3 * .04} strokeWidth=".65" />)}</g>
      <g className="ssPlasmaBloom" fill="none" stroke="var(--ss-plasma-violet)" strokeWidth="15" filter="url(#plasma-bloom)" opacity=".42">{emissionRings.map((d, i) => <path key={i} d={d}/>)}</g>
      <g className="ssPlasmaVolume" fill="none" stroke="url(#plasma-heat)" strokeWidth="20" filter="url(#plasma-volume-soft)">{emissionRings.map((d, i) => <path key={i} d={d} opacity={.3 + i % 3 * .04}/>)}</g>
      <g className="ssPlasmaThermalCore" fill="none" stroke="url(#plasma-hot-core)" strokeWidth="5" filter="url(#plasma-halo)">{emissionRings.map((d, i) => <path key={i} d={d} opacity={.28 + i % 3 * .06}/>)}</g>
      <g className="ssPlasmaFilaments" fill="none" stroke="url(#plasma-hot-core)" strokeWidth="1.2">{emissionRings.filter((_, i) => i % 2 === 0).map((d, i) => <path key={i} d={d} opacity=".48"/>)}</g>
      <g className="ssPlasmaFieldGlow" fill="none" stroke="url(#plasma-line)" strokeWidth="1.8" filter="url(#plasma-halo)" opacity=".2">{coreLines.map((d, i) => <path key={i} d={d}/>)}</g>
      <g className="ssPlasmaFieldCore" fill="none" stroke="url(#plasma-line)" strokeWidth=".8" opacity=".46">{coreLines.map((d, i) => <path key={i} d={d}/>)}</g>
      <g className="ssPlasmaGrains" fill="var(--ss-plasma-core)">{emissionGrains.map((point, i) => <circle key={i} cx={point.x.toFixed(2)} cy={point.y.toFixed(2)} r={.45 + i % 3 * .28} opacity={.18 + i % 4 * .1}/>)}</g>
      <g className="ssPlasmaReactions">{reactionSites.map((point, i) => <g key={i} transform={`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`}>
        <circle className="ssReactionHalo" r="15" fill="url(#plasma-reaction-glow)" style={{ animationDelay: point.delay, animationDuration: point.duration }}/>
        <g className="ssReactionLight" style={{ animationDelay: point.delay, animationDuration: point.duration }}>
          <circle r="6" fill="var(--ss-plasma-core)" opacity=".65" filter="url(#plasma-halo)"/>
          <circle r={1.6 + i % 3 * .4} fill="var(--ss-plasma-core)"/>
        </g>
      </g>)}</g>
      <g fill="none" strokeLinecap="round" className="ssPlasmaMotion">{coreLines.map((d, i) => <path key={i} d={d} pathLength="1000" className="ssFlow" style={{ animationDelay: `${i * -1.7}s` }} />)}</g>
    </svg>
    <figcaption><span>{en ? 'FUSION REACTION CONCEPT · NOT MEASURED' : '聚变反应概念 · 非实测'}</span><button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? (en ? 'Play motion' : '播放动画') : (en ? 'Pause motion' : '暂停动画')}</button></figcaption>
  </figure>;
}
