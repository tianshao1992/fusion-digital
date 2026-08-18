import Image from 'next/image';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import KnowledgeBackLink from '../components/KnowledgeBackLink';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import StaticLocaleContent from '../components/StaticLocaleContent';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from '../i18n/config';
import DiagnosticsResearchCatalog from './DiagnosticsResearchCatalog';
import {
  DiagnosticsClosedLoopGraph,
  DiagnosticsDeviceCoverageChart,
  DiagnosticsEvidenceHeatmap,
  DiagnosticsRoadmapChart,
  DiagnosticsTaskCoverageChart,
  DiagnosticsTimescaleChart,
} from './DiagnosticsCharts';
import {
  diagnosticsDeviceProfiles,
  diagnosticsResearchItems,
  diagnosticsTaskMeta,
  type DiagnosticsTaskId,
} from './diagnosticsResearch';
import { parseDiagnosticsCatalogState, type DiagnosticsSearchParams } from './diagnosticsFilters';
import './diagnostics.css';

export async function generateMetadata():Promise<Metadata>{const store=await cookies();const en=(resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value)??DEFAULT_LOCALE)==='en';return{title:en?'Diagnostics and Sensing: Fusion Measurements, Synthetic Observations and Facility Evidence':'诊断感知：聚变诊断、合成观测与装置证据图谱',description:en?'Search fusion-diagnostic research by DG0–DG11 task, technique and facility, with scientific evidence distinguished from engineering deployment.':'按 DG0–DG11、技术类型和装置检索 97 项聚变诊断工作、167 篇论文与来源、35 项代码资产和 18 个装置档案，并区分科学证据与工程部署。'};}

const taskBriefs: Record<DiagnosticsTaskId, { boundary: string; signals: string }> = {
  DG0: {
    boundary: '管理需求、几何、标定、时钟、数据质量、环境适配、可维护性与诊断自身健康，是全部测量链的共同底座。',
    signals: '配置 · 标定证书 · 时间基准 · 质量位 · 不确定度 · 健康状态',
  },
  DG1: {
    boundary: '由磁探针、磁通环、Rogowski、抗磁与 MSE 等观测重建磁平衡、电流和等离子体位形。',
    signals: '边界 · 轴位置 · 电流 · q / 磁剪切 · 磁能 · 环电压',
  },
  DG2: {
    boundary: '以干涉、偏振、反射、Thomson scattering、ECE/ECEI 等获得电子密度与电子温度。',
    signals: 'ne · Te · 线积分 · 径向剖面 · 二维涨落',
  },
  DG3: {
    boundary: '由 CXRS/CER、XICS、可见/VUV 光谱与粒子分析测量离子状态、流动、组分和中性粒子。',
    signals: 'Ti · 转动 · 燃料比 · 杂质电荷态 · 中性粒子分布',
  },
  DG4: {
    boundary: '以 bolometry、软/硬 X 射线和光谱观测总辐射、局部辐射、杂质与功率损失。',
    signals: 'Prad · Zeff · 杂质源 · 辐射分布 · 逃逸能量',
  },
  DG5: {
    boundary: '覆盖中子、伽马、聚变产物和高能粒子的产额、谱、空间分布、约束与损失。',
    signals: '中子率/谱 · 聚变功率代理 · 快离子分布 · 逃逸粒子',
  },
  DG6: {
    boundary: '以 Mirnov、BES、DBS、相关反射、PCI、ECEI、GPI 等识别 MHD、波动与湍流结构。',
    signals: '模式频率/数 · 相位 · 相干性 · 湍流谱 · 模式位置',
  },
  DG7: {
    boundary: '诊断边界、SOL、偏滤器和面对等离子体部件的热流、侵蚀沉积、尘埃与壁状态。',
    signals: '热流 · 表面温度 · 粒子通量 · 回收 · 侵蚀 · 热事件',
  },
  DG8: {
    boundary: '把温度、力、位移、应变、振动、声学与光纤等传感扩展到磁体、结构、真空、低温、氚与电厂设备。',
    signals: '温度 · 应力/应变 · 位移 · 振动 · 泄漏 · 绝缘 · 设备健康',
  },
  DG9: {
    boundary: '用仪器几何、传递函数、噪声和采样模型，把物理/工程状态映射为可与真实信号比较的观测量。',
    signals: '虚拟通道 · 仪器响应 · 可观测性 · 设计裕量 · 残差',
  },
  DG10: {
    boundary: '联合多诊断开展 Bayesian/GP/滤波、层析与数据同化，输出带不确定度且相互一致的状态。',
    signals: '后验状态 · 协方差 · 三维辐射/发射率 · 一致性残差',
  },
  DG11: {
    boundary: '把已计时、可降级的实时特征、代理反演、异常检测和质量门接入 PCS、保护与人机界面。',
    signals: '实时状态 · 置信度 · 质量门 · 告警 · 决策接口 · 审计回执',
  },
};

