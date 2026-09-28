'use client';

import { useEffect, useRef, useState } from 'react';
import type { EChartsType } from 'echarts/core';
import { controlEvidence, layers } from './home-content';
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
    <div className="fdArchitectureLayout">
      <div className="fdArchitectureMap" aria-label={en ? 'Select an architecture layer' : '选择技术架构层'}>
        <div className="fdMapCaption"><span>{en ? 'EXPERT GOALS & BOUNDARIES' : '专家目标与边界'}</span><span>{en ? 'EXPERIMENTAL FEEDBACK' : '真实实验反馈'}</span></div>
        <div className="fdMapLanes">{layers.map((item, index) => <button type="button" className={`fdLayer fdLayer${index}`} key={item.name} onClick={() => setSelected(index)} aria-pressed={selected === index}><span className="fdLayerNumber">0{index + 1}</span><span><strong>{item.name}</strong><small>{item.kind[en ? 1 : 0]}</small></span><span className="fdLayerClock">{item.clock[en ? 1 : 0]}</span><span className="fdLayerPort" aria-hidden="true" /></button>)}<div className="fdFeedbackRail" aria-hidden="true"><span>↟</span></div></div>
        <div className="fdSafetyGate"><span aria-hidden="true">◇</span>{en ? 'Human approval · Physics constraints · Independent interlocks' : '人工审批 · 物理约束 · 独立安全联锁'}</div>
        <div className="fdDeviceNode"><span className="fdWave" aria-hidden="true">⌁</span><div><strong>{en ? 'FUSION DEVICE' : '聚变装置'}</strong><span>EXL-50U / {en ? 'future devices' : '未来装置'}</span></div><span className="fdDeviceReturn">{en ? 'Signals → evidence' : '信号 → 证据'} ↟</span></div>
      </div>
      <div className={`fdLayerDetail fdLayerDetail${selected}`} aria-live="polite"><p className="fdEyebrow">{layer.name.toUpperCase()}</p><h3>{layer.headline[en ? 1 : 0]}</h3><p>{layer.copy[en ? 1 : 0]}</p><div className="fdTags">{layer.tags[en ? 1 : 0].map(tag => <span key={tag}>{tag}</span>)}</div><p className="fdBoundary">{en ? 'Architecture vision, not a claim that all three layers are deployed. Agents never bypass validation or safety systems. This website has no actuator write path.' : '架构愿景，不代表三层能力已全部部署。智能体不绕过验证与安全系统；本网站不连接装置执行器。'}</p></div>
    </div>
  </section>;
}

