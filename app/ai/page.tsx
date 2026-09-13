'use client';

import KnowledgeBackLink from '../components/KnowledgeBackLink';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import TwinAgentMotion from '../components/TwinAgentMotion';
import { useI18n } from '../i18n';
import AIResearchCatalog from './AIResearchCatalog';
import { aiResearchItems, domainMeta, type AIDomain } from './aiResearch';
import './ai.css';

const capabilityLayers = [
  {
    index: '01',
    title: '机器学习',
    en: 'MACHINE LEARNING',
    role: '把放电、仿真和设备数据转化为可校准的分类、回归、异常检测、优化与寿命模型。',
    tasks: '破裂预警、状态估计、参数辨识、设备健康、实验聚类、工程代理',
    gate: '按时间、炮次、实验批次和装置隔离测试；报告概率校准、误报、漏报与失效案例。',
  },
  {
    index: '02',
    title: '深度学习',
    en: 'DEEP LEARNING',
    role: '学习多通道时序、图像、剖面、几何与执行量之间的非线性表征，并形成低时延模型。',
    tasks: '多模态诊断、神经状态空间、快速代理、强化学习控制、神经算子',
    gate: '验证传感器缺失、分布漂移、最坏时延、对抗扰动及 sim-to-real 鲁棒性。',
  },
  {
    index: '03',
    title: '基础模型',
    en: 'FOUNDATION MODELS',
    role: '在跨诊断、跨任务和潜在跨装置数据上预训练统一状态表征，再用少量数据适配下游任务。',
    tasks: '缺失诊断重建、少样本迁移、多模态状态表征、跨任务接口',
    gate: '规模不等于可信度；必须公开数据谱系、适用域、探针任务、消融和独立装置验证。',
  },
  {
    index: '04',
    title: '智能体',
    en: 'AI AGENTS',
    role: '调用检索、数据、仿真、优化和报告工具，编排可审计的研究与运行辅助工作流。',
    tasks: '实验检索、场景搜索、仿真编排、数据分析、运行副驾驶、维护协同',
    gate: '不绕过安全控制器；写操作经过权限门、计划预检、人工批准、执行回执与完整审计。',
  },
];

const domainAnalysis: Record<AIDomain, { focus: string; frontier: string; gap: string }> = {
  physics: {
    focus: '输运、湍流、平衡、边界与材料相互作用的代理、可微模拟和参数反演。',
    frontier: 'QLKNN、TORAX 类可微环境已能把慢模型接入优化与控制设计。',
    gap: '父模型偏差、训练域外推、跨尺度耦合和守恒约束仍限制反应堆级预测。',
  },
  engineering: {
    focus: '电磁—结构—热流体—中子—材料计算的降阶、代理、逆设计和健康预测。',
    frontier: '概念设计与多参数扫描受益最明显，部分工作已形成可复用优化环境。',
    gap: '公开聚变工程数据极少，制造公差、老化和实验传感器闭环验证不足。',
  },
  control: {
    focus: '形状、剖面、加热、稳定性和执行器分配的学习控制、预测控制与策略搜索。',
    frontier: 'TCV、DIII-D、KSTAR 等已出现真实装置闭环实验，是证据最强的 AI 方向。',
    gap: '多目标耦合、共享执行器、最坏时延、OOD 识别和安全包络尚未电厂化。',
  },
  diagnostics: {
    focus: '破裂与不稳定性预测、虚拟诊断、缺失信号重建、断层重建和异常识别。',
    frontier: '多装置预测、FusionMAE/TokaMind 等多模态预训练正在改变诊断接口。',
    gap: '真实故障标签、跨装置标定、误报警代价和辐照环境下的长期漂移验证不足。',
  },
  energy: {
    focus: '包层取热、一次/二次回路、功率循环、储能与电网耦合的快速优化和预测。',
    frontier: '多采用核电或通用能源系统方法，聚变专属工作集中在概念设计与系统代码。',
    gap: '缺乏聚变热源瞬态、氚约束与并网工况共同驱动的运行数据和闭环实证。',
  },
  auxiliary: {
    focus: '加热与电流驱动、低温、真空、燃料、氚、冷却水、电源和遥操作系统。',
    frontier: 'RF/NBI 代理、设备异常检测和机器人感知是较现实的近期切入点。',
    gap: '子系统数据孤岛、商业设备接口、故障样本稀缺和跨系统失效传播尚未打通。',
  },
  data: {
    focus: '时序对齐、配置、单位、本体、数据质量、访问、版本、基准和证据谱系。',
    frontier: 'MDSplus、UDA、IMAS/OMAS、MAST 开放数据与新基准构成 AI 的公共底座。',
    gap: '跨装置语义仍不一致；开放数据、诊断元数据和可复现训练切分远远不足。',
  },
  hmi: {
    focus: '自然语言检索、解释、实验规划、数值数据问答、协同决策与操作副驾驶。',
    frontier: '聚变领域 LLM、RAG 和数值数据智能体已出现，但多停留在研究或演示阶段。',
    gap: '引用可核验性、权限边界、操作程序约束、专家责任和人因验证尚未体系化。',
  },
  integration: {
    focus: '把物理、工程、控制、诊断、辅机与经济目标编排为可追溯的多保真决策闭环。',
    frontier: 'FUSE、PROCESS/FAROES、可微模拟与搜索智能体正在形成设计空间探索骨架。',
    gap: '尚缺统一状态、在线校准、全厂故障传播、安全论证和连续运行证据。',
  },
};

