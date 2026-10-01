'use client';

import { useState } from 'react';
import { layers } from './home-content';
import ControlEvidence, { ControlMetrics } from './ControlEvidence';
import Exl50uVrTour from '../../digital-prototype/Exl50uVrTour';

type Localized = { en: boolean };
export function FusionPrinciples({ en }: Localized) {
  const values = en ? [
    ['01', 'Validation before action.', 'Test candidate decisions against physics, uncertainty and engineering limits.'],
    ['02', 'Evidence across the loop.', 'Trace requirements, data, models, versions and experimental outcomes.'],
    ['03', 'Learn from operation.', 'Let real feedback reveal the next model gap and the next experiment.'],
  ] : [
    ['01', '先验证，再行动。', '用物理规律、不确定度与工程约束，检验每一个候选决策。'],
    ['02', '用证据，贯穿闭环。', '让需求、数据、模型、版本与实验结果相互可追溯。'],
    ['03', '在运行中，持续进化。', '以真实反馈发现模型缺口，把每一次实验沉淀为下一次能力。'],
  ];
  return <section className="fdPrinciples" aria-label={en ? 'Our principles' : '核心理念'}>{values.map(([id, title, copy]) => <article key={id}><span>{id}</span><div><h2>{title}</h2><p>{copy}</p></div></article>)}</section>;
}

export function FusionArchitecture({ en }: Localized) {
  const [selected, setSelected] = useState(1);
  const layer = layers[selected];
  return <section className="fdSection fdArchitecture" id="architecture">
    <div className="fdSectionHead"><p className="fdEyebrow">01 / A CONNECTED INTELLIGENCE</p><h2>{en ? <>Three layers.<br /><em>One verifiable loop.</em></> : <>三层协同。<br /><em>一条可验证闭环。</em></>}</h2><p>{en ? 'Agents propose. Digital twins verify. Real-time systems execute. Device feedback closes the loop.' : '智能体提出方案，数字孪生验证方案，实时控制执行策略。装置反馈，闭合下一轮学习。'}</p></div>
    <div className="fdHandoffStrip"><span>{en?'Goals & candidate experiments':'目标与候选实验'}</span><i aria-hidden="true">→</i><strong>{en?'Twin training & validation':'孪生训练与验证'}</strong><i aria-hidden="true">→</i><span>{en?'Approved real-time policies':'已批准的实时策略'}</span></div>
    <div className="fdArchitectureLayout">
      <div className="fdArchitectureMap" aria-label={en ? 'Select an architecture layer' : '选择技术架构层'}>
        <div className="fdMapCaption"><span>{en ? 'EXPERT GOALS & BOUNDARIES' : '专家目标与边界'}</span><span>{en ? 'EXPERIMENTAL FEEDBACK' : '真实实验反馈'}</span></div>
        <div className="fdMapLanes">{layers.map((item, index) => <button type="button" className={`fdLayer fdLayer${index}`} key={item.name} onClick={() => setSelected(index)} aria-pressed={selected === index}><span className="fdLayerNumber">0{index + 1}</span><span><strong>{item.name}</strong><small>{item.kind[en ? 1 : 0]}</small></span><span className="fdLayerClock">{item.clock[en ? 1 : 0]}</span><span className="fdLayerPort" aria-hidden="true" /></button>)}<div className="fdFeedbackRail" aria-hidden="true"><span>↟</span></div></div>
        <div className="fdSafetyGate"><span aria-hidden="true">◇</span>{en ? 'Human approval · Physics constraints · Independent interlocks' : '人工审批 · 物理约束 · 独立安全联锁'}</div>
        <div className="fdDeviceNode"><span className="fdWave" aria-hidden="true">⌁</span><div><strong>{en ? 'FUSION DEVICE' : '聚变装置'}</strong><span>EXL-50U / {en ? 'future devices' : '未来装置'}</span></div><span className="fdDeviceReturn">{en ? 'Signals → evidence' : '信号 → 证据'} ↟</span></div>
      </div>
      <div className={`fdLayerDetail fdLayerDetail${selected}`} aria-live="polite"><p className="fdEyebrow">{layer.name.toUpperCase()}</p><h3>{layer.headline[en ? 1 : 0]}</h3><p>{layer.copy[en ? 1 : 0]}</p><div className="fdTags">{layer.tags[en ? 1 : 0].map(tag => <span key={tag}>{tag}</span>)}</div><p className="fdBoundary">{en ? 'Architecture vision, not a claim that all three layers are deployed. Agents never bypass validation or safety systems. This website has no actuator write path.' : '架构愿景，不代表三层能力已全部部署。智能体不绕过验证与安全系统；本网站不连接装置执行器。'}</p><a className="fdTextLink" href="/vision">{en?'Explore the complete architecture':'查看完整技术理念'}</a></div>
    </div>
  </section>;
}