function ControlChart({ en }: Localized) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let chart: EChartsType | undefined;
    let resize: ResizeObserver | undefined;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const [echarts, charts, components, renderers] = await Promise.all([import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers')]);
        if (disposed) return;
        echarts.use([charts.BarChart, components.GridComponent, components.TooltipComponent, components.AriaComponent, renderers.SVGRenderer]);
        chart = echarts.init(element, undefined, { renderer: 'svg' });
        chart.setOption({
          animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          aria: { enabled: true },
          grid: { left: 44, right: 18, top: 40, bottom: 44 },
          textStyle: { fontFamily: 'Arial, Microsoft YaHei, sans-serif' },
          tooltip: { trigger: 'axis', renderMode: 'richText', formatter: (params: unknown) => {
            const list = params as { dataIndex: number }[];
            const item = controlEvidence.stages[list[0]?.dataIndex ?? 0];
            return `${item.period}\n${item.estimated ? (en ? 'Placeholder estimate: ≈' : '占位估算：约 ') : (en ? 'Historical slide: ' : '历史图表：')}${item.success}${en ? ' successful takeovers' : ' 次成功接管'}`;
          } },
          xAxis: { type: 'category', data: controlEvidence.stages.map(item => item.period.replace(/[. ]/, '\n')), axisLine: { lineStyle: { color: '#d7d5e0' } }, axisTick: { show: false }, axisLabel: { color: '#646276', fontSize: 12, interval: 0, margin: 12, lineHeight: 16 } },
          yAxis: { type: 'value', max: 700, interval: 200, axisLabel: { color: '#757286', fontSize: 12 }, splitLine: { lineStyle: { color: '#e8e6ed', type: 'dashed' } } },
          series: [{ type: 'bar', barMaxWidth: 58, label: { show: true, position: 'top', color: '#4c356f', fontSize: 14, formatter: (p: { dataIndex: number; value: unknown }) => `${p.dataIndex === 3 ? '≈ ' : ''}${p.value}` }, data: controlEvidence.stages.map(item => ({ value: item.success, itemStyle: item.estimated ? { color: '#e5ddf3', borderColor: '#8160b6', borderWidth: 1.5, borderType: 'dashed', decal: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -.6, color: 'rgba(101,66,165,.12)' } } : { color: '#76618e', borderRadius: [3, 3, 0, 0] } })) }],
        });
        resize = new ResizeObserver(() => chart?.resize());
        resize.observe(element);
        setReady(true);
      } catch { /* The complete accessible fallback remains visible. */ }
    }, { rootMargin: '150px' });
    observer.observe(element);
    return () => { disposed = true; observer.disconnect(); resize?.disconnect(); chart?.dispose(); };
  }, [en]);
  return <div className="fdChartShell"><div className="fdChartTitle"><span>{en ? 'SUCCESSFUL TAKEOVERS / BY STAGE' : '成功接管次数 / 按阶段'}</span><span>{en ? 'Dashed = estimate' : '虚线 = 占位估算'}</span></div><div ref={container} className="fdControlChart" data-echart="homepage-control-evidence" aria-hidden="true" />{!ready && <div className="fdChartFallback" aria-hidden="true">{controlEvidence.stages.map(item => <div key={item.period}><strong>{item.estimated ? '≈ ' : ''}{item.success}</strong><span className={item.estimated ? 'estimated' : ''} style={{ height: `${Math.max(5, item.success / 700 * 210)}px` }} /><small>{item.period}</small></div>)}</div>}<p className="srOnly">{controlEvidence.stages.map(item => `${item.period}: ${item.success}${item.estimated ? (en ? ' estimated, unverified' : '，估算、未核验') : (en ? ' from historical slide' : '，来自历史图表')}`).join('; ')}</p></div>;
}