const deviceMatrix = [
  ['TCV', '磁位形强化学习控制、轨迹预测与优化', 'E4 · 多次装置闭环实验', '控制策略仍依赖高质量仿真器和明确约束'],
  ['DIII-D', '破裂/撕裂模预测、避免控制、PACMAN 集成控制', 'E4 · 装置闭环与实时系统', '向燃烧等离子体与长期运行迁移仍待验证'],
  ['KSTAR', '撕裂模避免、ELM/不稳定性跨装置预测', 'E4 / E2', '跨工况稳定性与可解释边界仍是重点'],
  ['HL-3 / SUNIST-2', 'FusionMAE、多任务诊断、缺失信号恢复', 'E2–E3 · 实验数据与系统部署', '基础模型仍偏装置特定，公开权重/数据有限'],
  ['MAST / MAST-U', '开放数据、TokaMark/TokaMind、事件预测', 'E2 · 大规模离线数据', '基准开放度提升中，尚未形成闭环控制证据'],
  ['JET / EAST / C-Mod', '跨装置破裂预测、输运代理、数据管线', 'E2–E4 · 依具体工作而异', '域偏移和信号定义差异会显著影响迁移'],
  ['SPARC', 'TORAX 场景搜索、热负荷控制与 AI pilot 研发', 'E1 · 仿真与官方研发计划', '装置尚待运行，不能把计划等同于实验验证'],
  ['ITER / DEMO', '目标适配、数字工程与安全关键场景研究', 'E0–E1 · 设计/仿真为主', '缺少同尺度运行数据，必须以可证外推和独立保护为前提'],
];

const risks = [
  ['分布外失效', '新壁状态、新加热组合、异常诊断或新装置会使训练分布失效；必须实时检测 OOD 并定义降级行为。'],
  ['不确定度失真', '点预测准确不代表风险可信；需校准置信区间，并把不确定度传播到控制与工程决策。'],
  ['相关不等于因果', '模型可能学习装置习惯或数据采集伪特征；需要守恒、因果干预和合成诊断约束。'],
  ['智能体越权', '生成式模型不得直接越过确定性安全层；工具白名单、最小权限、双人批准和回执不可省略。'],
  ['持续学习风险', '在线更新可能破坏已验证行为；生产模型应冻结发布，候选模型先在影子模式重新过门。'],
  ['证据不可追溯', '训练数据、代码、权重、配置、提示词、工具调用和结果必须关联到同一版本与时间轴。'],
];

