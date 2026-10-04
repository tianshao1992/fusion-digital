'use client';

import { useEffect, useRef, useState } from 'react';
import './fusion-energy.css';

const stages = [
  {
    id: 'plasma', label: ['燃烧等离子体', 'Burning plasma'],
    detail: ['约束 · 加热 · 自加热', 'Confinement · heating · self-heating'],
    alt: ['磁体与真空室剖面中的环形等离子体，AI 生成的未来装置概念图', 'AI-generated concept: confined toroidal plasma inside a cutaway magnetic fusion device'],
    description: ['外部加热与燃料供给建立运行条件。聚变产物沉积的能量参与自加热，与辐射和输运损失共同决定等离子体的能量平衡。', 'External heating and fuelling establish operating conditions. Deposited fusion energy contributes to self-heating; radiation and transport losses complete the plasma energy balance.'],
  },
  {
    id: 'conversion', label: ['能量转换', 'Energy conversion'],
    detail: ['能量提取 · 转换 · 发电', 'Extraction · conversion · generation'],
    alt: ['换热管路、透平叶片与发电机组的写实概念剖面，并非已选定的工程路线', 'Conceptual cutaway of heat-transfer pipework, turbine blades and a generator, not a selected plant design'],
    description: ['把等离子体释放的能量交给工程系统，转换为电力。图中透平—发电机仅示意一种热转换路径；效率、损耗与运行稳定性都需要验证。', 'Engineering systems turn extracted energy into electricity. The turbine–generator illustrates one possible thermal conversion route; efficiency, losses and operating stability require validation.'],
  },
  {
    id: 'power', label: ['电力输出', 'Electric power'],
    detail: ['厂用电回流 · 净电力输出', 'Plant loads · net electric output'],
    alt: ['变压器、变电设备与输电设施的未来电力输出概念画面', 'Conceptual transformer, switchyard and transmission equipment for future electricity delivery'],
    description: ['发出的电力一部分返回加热、磁体与冷却系统。扣除厂用功耗后的净电力，才是能源系统对外供电的结果。', 'Part of the generated electricity returns to heating, magnets and cooling. Net electricity is what remains for delivery after plant loads.'],
  },
] as const;

/** Generated engineering concepts, never measured plasma or an as-built plant. */
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
    const timer = window.setInterval(() => setStep(value => (value + 1) % stages.length), 6000);
    return () => window.clearInterval(timer);
  }, [paused, reduced, visible]);
  return <header className="fdHero fdHeroCinematic" id="top">
    <div className="fdHeroCopy">
      <p className="fdEyebrow"><span className="fdSmallLine" /> AI FOR SCIENCE &amp; ENGINEERING</p>
      <h1>{en ? <>Beyond the known.<br />Grounded in <em>evidence.</em></> : <>让智能，走出已知。<br />让每一步，<em>都有证据。</em></>}</h1>
    </div>
    <div className="fdHeroContext">
      <p className="fdLead">{en ? 'The next step is more than a better algorithm. It is knowing when to trust, exploring beyond the training domain efficiently, and turning real feedback into new capability.' : 'AI 的下一步，不止是更好的算法。是验证何时可信，以更少的试错探索未知，让真实反馈成为持续进化的起点。'}</p>
      <div className="fdActions"><a className="fdButton" href="#architecture">{en ? 'Explore the architecture' : '了解三层技术体系'}</a><a className="fdTextLink" href="#exl50u-case">{en ? 'EXL-50U evidence' : '查看 EXL-50U 实验证据'}</a></div>
      <p className="fdHeroFoot">{en ? 'FusionDigital / Connect models, experiments and operation.' : 'FusionDigital / 连接模型、实验与真实运行。'}</p>
    </div>
    <figure className="fdEnergyFigure fdEnergyCinema" ref={figure} data-stage={step} data-running={!paused && !reduced && visible}>
      <div className="fdCinemaHeading">
        <div><p className="fdEyebrow">FROM PLASMA TO POWER</p><h2>{en ? 'One connected energy system.' : '从等离子体，到电力。'}</h2></div>
        {reduced ? <span className="fdCinemaMotionLabel">{en ? 'Static view' : '静态展示'}</span> : <button className="fdCinemaPlayback" type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? (en ? 'Play sequence' : '播放流程') : (en ? 'Pause sequence' : '暂停流程')}</button>}
      </div>
      <div className="fdEnergyScenes" role="group" aria-label={en ? 'Fusion energy stages' : '聚变能量转化阶段'}>
        {stages.map((stage, index) => <button type="button" className="fdEnergyScene" key={stage.id} aria-pressed={step === index} aria-describedby={step === index ? 'fusion-energy-description' : undefined} onFocus={() => setPaused(true)} onClick={() => { setStep(index); setPaused(true); }}>
          <span className="fdSceneImage">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={'/images/fusion-energy/'+stage.id+'-v1.webp'} width="1536" height="1024" loading="eager" decoding="async" alt={stage.alt[en ? 1 : 0]} />
            <span className="fdSceneLight" aria-hidden="true" />
            <span className="fdSceneIndex" aria-hidden="true">0{index + 1}<small>{stage.id.toUpperCase()}</small></span>
          </span>
          <span className="fdSceneCaption"><strong>{stage.label[en ? 1 : 0]}</strong><span>{stage.detail[en ? 1 : 0]}</span></span>
        </button>)}
      </div>
      <div className="fdEnergyReturn"><span className="fdReturnLine" aria-hidden="true" /><p>{en ? 'RECIRCULATING POWER' : '厂用电回流'}<span>{en ? 'Heating / magnets / cooling' : '加热 / 磁体 / 冷却'}</span></p></div>
      <div className="fdCinemaReadout">
        <p id="fusion-energy-description" className="fdCinemaDescription">{stages[step].description[en ? 1 : 0]}</p>
        <div className="fdCinemaBalance"><span>{en ? 'THE ENERGY BALANCE' : '能量账本'}</span><p>{en ? 'Electricity output' : '电力输出'}<i>−</i>{en ? 'Plant loads' : '厂用功耗'}<i>=</i><strong>{en ? 'Net electricity' : '净电力'}</strong></p></div>
      </div>
      <figcaption>{en ? 'AI-generated engineering concepts, not photographs or an as-built design. This future-energy vision does not mean EXL-50U has achieved burning plasma or electricity generation.' : 'AI 生成的工程概念画面，非实物照片或工程定型方案；不代表 EXL-50U 已实现燃烧等离子体或发电。'}</figcaption>
    </figure>
  </header>;
}