export function FusionControlCase({ en }: Localized) {
  const milestones = en ? [
    ['2025.07', 'First takeover', 'Limiter configuration control on EXL-50U.'],
    ['2025 Q4', 'A wider operating space', 'Divertor configurations and transitions between shapes.'],
    ['2026 Q1', 'Changing targets', 'Control without predesigned discharge waveforms, supporting locked-mode analysis experiments.'],
    ['2026', 'Toward full-process control', 'Expanding experimental use and routine controller operation.'],
  ] : [
    ['2025.07', '第一次接管', '在 EXL-50U 完成强化学习限制器位形控制。'],
    ['2025 Q4', '走向更多位形', '完成偏滤器位形控制与不同位形之间的过渡。'],
    ['2026 Q1', '目标可以改变', '无需预设放电波形的变目标控制，支撑锁模分析实验。'],
    ['2026', '迈向全流程接管', '随高参数实验持续调用，打磨常态化运行能力。'],
  ];
  return <section className="fdSection fdCase" id="exl50u-case"><div className="fdSectionHead fdSplitHead"><div><p className="fdEyebrow">03 / IN OPERATION · EXL-50U</p><h2>{en ? <>From the first takeover.<br /><em>To routine operation.</em></> : <>从第一次接管，<br /><em>到常态化运行。</em></>}</h2></div><p>{en ? 'An experimental path from digital-twin training to reinforcement-learning control, developed against increasingly demanding device tasks.' : '一条从数字孪生训练走向强化学习控制的实验路径。在更具挑战的装置任务中，持续积累可用能力。'}</p></div>
    <div className="fdCaseGrid"><div className="fdCaseMetric"><p>{en ? 'TEAM-REPORTED CUMULATIVE TOTAL' : '团队提供的累计成功接管口径'}</p><strong>750<span>+</span></strong><h3>{en ? 'Successful takeover experiments' : '次成功接管实验'}</h3><span className="fdEstimateBadge">{en ? 'PROVISIONAL · AWAITING SHOT-LEVEL REVIEW' : '暂定口径 · 待逐炮核验'}</span><p className="fdMetricNote">{en ? 'Proposed cutoff: 30 Sep 2026. Supplied on 28 Sep; this is not an independently verified count at that future date.' : '拟截至 2026.09.30；资料提供于 09.28。该未来截止日口径尚未独立核验。'}</p></div><div className="fdCaseChart"><ControlChart en={en} /><details className="fdDataNote"><summary>{en ? 'Data provenance & estimate' : '数据口径与估算说明'}</summary><p>{en ? 'Historical successes: 8 (read from the slide), 44 (Q4-1: 18 + Q4-2: 26), and 64. The last bar is a residual placeholder: 750 − 8 − 44 − 64 = 634, covering Q2–Q3; it is not a measured period total. The initial period follows the supplied July narrative, correcting the older Q2 label. No new success rate is inferred.' : '历史成功次数：8（按原图约读）、44（Q4-1 的 18 + Q4-2 的 26）、64。末柱为差额占位：750 − 8 − 44 − 64 = 634，覆盖 Q2–Q3，并非该阶段实测总数。起始月份按本次提供的 7 月叙述修正旧图 Q2 标签；不据此推算新成功率。'}</p><table><caption>{en ? 'Editable historical and provisional figures' : '历史与占位统计明细'}</caption><thead><tr><th>{en ? 'Stage' : '阶段'}</th><th>{en ? 'Successes' : '成功次数'}</th><th>{en ? 'Source' : '来源'}</th></tr></thead><tbody>{controlEvidence.stages.map(item => <tr key={item.period}><td>{item.period}</td><td>{item.estimated ? '≈ ' : ''}{item.success}</td><td>{item.estimated ? (en ? 'Estimate, unverified' : '估算，待核验') : (en ? 'Supplied slide' : '提供的历史图表')}</td></tr>)}</tbody></table></details><p className="fdChartNotice">{en ? 'Final bar: placeholder estimate, not experimental evidence. Historical slide figures also await shot-level reconciliation.' : '末柱为占位估算，不构成实验证据。历史图表数字亦待逐炮对账。'}</p></div></div>
    <div className="fdTimeline">{milestones.map(([date, title, copy]) => <article key={date}><span>{date}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    <div className="fdCaseConclusion"><p>{en ? 'More demanding experiments. More frequent use. A controller learning its way into everyday operation.' : '实验挑战不断提高，调用规模持续增长。DRL 控制器正在真实运行中打磨出常态化能力。'}</p><span>{en ? 'Team-reported progress. An AI-control scaling hypothesis to investigate, not a proven scaling law.' : '以上为团队进展陈述。“AI 控制 scaling law”是待研究假设，而非由占位图证明的定律。'}</span></div>
    <div className="fdCasePhoto"><Exl50uVrTour en={en} /><div><p className="fdEyebrow">EXL-50U / EXPERIMENTAL CONTEXT</p><h3>{en ? <>A real device.<br />A bounded claim.</> : <>真实的装置。<br />有边界的结论。</>}</h3><p>{en ? 'Control experiments demonstrate progress within tested operating conditions. They do not establish burning-plasma operation, net electricity generation or universal policy transfer.' : '控制实验展示的是已测试运行条件内的进展，不等同于燃烧等离子体、净发电或策略的普适迁移能力。'}</p><a className="fdTextLink" href="/control">{en ? 'Explore control research' : '探索集成控制研究'} ↗</a></div></div>
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
