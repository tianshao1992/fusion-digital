import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import StaticLocaleContent from '../components/StaticLocaleContent';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from '../i18n/config';
import { ProgramPhaseChart, ProgramSystemMap } from './ProgramRoadmapCharts';
import {
  acceptanceDimensions,
  deanDecisions,
  digitalThread,
  knowledgeModuleRoutes,
  roadmapPhases,
  roadmapSources,
  technologyDecisions,
} from './program-roadmap-data';
import './roadmap.css';

export async function generateMetadata():Promise<Metadata>{const store=await cookies();const en=(resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value)??DEFAULT_LOCALE)==='en';return{title:en?'Two-Phase Fusion Digital-Twin Roadmap | EXL-50U to EHL-2':'聚变数字孪生两期建设路线｜EXL‑50U 到 EHL‑2',description:en?'A three-month EXL-50U minimum closed loop and a six-month EHL-2 first-plasma virtual-commissioning programme spanning physics, control, diagnostics, engineering, IMAS data foundations and evidence-gated delivery.':'EXL‑50U 三个月最小闭环与 EHL‑2 六个月首等离子体虚拟调试路线，覆盖物理、控制、诊断、工程、IMAS 数据基座和可验证交付。'};}

const digitalThreadEn=['Experiment objective and scenario','Machine / configuration baseline','Equilibrium and control rehearsal','Engineering-load assessment','Experiment execution','Raw and engineering data','Reconstruction and diagnostic analysis','V&V / residuals','Model-version update'] as const;
const acceptanceEn=[
  {title:'Traceable',target:'100% of critical artifacts',detail:'Complete shot/run ID, input hash, code commit, container, configuration, geometry, mesh, solver and output versions.'},
  {title:'Reproducible',target:'Replayable with identical inputs and versions',detail:'Explain deterministic differences; raw, calibrated, derived and reconstructed layers never overwrite one another.'},
  {title:'Verifiable',target:'Every prediction carries a residual or boundary label',detail:'Observable quantities enter V&V. Unobservable results are labelled as design inference; visualization never substitutes for evidence.'},
  {title:'Gracefully degradable',target:'Control and diagnostic fault matrices pass',detail:'Latency, packet loss, bias, actuator saturation and model out-of-domain conditions have explicit states and safe fallback.'},
  {title:'Governed',target:'Every gate has an owner and sign-off',detail:'Physics, control, engineering and diagnostic leads freeze scientific tolerances at G0/G5; the interface does not invent them.'},
] as const;
const technologyEn=[
  {layer:'Experimental source data',choice:'MDSplus / existing authoritative archives and configuration logs',rationale:'Do not migrate or overwrite raw shot data or approved PCS configurations. Integrate read-only and retain calibration, quality and the native timebase.',modules:['diagnostics','data'] as const},
  {layer:'Semantic exchange',choice:'IMAS Data Dictionary + IMAS-Python',rationale:'Freeze the DD and machine-mapping versions. IMAS is the cross-model physics semantic layer; engineering signals are not forced into unsuitable IDSs.',modules:['physics','diagnostics','data'] as const},
  {layer:'Engineering and real-time integration',choice:'Edge adapters + EPICS PVA / OPC UA-style contracts',rationale:'Retain native PLC and control protocols. The platform integrates read-only with normalized units, timestamps, quality, asset IDs and calibration versions. Control-critical hard real-time loops remain on native PCS interfaces.',modules:['engineering','auxiliary','control'] as const},
  {layer:'Model execution',choice:'Containerized adapters + HPC scheduler + immutable run manifest',rationale:'Solvers remain in the governed compute domain. Inputs, code, container, mesh, configuration and output hashes form a replayable run package.',modules:['physics','engineering','integration'] as const},
  {layer:'Equilibrium and control',choice:'Pre-shot free-boundary scenario workflow + independent EFIT/PTEFIT as-shot inverse reconstruction + RZIP/ROM real-time plant + SIL / conditional HIL',rationale:'Forward rehearsal, inverse reconstruction and the real-time plant have distinct responsibilities; each declares its data provenance, applicability domain and V&V evidence.',modules:['physics','control','diagnostics'] as const},
  {layer:'Engineering analysis',choice:'Prescribed accident event package → electromagnetic / thermal branches → structural / thermal stress',rationale:'Begin with auditable one-way mappings. Do not misrepresent static equilibrium, disruption heat loads and structural response as a trivial serial chain or a prescribed envelope as a disruption predictor.',modules:['engineering','integration'] as const},
  {layer:'EHL-2 MHD',choice:'Approved equilibrium/profile + problem-specific linear response + selected nonlinear cases',rationale:'CHEASE-class tools support equilibrium/pre-processing; MARS-F-class tools address defined linear-response questions. JOREK or local nonlinear codes enter only as benchmarked offline design evidence. RZIP remains a control model.',modules:['physics','ai'] as const},
  {layer:'EHL-2 startup and heating',choice:'Actual pre-ionization source / burn-through model; post-formation GENRAY+CQL3D; NUBEAM+ASTRA as candidates',rationale:'Separate breakdown from post-formation wave absorption/current drive. EC enters the first-plasma path only if present in the commissioning configuration; NBI and high-power scenarios remain subject to licensing and local validation.',modules:['energy','auxiliary','physics'] as const},
  {layer:'Products and knowledge',choice:'Object storage + metadata/version repository + Knowledge Graph + ECharts / 3D viewer',rationale:'The graph stores entities, relationships and evidence; large fields remain in object storage; the front end orchestrates versioned results only.',modules:['data','hmi','integration','ai'] as const},
] as const;
const moduleEn=[
  ['physics','01','Physics Simulation','Equilibrium, configuration and prescribed accident-event packages','Startup, MHD, heating and transport'],['engineering','02','Engineering Simulation','Electromagnetic/thermal loads and structural response','As-built configuration, power supplies and commissioning envelope'],['control','03','Integrated Control','PCS replay and MIL/SIL; controller HIL only when hardware is available','Real-time plant emulator and first-plasma virtual commissioning; conditional HIL'],['diagnostics','04','Diagnostics and Sensing','Calibration, EFIT, quality and residuals','Minimum real-time and synthetic diagnostics'],['energy','05','Energy Conversion','Reserve data and interface contracts','Power deposition and energy balance'],['auxiliary','06','Auxiliary Systems','Engineering-sensor and state contracts','EC/NBI, power supplies, vacuum and cooling'],['hmi','07','Human–Machine Interaction','Cross-domain shot/run workbench','Operator rehearsal and readiness dashboard'],['data','08','Data Foundation','IMAS, time series, objects and versions','As-built/as-tested configuration backbone'],['integration','09','System Integration','Interfaces, orchestration, V&V and gates','Virtual campaign and shadow twin'],['ai','10','AI-Native Systems','Evidence assistant and validated surrogate models','ROM/anomaly candidates; never direct machine control'],
] as const;
const decisionsEn=['Approve the EXL-50U Phase I scenario family, representative shots and hold-out set, and appoint accountable acceptance owners for physics, control, engineering and diagnostics.','Require all teams to share facility, component, shot, run, coordinate, time and version identities; interface changes must trigger impact analysis and re-verification.','Approve isolated PCS replay/SIL/HIL and an HPC evidence factory; the public site, knowledge graph and language models must never receive direct machine-control authority.'] as const;
const sourceLabelsEn=['EXL-50U: EFIT-mini, RZ-Ip simulator and kilohertz-control baseline','Official EHL-2 facility page and design parameters','EHL-2 physics-design overview (0-D / 1.5-D design targets)','EHL-2 heating and current-drive design study','Preliminary EHL-2 MHD assessment and applicability limits','ITER: open-source IMAS infrastructure and physics models','IMAS-Python: IDSs, validation, resampling and MDSplus','IMAS Data Dictionary: pulse_schedule IDS','Official EPICS documentation','ITER CODAC Core System: real-time framework, interfaces and isolation','EHL-2 MHD / JOREK predictive study','EHL-2 divertor-configuration study'] as const;
const phaseEn={
  'phase-1':{label:'PHASE I',duration:'12 weeks',axisLabel:'Project week',thesis:'A repeatable offline / near-real-time minimum closed-loop demonstrator for one scenario family and one evidence chain',promise:'Demonstrate that one experiment can run traceably from planning, physics rehearsal, control testing and engineering-load assessment through execution, diagnostic review and model update.',exclusions:['No full-operating-envelope, all-diagnostic or real-time fully coupled digital twin','No machine-control write path from the website, knowledge graph or language model to PCS/interlocks','No inference of disruption timing or safety-qualified loads directly from a static equilibrium'],gates:[['G0','Scope and contract freeze','Facility, scenario, data, models, coordinates, timebase, owners and safety boundary are explicit'],['G1','As-shot baseline','Raw data, calibration, reconstruction and repeatable replay share one shot identity'],['G2','Virtual control','The approved MIL/SIL matrix passes; HIL is claimed only after real hardware integration'],['G3','Engineering-load chain','Conservation, mapping and numerical-sensitivity evidence exist for normal and prescribed accident envelopes'],['G4','Hold-out publication','Hold-out data remain free from manual tuning; physics, control, engineering, diagnostics and operations review jointly']]},
  'phase-2':{label:'PHASE II',duration:'6 months',axisLabel:'Project month',thesis:'First-plasma virtual commissioning plus a read-only shadow twin isolated from the control network',promise:'Once the EHL-2 machine and commissioning configuration baselines are controlled, complete virtual experiments for low-energy first plasma, integrated control/diagnostic testing, operator rehearsal and online read-only shadow operation.',exclusions:['Do not accept first plasma against the 3 MA, 17 MW NBI, 6 MW ECRH or high-Ti design endpoints','No promise of real-time 3D nonlinear MHD; high-fidelity calculations remain offline evidence for selected cases','The shadow twin never replaces independent protection, interlocks or operational authorization','The six-month plan assumes named model owners, runnable benchmarked chains, an EHL-2 machine description/profile assumptions and compute capacity at M1; otherwise nonlinear MHD and high-power heating become extension tasks'],gates:[['G5','Mobilization and entry criteria','Model owners, runnable baselines, EHL-2 machine description/profile assumptions, compute, first-plasma objective and configuration-difference register are in place'],['G6','Configuration and model baseline','Actual configuration is frozen; vacuum field, breakdown/burn-through, Ip/R/Z scenarios and minimum diagnostics, actuators and protection interfaces are traceable'],['G7','Virtual commissioning','SIL/real-time plant emulator, diagnostic latency and fault matrix pass; HIL is accepted only against available hardware and shadow remains read-only'],['G8','Integrated rehearsal','Nominal and selected-fault campaigns, operator rehearsal and fallback procedures are complete'],['G9','Readiness review','Open items, applicability domains and uncertainty are transparent; evidence enters the formal Go/No-Go review']]},
} as const;

