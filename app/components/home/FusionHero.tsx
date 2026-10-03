'use client';

import { useEffect, useId, useRef, useState } from 'react';

const stages = [
  ['约束与加热', 'Confine & heat'], ['聚变与自加热', 'Fusion & self-heating'],
  ['能量转换', 'Energy conversion'], ['电力与循环', 'Power & recirculation'],
] as const;
const descriptions = [
  ['磁约束、外部加热与燃料供给共同建立等离子体运行条件；控制系统持续调节状态。', 'Magnetic confinement, external heating and fuelling establish plasma conditions. Control systems continuously regulate the state.'],
  ['聚变释放能量，沉积在等离子体中的部分参与自加热，并与辐射、输运损失竞争。燃烧等离子体是未来研究目标。', 'Fusion releases energy. The deposited fraction supports self-heating while radiation and transport remove energy. Burning plasma is a future research goal.'],
  ['能量提取连接等离子体与工程系统。转换效率、运行稳定性和系统损耗需要共同验证，不预设具体转换路线。', 'Energy extraction connects plasma physics with plant engineering. Efficiency, stability and losses must be validated together; no conversion technology is prescribed.'],
  ['一部分电力返回加热、磁体与冷却系统；扣除厂用功耗后，才是净电力。闭合能量账本，是走向发电的必要验证。', 'Part of the electricity supplies heating, magnets and cooling. Net electricity remains after plant loads. Closing this energy balance is essential to power generation.'],
] as const;