const roadmap = [
  ['A0', '数据与证据', '建立炮次级数据质量、标签、本体、装置配置、模型卡和可重复评测。'],
  ['A1', '辅助模型', '从诊断重建、异常检测和单物理快速代理切入，不直接影响实时控制。'],
  ['A2', '预测孪生', '把代理与 DINA / MEQ、输运和工程约束组合，形成带 UQ 的影子预测。'],
  ['A3', '操作副驾驶', '提供实验检索、场景比较、仿真编排和可引用解释，保留人工决策。'],
  ['A4', '受控智能体', '在白名单与权限门内自动执行离线流程；所有写操作可审计、可回退。'],
  ['A5', '有限自治', '仅在经独立 V&V 的狭窄适用域闭环；安全保护始终独立于生成式 AI。'],
];

const capabilityLayersEn = [
  { index: '01', title: 'Machine learning', en: 'MACHINE LEARNING', role: 'Convert discharge, simulation and equipment data into calibrated classifiers, regressors, anomaly detectors, optimizers and lifetime models.', tasks: 'Disruption prediction · state estimation · parameter identification · equipment health · discharge clustering · engineering surrogates', gate: 'Partition tests by time, discharge, campaign and facility; report calibration, false alarms, misses and failure cases.' },
  { index: '02', title: 'Deep learning', en: 'DEEP LEARNING', role: 'Learn nonlinear representations across multichannel time series, images, profiles, geometry and actuator demand, including low-latency surrogates.', tasks: 'Multimodal diagnostics · neural state space · fast surrogates · reinforcement-learning control · neural operators', gate: 'Test missing sensors, distribution shift, worst-case latency, adversarial disturbance and simulation-to-reality robustness.' },
  { index: '03', title: 'Foundation models', en: 'FOUNDATION MODELS', role: 'Pre-train shared state representations across diagnostics, tasks and, where justified, facilities; adapt them to downstream work with limited labelled data.', tasks: 'Missing-diagnostic reconstruction · few-shot transfer · multimodal state representation · cross-task interfaces', gate: 'Scale is not credibility: publish lineage, applicability, probe tasks, ablations and independent-facility validation.' },
  { index: '04', title: 'AI agents', en: 'AI AGENTS', role: 'Orchestrate auditable workflows by invoking retrieval, data, simulation, optimization and reporting tools.', tasks: 'Experiment retrieval · scenario search · simulation orchestration · data analysis · operator copilot · maintenance coordination', gate: 'Never bypass safety controllers; writes require authorization, plan pre-check, human approval, execution receipt and a complete audit trail.' },
];