const evidenceDefinitions = [
  ['E0', '需求 / 概念', '只有需求、架构或原理描述，尚无足够动态结果。'],
  ['E1', '数值 / 合成验证', '在数值模型或合成数据上验证，不代表仪器已完成标定。'],
  ['E2', '实验室 / 原型 / 标定', '在标定台、实验室或受控部件上形成可重复证据。'],
  ['E3', '装置数据 / 交叉验证', '使用真实装置数据离线分析、安装调试或与独立诊断交叉验证。'],
  ['E4', '装置在线 / 常规使用', '进入真实装置在线、实时或常规实验流程；不自动等同安全资格。'],
];

const deploymentDefinitions = [
  ['D1', '概念 / 需求'],
  ['D2', '软件或实验室原型'],
  ['D3', '安装、联调、回放、影子或 HIL'],
  ['D4', '常规装置工作流'],
  ['D5', '经治理批准的安全 / 保护关键用途'],
];

const twinGaps = [
  ['G1', '观测不是状态', '多数诊断输出局部或线积分信号；数字孪生还需要联合反演、可观测性分析和跨域一致状态。'],
  ['G2', '标定尚未数字线程化', '几何、时钟、响应函数、校准证书、有效期、漂移和维修事件必须随每个数据产品可查询。'],
  ['G3', '合成—真实残差未闭环', '前向模型不能只做论文后处理；需要与原始通道持续对齐，并把残差反馈给模型、仪器和不确定度。'],
  ['G4', '质量与失效缺少在线语义', '缺数、饱和、污染、辐照漂移、时间错位和算法失效要形成机器可读质量位与降级策略。'],
  ['G5', '等离子体与工程健康割裂', '位形、热流与中子源应能关联温度、力、位移、应变及辅机状态，支撑故障传播和寿命判断。'],
  ['G6', '实时不等于可信控制', '低平均延迟不足以进入闭环；还需要最坏时延、故障注入、HIL、权限、回退和独立保护证据。'],
  ['G7', '跨装置语义仍不统一', '通道名、坐标、单位、配置和处理版本差异阻碍迁移；IMAS/OMAS 等契约仍需站点适配与审计。'],
  ['G8', '生命周期证据不足', '长脉冲、辐照老化、维护后再标定、备件替换和软件升级必须进入同一配置与责任体系。'],
];

const roadmap = [
  ['R0', '测量资产与计量底座', '盘点通道、视线、采样、时钟、标定、误差、依赖和责任人；保留原始 ADC 与不可变配置快照。', '近期 · 可立即实施'],
  ['R1', '回放与合成诊断闭环', '统一炮次回放接口；让 DINA / MEQ、输运与工程模型生成虚拟通道，并以残差和交叉诊断验证。', '近期 → 中期'],
  ['R2', '多诊断状态与影子运行', '构建带 UQ 的集成反演和数据同化，在影子模式验证时延、漂移、缺失通道与异常工况。', '中期'],
  ['R3', '控制与工程健康联动', '把可信状态、热流和载荷接入场景规划、保护建议、预测维护与实验协同；所有动作经过确定性门。', '中期 → 远期'],
  ['R4', '电厂级持续可信运行', '形成跨班次、跨维护周期、跨软件版本的证据链，覆盖降级、再标定、老化、网络安全与安全论证。', '远期'],
];
const taskBriefsEn:Record<DiagnosticsTaskId,{boundary:string;signals:string}>={
  DG0:{boundary:'Govern requirements, geometry, calibration, clocks, data quality, environment, maintainability and diagnostic health across every measurement chain.',signals:'Configuration · calibration certificate · time reference · quality flags · uncertainty · health state'},DG1:{boundary:'Reconstruct magnetic equilibrium, current and plasma configuration from magnetic probes, flux loops, Rogowski coils, diamagnetics and MSE.',signals:'Boundary · magnetic-axis position · current · q / magnetic shear · magnetic energy · loop voltage'},DG2:{boundary:'Measure electron density and temperature through interferometry, polarimetry, reflectometry, Thomson scattering and ECE/ECEI.',signals:'ne · Te · line integral · radial profile · two-dimensional fluctuations'},DG3:{boundary:'Use CXRS/CER, XICS, visible/VUV spectroscopy and particle analysis to measure ion state, flow, composition and neutrals.',signals:'Ti · rotation · fuel ratio · impurity charge state · neutral distribution'},DG4:{boundary:'Observe total and localized radiation, impurities and power loss using bolometry, soft/hard X-rays and spectroscopy.',signals:'Prad · Zeff · impurity source · radiation distribution · escaping energy'},DG5:{boundary:'Measure yield, spectrum, spatial distribution, confinement and loss of neutrons, gamma rays, fusion products and energetic particles.',signals:'Neutron rate/spectrum · fusion-power proxy · fast-ion distribution · escaping particles'},DG6:{boundary:'Identify MHD, wave and turbulence structures using Mirnov coils, BES, DBS, correlation reflectometry, PCI, ECEI and GPI.',signals:'Mode frequency/number · phase · coherence · turbulence spectrum · mode location'},DG7:{boundary:'Diagnose the boundary, SOL, divertor and plasma-facing components for heat flux, erosion/deposition, dust and wall state.',signals:'Heat flux · surface temperature · particle flux · recycling · erosion · thermal event'},DG8:{boundary:'Extend temperature, force, displacement, strain, vibration, acoustic and fibre sensing to magnets, structures, vacuum, cryogenics, tritium and plant equipment.',signals:'Temperature · stress/strain · displacement · vibration · leak · insulation · equipment health'},DG9:{boundary:'Map physics/engineering state into instrument-comparable observables using geometry, transfer functions, noise and sampling models.',signals:'Virtual channels · instrument response · observability · design margin · residual'},DG10:{boundary:'Fuse multiple diagnostics through Bayesian/GP/filtering, tomography and data assimilation to produce mutually consistent states with uncertainty.',signals:'Posterior state · covariance · 3D radiation/emissivity · consistency residual'},DG11:{boundary:'Connect timed, degradable real-time features, surrogate inversions, anomaly detection and quality gates to PCS, protection and HMI.',signals:'Real-time state · confidence · quality gate · alarm · decision interface · audit receipt'}};