function ProgramRoadmapContent({en}:{en:boolean}) {
  const phaseOne = roadmapPhases[0];
  const phaseTwo = roadmapPhases[1];
  const moduleRows=en?moduleEn.map(([id,no,title,phase1,phase2])=>({id,no,title,phase1,phase2,route:knowledgeModuleRoutes.find((module)=>module.id===id)?.route??'/knowledge-graph'})):knowledgeModuleRoutes;
  const moduleById = new Map(moduleRows.map((module) => [module.id, module]));
  const threadRows=en?digitalThreadEn:digitalThread;
  const acceptanceRows=en?acceptanceEn:acceptanceDimensions;
  const technologyRows=en?technologyEn:technologyDecisions;
  const decisionRows=en?decisionsEn:deanDecisions;
  return <main className="programRoadmapPage">
    <SiteNav active="roadmap" />

    <header className="programHero">
      <div className="programHeroCopy">
        <p className="programEyebrow">FUSION DIGITAL TWIN PROGRAM · 3 + 6 MONTHS</p>
        <h1>{en?'From an EXL-50U minimum closed loop to':<>从 EXL‑50U 最小闭环，走向</>}<br/><em>{en?'an EHL-2 first-plasma virtual experiment':'EHL‑2 首等离子体虚拟实验'}</em></h1>
        <p className="programHeroLead">{en?'Build safely evolvable fusion digital-twin infrastructure on a Machine Description foundation, a unified data-contract backbone, validated physics and engineering models, and acceptance against a real experimental closed loop.':'以装置描述（Machine Description）为基础、以统一数据契约为骨架、以经过验证的物理与工程模型为核心、以真实实验闭环作为验收对象，建设可安全演进的聚变数字孪生基础设施。'}</p>
        <div className="programHeroActions"><a href="#system-map">{en?'Integrated technical route':'总体技术路线'}</a><a href="#phase-one">{en?'Phase I delivery plan':'一期实施计划'}</a><a href="#phase-two">{en?'Phase II delivery plan':'二期实施计划'}</a><a href="#technology">{en?'Technology decision audit':'选型审计表'}</a><Link href="/knowledge-graph">{en?'Open knowledge graph':'进入知识图谱'}</Link></div>
      </div>
      <aside className="programMandate">
        <span>{en?'EXECUTIVE THESIS':'汇报主张 / EXECUTIVE THESIS'}</span>
        <blockquote>{en?'Phase I proves that one experiment can proceed traceably from planning and verification through execution and review. Phase II proves that the platform can support EHL-2 first-plasma virtual commissioning and online read-only shadow operation without assuming safety-control authority.':'第一期证明一次实验能从计划、验证、执行到复盘完整且可追溯地跑通；第二期证明平台能在不接管安全控制的前提下，为 EHL‑2 首等离子体提供虚拟调试和在线只读影子运行。'}</blockquote>
        <p>{en?'The digital twin strengthens experimental decisions and evidence management; it does not replace experiments, independent protection, engineering review or the formal Go/No-Go organization.':'数字孪生增强实验决策与证据管理，不替代实验、独立保护、工程审查或正式 Go / No-Go 组织。'}</p>
      </aside>
      <dl className="programHeroMetrics">
        <div><dt>{en?'12 weeks':'12 周'}</dt><dd>{en?'EXL-50U minimum closed loop':'EXL‑50U 最小闭环'}</dd></div>
        <div><dt>{en?'6 months':'6 个月'}</dt><dd>{en?'EHL-2 virtual first plasma':'EHL‑2 虚拟 first plasma'}</dd></div>
        <div><dt>{en?'10 modules':'10 模块'}</dt><dd>{en?'Knowledge, data and model coordination':'知识、数据与模型协同'}</dd></div>
        <div><dt>{en?'0 web-to-machine write paths':'0 网页控机写通道'}</dt><dd>{en?'Knowledge graph / LLM isolated from independent PCS and interlocks':'KG / LLM 与独立 PCS、联锁隔离'}</dd></div>
      </dl>
    </header>

    <section className="programDefinition" aria-labelledby="program-definition-title">
      <div className="programSectionHead">
        <p>00 / PROGRAM DEFINITION</p>
        <h2 id="program-definition-title">{en?'The deliverable is not a dashboard; it is an evidence-bearing experimental digital thread.':'交付的不是“大屏”，而是一条有证据的实验数字线程。'}</h2>
        <span>{en?'Every result must bind its shot/run, machine and geometry revision, coordinates and timebase, calibration and data-dictionary versions, code and container, input/output checksums, applicability domain and approval state.':'每个结果必须绑定 shot / run、装置与几何版次、坐标与时基、校准和数据字典版本、代码与容器、输入输出校验和、适用域和审批状态。'}</span>
      </div>
      <ol className="programDigitalThread">
        {threadRows.map((step, index) => <li key={step}><small>{String(index + 1).padStart(2, '0')}</small><b>{step}</b>{index < threadRows.length - 1 && <i aria-hidden="true">→</i>}</li>)}
      </ol>
      <div className="programArchitectureBand">
        <article><small>{en?'Source of truth':'事实源'}</small><b>{en?'MDSplus / authoritative archives / engineering time series':'MDSplus / 权威档案 / 工程时序'}</b><p>{en?'Raw experimental data and approved control configurations remain immutable; the platform reads them through adapters.':'原始实验数据与获批控制配置记录保持不可变；平台通过只读适配器获取。'}</p></article>
        <article><small>{en?'Semantic layer':'语义层'}</small><b>{en?'IMAS + engineering-asset contracts':'IMAS + 工程资产合同'}</b><p>{en?'Freeze DD, COCOS, units, timebase, quality and calibration; do not force engineering signals into unsuitable IDSs.':'冻结 DD、COCOS、单位、时标、质量和校准；工程信号不被强塞入不适配 IDS。'}</p></article>
        <article><small>{en?'Evidence factory':'证据工厂'}</small><b>{en?'Model adapters + HPC + V&V':'模型 adapter + HPC + V&V'}</b><p>{en?'High-fidelity computation remains in the governed compute domain and produces immutable run manifests and verification evidence.':'高保真计算留在受控计算域，产生不可变 run manifest 与验证证据。'}</p></article>
        <article><small>{en?'Decision interface':'决策界面'}</small><b>Knowledge + ECharts + 3D</b><p>{en?'The front end orchestrates, compares and traces results only; synchronized interfaces do not prove scientific model coupling.':'前端只编排、比较和追溯结果；界面联动不等于模型已经科学耦合。'}</p></article>
      </div>
    </section>

    <section className="programSystemMap" id="system-map" aria-labelledby="system-map-title">
      <div className="programSectionHead">
        <p>01 / INTEGRATED TECHNICAL ROUTE</p>
        <h2 id="system-map-title">{en?'Five professional domains turn models into verifiable experimental capabilities.':'五大专业环节，共同把模型变成可验证的实验能力。'}</h2>
        <span>{en?'Inspect the support relationships, then select any domain to drill into fusion-physics scope, candidate toolchains, technical sub-route and Phase I/II delivery. Each route exposes inputs, outputs, V&V evidence, applicability limits, work packages and gates.':'先看总览中的支撑关系，再点击任一环节，下钻“聚变专业覆盖 → 候选工具链 → 技术子路线 → 一期 / 二期交付”；每条路线同步显示输入输出、V&V 证据、适用边界、工作包与阶段门。'}</span>
      </div>
      <ProgramSystemMap />
    </section>

    <section className="programPhase programPhaseOne" id="phase-one" aria-labelledby="phase-one-title">
      <PhaseHeader phase={phaseOne} number="02A" titleId="phase-one-title" en={en} />
      <ProgramPhaseChart phaseId="phase-1" />
      <GateStrip phase={phaseOne} en={en} />
    </section>

    <section className="programPhase programPhaseTwo" id="phase-two" aria-labelledby="phase-two-title">
      <PhaseHeader phase={phaseTwo} number="02B" titleId="phase-two-title" en={en} />
      <div className="firstPlasmaSequence" aria-label={en?'EHL-2 first-plasma task boundary':'EHL-2 首等离子体任务边界'}>
        {(en?['Vacuum field / power-supply dry run','Null / error field and eddy currents','Actual pre-ionization source / breakdown','Burn-through / Ip establishment','Post-formation R/Z control','Minimum diagnostic confirmation','Safe termination']:['真空场 / 电源 dry-run', 'null / 误差场与涡流', '实际预电离源 / 击穿', 'burn-through / Ip 建立', '成形后 R / Z 控制', '基础诊断确认', '安全终止']).map((step, index) => <span key={step}><small>{String(index + 1).padStart(2, '0')}</small>{step}</span>)}
      </div>
      <div className="ehlEntryCriteria"><b>{en?'Six-month entry criteria':'六个月入口条件'}</b><p>{en?'At M1 there must be named code owners, runnable benchmarked model chains, a controlled EHL-2 machine description/profile assumptions and available compute. If any is missing, nonlinear MHD and high-power heating become extension deliverables and do not block the first-plasma virtual-commissioning critical path.':'M1 必须已有具名代码负责人、可运行且经过基准测试的模型链、受控的 EHL‑2 装置描述 / 剖面假设和可用算力；缺少任一项时，非线性 MHD 与高功率加热转为拓展交付，不阻断 first-plasma 虚拟调试主线。'}</p></div>
      <ProgramPhaseChart phaseId="phase-2" />
      <GateStrip phase={phaseTwo} en={en} />
      <div className="ehlDesignBoundary"><b>{en?'Design endpoints ≠ first-plasma acceptance':'设计目标 ≠ 首炮验收'}</b><p>{en?'Published EHL-2 design endpoints include B0 ≈ 3 T, Ip ≈ 3 MA, 17 MW NBI and 6 MW ECRH; this roadmap treats them as a later high-performance offline design envelope. First-plasma acceptance uses the actual commissioning configuration and covers low-energy plasma establishment, position control, minimum diagnostics and safe termination.':'EHL‑2 官方公开设计目标包括 B₀≈3 T、Iₚ≈3 MA、17 MW NBI 和 6 MW ECRH；本路线将其作为后续高性能离线设计包络。first plasma 只按实际 commissioning configuration 验收低能量建立、位置控制、最小诊断和安全终止。'}</p><a href="https://en.ennresearch.com/researchfield/Compactfusion/EHL_2/" target="_blank" rel="noreferrer">{en?'Verify official EHL-2 parameters':'核对 EHL‑2 官方参数'} ↗</a></div>
    </section>

    <section className="programAcceptance" id="acceptance" aria-labelledby="acceptance-title">
      <div className="programSectionHead">
        <p>03 / ACCEPTANCE &amp; CREDIBILITY</p>
        <h2 id="acceptance-title">{en?'Pass gates on evidence—not automatically on the calendar.':'按证据过门，不按日历自动“完成”。'}</h2>
        <span>{en?'Numerical error, real-time budgets and machine-success criteria must be frozen by accountable owners at G0/G5 against local baselines; this page does not invent scientific tolerances on behalf of experts.':'数值误差、实时预算和装置成功判据必须在 G0 / G5 由责任人结合本地基线冻结；本页不凭空替专家定义科学容差。'}</span>
      </div>
      <div className="acceptanceGrid">{acceptanceRows.map((item, index) => <article key={item.title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{item.title}</h3><b>{item.target}</b><p>{item.detail}</p></article>)}</div>
      <div className="programRedLines">
        <b>{en?'Five technical red lines':'五条技术红线'}</b>
        <span>{en?'Successful visualization ≠ scientific validation':'展示成功 ≠ 科学验证'}</span><span>{en?'Synthetic data ≠ experimental data':'合成数据 ≠ 实验数据'}</span><span>{en?'Cross-machine transfer ≠ EHL-2 validation':'跨机迁移 ≠ EHL‑2 验证'}</span><span>{en?'Offline high fidelity ≠ real-time capability':'离线高保真 ≠ 实时能力'}</span><span>{en?'Digital twin ≠ safety interlock':'数字孪生 ≠ 安全联锁'}</span>
      </div>
    </section>

    <section className="programTechnology" id="technology" aria-labelledby="technology-title">
      <div className="programSectionHead">
        <p>04 / TECHNOLOGY DECISIONS</p>
        <h2 id="technology-title">{en?'Technology choices follow the question, evidence and deployment boundary.':'技术选型服从问题、证据与部署边界。'}</h2>
        <span>{en?'The goal is not to integrate as many solvers as possible, but to select a validated, reproducible and replaceable model chain for each decision.':'不是集成尽可能多的求解器，而是为每个决策选择一条被验证、能复现、可替换的模型链。'}</span>
      </div>
      <div className="technologyTable" role="table" aria-label={en?'Fusion digital-twin technology decisions':'聚变数字孪生技术路线选型'}>
        <div className="technologyTableHead" role="row"><span role="columnheader">{en?'Architecture layer':'架构层'}</span><span role="columnheader">{en?'Recommended route':'推荐路线'}</span><span role="columnheader">{en?'Rationale and boundary':'选择依据与边界'}</span><span role="columnheader">{en?'Modules':'模块'}</span></div>
        {technologyRows.map((item, index) => <div className="technologyRow" role="row" key={item.layer}><span role="cell"><small>{String(index + 1).padStart(2, '0')}</small><b>{item.layer}</b></span><strong role="cell">{item.choice}</strong><p role="cell">{item.rationale}</p><span role="cell" className="technologyModules">{item.modules.map((moduleId) => { const knowledgeMeta = moduleById.get(moduleId); return <a href={`#module-${moduleId}`} key={moduleId}>{knowledgeMeta?.title ?? moduleId}</a>; })}</span></div>)}
      </div>
    </section>

    <section className="programModuleMap" id="modules" aria-labelledby="module-map-title">
      <div className="programSectionHead">
        <p>05 / KNOWLEDGE MODULE MAPPING</p>
        <h2 id="module-map-title">{en?'The ten modules are not parallel tracks; they divide responsibility within one experimental closed loop.':'十大模块不是十条平行线，而是同一实验闭环的职责分工。'}</h2>
        <span>{en?'A linked module indicates project ownership. The current knowledge graph has structured evidence domains chiefly for physics, engineering, control, diagnostics, AI and facilities; independent evidence domains for modules 05–09 still require expansion.':'“关联模块”表示项目归属；当前知识图谱已结构化的证据域主要覆盖物理、工程、控制、诊断、AI 与装置，05–09 的独立证据域仍需后续扩建。'}</span>
      </div>
      <div className="programModuleGrid">{moduleRows.map((module) => <Link href={module.route} id={`module-${module.id}`} data-roadmap-module={module.id} key={module.id}><span>{module.no}</span><h3>{module.title}</h3><dl><div><dt>{en?'Phase I':'一期'}</dt><dd>{module.phase1}</dd></div><div><dt>{en?'Phase II':'二期'}</dt><dd>{module.phase2}</dd></div></dl><b>{en?'Open module':'进入模块'} ↗</b></Link>)}</div>
      <div className="programEvidenceProjection"><p><b>{en?'Evidence projection':'证据投影'}</b>　{en?'The roadmap maps work packages to existing knowledge modules. Papers, code, facilities and model evidence remain governed by the Knowledge Graph; large datasets and solver results are not duplicated here.':'路线页把工作包映射到现有知识模块；论文、代码、装置和模型依据仍由 Knowledge Graph 管理，不复制大规模数据或求解结果。'}</p><Link href="/knowledge-graph">{en?'Verify paper, code and facility evidence in the graph':'从图谱核对论文、代码与装置证据'} →</Link></div>
    </section>

    <section className="programDecision" id="decisions" aria-labelledby="decision-title">
      <div>
        <p>06 / DECISIONS REQUESTED</p>
        <h2 id="decision-title">{en?'Three decisions requiring institute-level confirmation':'需要院级确认的三项决定'}</h2>
        <span>{en?'Freeze common interfaces and accountability boundaries before adding solvers and pages; otherwise the three-month window will be consumed by data, coordinate and version disputes.':'先冻结共同接口和责任边界，再增加求解器与页面；否则三个月会被数据、坐标与版本争议耗尽。'}</span>
      </div>
      <ol>{decisionRows.map((decision, index) => <li key={decision}><span>{String(index + 1).padStart(2, '0')}</span><p>{decision}</p></li>)}</ol>
    </section>

    <section className="programSources" aria-labelledby="sources-title">
      <div className="programSectionHead"><p>07 / PRIMARY SOURCES</p><h2 id="sources-title">{en?'Planning basis and primary-source entry points':'规划依据与一手入口'}</h2><span>{en?'Durations and work packages are project recommendations, not commitments by the source organizations. Facility parameters and technical capabilities must be checked against the linked official or primary material.':'时间区间与工作包是本项目建议，并非来源机构的承诺；装置参数和技术能力以链接中的官方 / 原始材料为准。'}</span></div>
      <div>{roadmapSources.map((source, index) => <a href={source.url} key={source.url} target="_blank" rel="noreferrer"><span>S{String(index + 1).padStart(2, '0')}</span><b>{en?sourceLabelsEn[index]:source.label}</b><i>↗</i></a>)}</div>
    </section>

    <SiteFooter />
  </main>;
}

export default function ProgramRoadmapPage(){return <StaticLocaleContent zh={<ProgramRoadmapContent en={false}/>} en={<ProgramRoadmapContent en/>}/>;}

function PhaseHeader({ phase, number, titleId, en }: { phase: (typeof roadmapPhases)[number]; number: string; titleId: string; en:boolean }) {
  const translated=phaseEn[phase.id];
  return <header className="programPhaseHeader">
    <div><p>{number} / {en?translated.label:phase.label}</p><h2 id={titleId}>{phase.device} · {en?translated.duration:phase.duration}</h2><h3>{en?translated.thesis:phase.thesis}</h3><span>{en?translated.promise:phase.promise}</span></div>
    <aside><b>{en?'EXCLUDED FROM THE DEFAULT COMMITMENT':'不纳入本期默认承诺'}</b>{(en?translated.exclusions:phase.exclusions).map((item) => <p key={item}>{item}</p>)}</aside>
  </header>;
}

function GateStrip({ phase,en }: { phase: (typeof roadmapPhases)[number];en:boolean }) {
  const translated=phaseEn[phase.id];
  return <div className="programGateStrip" aria-label={en?`${phase.device} phase gates`:`${phase.device}阶段门`}>
    {phase.gates.map((gate,index) => {const entry=translated.gates[index];return <article key={gate.id}><span>{gate.id}</span><div><b>{en?entry[1]:gate.title}</b><p>{en?entry[2]:gate.go}</p></div><small>{en?translated.axisLabel:phase.axisLabel} {gate.at}</small></article>;})}
  </div>;
}