const domainAnalysisEn: Record<AIDomain, { focus: string; frontier: string; gap: string }> = {
  physics: { focus: 'Surrogates, differentiable simulation and parameter inference for transport, turbulence, equilibrium, edge physics and plasma–material interaction.', frontier: 'QLKNN and differentiable environments such as TORAX increasingly connect expensive physics models to optimization and control design.', gap: 'Parent-model bias, extrapolation beyond training domains, multiscale coupling and conservation constraints still limit reactor-grade prediction.' },
  engineering: { focus: 'Model-order reduction, surrogates, inverse design and condition prognosis across electromagnetics, structures, thermal fluids, neutronics and materials.', frontier: 'Conceptual design and large parameter scans show the clearest benefits, with several reusable optimization environments emerging.', gap: 'Public fusion-engineering data are scarce; manufacturing tolerances, ageing and closed-loop validation against plant sensors remain weak.' },
  control: { focus: 'Learning control, model-predictive control and policy search for shape, profiles, heating, stability and actuator allocation.', frontier: 'Real-facility closed-loop experiments on TCV, DIII-D and KSTAR provide the strongest evidence in fusion AI.', gap: 'Coupled objectives, shared actuators, worst-case latency, OOD detection and enforceable safety envelopes are not yet power-plant ready.' },
  diagnostics: { focus: 'Disruption and instability prediction, virtual diagnostics, missing-signal reconstruction, tomography and anomaly detection.', frontier: 'Cross-facility prediction and multimodal pre-training efforts such as FusionMAE and TokaMind are reshaping diagnostic interfaces.', gap: 'True fault labels, cross-facility calibration, false-alarm cost and long-term drift under irradiation remain insufficiently validated.' },
  energy: { focus: 'Fast optimization and prediction for blanket heat extraction, primary/secondary loops, power cycles, storage and grid coupling.', frontier: 'Most methods originate in fission or general energy systems; fusion-specific work remains concentrated in conceptual design and systems codes.', gap: 'Operational data coupling fusion heat-source transients, tritium constraints and grid requirements do not yet exist at useful scale.' },
  auxiliary: { focus: 'Heating and current drive, cryogenics, vacuum, fuelling, tritium, cooling water, power supplies and remote handling.', frontier: 'RF/NBI surrogates, equipment anomaly detection and robotic perception are credible near-term entry points.', gap: 'Subsystem data silos, commercial interfaces, sparse fault examples and cross-system failure propagation remain unresolved.' },
  data: { focus: 'Time alignment, configuration, units, ontology, quality, access, versioning, benchmarks and evidence lineage.', frontier: 'MDSplus, UDA, IMAS/OMAS, MAST open data and new benchmarks form a practical common foundation.', gap: 'Cross-facility semantics remain inconsistent; open diagnostic metadata and reproducible train/test partitions are inadequate.' },
  hmi: { focus: 'Natural-language retrieval, explanation, experiment planning, numerical-data question answering, collaborative decisions and operator copilots.', frontier: 'Fusion-specific language models, retrieval-augmented generation and numerical-data agents exist, but mostly as research prototypes.', gap: 'Citation verification, authorization, operating-procedure constraints, expert accountability and human-factors validation lack mature evidence.' },
  integration: { focus: 'Orchestrate physics, engineering, control, diagnostics, auxiliaries and economics into traceable multi-fidelity decision loops.', frontier: 'FUSE, PROCESS/FAROES, differentiable simulation and search agents are becoming a design-space exploration backbone.', gap: 'A common authoritative state, online calibration, whole-plant fault propagation, safety cases and sustained-operation evidence are still missing.' },
};

const deviceMatrixEn = [
  ['TCV', 'Reinforcement-learning magnetic-configuration control, trajectory prediction and optimization', 'E4 · repeated facility closed-loop experiments', 'Control policies still depend on validated simulators and explicit constraints'],
  ['DIII-D', 'Disruption/tearing-mode prediction, avoidance control and PACMAN integrated control', 'E4 · facility closed loop and real-time systems', 'Transfer to burning plasmas and sustained operation remains unverified'],
  ['KSTAR', 'Tearing-mode avoidance and cross-facility ELM/instability prediction', 'E4 / E2', 'Robustness across operating regimes and interpretable boundaries remain priorities'],
  ['HL-3 / SUNIST-2', 'FusionMAE, multitask diagnostics and missing-signal recovery', 'E2–E3 · experimental data and system deployment', 'Foundation models remain facility-specific; public weights and datasets are limited'],
  ['MAST / MAST-U', 'Open data, TokaMark/TokaMind and event prediction', 'E2 · large offline datasets', 'Benchmark openness is improving; closed-loop evidence is not yet established'],
  ['JET / EAST / C-Mod', 'Cross-facility disruption prediction, transport surrogates and data pipelines', 'E2–E4 · work dependent', 'Domain shift and inconsistent signal definitions materially affect transfer'],
  ['SPARC', 'TORAX scenario search, heat-load control and AI-pilot research', 'E1 · simulation and official R&D plans', 'The facility is pre-operation; plans must not be represented as experimental validation'],
  ['ITER / DEMO', 'Target adaptation, digital engineering and safety-critical scenario research', 'E0–E1 · predominantly design/simulation', 'No same-scale operating data exist; transfer requires demonstrable extrapolation and independent protection'],
];

