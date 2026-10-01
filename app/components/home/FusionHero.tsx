'use client';

import { useEffect, useRef, useState } from 'react';

const stages = [
  ['约束与加热', 'Confine & heat'], ['聚变与自加热', 'Fusion & self-heating'],
  ['能量转换', 'Energy conversion'], ['电力输出', 'Electricity'],
] as const;
const descriptions = [
  ['磁场约束氢硼等离子体；外部加热、燃料供给与实时控制共同维持运行条件。', 'Magnetic fields confine proton–boron plasma. Heating, fuelling and real-time control sustain operating conditions.'],
  ['p + ¹¹B → 3α。聚变产物携带能量；沉积在等离子体内的能量参与自加热。燃烧等离子体是面向未来的研究目标。', 'p + ¹¹B → 3α. Fusion products carry energy; the deposited fraction contributes to self-heating. Burning plasma remains a future research goal.'],
  ['从等离子体到工程系统，研究能量提取与转换；图中不预设具体发电技术路线。', 'Energy extraction and conversion connect the plasma to engineering systems. This diagram does not prescribe a power-conversion technology.'],
  ['电力系统输出还需覆盖加热、磁体、冷却等厂用功耗；净发电需要独立的能量平衡验证。', 'Electricity output must also cover heating, magnets, cooling and other plant loads. Net generation requires a separately verified energy balance.'],
] as const;