const evidenceDefinitionsEn=[['E0','Requirement / concept','Requirement, architecture or principle only; insufficient dynamic evidence.'],['E1','Numerical / synthetic validation','Validated in a numerical model or synthetic dataset; does not establish instrument calibration.'],['E2','Laboratory / prototype / calibration','Repeatable evidence from a calibration stand, laboratory or controlled component.'],['E3','Facility data / cross-validation','Offline real-machine data, installation/commissioning or comparison with an independent diagnostic.'],['E4','Online / routine facility use','Used online, in real time or in routine experiments; not automatically safety-qualified.']];
const deploymentDefinitionsEn=[['D1','Concept / requirement'],['D2','Software or laboratory prototype'],['D3','Installation, commissioning, replay, shadow or HIL'],['D4','Routine facility workflow'],['D5','Governance-approved safety/protection-critical use']];
const twinGapsEn=[['G1','Observation is not state','Most diagnostics produce local or line-integrated signals; a twin needs joint inference, observability analysis and a cross-domain consistent state.'],['G2','Calibration lacks a digital thread','Geometry, clocks, response functions, certificates, validity, drift and maintenance events must remain queryable with every product.'],['G3','Synthetic–real residuals are not closed','Forward models must align continuously to raw channels and feed residuals back to physics, instruments and uncertainty.'],['G4','Quality and failure lack online semantics','Missing data, saturation, contamination, radiation drift, time offset and algorithm failure need machine-readable flags and degradation strategies.'],['G5','Plasma and engineering health are separated','Configuration, heat flux and neutron source must relate to temperature, force, displacement, strain and auxiliary-system state.'],['G6','Real time does not imply trustworthy control','Low mean latency is insufficient; worst-case latency, fault injection, HIL, authorization, fallback and independent protection are also required.'],['G7','Cross-facility semantics remain inconsistent','Channel names, coordinates, units, configurations and processing revisions impede transfer; IMAS/OMAS contracts still need audited site mappings.'],['G8','Lifecycle evidence is incomplete','Long pulses, irradiation ageing, post-maintenance recalibration, spare replacement and software upgrades need one configuration and accountability system.']];
const diagnosticsRoadmapEn=[['R0','Measurement assets and metrology foundation','Inventory channels, lines of sight, sampling, clocks, calibration, error, dependencies and owners; preserve raw ADC and immutable configuration snapshots.','Near term · immediate'],['R1','Replay and synthetic-diagnostic closed loop','Unify shot replay; let DINA/MEQ, transport and engineering models generate virtual channels validated through residuals and cross-diagnostic comparisons.','Near → medium term'],['R2','Multi-diagnostic state and shadow operation','Build integrated inference/data assimilation with UQ and validate latency, drift, channel loss and off-normal cases in shadow mode.','Medium term'],['R3','Link control to engineering health','Connect trusted state, heat flux and loads to scenario planning, protection advice, predictive maintenance and experiment coordination under deterministic gates.','Medium → long term'],['R4','Continuously trustworthy power-plant operation','Maintain evidence across shifts, maintenance cycles and software versions, covering degradation, recalibration, ageing, cybersecurity and safety cases.','Long term']];