const risksEn = [
  ['Out-of-distribution failure', 'New wall conditions, heating combinations, diagnostic anomalies or facilities can invalidate the training distribution. Detect OOD state online and define deterministic degradation.'],
  ['Miscalibrated uncertainty', 'Accurate point predictions do not establish credible risk. Calibrate intervals and propagate uncertainty into control and engineering decisions.'],
  ['Correlation is not causation', 'A model may learn operating conventions or acquisition artefacts. Apply conservation, intervention and synthetic-diagnostic constraints.'],
  ['Agent overreach', 'Generative models must not bypass deterministic safety layers. Tool allowlists, least privilege, dual approval and execution receipts are mandatory.'],
  ['Continual-learning risk', 'Online updates can invalidate qualified behaviour. Freeze production models and require candidates to re-pass gates in shadow mode.'],
  ['Untraceable evidence', 'Training data, code, weights, configuration, prompts, tool calls and outputs must resolve to one versioned timeline.'],
];

const roadmapEn = [
  ['A0', 'Data and evidence', 'Establish discharge-level data quality, labels, ontology, facility configuration, model cards and reproducible evaluation.'],
  ['A1', 'Assistive models', 'Begin with diagnostic reconstruction, anomaly detection and narrow single-physics surrogates without real-time control authority.'],
  ['A2', 'Predictive twin', 'Combine surrogates with DINA/MEQ, transport and engineering constraints to produce an uncertainty-aware digital shadow.'],
  ['A3', 'Operator copilot', 'Provide experiment retrieval, scenario comparison, simulation orchestration and citable explanations while preserving human decisions.'],
  ['A4', 'Governed agent', 'Automate offline workflows within tool allowlists and authorization gates; every write remains auditable and reversible.'],
  ['A5', 'Bounded autonomy', 'Close the loop only within a narrow, independently verified applicability domain; safety protection remains independent of generative AI.'],
];

const domainCounts = Object.fromEntries(
  (Object.keys(domainMeta) as AIDomain[]).map((domain) => [domain, aiResearchItems.filter((item) => item.domain === domain).length]),
) as Record<AIDomain, number>;
const directCodeCount = aiResearchItems.filter((item) => item.code.some((repo) => repo.status === 'official-direct')).length;
const deviceEvidenceCount = aiResearchItems.filter((item) => ['E2', 'E3', 'E4'].includes(item.evidenceLevel)).length;

