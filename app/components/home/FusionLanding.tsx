'use client';

import { useState } from 'react';
import { layers } from './home-content';
import ControlEvidence, { ControlMetrics } from './ControlEvidence';
import Exl50uVrTour from '../../digital-prototype/Exl50uVrTour';

type Localized = { en: boolean; compact?: boolean };
export function FusionPrinciples({ en, compact = false }: Localized) {
  if (compact) return <section className="fdPrinciples fdPrinciplesBrief" id="principles" aria-label={en ? 'Verify, extend, evolve' : '验证、外推、进化'}>
    <div className="fdPrincipleGrid">{(en ? [
      ['01 / VERIFY', 'Make AI usable.', 'Test ideas against physics and experiments.'],
      ['02 / EXTEND', 'Explore with purpose.', 'Use digital twins to make every experiment count.'],
      ['03 / EVOLVE', 'Learn from operation.', 'Turn each experiment into the next improvement.'],
    ] : [
      ['01 / VERIFY', '验证，让算法可用。', '以物理与实验，检验每一个方案。'],
      ['02 / EXTEND', '外推，让探索高效。', '以数字孪生，让每次实验更有价值。'],
      ['03 / EVOLVE', '进化，让经验生长。', '让真实运行的反馈，成为下一次改进。'],
    ]).map(([id, title, copy]) => <article key={id}><span>{id}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
  </section>;
  const values = en ? [
    ['01 / VERIFY', 'Know when to trust.', 'Connect physical consistency, uncertainty and engineering constraints. Make the operating boundary explicit, and the evidence traceable.'],
    ['02 / EXTEND', 'Make exploration count.', 'Use digital twins to screen candidates and experiments to test the most informative hypotheses. Extend capability one validated step at a time.'],
    ['03 / EVOLVE', 'Learn without losing control.', 'Turn residuals and new observations into model and knowledge updates. Revalidate each change before it returns to operation.'],
  ] : [
    ['01 / VERIFY', '验证：知道何时可信。', '连接物理一致性、不确定度与工程约束。让适用边界可说明，让决策依据可追溯。'],
    ['02 / EXTEND', '外推：让每次探索更有效。', '用数字孪生筛选候选，用实验检验关键假设。把有限的验证资源，用在最值得探索的未知。'],
    ['03 / EVOLVE', '进化：让经验成为能力。', '把残差、异常与新观测回写模型和知识。每次更新重新验证，再进入受约束的运行。'],
  ];
  return <section className="fdPrinciples" id="principles" aria-labelledby="principles-title"><div className="fdPrinciplesIntro"><p className="fdEyebrow">OUR THESIS / AI BEYOND ALGORITHMS</p><h2 id="principles-title">{en ? <>Algorithms propose.<br />Evidence makes them usable.</> : <>算法给出候选。<br />验证，创造可用的能力。</>}</h2><p>{en ? 'In fusion, progress means extending the boundary of what can be trusted—not just fitting what is already known.' : '在聚变中，进步不只是拟合已知，更是有依据地拓展可信边界。'}</p></div><div className="fdPrincipleGrid">{values.map(([id, title, copy]) => <article key={id}><span>{id}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>;
}

export function FusionArchitecture({ en, compact = false }: Localized) {
  const [selected, setSelected] = useState(1);
  const layer = layers[selected];
  const summaries = en ? [
    'Connect knowledge and tools to plan the next experiment.',
    'Calibrate models with experiments. Train and evaluate control policies in the digital world.',
    'Execute validated policies in real time. Return device observations to the twin.',
  ] : ['连接知识与工具，规划下一次实验。', '用实验校准模型，在数字世界训练和评测控制策略。', '实时执行已验证策略，将装置反馈带回数字孪生。'];
  return <section className="fdSection fdArchitecture" id="architecture">
    <div className="fdSectionHead"><p className="fdEyebrow">01 / ARCHITECTURE</p><h2>{compact ? (en ? 'Three layers. One learning loop.' : '三层协同，让智能走向装置。') : (en ? <>Three layers.<br /><em>One verifiable loop.</em></> : <>三层协同。<br /><em>一条可验证闭环。</em></>)}</h2><p>{compact ? (en ? 'Agents plan. Digital twins train and validate. Controllers act. Experiments close the loop.' : '智能体规划，数字孪生训练与验证，实时控制执行。实验反馈，让三层持续协同。') : (en ? 'FusionEvolve asks what is worth testing. FusionDigital establishes what the evidence supports. FusionControl executes approved policies. Device feedback informs the next question.' : 'FusionEvolve 提出值得验证的问题，FusionDigital 建立模型与实验证据，FusionControl 执行获准策略。真实装置的反馈，定义下一轮探索。')}</p></div>
    {!compact && <div className="fdHandoffStrip"><span>{en?'Goals & candidate experiments':'目标与候选实验'}</span><i aria-hidden="true">→</i><strong>{en?'Twin training & validation':'孪生训练与验证'}</strong><i aria-hidden="true">→</i><span>{en?'Approved real-time policies':'已批准的实时策略'}</span></div>}
    <div className="fdArchitectureLayout">
      <div className="fdArchitectureMap" aria-label={en ? 'Select an architecture layer' : '选择技术架构层'}>
        <div className="fdMapCaption"><span>{en ? 'EXPERT GOALS & BOUNDARIES' : '专家目标与边界'}</span><span>{en ? 'EXPERIMENTAL FEEDBACK' : '真实实验反馈'}</span></div>
        <div className="fdMapLanes">{layers.map((item, index) => <button type="button" className={`fdLayer fdLayer${index}`} key={item.name} onClick={() => setSelected(index)} aria-pressed={selected === index}><span className="fdLayerNumber">0{index + 1}</span><span><strong>{item.name}</strong><small>{item.kind[en ? 1 : 0]}</small></span><span className="fdLayerClock">{item.clock[en ? 1 : 0]}</span><span className="fdLayerPort" aria-hidden="true" /></button>)}<div className="fdFeedbackRail" aria-hidden="true"><span>↟</span></div></div>
        {!compact && <div className="fdSafetyGate"><span aria-hidden="true">◇</span>{en ? 'Human approval · Physics constraints · Independent interlocks' : '人工审批 · 物理约束 · 独立安全联锁'}</div>}
        <div className="fdDeviceNode"><span className="fdWave" aria-hidden="true">⌁</span><div><strong>{en ? 'FUSION DEVICE' : '聚变装置'}</strong><span>EXL-50U / {en ? 'future devices' : '未来装置'}</span></div><span className="fdDeviceReturn">{en ? 'Signals → evidence' : '信号 → 证据'} ↟</span></div>
      </div>
      <div className={`fdLayerDetail fdLayerDetail${selected}`} aria-live="polite"><p className="fdEyebrow">{layer.name.toUpperCase()}</p><h3>{layer.headline[en ? 1 : 0]}</h3><p>{compact ? summaries[selected] : layer.copy[en ? 1 : 0]}</p><div className="fdTags">{layer.tags[en ? 1 : 0].map(tag => <span key={tag}>{tag}</span>)}</div>{!compact && <p className="fdBoundary">{en ? 'Architecture vision, not a claim that all three layers are deployed. Agents never bypass validation or safety systems. This website has no actuator write path.' : '架构愿景，不代表三层能力已全部部署。智能体不绕过验证与安全系统；本网站不连接装置执行器。'}</p>}<a className="fdTextLink" href="/vision">{en?'Explore the complete architecture':'查看完整技术理念'}</a></div>
    </div>
    {compact && <details className="fdInlineDisclosure fdArchitectureNote"><summary>{en ? 'Architecture vision · Deployment scope' : '架构愿景 · 查看应用边界'}</summary><p>{en ? 'Not all three layers are deployed. Validated policies remain subject to human approval and independent safety systems. This website has no actuator write path.' : '三层体系为架构愿景，并非全部已部署。策略须经验证与人工授权，由独立安全系统保护；本网站不连接装置执行器。'}</p></details>}
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
    <div className="fdSectionHead fdSplitHead"><div><p className="fdEyebrow">02 / EXL-50U</p><h2>{compact ? (en ? 'From experiments to everyday operation.' : '从实验验证，到常态化运行。') : (en ? <>Capability, built through experiments.<br /><em>From validation to routine use.</em></> : <>能力，建立于真实实验。<br /><em>从验证走向常态化应用。</em></>)}</h2></div><p>{compact ? (en ? 'DRL control supporting daily physics experiments. Results reported by the EXL-50U team.' : 'DRL 控制持续支持日常物理实验。以下为 EXL-50U 团队报告结果。') : (en ? 'Team-reported experiments demonstrate adaptation to different current levels and operating conditions, supporting daily physics research.' : '实验结果表明，控制器适应不同电流等级与运行工况，稳定支持日常物理实验。以下为团队提供的实验总结。')}</p></div>
    <ControlMetrics en={en} />
    {!compact && <p className="fdPerformanceNote">{en ? 'Reported within tested conditions. Error definitions, evaluation windows and shot-level coverage await detailed supporting data; these are not guarantees for every discharge.' : '指标适用于已测试工况；误差定义、统计窗口及逐炮覆盖范围待补充，不代表对所有放电的性能保证。'}</p>}
    <div className="fdResultsGrid"><div className="fdApplications"><p className="fdEyebrow">{en?'SUPPORTING REAL PHYSICS':'服务真实物理实验'}</p>
      {(en ? [['Locked-mode studies','Flexible targets support experimental analysis.'],['High ion temperature','Maintain controlled operating conditions for high-parameter experiments.'],['Fusion-reaction studies','Stable shape and current control support proton–boron physics experiments.']] : [['锁模研究','灵活变目标控制，为锁模分析提供实验支撑。'],['高离子温度提升','面向高参数实验，维持受控运行工况。'],['聚变反应研究','以稳定的位形与电流控制，支持氢硼等物理实验。']]).map(([title,copy])=><article key={title}><h3>{title}</h3><p>{copy}</p></article>)}
      <a className="fdTextLink" href={compact?'/control/exl50u':'/control'}>{en?'Explore the control research':compact?'查看案例与完整流程':'探索集成控制研究'}</a>
    </div><ControlEvidence en={en}/></div>
    {!compact && <><div className="fdTimeline">{milestones.map(([date,title,copy])=><article key={date}><span>{date}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      <div className="fdCasePhoto"><Exl50uVrTour en={en}/><div><p className="fdEyebrow">EXL-50U / EXPERIMENTAL CONTEXT</p><h3>{en?'Real operation. Bounded evidence.':'真实运行，有边界的证据。'}</h3><p>{en?'These control results do not establish burning-plasma operation, net electricity generation or universal policy transfer. Increased experimental use alone does not establish a scaling law.':'这些控制结果不等同于燃烧等离子体、净发电或策略普适迁移；实验调用增长也不单独构成已证实的 scaling law。'}</p></div></div></>}
  </section>;
}

export function FusionLearningLoop({ en, compact = false }: Localized) {
  if (compact) return <section className="fdLearning fdLearningBrief" id="learning-loop" aria-labelledby="learning-title">
    <div><p className="fdEyebrow">DIGITAL TWIN × REINFORCEMENT LEARNING</p><h2 id="learning-title">{en ? 'Every experiment improves the next.' : '每一次实验，都让下一次更好。'}</h2><a href="/vision" className="fdTextLink">{en ? 'How the loop works' : '了解完整闭环'}</a></div>
    <div><ol className="fdLearningSequence">{(en ? ['Observe', 'Calibrate', 'Train', 'Validate', 'Operate'] : ['观测', '校准', '训练', '验证', '运行']).map((label, index) => <li key={label}><span>0{index + 1}</span>{label}</li>)}</ol><p className="fdLearningSummary">{en ? 'Device feedback calibrates the twin. Simulation improves the policy. Experiments test the next step.' : '装置反馈校准孪生，仿真训练改进策略，实验检验下一步。'}</p></div>
  </section>;
  const steps = en ? [
    ['01', 'Observe', 'Shot data & device constraints'], ['02', 'Calibrate', 'Identify model residuals'], ['03', 'Explore', 'RL training & boundary scenarios'], ['04', 'Validate', 'Offline evaluation, SIL / HIL'], ['05', 'Operate', 'Approved bounded experiments'],
  ] : [
    ['01', '观测', '实验数据与装置约束'], ['02', '校准', '识别模型残差与适用域'], ['03', '探索', '策略训练与边界场景'], ['04', '验证', '离线评测、SIL / HIL'], ['05', '运行', '审批后的受限真机实验'],
  ];
  return <section className="fdLearning" id="learning-loop"><div className="fdSectionHead"><p className="fdEyebrow">THE DIGITAL TWIN × REINFORCEMENT LEARNING</p><h2>{en ? <>The next experiment<br />starts with the last.</> : <>下一次实验，<br />始于上一次反馈。</>}</h2><p>{en ? 'Continuous learning does not mean changing a controller mid-discharge. The twin turns new evidence into candidate updates; validation and approval determine what can return to operation.' : '持续学习，不是在放电中随意改变控制器。数字孪生将新证据转化为候选更新，再由验证与审批决定，哪些能力可以进入下一次运行。'}</p></div><div className="fdLoopFlow">{steps.map(([id, title, copy]) => <article key={id}><span>{id}</span><h3>{title}</h3><p>{copy}</p></article>)}</div><div className="fdLoopReturn"><span>↶</span><p>{en ? 'Residuals · anomalies · new observations → model calibration & knowledge updates' : '残差 · 异常 · 新观测 → 模型再校准与知识更新'}</p><span>↵</span></div><p className="fdLoopNote">{en ? 'Illustrative workflow, not a claim that every evaluation gate has been completed. Independent safety systems and human approval remain mandatory.' : '流程示意，不代表各验证门已全部完成；独立安全系统与人工授权始终保留。'}</p></section>;
}