/** Functional energy-flow diagram, not a reactor drawing or measured plasma. */
export function FusionHero({ en }: { en: boolean }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const figure = useRef<HTMLElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update(); media.addEventListener('change', update);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    if (figure.current) observer.observe(figure.current);
    return () => { media.removeEventListener('change', update); observer.disconnect(); };
  }, []);
  useEffect(() => {
    if (paused || reduced || !visible) return;
    const timer = window.setInterval(() => setStep(value => (value + 1) % stages.length), 4500);
    return () => window.clearInterval(timer);
  }, [paused, reduced, visible]);
  return <header className="fdHero" id="top">
    <div className="fdHeroCopy">
      <p className="fdEyebrow"><span className="fdSmallLine" /> AI4FUSION / FROM PHYSICS TO PRODUCTS</p>
      <h1>{en ? <>From AI research.<br />To <em>verifiable</em><br />fusion products.</> : <>让 AI4Fusion<br />从算法研发<br />走向<em>可验证产品。</em></>}</h1>
      <p className="fdLead">{en ? 'FusionEvolve plans. FusionDigital verifies. FusionControl operates. Together, data, models and experiments form a learning loop toward proton–boron fusion energy.' : 'FusionEvolve 规划，FusionDigital 验证，FusionControl 执行。让数据、模型与实验形成持续学习的闭环，面向氢硼聚变能源。'}</p>
      <div className="fdActions"><a className="fdButton" href="#architecture">{en ? 'Explore the architecture' : '了解三层技术体系'}</a><a className="fdTextLink" href="#exl50u-case">{en ? 'EXL-50U results' : '查看 EXL-50U 实验成效'}</a></div>
      <p className="fdHeroFoot">{en ? 'Learn within constraints. Validate before operation. Evolve with evidence.' : '在约束内学习 · 在验证中扩域 · 在运行中演化'}</p>
    </div>
    <figure className="fdEnergyFigure fdBoronFigure" ref={figure} data-stage={step} data-running={!paused && !reduced && visible}>
      <div className="fdFigureTop"><span>p–¹¹B / FUSION ENERGY</span>{reduced ? <span>{en ? 'Static view' : '静态展示'}</span> : <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? (en ? 'Play' : '播放') : (en ? 'Pause' : '暂停')}</button>}</div>
      <div className="fdBoronDiagram">
        <div className="fdFuelRow"><span>{en ? 'PROTON + BORON-11' : '氢核 + 硼-11'}</span><strong>p + ¹¹B → 3α</strong><span>{en ? 'CHARGED FUSION PRODUCTS' : '带电聚变产物'}</span></div>
        <svg viewBox="0 0 600 280" role="img" aria-label={en ? 'Energy-flow concept: heating and confinement, proton–boron fusion, alpha energy deposition and self-heating, energy extraction. Not experimental data.' : '能量流概念图：加热与约束、氢硼聚变、α 能量沉积与自加热、能量提取。非实验数据。'}>
          <defs><linearGradient id="fd-boron-field"><stop stopColor="#ac9af5"/><stop offset="1" stopColor="#ffb675"/></linearGradient><marker id="fd-flow-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0L7 3.5L0 7" fill="#bcb0e0"/></marker></defs>
          <g fill="none" stroke="#514765" strokeWidth=".7" opacity=".7"><path d="M24 70H576M24 140H576M24 210H576M100 20V260M200 20V260M300 20V260M400 20V260M500 20V260"/></g>
          <g fill="none" stroke="url(#fd-boron-field)">{Array.from({length: 11}, (_, i) => <ellipse key={i} cx="289" cy="140" rx={66+i*5} ry={37+i*7} strokeWidth={i===10?1.8:.7} opacity={.85-i*.04} />)}</g>
          <g fill="none" strokeWidth="2" markerEnd="url(#fd-flow-arrow)"><path className="fdEnergyPulse" d="M36 140H174" stroke="#bcb0e0"/><path className="fdEnergyPulse" d="M405 140H567" stroke="#edb185"/><path className="fdSelfHeat" d="M348 87C371 10 208 0 218 84" stroke="#f0b386"/><path d="M289 226V263" stroke="#8d839e"/></g>
          <g fontFamily="Arial, Microsoft YaHei, sans-serif" textAnchor="middle" fill="#ece8f5"><text x="289" y="123" fontSize="16">{en?'FUSION PLASMA':'聚变等离子体'}</text><text x="289" y="149" fontSize="23" fill="#ffc794">p–¹¹B</text><text x="289" y="175" fontSize="13">{en?'CONFINEMENT + CONTROL':'磁约束 + 运行控制'}</text><text x="83" y="119" fontSize="14">{en?'HEATING':'外部加热'}</text><text x="502" y="119" fontSize="14">{en?'ENERGY OUT':'能量提取'}</text><text x="290" y="26" fontSize="14" fill="#ffc794">{en?'α DEPOSITION / SELF-HEATING':'α 能量沉积 / 自加热'}</text><text x="393" y="265" fontSize="13" fill="#bbb2ca">{en?'RADIATION + TRANSPORT LOSSES':'辐射与输运损失'}</text></g>
        </svg>
        <div className="fdMobilePlasma"><span>{en?'External heating + fuel':'外部加热 + 燃料供给'}</span><i aria-hidden="true">↓</i><strong>{en?'Confined p–¹¹B plasma':'受约束的氢硼等离子体'}</strong><p>{en?'α energy deposition ↺ self-heating':'α 能量沉积 ↺ 自加热'}</p><small>{en?'Balance radiation & transport losses':'平衡辐射与输运损失'}</small></div>
        <div className="fdConversionFlow"><span>{en?'Plasma energy':'等离子体能量'}</span><i aria-hidden="true">→</i><span>{en?'Energy conversion':'能量转换系统'}</span><i aria-hidden="true">→</i><strong>{en?'Electricity':'电力输出'}</strong></div>
        <div className="fdEnergyBalance">{en?'OUTPUT − PLANT LOADS = NET ELECTRICITY':'电力输出 − 厂用功耗 = 净电力'}<span>{en?'Research goal · energy balance to be verified':'研究目标 · 能量平衡需验证'}</span></div>
      </div>
      <div className="fdEnergySteps" aria-label={en ? 'Fusion energy stages' : '聚变能量转化阶段'}>{stages.map((label, index) => <button type="button" key={label[1]} aria-pressed={step === index} onClick={() => { setStep(index); setPaused(true); }}><span>0{index + 1}</span>{label[en ? 1 : 0]}</button>)}</div>
      <p className="fdEnergyDescription">{descriptions[step][en ? 1 : 0]}</p>
      <figcaption>{en ? 'Future-energy concept, not a claim that EXL-50U has achieved burning plasma or electricity generation.' : '面向未来能源的概念示意，不代表 EXL-50U 已实现燃烧等离子体或发电。'}</figcaption>
    </figure>
  </header>;
}
