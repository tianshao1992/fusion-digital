'use client';

import { useEffect, useRef, useState } from 'react';
import './fusion-energy.css';

const stages = [
  {
    id: 'plasma', label: ['燃烧等离子体', 'Burning plasma'],
    detail: ['约束 · 加热 · 自加热', 'Confinement · heating · self-heating'],
    alt: ['磁体与真空室剖面中的环形等离子体，AI 生成的未来装置概念图', 'AI-generated concept: confined toroidal plasma inside a cutaway magnetic fusion device'],
    description: ['磁场约束等离子体，外部加热启动反应，聚变能量参与自加热。', 'Magnetic fields confine the plasma. External heating starts the reaction; fusion energy contributes to self-heating.'],
  },
  {
    id: 'conversion', label: ['能量转换', 'Energy conversion'],
    detail: ['能量提取 · 转换 · 发电', 'Extraction · conversion · generation'],
    alt: ['换热管路、透平叶片与发电机组的写实概念剖面，并非已选定的工程路线', 'Conceptual cutaway of heat-transfer pipework, turbine blades and a generator, not a selected plant design'],
    description: ['提取聚变能量，转换为电力。透平—发电机示意一种可能的热转换路径。', 'Extract fusion energy and convert it into electricity. The turbine–generator illustrates one possible thermal route.'],
  },
  {
    id: 'power', label: ['电力输出', 'Electric power'],
    detail: ['厂用电回流 · 净电力输出', 'Plant loads · net electric output'],
    alt: ['变压器、变电设备与输电设施的未来电力输出概念画面', 'Conceptual transformer, switchyard and transmission equipment for future electricity delivery'],
    description: ['电力支持加热、磁体与冷却，扣除厂用功耗后，净电力送往电网。', 'Electricity powers heating, magnets and cooling. Net output is delivered to the grid after plant loads.'],
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
      <p className="fdLead">{en ? 'Beyond algorithms: validate in digital twins, explore with fewer experiments, and learn from real operation.' : '让 AI 从算法走向应用：在数字孪生中验证，以更少实验探索未知，在真实运行中持续进化。'}</p>
      <div className="fdActions"><a className="fdButton" href="#capabilities">{en ? 'Explore FusionDigital' : '进入功能区'}</a><a className="fdTextLink" href="#architecture">{en ? 'Three-layer architecture' : '了解三层架构'}</a></div>
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
      <figcaption className="fdConceptCaption"><span>{en ? 'AI-generated concepts · Future energy system' : 'AI 生成概念图 · 未来能源系统'}</span><details className="fdInlineDisclosure"><summary>{en ? 'About these images' : '图示说明'}</summary><p>{en ? 'Not photographs or an as-built design. This vision does not mean EXL-50U has achieved burning plasma or electricity generation.' : '非实物照片或工程定型方案；不代表 EXL-50U 已实现燃烧等离子体或发电。'}</p></details></figcaption>
    </figure>
  </header>;
}