export default function AIPage() {
  const { locale } = useI18n();
  if (locale === 'en') {
    return (
      <main className="aiPage">
        <SiteNav active="ai" />
        <KnowledgeBackLink />

        <header className="aiHero">
          <div>
            <p className="aiEyebrow">FUSION AI-NATIVE RESEARCH ATLAS · 2026</p>
            <h1>AI for fusion</h1>
            <p>Explore surrogates, foundation models and agents. Actions affecting a facility require safety checks and authorized approval.</p>
            <div className="aiActions"><a href="#catalog">Search the research atlas</a><a href="/fusion-ai-native-research-report.docx" download>Download report (Chinese)</a></div>
            <dl className="aiHeroStats"><div><dt>{aiResearchItems.length}</dt><dd>verified records</dd></div><div><dt>9</dt><dd>knowledge domains</dd></div><div><dt>{deviceEvidenceCount}</dt><dd>records using facility data or stronger evidence</dd></div><div><dt>{directCodeCount}</dt><dd>records with official direct code</dd></div></dl>
          </div>
          <TwinAgentMotion />
        </header>

        <section className="aiThesis"><p className="aiIndex">00 / OPERATING PRINCIPLE</p><h2><span>Twin-grounded AI:</span> declared scope, verifiable decisions, clear explanations and rollback.</h2></section>

        <section className="aiCapabilities" id="capabilities"><div className="aiSectionHead"><p className="aiIndex">01 / CAPABILITY STACK</p><h2>From machine learning to agents</h2><p>Foundation models provide representations, task models perform deterministic work, and agents orchestrate tools. The twin supplies state, simulation, configuration and evidence boundaries.</p></div><div className="capabilityGrid">{capabilityLayersEn.map((item) => <article key={item.index}><header><span>{item.index}</span><b>{item.en}</b></header><h3>{item.title}</h3><p>{item.role}</p><dl><div><dt>Suitable tasks</dt><dd>{item.tasks}</dd></div><div><dt>Gate before twin integration</dt><dd>{item.gate}</dd></div></dl></article>)}</div></section>

        <section className="aiLandscape" id="catalog"><div className="aiSectionHead aiLandscapeHead"><div><p className="aiIndex">02 / SEARCHABLE RESEARCH LANDSCAPE</p><h2>Research catalogue across nine domains</h2><p>Sources prioritize papers, official pages and author repositories. Non-public code, enabling tools and community reproductions are distinguished from the paper authors&apos; implementation.</p></div><div className="landscapeDownloads"><a href="/fusion-ai-native-research-report.docx" download><b>WORD</b><span>Technical report (Chinese)</span></a><a href="/data/fusion-ai-native-landscape.json" download><b>JSON</b><span>Maintainable research data</span></a><a href="/fusion-ai-native-paper-code-index.csv" download><b>CSV</b><span>Paper and code index</span></a></div></div><AIResearchCatalog /></section>

        <section className="aiDomains" id="domains"><div className="aiSectionHead"><p className="aiIndex">03 / NINE-DOMAIN SYNTHESIS</p><h2>Applications across nine research domains</h2><p>Each domain sets its own data, physics constraints, validation metrics and responsibility boundaries.</p></div><div className="domainSynthesisGrid">{(Object.keys(domainMeta) as AIDomain[]).map((key) => { const meta = domainMeta[key]; const analysis = domainAnalysisEn[key]; return <article key={key} style={{ '--domain-accent': meta.color } as React.CSSProperties}><header><span>{meta.index}</span><b>{meta.en}</b><i>{domainCounts[key]} records</i></header><h3>{meta.en}</h3><dl><div><dt>Focus</dt><dd>{analysis.focus}</dd></div><div><dt>Frontier</dt><dd>{analysis.frontier}</dd></div><div><dt>Gap</dt><dd>{analysis.gap}</dd></div></dl></article>; })}</div></section>

        <section className="aiDevices" id="devices"><div className="aiSectionHead"><p className="aiIndex">04 / FACILITY ADOPTION</p><h2>Facility adoption: distinguish experiments from plans</h2></div><div className="deviceEvidenceTable" role="table" aria-label="Evidence for AI-native applications on fusion facilities"><div className="deviceEvidenceHeader" role="row"><span>Facility</span><span>Representative work</span><span>Highest evidence</span><span>Interpretation boundary</span></div>{deviceMatrixEn.map((row) => <div role="row" key={row[0]}>{row.map((cell) => <span role="cell" key={cell}>{cell}</span>)}</div>)}</div></section>

        <section className="aiArchitecture"><div><p className="aiIndex">05 / REFERENCE ARCHITECTURE</p><h2>Online and offline architecture</h2><p>Online models must be frozen, time-bounded and reversible. Offline agents retrieve, simulate, train, compare and report. Data, physics, timing, robustness and authorization gates precede shadow or bounded closed-loop use.</p></div><div className="archStack"><article><span>ONLINE · ms–s</span><b>Diagnostics → state estimation → fast prediction → deterministic safety controller</b><i>Worst-case latency · independent protection · OOD detection · degraded modes</i></article><article><span>EVIDENCE GATE</span><b>Data lineage · physical conservation · VVUQ · HIL · authorization · signed release</b><i>Approve / reject / roll back / re-validate</i></article><article><span>OFFLINE · min–week</span><b>High-fidelity simulation → training and evaluation → agent orchestration → expert review</b><i>Cross-facility validation · adversarial testing · fault injection · model cards</i></article></div></section>

        <section className="aiRisks"><div className="aiSectionHead"><p className="aiIndex">06 / TRUST GAPS</p><h2>Key risks to trustworthy operation</h2></div><div className="riskGrid">{risksEn.map((item, index) => <article key={item[0]}><span>{String(index + 1).padStart(2, '0')}</span><h3>{item[0]}</h3><p>{item[1]}</p></article>)}</div></section>

        <section className="aiRoute" id="route"><div className="aiSectionHead"><p className="aiIndex">07 / FUSIONDIGITAL ROADMAP</p><h2>Start with DINA / MEQ and narrow tasks</h2><p>Start with reproducible evaluation and surrogate services, then shadow mode. Authorize closed loop only in a narrow, verified domain. Generating an action does not authorize execution.</p></div><div className="aiRouteGrid">{roadmapEn.map((item) => <article key={item[0]}><span>{item[0]}</span><h3>{item[1]}</h3><p>{item[2]}</p></article>)}</div></section>

        <section className="platformInlineLink"><span>Records retain evidence, sources, code relationships and limitations. Facility actions still require server-side authorization and human approval.</span><a href="/platform#architecture">View the agent-integration architecture →</a></section>
        <SiteFooter />
      </main>
    );
  }
  return (
    <main className="aiPage">
      <SiteNav active="ai" />
      <KnowledgeBackLink />

      <header className="aiHero">
        <div>
          <p className="aiEyebrow">FUSION AI-NATIVE RESEARCH ATLAS · 2026</p>
          <h1>聚变与人工智能</h1>
          <p>
            查找代理模型、基础模型与智能体研究。影响装置的操作仍须经过安全检查与授权审批。
          </p>
          <div className="aiActions">
            <a href="#catalog">检索研究图谱</a>
            <a href="/fusion-ai-native-research-report.docx" download>下载 Word 报告</a>
          </div>
          <dl className="aiHeroStats">
            <div><dt>{aiResearchItems.length}</dt><dd>项核验工作</dd></div>
            <div><dt>9</dt><dd>个知识域</dd></div>
            <div><dt>{deviceEvidenceCount}</dt><dd>项使用装置数据或更高证据</dd></div>
            <div><dt>{directCodeCount}</dt><dd>项有官方对应代码</dd></div>
          </dl>
        </div>
        <TwinAgentMotion />
      </header>

      <section className="aiThesis">
        <p className="aiIndex">00 / OPERATING PRINCIPLE</p>
        <h2><span>以孪生支撑 AI：</span>明确适用范围，决策可验证、可解释、可回退。</h2>
      </section>

      <section className="aiCapabilities" id="capabilities">
        <div className="aiSectionHead">
          <p className="aiIndex">01 / CAPABILITY STACK</p>
          <h2>从机器学习到智能体</h2>
          <p>基础模型提供表征，专用模型执行确定性任务，智能体编排工具；孪生提供状态、仿真、配置与证据边界。</p>
        </div>
        <div className="capabilityGrid">
          {capabilityLayers.map((item) => (
            <article key={item.index}>
              <header><span>{item.index}</span><b>{item.en}</b></header>
              <h3>{item.title}</h3><p>{item.role}</p>
              <dl><div><dt>适合任务</dt><dd>{item.tasks}</dd></div><div><dt>进入孪生前的门</dt><dd>{item.gate}</dd></div></dl>
            </article>
          ))}
        </div>
      </section>

      <section className="aiLandscape" id="catalog">
        <div className="aiSectionHead aiLandscapeHead">
          <div>
            <p className="aiIndex">02 / SEARCHABLE RESEARCH LANDSCAPE</p>
            <h2>九域研究目录</h2>
            <p>来源优先选原论文、官方页面和作者仓库。未公开实现单独标注，使能工具、社区复现与论文原代码分别记录。</p>
          </div>
          <div className="landscapeDownloads">
            <a href="/fusion-ai-native-research-report.docx" download><b>WORD</b><span>完整技术报告</span></a>
            <a href="/data/fusion-ai-native-landscape.json" download><b>JSON</b><span>可维护研究数据</span></a>
            <a href="/fusion-ai-native-paper-code-index.csv" download><b>CSV</b><span>论文与代码索引</span></a>
          </div>
        </div>
        <AIResearchCatalog />
      </section>

      <section className="aiDomains" id="domains">
        <div className="aiSectionHead">
          <p className="aiIndex">03 / NINE-DOMAIN SYNTHESIS</p>
          <h2>AI 在九个知识域的应用</h2>
          <p>各域分别定义数据、物理约束、验证指标与责任边界。</p>
        </div>
        <div className="domainSynthesisGrid">
          {(Object.keys(domainMeta) as AIDomain[]).map((key) => {
            const meta = domainMeta[key];
            const analysis = domainAnalysis[key];
            return (
              <article key={key} style={{ '--domain-accent': meta.color } as React.CSSProperties}>
                <header><span>{meta.index}</span><b>{meta.en}</b><i>{domainCounts[key]} 项</i></header>
                <h3>{meta.label}</h3>
                <dl><div><dt>重点</dt><dd>{analysis.focus}</dd></div><div><dt>前沿</dt><dd>{analysis.frontier}</dd></div><div><dt>缺口</dt><dd>{analysis.gap}</dd></div></dl>
              </article>
            );
          })}
        </div>
      </section>

      <section className="aiDevices" id="devices">
        <div className="aiSectionHead">
          <p className="aiIndex">04 / DEVICE ADOPTION</p>
          <h2>装置应用：实验闭环与计划分别标注</h2>
        </div>
        <div className="deviceEvidenceTable" role="table" aria-label="聚变装置智能原生应用证据">
          <div className="deviceEvidenceHeader" role="row"><span>装置</span><span>代表工作</span><span>最高证据</span><span>阅读边界</span></div>
          {deviceMatrix.map((row) => <div role="row" key={row[0]}>{row.map((cell) => <span role="cell" key={cell}>{cell}</span>)}</div>)}
        </div>
      </section>

      <section className="aiArchitecture">
        <div><p className="aiIndex">05 / REFERENCE ARCHITECTURE</p><h2>在线与离线架构</h2><p>在线模型须冻结、可计时、可回退；离线智能体检索、仿真、训练、比较和报告。进入影子或有限闭环前，须通过数据、物理、实时性、鲁棒性与权限审查。</p></div>
        <div className="archStack">
          <article><span>ONLINE · ms–s</span><b>诊断 → 状态估计 → 快速预测 → 确定性安全控制器</b><i>最坏时延 · 独立保护 · OOD 检测 · 降级模式</i></article>
          <article><span>EVIDENCE GATE</span><b>数据谱系 · 物理守恒 · VVUQ · HIL · 权限 · 签名发布</b><i>批准 / 拒绝 / 回退 / 再验证</i></article>
          <article><span>OFFLINE · min–week</span><b>高保真模拟 → 训练评测 → 智能体编排 → 专家评审</b><i>跨装置验证 · 对抗测试 · 失效注入 · 模型卡</i></article>
        </div>
      </section>

      <section className="aiRisks">
        <div className="aiSectionHead"><p className="aiIndex">06 / TRUST GAPS</p><h2>可信运行的主要风险</h2></div>
        <div className="riskGrid">{risks.map((item, index) => <article key={item[0]}><span>{String(index + 1).padStart(2, '0')}</span><h3>{item[0]}</h3><p>{item[1]}</p></article>)}</div>
      </section>

      <section className="aiRoute" id="route">
        <div className="aiSectionHead"><p className="aiIndex">07 / FUSIONDIGITAL ROADMAP</p><h2>从 DINA / MEQ 与窄任务起步</h2><p>先评测与代理服务，再影子运行；仅在经验证的狭窄适用域授权闭环。生成方案不等于获准执行。</p></div>
        <div className="aiRouteGrid">{roadmap.map((item) => <article key={item[0]}><span>{item[0]}</span><h3>{item[1]}</h3><p>{item[2]}</p></article>)}</div>
      </section>

      <section className="platformInlineLink"><span>条目保留证据、来源、代码状态与局限。装置操作仍需服务端授权和人工批准。</span><a href="/platform#architecture">查看智能体接入架构 →</a></section>

      <SiteFooter />
    </main>
  );
}