const taskIds = Object.keys(diagnosticsTaskMeta) as DiagnosticsTaskId[];
const directCodeCount = diagnosticsResearchItems.filter((item) =>
  item.code.some((asset) => asset.status === 'official-direct'),
).length;
const onlineCount = diagnosticsResearchItems.filter((item) => item.evidenceLevel === 'E4').length;
const uniquePaperCount = new Set(
  diagnosticsResearchItems.flatMap((item) => item.papers.map((paper) => {
    const record = paper as { doi?: string | null; url?: string | null; title: string };
    return record.doi || record.url || record.title;
  })),
).size;

function ScientificFigure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="diagnosticsFigure">
      <Image src={src} alt={alt} width={2400} height={1380} sizes="(max-width: 1120px) 89vw, 47vw" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export default async function DiagnosticsPage({ searchParams }: { searchParams?: Promise<DiagnosticsSearchParams> }) {
  const initialCatalogState = parseDiagnosticsCatalogState(await (searchParams ?? Promise.resolve({})));
  return <StaticLocaleContent zh={<DiagnosticsContent en={false} initialCatalogState={initialCatalogState}/>} en={<DiagnosticsContent en initialCatalogState={initialCatalogState}/>}/>;
}

function DiagnosticsContent({en,initialCatalogState}:{en:boolean;initialCatalogState:ReturnType<typeof parseDiagnosticsCatalogState>}){
  if(en)return <main className="diagnosticsPage"><SiteNav active="diagnostics"/><KnowledgeBackLink/>
    <header className="diagnosticsHero"><div className="diagnosticsHeroCopy"><p className="diagnosticsEyebrow">DIAGNOSTICS &amp; SENSING · KNOWLEDGE DOMAIN 04</p><h1>Diagnostics and sensing: <span>turn unobservable fusion states into calibrated, verifiable decision evidence.</span></h1><p>Fusion diagnostics are neither a sensor list nor synonymous with “intelligent diagnostics.” They connect instrument physics, metrology, acquisition, inference and assimilation, synthetic diagnostics, real-time interfaces and engineering health so that the physical facility and digital twin share time, geometry, configuration and uncertainty.</p><div className="diagnosticsActions"><a href="#catalog">Search principal work</a><a href="/fusion-diagnostics-research-report.docx" download>Download full report (Chinese)</a></div><dl className="diagnosticsHeroStats"><div><dt>{diagnosticsResearchItems.length}</dt><dd>structured records</dd></div><div><dt>{uniquePaperCount}</dt><dd>unique papers / sources</dd></div><div><dt>{directCodeCount}</dt><dd>records linked to official direct code</dd></div><div><dt>{diagnosticsDeviceProfiles.length}</dt><dd>facility evidence profiles</dd></div><div><dt>{onlineCount}</dt><dd>records with E4 online/routine evidence</dd></div></dl></div><ScientificFigure src="/figures/diagnostics-digital-twin-architecture-nature.png" alt="Reference architecture linking a fusion facility, measurement chain, state inference, synthetic diagnostics, decisions and evidence governance" caption="Figure 1 | Configuration, clocks, calibration and uncertainty connect physical observations to model predictions."/></header>
    <section className="diagnosticsThesis"><p className="diagnosticsIndex">00 / DOMAIN THESIS</p><h2><span>A digital twin is not a signal display.</span> It must continually answer: what state is the facility in, why do we trust it, how uncertain is it, why do model and observation disagree, and what may safely follow?</h2><div><p>Real diagnostics provide noisy, selective local observations. Integrated inference converts complementary diagnostics into uncertain state estimates. Synthetic diagnostics project model state back into instrument space. Model calibration is physically meaningful only when both paths close under the same configuration.</p><p>For a power plant, diagnostic responsibility also covers magnets, structures, vacuum, cryogenics, fuel/tritium, cooling and power conversion. Plasma state and engineering health cannot remain isolated products.</p></div></section>
    <section className="diagnosticsLoop" id="closed-loop"><div className="diagnosticsSectionHead"><p className="diagnosticsIndex">01 / OBSERVATION–MODEL–DECISION LOOP</p><h2>Physical and synthetic diagnostics form a bidirectional measurement chain—not a one-way data pipe.</h2><p>Real-time decisions consume only frozen products that pass quality gates. Raw signals, calibration and processing versions remain available for replay, attribution and re-validation.</p></div><div className="diagnosticsLoopGrid"><figure className="diagnosticsChartFigure"><DiagnosticsClosedLoopGraph/><figcaption>Interactive view 1 | Observations form posterior state; synthetic diagnostics return model predictions to instrument space; residuals drive calibration, design and decisions.</figcaption></figure><div className="diagnosticsLoopPrinciples"><article><span>01</span><div><b>Metrological traceability</b><p>Every value traces to raw signal, units, coordinates, calibration coefficients, validity and geometry revision.</p></div></article><article><span>02</span><div><b>Explicit observation operator</b><p>Line of sight, convolution, response, noise, sampling and occlusion enter the forward model; grid values are not treated as measurements.</p></div></article><article><span>03</span><div><b>Propagated uncertainty</b><p>Instrument, model-structure and inference-posterior uncertainties remain distinct and propagate into decisions.</p></div></article><article><span>04</span><div><b>Separated safety responsibilities</b><p>AI may classify modes and orchestrate analysis but cannot bypass quality gates, authorization, deterministic control or independent protection.</p></div></article></div></div></section>
    <section className="diagnosticsTaxonomy" id="taxonomy"><div className="diagnosticsSectionHead"><p className="diagnosticsIndex">02 / ONE FOUNDATION + ELEVEN TASKS</p><h2>One systems-engineering and metrology foundation supports eleven measurement, inference and real-time tasks.</h2><p>DG0 is cross-cutting; DG1–DG8 follow measured objects; DG9–DG11 cover forward models, joint inference and decision interfaces. Every record has one primary task and may carry related tasks.</p></div><figure className="diagnosticsChartFigure diagnosticsCoverage"><DiagnosticsTaskCoverageChart/><figcaption>Interactive view 2 | Research records aggregated by primary task; select a bar to filter the catalogue.</figcaption></figure><div className="diagnosticsTaskGrid">{taskIds.map(taskId=>{const meta=diagnosticsTaskMeta[taskId];const brief=taskBriefsEn[taskId];const count=diagnosticsResearchItems.filter(item=>item.primaryTask===taskId).length;return <article className={meta.role==='cross-cutting'?'crossCutting':''} key={taskId} id={`task-${taskId}`}><header><b>{taskId}</b><span>{meta.en}</span><i>{count} records</i></header><h3>{meta.en}</h3><p>{brief.boundary}</p><dl><div><dt>Representative products</dt><dd>{brief.signals}</dd></div><div><dt>Domain role</dt><dd>{meta.role==='cross-cutting'?'Cross-measurement-chain capability':'Measured object and state'}</dd></div></dl><a href={`/diagnostics?task=${taskId}#catalog`}>Search this task <span aria-hidden="true">↗</span></a></article>})}</div></section>
    <section className="diagnosticsResearch" id="catalog"><div className="diagnosticsSectionHead diagnosticsResearchHead"><div><p className="diagnosticsIndex">03 / SEARCHABLE EVIDENCE ATLAS</p><h2>Search principal work by task, technique, facility, evidence and software relationship.</h2><p>Records distinguish original research code, official enabling tools, community reproductions, commercial/controlled software and non-public code.</p></div><nav className="diagnosticsDownloads" aria-label="Diagnostic-research data downloads"><a href="/fusion-diagnostics-research-report.docx" download><b>DOCX</b><span>Full report (Chinese)</span></a><a href="/data/fusion-diagnostics-landscape.json" download><b>JSON</b><span>Research fact base</span></a><a href="/fusion-diagnostics-paper-code-index.csv" download><b>CSV</b><span>Paper/code index</span></a><a href="/fusion-diagnostics-references.bib" download><b>BIB</b><span>Reference library</span></a><a href="/data/fusion-diagnostics-device-profiles.json" download><b>DEVICE</b><span>Facility profiles JSON</span></a></nav></div><DiagnosticsResearchCatalog initialState={initialCatalogState}/></section>
    <section className="diagnosticsEvidence" id="evidence"><div className="diagnosticsSectionHead"><p className="diagnosticsIndex">04 / EVIDENCE ≠ DEPLOYMENT</p><h2>Scientific evidence E and engineering deployment D are independent axes.</h2><p>E4 records online, real-time or routine facility use; it does not imply D5 safety qualification. D5 requires approval, configuration accountability, testing, change control and lifecycle evidence.</p></div><div className="diagnosticsEvidenceLayout"><figure className="diagnosticsChartFigure"><DiagnosticsEvidenceHeatmap/><figcaption>Interactive view 3 | Cross-aggregation of E0–E4 and D1–D5; select a cell to filter the catalogue.</figcaption></figure><div className="diagnosticsEvidenceScales"><div><h3>E · Scientific and operational evidence</h3>{evidenceDefinitionsEn.map(([id,label,description])=><article key={id}><span>{id}</span><div><b>{label}</b><p>{description}</p></div></article>)}</div><div><h3>D · Deployment responsibility</h3>{deploymentDefinitionsEn.map(([id,label])=><article key={id}><span>{id}</span><div><b>{label}</b></div></article>)}</div></div></div></section>
    <section className="diagnosticsScientificViews" id="scientific-views"><div className="diagnosticsSectionHead"><p className="diagnosticsIndex">05 / SCIENTIFIC VIEWS</p><h2>Five views explain one system: time scale, facility coverage, inference and real-time governance.</h2><p>Orders of magnitude and relationships connect to the primary sources, calibration and error fields in the catalogue.</p></div><div className="diagnosticsFigureGrid"><figure className="diagnosticsChartFigure diagnosticsScientificChart"><DiagnosticsTimescaleChart/><figcaption>Interactive view 4 | Fast protection, real-time state, intra-shot evolution, inter-shot calibration and lifecycle health require different data chains and validation.</figcaption></figure><figure className="diagnosticsChartFigure diagnosticsScientificChart"><DiagnosticsDeviceCoverageChart/><figcaption>Interactive view 5 | Facility evidence indexed by task, data access, real-time interface and validation environment.</figcaption></figure><ScientificFigure src="/figures/diagnostics-synthetic-loop-nature.png" alt="Residual loop linking physical and synthetic diagnostics" caption="Figure 7 | A model passes through the instrument forward operator before comparison with raw observations; residuals localize physics, geometry, calibration or noise-model error."/><ScientificFigure src="/figures/diagnostics-inference-graph-nature.png" alt="Joint multi-diagnostic inference and uncertainty propagation" caption="Figure 8 | Integrated inference combines complementary observations with explicit prior, likelihood, geometry and posterior uncertainty."/><ScientificFigure src="/figures/diagnostics-realtime-governance-nature.png" alt="Real-time diagnostics, AI, quality gates and safety interfaces" caption="Figure 9 | Input quality, worst-case latency, out-of-domain state and degradation determine whether output may enter PCS, protection or HMI."/></div></section>
    <section className="diagnosticsGaps" id="gaps"><div className="diagnosticsSectionHead"><p className="diagnosticsIndex">06 / GAP TO A DIGITAL TWIN</p><h2>The gap is not another model; it is continuous closure of observation, state, evidence and accountability.</h2></div><div className="diagnosticsGapGrid">{twinGapsEn.map(([id,title,description])=><article key={id}><span>{id}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>
    <section className="diagnosticsRoadmap" id="roadmap"><div className="diagnosticsSectionHead"><p className="diagnosticsIndex">07 / FUSIONDIGITAL ROADMAP</p><h2>Begin with shot-level evidence and progress toward continuously observable, trustworthy plant decisions.</h2><p>Every phase gates on replayability, comparability and graceful degradation; pace depends on EXL-50U/EHL-2 instrumentation, data authorization and campaign plans.</p></div><figure className="diagnosticsChartFigure diagnosticsRoadmapFigure"><DiagnosticsRoadmapChart/><figcaption>Interactive view 6 | Phases may overlap and progress only through evidence gates.</figcaption></figure><div className="diagnosticsRoadmapGrid">{diagnosticsRoadmapEn.map(([id,title,description,horizon])=><article key={id}><header><span>{id}</span><b>{horizon}</b></header><h3>{title}</h3><p>{description}</p><footer>Configuration baseline → validation record → accountable approval → reversible release</footer></article>)}</div></section><SiteFooter/>
  </main>;
  return (
    <main className="diagnosticsPage">
      <SiteNav active="diagnostics" />
      <KnowledgeBackLink />

      <header className="diagnosticsHero">
        <div className="diagnosticsHeroCopy">
          <p className="diagnosticsEyebrow">DIAGNOSTICS &amp; SENSING · KNOWLEDGE DOMAIN 04</p>
          <h1>诊断感知：<span>让不可直接看见的聚变状态，成为可校准、可验证的决策证据。</span></h1>
          <p>
            聚变诊断不是传感器清单，也不等于“智能诊断”。它贯通仪器物理、计量标定、数据采集、反演与同化、
            合成诊断、实时接口和工程健康，把真实装置与数字孪生放在同一时间、几何、配置和不确定度语境中。
          </p>
          <div className="diagnosticsActions">
            <a href="#catalog">检索主要工作</a>
            <a href="/fusion-diagnostics-research-report.docx" download>下载完整报告</a>
          </div>
          <dl className="diagnosticsHeroStats">
            <div><dt>{diagnosticsResearchItems.length}</dt><dd>项结构化工作</dd></div>
            <div><dt>{uniquePaperCount}</dt><dd>篇去重论文 / 来源</dd></div>
            <div><dt>{directCodeCount}</dt><dd>项关联官方直接代码</dd></div>
            <div><dt>{diagnosticsDeviceProfiles.length}</dt><dd>个装置证据档案</dd></div>
            <div><dt>{onlineCount}</dt><dd>项达到 E4 在线 / 常规使用证据</dd></div>
          </dl>
        </div>
        <ScientificFigure
          src="/figures/diagnostics-digital-twin-architecture-nature.png"
          alt="聚变诊断与数字孪生参考架构：真实装置、测量链、状态反演、合成诊断、决策与证据治理"
          caption="图 1｜真实观测与模型预测通过配置、时钟、标定和不确定度连接。"
        />
      </header>

      <section className="diagnosticsThesis">
        <p className="diagnosticsIndex">00 / DOMAIN THESIS</p>
        <h2><span>数字孪生的本质不是“显示信号”，</span>而是持续回答：装置此刻处于什么状态、我们为何相信它、误差有多大、模型与观测为何不一致，以及据此可以安全地做什么。</h2>
        <div>
          <p>真实诊断给出带噪声、带选择效应的局部观测；集成反演把多诊断转化为带不确定度的状态；合成诊断把模型状态重新投影回仪器空间。只有两条路径在同一配置下闭合，模型校准才有物理含义。</p>
          <p>面向电厂，诊断责任还必须覆盖磁体、结构、真空、低温、燃料/氚、冷却与能量转换设备。等离子体状态和工程健康不能继续作为两套相互孤立的数据产品。</p>
        </div>
      </section>

      <section className="diagnosticsLoop" id="closed-loop">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">01 / OBSERVATION–MODEL–DECISION LOOP</p>
          <h2>真实诊断与合成诊断构成“双向测量链”，不是单向数据管道。</h2>
          <p>点击节点查看它在闭环中的责任。实时决策只消费通过质量门的冻结数据产品；原始信号、标定与处理版本始终保留，支持回放、归因和再验证。</p>
        </div>
        <div className="diagnosticsLoopGrid">
          <figure className="diagnosticsChartFigure">
            <DiagnosticsClosedLoopGraph />
            <figcaption>交互图 1｜观测形成后验状态，模型经合成诊断返回仪器空间，残差驱动校准、设计和决策。</figcaption>
          </figure>
          <div className="diagnosticsLoopPrinciples">
            <article><span>01</span><div><b>计量可追溯</b><p>每个量值都能回到原始信号、单位、坐标、标定系数、有效期和几何版本。</p></div></article>
            <article><span>02</span><div><b>观测算子显式化</b><p>视线、卷积、响应、噪声、采样和遮挡必须进入前向模型，不能把模型网格值直接当测量值。</p></div></article>
            <article><span>03</span><div><b>不确定度随链传播</b><p>仪器误差、模型结构误差和反演后验要区分表达，并随决策产品传播。</p></div></article>
            <article><span>04</span><div><b>安全职责分离</b><p>AI 可识别模式和编排分析，但不得越过质量门、权限、确定性控制器与独立保护。</p></div></article>
          </div>
        </div>
      </section>

      <section className="diagnosticsTaxonomy" id="taxonomy">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">02 / ONE FOUNDATION + ELEVEN TASKS</p>
          <h2>一个系统工程与计量底座，支撑十一类测量、反演和实时任务。</h2>
          <p>DG0 是跨域底座；DG1–DG8 按主要被测对象划分，DG9–DG11负责前向模型、联合反演与决策接口。一项工作只有一个主任务，但可以关联多个任务，避免重复计数。</p>
        </div>
        <figure className="diagnosticsChartFigure diagnosticsCoverage">
          <DiagnosticsTaskCoverageChart />
          <figcaption>交互图 2｜97 项工作按主任务聚合；点击条形进入目录筛选。</figcaption>
        </figure>
        <div className="diagnosticsTaskGrid">
          {taskIds.map((taskId) => {
            const meta = diagnosticsTaskMeta[taskId];
            const brief = taskBriefs[taskId];
            const count = diagnosticsResearchItems.filter((item) => item.primaryTask === taskId).length;
            return (
              <article className={meta.role === 'cross-cutting' ? 'crossCutting' : ''} key={taskId} id={`task-${taskId}`}>
                <header><b>{taskId}</b><span>{meta.en}</span><i>{count} 项</i></header>
                <h3>{meta.label}</h3>
                <p>{brief.boundary}</p>
                <dl><div><dt>代表产品</dt><dd>{brief.signals}</dd></div><div><dt>域角色</dt><dd>{meta.role === 'cross-cutting' ? '跨测量链能力' : '被测对象与状态'}</dd></div></dl>
                <a href={`/diagnostics?task=${taskId}#catalog`}>检索该类工作 <span aria-hidden="true">↗</span></a>
              </article>
            );
          })}
        </div>
      </section>

      <section className="diagnosticsResearch" id="catalog">
        <div className="diagnosticsSectionHead diagnosticsResearchHead">
          <div>
            <p className="diagnosticsIndex">03 / SEARCHABLE EVIDENCE ATLAS</p>
            <h2>按任务、技术、装置、证据和软件关系检索主要工作。</h2>
            <p>条目区分论文原代码、官方使能工具、社区复现、商业/受控软件和未公开代码。</p>
          </div>
          <nav className="diagnosticsDownloads" aria-label="诊断研究数据下载">
            <a href="/fusion-diagnostics-research-report.docx" download><b>DOCX</b><span>完整技术报告</span></a>
            <a href="/data/fusion-diagnostics-landscape.json" download><b>JSON</b><span>工作事实库</span></a>
            <a href="/fusion-diagnostics-paper-code-index.csv" download><b>CSV</b><span>论文代码索引</span></a>
            <a href="/fusion-diagnostics-references.bib" download><b>BIB</b><span>参考文献库</span></a>
            <a href="/data/fusion-diagnostics-device-profiles.json" download><b>DEVICE</b><span>装置档案 JSON</span></a>
          </nav>
        </div>
        <DiagnosticsResearchCatalog initialState={initialCatalogState} />
      </section>

      <section className="diagnosticsEvidence" id="evidence">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">04 / EVIDENCE ≠ DEPLOYMENT</p>
          <h2>科学证据 E 与工程部署 D 是两条独立坐标轴。</h2>
          <p>E4 只说明曾进入真实装置在线、实时或常规工作流，不自动推导为 D5 安全资格。任何 D5 声明必须有审批、配置责任、测试、变更和生命周期证据。</p>
        </div>
        <div className="diagnosticsEvidenceLayout">
          <figure className="diagnosticsChartFigure">
            <DiagnosticsEvidenceHeatmap />
            <figcaption>交互图 3｜工作按 E0–E4 与 D1–D5 交叉聚合；点击单元格进入目录筛选。</figcaption>
          </figure>
          <div className="diagnosticsEvidenceScales">
            <div>
              <h3>E · 科学与运行证据</h3>
              {evidenceDefinitions.map(([id, label, description]) => <article key={id}><span>{id}</span><div><b>{label}</b><p>{description}</p></div></article>)}
            </div>
            <div>
              <h3>D · 部署责任等级</h3>
              {deploymentDefinitions.map(([id, label]) => <article key={id}><span>{id}</span><div><b>{label}</b></div></article>)}
            </div>
          </div>
        </div>
      </section>

      <section className="diagnosticsScientificViews" id="scientific-views">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">05 / SCIENTIFIC VIEWS</p>
          <h2>从时间尺度、装置覆盖到反演与实时链：五张视图解释同一系统。</h2>
          <p>图中数量级和关系与目录中的原始来源、标定和误差信息对应。</p>
        </div>
        <div className="diagnosticsFigureGrid">
          <figure className="diagnosticsChartFigure diagnosticsScientificChart"><DiagnosticsTimescaleChart /><figcaption>交互图 4｜快速保护、实时状态、炮内演化、炮间校准与全生命周期健康对应不同数据链和验证方法。</figcaption></figure>
          <figure className="diagnosticsChartFigure diagnosticsScientificChart"><DiagnosticsDeviceCoverageChart /><figcaption>交互图 5｜按任务、数据开放度、实时接口和验证环境索引装置证据。</figcaption></figure>
          <ScientificFigure src="/figures/diagnostics-synthetic-loop-nature.png" alt="真实诊断与合成诊断残差闭环图" caption="图 7｜合成诊断闭环：模型经过仪器前向算子后再与原始观测比较，残差用于定位物理、几何、校准或噪声模型偏差。" />
          <ScientificFigure src="/figures/diagnostics-inference-graph-nature.png" alt="多诊断联合反演和不确定度传播图" caption="图 8｜集成反演：联合多个互补观测，显式表达先验、似然、空间几何和后验不确定度，避免各诊断各自产生互不一致的状态。" />
          <ScientificFigure src="/figures/diagnostics-realtime-governance-nature.png" alt="实时诊断、人工智能、质量门和安全接口图" caption="图 9｜实时链：输入质量、最坏时延、OOD 和降级状态决定输出进入 PCS、保护或人机界面的路径。" />
        </div>
      </section>

      <section className="diagnosticsGaps" id="gaps">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">06 / GAP TO A DIGITAL TWIN</p>
          <h2>距离数字孪生，缺口不在“再加一个模型”，而在观测、状态、证据与责任能否连续闭合。</h2>
        </div>
        <div className="diagnosticsGapGrid">
          {twinGaps.map(([id, title, description]) => <article key={id}><span>{id}</span><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>

      <section className="diagnosticsRoadmap" id="roadmap">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">07 / FUSIONDIGITAL ROADMAP</p>
          <h2>从炮次级证据链切入，逐步形成电厂级持续观测与可信决策。</h2>
          <p>每一阶段以可回放、可对比、可降级为验收门，节奏取决于 EXL-50U / EHL-2 的仪器配置、数据权限与实验计划。</p>
        </div>
        <figure className="diagnosticsChartFigure diagnosticsRoadmapFigure"><DiagnosticsRoadmapChart /><figcaption>交互图 6｜阶段允许并行，并按证据门推进。</figcaption></figure>
        <div className="diagnosticsRoadmapGrid">
          {roadmap.map(([id, title, description, horizon]) => <article key={id}><header><span>{id}</span><b>{horizon}</b></header><h3>{title}</h3><p>{description}</p><footer>配置基线 → 验证记录 → 责任批准 → 可回退发布</footer></article>)}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