export function FusionControlCase({ en, compact = false }: Localized & { compact?: boolean }) {
  const milestones = en ? [
    ['01', 'Limiter control', 'Validate shape control on EXL-50U.'],
    ['02', 'Divertor & transitions', 'Extend to different plasma configurations.'],
    ['03', 'Changing targets', 'Support locked-mode studies without predesigned discharge waveforms.'],
    ['04', 'Routine operation', 'Support everyday experiments across 400–600 kA current plateaus.'],
  ] : [
    ['01', '限制器位形控制', '在 EXL-50U 验证强化学习位形控制。'],
    ['02', '偏滤器与位形过渡', '扩展到不同等离子体位形与切换任务。'],
    ['03', '变目标控制', '无需预设放电波形，支撑锁模研究实验。'],
    ['04', '常态化运行', '覆盖 400–600 kA 电流平台，稳定支持日常物理实验。'],
  ];
  return <section className="fdSection fdCase" id="exl50u-case">
    <div className="fdSectionHead fdSplitHead"><div><p className="fdEyebrow">02 / EXPERIMENTAL RESULTS · EXL-50U</p><h2>{en ? <>Control, tested in experiments.<br /><em>Ready for routine use.</em></> : <>从位形控制，<br /><em>走向常态化实验应用。</em></>}</h2></div><p>{en ? 'Team-reported experiments demonstrate adaptation to different current levels and operating conditions, supporting daily physics research.' : '实验结果表明，控制器适应不同电流等级与运行工况，稳定支持日常物理实验。以下为团队提供的实验总结。'}</p></div>
    <ControlMetrics en={en} />
    <p className="fdPerformanceNote">{en ? 'Reported within tested conditions. Error definitions, evaluation windows and shot-level coverage await detailed supporting data; these are not guarantees for every discharge.' : '指标适用于已测试工况；误差定义、统计窗口及逐炮覆盖范围待补充，不代表对所有放电的性能保证。'}</p>
    <div className="fdResultsGrid"><div className="fdApplications"><p className="fdEyebrow">{en?'SUPPORTING REAL PHYSICS':'服务真实物理实验'}</p>
      {(en ? [['Locked-mode studies','Flexible targets support experimental analysis.'],['High ion temperature','Maintain controlled operating conditions for high-parameter experiments.'],['Proton–boron fusion','Support physics experiments with stable shape and current control.']] : [['锁模研究','灵活变目标控制，为锁模分析提供实验支撑。'],['高离子温度提升','面向高参数实验，维持受控运行工况。'],['氢硼聚变反应','以稳定的位形与电流控制，支持氢硼物理实验。']]).map(([title,copy])=><article key={title}><h3>{title}</h3><p>{copy}</p></article>)}
      <a className="fdTextLink" href={compact?'/control/exl50u':'/control'}>{en?'Explore the control research':compact?'查看案例与完整流程':'探索集成控制研究'}</a>
    </div><ControlEvidence en={en}/></div>
    {!compact && <><div className="fdTimeline">{milestones.map(([date,title,copy])=><article key={date}><span>{date}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      <div className="fdCasePhoto"><Exl50uVrTour en={en}/><div><p className="fdEyebrow">EXL-50U / EXPERIMENTAL CONTEXT</p><h3>{en?'Real operation. Bounded evidence.':'真实运行，有边界的证据。'}</h3><p>{en?'These control results do not establish burning-plasma operation, net electricity generation or universal policy transfer. Increased experimental use alone does not establish a scaling law.':'这些控制结果不等同于燃烧等离子体、净发电或策略普适迁移；实验调用增长也不单独构成已证实的 scaling law。'}</p></div></div></>}
  </section>;
}

export function FusionLearningLoop({ en }: Localized) {
  const steps = en ? [
    ['01', 'Observe', 'Shot data & device constraints'], ['02', 'Calibrate', 'Identify model residuals'], ['03', 'Train', 'RL policies & scenario variation'], ['04', 'Validate', 'Offline evaluation, SIL / HIL'], ['05', 'Operate', 'Approved bounded experiments'],
  ] : [
    ['01', '观测', '实验数据与装置约束'], ['02', '校准', '识别模型残差与适用域'], ['03', '训练', '强化学习策略与场景扰动'], ['04', '验证', '离线评测、SIL / HIL'], ['05', '运行', '审批后的受限真机实验'],
  ];
  return <section className="fdLearning" id="learning-loop"><div className="fdSectionHead"><p className="fdEyebrow">THE DIGITAL TWIN × REINFORCEMENT LEARNING</p><h2>{en ? <>The next experiment<br />starts with the last.</> : <>下一次实验，<br />始于上一次反馈。</>}</h2><p>{en ? 'A digital twin is not just a training environment. It is the bridge between experimental evidence, policy evaluation and the next model update.' : '数字孪生不只是训练环境，更是实验依据、策略评估与下一次模型更新之间的桥梁。'}</p></div><div className="fdLoopFlow">{steps.map(([id, title, copy]) => <article key={id}><span>{id}</span><h3>{title}</h3><p>{copy}</p></article>)}</div><div className="fdLoopReturn"><span>↶</span><p>{en ? 'Residuals · anomalies · new observations → model calibration & knowledge updates' : '残差 · 异常 · 新观测 → 模型再校准与知识更新'}</p><span>↵</span></div><p className="fdLoopNote">{en ? 'Illustrative workflow, not a claim that every evaluation gate has been completed. Independent safety systems and human approval remain mandatory.' : '流程示意，不代表各验证门已全部完成；独立安全系统与人工授权始终保留。'}</p></section>;
}