/** An energy-balance schematic, not a reactor design or a measured plasma. */
export function FusionHero({ en }: { en: boolean }) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [visible, setVisible] = useState(false);
  const figure = useRef<HTMLElement>(null);
  const uid = useId().replaceAll(':', '');
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
    const timer = window.setInterval(() => setStep(value => (value + 1) % stages.length), 5000);
    return () => window.clearInterval(timer);
  }, [paused, reduced, visible]);
  return <header className="fdHero" id="top">
    <div className="fdHeroCopy">
      <p className="fdEyebrow"><span className="fdSmallLine" /> AI FOR SCIENCE &amp; ENGINEERING</p>
      <h1>{en ? <>Beyond the known.<br />Grounded in<br /><em>evidence.</em></> : <>让智能，走出已知。<br />让每一步，<br /><em>都有证据。</em></>}</h1>
      <p className="fdLead">{en ? 'The next step is more than a better algorithm. It is knowing when to trust, exploring beyond the training domain efficiently, and turning real feedback into new capability.' : 'AI 的下一步，不止是更好的算法。是验证何时可信，以更少的试错探索未知，让真实反馈成为持续进化的起点。'}</p>
      <div className="fdActions"><a className="fdButton" href="#architecture">{en ? 'Explore the architecture' : '了解三层技术体系'}</a><a className="fdTextLink" href="#exl50u-case">{en ? 'EXL-50U evidence' : '查看 EXL-50U 实验证据'}</a></div>
      <p className="fdHeroFoot">{en ? 'FusionDigital / Connect models, experiments and operation.' : 'FusionDigital / 连接模型、实验与真实运行。'}</p>
    </div>
    <figure className="fdEnergyFigure fdEnergyAtlas" ref={figure} data-stage={step} data-running={!paused && !reduced && visible}>
      <div className="fdFigureTop"><span>FUSION / ENERGY SYSTEM</span>{reduced ? <span>{en ? 'Static view' : '静态展示'}</span> : <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? (en ? 'Play' : '播放') : (en ? 'Pause' : '暂停')}</button>}</div>
      <div className="fdEnergySchematic" role="img" aria-label={en ? 'Conceptual energy circuit: heating and confinement, fusion plasma and self-heating, extraction and conversion, electricity, recirculating plant power, and losses. Not experimental data.' : '能量循环概念图：约束与加热、聚变等离子体与自加热、能量提取与转换、电力输出、厂用电回流及损失。非实验数据。'}>
        <svg viewBox="0 0 720 500" aria-hidden="true">
          <defs>
            <radialGradient id={uid+'-glow'}><stop stopColor="var(--color-accent)" stopOpacity=".24"/><stop offset="1" stopColor="var(--color-accent)" stopOpacity="0"/></radialGradient>
            <linearGradient id={uid+'-flux'} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--color-info-strong)"/><stop offset=".55" stopColor="var(--color-accent)"/><stop offset="1" stopColor="var(--color-info)"/></linearGradient>
            <marker id={uid+'-arrow'} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="var(--color-accent)"/></marker>
          </defs>
          <g className="fdEnergyGrid" fill="none"><path d="M0 110H720M0 220H720M0 330H720M0 440H720M90 0V500M200 0V500M310 0V500M420 0V500M530 0V500M640 0V500"/><circle cx="245" cy="237" r="175"/><circle cx="245" cy="237" r="145"/></g>
          <ellipse cx="245" cy="237" rx="193" ry="175" fill={'url(#'+uid+'-glow)'}/>
          <g className="fdFluxSurfaces" fill="none" stroke={'url(#'+uid+'-flux)'}>
            {Array.from({length: 18}, (_, index) => <ellipse key={index} cx="245" cy="237" rx={120 - index * 2.1} ry={48 + index * 4.2} transform={'rotate('+index*10+' 245 237)'} strokeWidth={index % 3 === 0 ? 1.5 : .7} opacity={index % 3 === 0 ? .8 : .38}/>)}
          </g>
          <g fill="none" className="fdEnergyConduits" markerEnd={'url(#'+uid+'-arrow)'}>
            <path className="fdHeatingPath" d="M50 302H96Q112 302 125 287L155 256"/>
            <path className="fdSelfHeatingPath" d="M201 149C179 75 333 63 322 161"/>
            <path className="fdConversionPath" d="M367 237H451"/>
            <path className="fdOutputPath" d="M557 237H674"/>
            <path className="fdReturnPath" d="M606 247V416Q606 434 588 434H67Q50 434 50 416V320"/>
          </g>
          <g className="fdConverterGlyph" fill="none"><circle cx="505" cy="237" r="52"/><circle cx="505" cy="237" r="38"/><path d="M479 244L492 223L505 249L518 224L531 237"/></g>
          <g className="fdLossPath" fill="none"><path d="M275 353V378M525 293V343"/><path d="M270 373L275 378L280 373M520 338L525 343L530 338"/></g>
          <g className="fdEnergyParticles" fill="var(--color-accent)"><circle cx="398" cy="237" r="4"/><circle cx="578" cy="237" r="4"/><circle cx="390" cy="434" r="4"/></g>
        </svg>
        <span className="fdEnergyLabel fdLabelPlasma"><small>01 / PLASMA</small><strong>{en?'Controlled plasma':'受控等离子体'}</strong></span>
        <span className="fdEnergyLabel fdLabelSelfHeat">{en?'Fusion · self-heating':'聚变 · 自加热'}</span>
        <span className="fdEnergyLabel fdLabelInput">{en?'Heating & fuel':'加热与供给'}</span>
        <span className="fdEnergyLabel fdLabelConversion"><small>02 / CONVERSION</small><strong>{en?'Energy conversion':'能量转换'}</strong></span>
        <span className="fdEnergyLabel fdLabelOutput"><small>03 / POWER</small><strong>{en?'Electricity':'电力输出'}</strong></span>
        <span className="fdEnergyLabel fdLabelLoss">{en?'Radiation · transport · conversion losses':'辐射 · 输运 · 转换损失'}</span>
        <span className="fdEnergyLabel fdLabelReturn">{en?'RECIRCULATING POWER / HEATING · MAGNETS · COOLING':'厂用电回流 / 加热 · 磁体 · 冷却'}</span>
      </div>
      <div className="fdEnergyBalance"><span>{en?'THE ENERGY BALANCE':'能量账本'}</span><strong>{en?'Electricity output − plant loads = net electricity':'电力输出 − 厂用功耗 = 净电力'}</strong></div>
      <div className="fdEnergySteps" aria-label={en ? 'Fusion energy stages' : '聚变能量转化阶段'}>{stages.map((label, index) => <button type="button" key={label[1]} aria-pressed={step === index} onClick={() => { setStep(index); setPaused(true); }}><span>0{index + 1}</span>{label[en ? 1 : 0]}</button>)}</div>
      <p className="fdEnergyDescription">{descriptions[step][en ? 1 : 0]}</p>
      <figcaption>{en ? 'Future-energy concept, not a claim that EXL-50U has achieved burning plasma or electricity generation.' : '面向未来能源的概念示意，不代表 EXL-50U 已实现燃烧等离子体或发电。'}</figcaption>
    </figure>
  </header>;
}
