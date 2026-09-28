'use client';

import { useEffect, useRef, useState } from 'react';

const stages = [
  ['磁约束与加热', 'Confinement & heating'],
  ['燃烧等离子体', 'Burning plasma'],
  ['包层热量提取', 'Heat extraction'],
  ['热循环与发电', 'Power conversion'],
] as const;
const stageCopy = [
  ['磁场约束高温等离子体，外部加热把燃料带入聚变条件。', 'Magnetic fields confine the plasma while external heating brings the fuel toward fusion conditions.'],
  ['聚变释放能量，α 粒子在等离子体内沉积能量，形成自加热。', 'Fusion releases energy. Alpha particles deposit energy inside the plasma, sustaining self-heating.'],
  ['中子把能量传递给包层，冷却回路将热量带往换热器。', 'Neutrons transfer energy to the blanket; a coolant loop carries the heat to an exchanger.'],
  ['热循环驱动汽轮机与发电机，并扣除厂用电后向电网供能。', 'A thermal cycle drives a turbine and generator; electricity reaches the grid after plant loads.'],
] as const;

// Projected toroidal field-line geometry: an explanatory schematic, not a device reconstruction.
function fieldLine(phase: number, radius: number) {
  return Array.from({ length: 201 }, (_, index) => {
    const t = index / 200 * Math.PI * 2;
    const a = t * 3 + phase;
    const r = 118 + radius * Math.cos(a);
    const x = 262 + r * Math.cos(t);
    const y = 223 + r * Math.sin(t) * .48 + radius * Math.sin(a) * .82;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

export function FusionHero({ en }: { en: boolean }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const figure = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (figure.current) observer.observe(figure.current);
    return () => { media.removeEventListener('change', update); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (paused || reduced || !visible) return;
    const timer = window.setInterval(() => setStep(value => (value + 1) % 4), 3800);
    return () => window.clearInterval(timer);
  }, [paused, reduced, visible]);
  return <header className="fdHero" id="top">
    <div className="fdHeroCopy">
      <p className="fdEyebrow"><span className="fdSmallLine" /> INTELLIGENCE, GROUNDED IN PHYSICS</p>
      <h1>{en ? <>From AI research.<br />To <em>verifiable</em><br />fusion products.</> : <>让 AI4Fusion<br />从算法研发<br />走向<em>可验证产品。</em></>}</h1>
      <p className="fdLead">{en ? 'Connect data, models and experiments. Learn within constraints. Extend capability through validation. Evolve with every experiment.' : '连接数据、模型与实验。在约束内学习，在验证中拓展能力，在运行中持续进化。'}</p>
      <div className="fdActions"><a className="fdButton" href="#capabilities">{en ? 'Explore the platform' : '探索平台能力'} <span>↗</span></a><a className="fdTextLink" href="/control/exl50u">{en ? 'See it in operation' : '了解控制案例'} <span>↗</span></a></div>
      <a className="fdHeroFoot fdVisionLink" href="/vision"><span>{en ? 'Agents → Digital twins → Control' : '智能体 → 数字孪生 → 实时控制'}</span><span>{en ? 'Explore the three-layer vision ↗' : '了解三层技术体系 ↗'}</span></a>
    </div>
    <figure className="fdEnergyFigure" ref={figure} data-stage={step} data-running={!paused && !reduced && visible}>
      <div className="fdFigureTop"><span>01—04 / FUSION TO ENERGY</span>{reduced ? <span>{en ? 'Static view' : '静态展示'}</span> : <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? (en ? 'Play' : '播放') : (en ? 'Pause' : '暂停')} {paused ? '▷' : 'Ⅱ'}</button>}</div>
      <svg className="fdPlasma" viewBox="0 0 600 425" role="img" aria-label={en ? 'Conceptual magnetic-confinement fusion: alpha self-heating, neutron heat extraction, and a thermal power cycle.' : '磁约束聚变概念示意：α 粒子自加热、中子能量提取与热循环发电。'}>
        <defs>
          <linearGradient id="fd-plasma-gradient" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#302069" /><stop offset=".43" stopColor="#8d65dc" /><stop offset=".72" stopColor="#d690c0" /><stop offset="1" stopColor="#ee7f44" /></linearGradient>
          <radialGradient id="fd-plasma-halo"><stop stopColor="#bd91eb" stopOpacity=".22" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <marker id="fd-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="#9a94aa" /></marker>
        </defs>
        <circle cx="265" cy="220" r="195" fill="url(#fd-plasma-halo)" />
        <g className="fdDiagramGrid" fill="none" stroke="currentColor" strokeWidth=".6"><path d="M52 80H520M52 340H520M85 45V376M454 45V376" /><ellipse cx="262" cy="223" rx="202" ry="109" /><ellipse cx="262" cy="223" rx="180" ry="149" strokeDasharray="3 6" /><path d="M48 223H470M262 53V389" strokeDasharray="2 7" /></g>
        <g fill="none" stroke="url(#fd-plasma-gradient)">{Array.from({ length: 30 }, (_, i) => <path key={i} d={fieldLine(i / 30 * Math.PI * 2, 43)} strokeWidth={i % 5 === 0 ? 1.8 : .75} opacity={i % 5 === 0 ? .8 : .45} />)}</g>
        <path className="fdAlphaOrbit" d={fieldLine(0, 30)} fill="none" stroke="#f78d54" strokeWidth="3" strokeDasharray="3 140" strokeLinecap="round" />
        <g className="fdNeutrons" stroke="#ec9861" strokeWidth="1.5" fill="none"><path d="M371 192L447 136" /><path d="M389 238L464 258" /><path d="M356 271L405 324" /></g>
        <g fontFamily="Arial, sans-serif" fontSize="12" fill="currentColor"><text x="60" y="63">MAGNETIC CONFINEMENT</text><path d="M85 71L133 140" fill="none" stroke="#9a94aa" /><text x="221" y="216" fill="#9d4d9e">α</text><text x="204" y="239" fontSize="11">SELF-HEATING</text><text x="440" y="123">n</text><text x="413" y="348">BLANKET HEAT</text></g>
        <g transform="translate(482 173)" stroke="#9a94aa" fill="none"><rect width="67" height="67" rx="4" /><path d="M16 18L29 33L16 48M29 18L42 33L29 48M42 18L55 33L42 48" /></g>
        <g className="fdPowerFlow" fill="none" stroke="#9480b5" strokeWidth="1.5"><path d="M432 304H463V207H481" markerEnd="url(#fd-arrow)" /><path d="M516 241V311" markerEnd="url(#fd-arrow)" /><circle cx="516" cy="333" r="19" /><path d="M504 333Q510 320 516 333T528 333M535 333H572" /></g>
        <text x="489" y="372" fontSize="11" fill="currentColor">ELECTRICITY</text>
        <text x="478" y="159" fontSize="11" fill="currentColor">POWER CYCLE</text>
      </svg>
      <div className="fdEnergySteps" aria-label={en ? 'Fusion energy stages' : '聚变能量转化阶段'}>{stages.map((label, index) => <button type="button" key={label[1]} aria-pressed={step === index} onClick={() => { setStep(index); setPaused(true); }}><span>0{index + 1}</span>{label[en ? 1 : 0]}</button>)}</div>
      <p className="fdEnergyDescription">{stageCopy[step][en ? 1 : 0]}</p>
      <figcaption>{en ? 'CONCEPT / A future D–T thermal-cycle plant. Not EXL-50U operation or a claim of electricity generation.' : '概念示意 / 未来 D–T 热循环电站，不代表 EXL-50U 已实现燃烧等离子体或发电。'}</figcaption>
    </figure>
  </header>;
}


