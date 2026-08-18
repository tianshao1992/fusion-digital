import Link from 'next/link';
import { cookies } from 'next/headers';
import KnowledgeBackLink from '../components/KnowledgeBackLink';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import StaticLocaleContent from '../components/StaticLocaleContent';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from '../i18n/config';
import { ControlEvidenceHeatmap, ControlTimescaleChart, type ControlTimescaleDatum } from './ControlCharts';
import ControlResearchCatalog from './ControlResearchCatalog';
import { controlDeviceProfiles, controlResearchItems, controlTaskMeta, type ControlTaskId } from './controlResearch';
import './control.css';

type TaskBrief = { short: string; time: string; state: string; actuator: string; minSeconds: number; maxSeconds: number; openEnded?: boolean };

const taskBriefs: Record<ControlTaskId, TaskBrief> = {
  T0: { short: '把异步、噪声和可能失效的诊断转化为带质量与不确定度的实时控制状态。', time: '10 μs–1 s', state: '边界 · q/剖面 · 模式 · 辐射前沿', actuator: '不直接执行；服务全部回路', minSeconds: 1e-5, maxSeconds: 1 },
  T1: { short: '在伏秒、磁体、电源、涡流和稳定约束下完成击穿、升流、平顶与受控降流。', time: '0.1 ms–100 s', state: 'Ip · 环电压 · 磁通 · li · 启动可行域', actuator: 'CS/PF · 预电离 · H&CD · 燃料', minSeconds: 1e-4, maxSeconds: 100 },
  T2: { short: '协调快慢线圈，控制垂直稳定、位置、边界、间隙、X 点和打击点拓扑。', time: '10 μs–100 ms', state: 'Z/R · gap · X 点 · 打击点 · 稳定裕度', actuator: 'VS 线圈 · PF · 电源电压/电流', minSeconds: 1e-5, maxSeconds: 1e-1 },
  T3: { short: '在输运记忆和诊断稀疏下，控制 q、电流、温度、密度、压力与旋转剖面。', time: '10 ms–10 s', state: 'q(r) · Te/Ti · ne · p · rotation', actuator: 'NBI · EC/IC/LH · 气体/丸注 · Ip', minSeconds: 1e-2, maxSeconds: 10 },
  T4: { short: '按物理机制分别检测、定位和控制 NTM、RWM、锯齿、AE、ELM 与误差场。', time: '10 μs–1 s', state: '模式幅值/相位/位置 · 增长率 · 约束态', actuator: 'ECCD · RMP · 线圈 · 加热 · 丸注', minSeconds: 1e-5, maxSeconds: 1 },
  T5: { short: '在核心性能、辐射、脱靶、热流、杂质、壁库存和部件寿命之间保持可持续窗口。', time: '1 ms–10 s', state: '辐射前沿 · q⊥ · Te,target · W · 壁状态', actuator: '杂质/燃料 · 抽气 · 形状/扫掠 · 加热', minSeconds: 1e-3, maxSeconds: 10 },
  T6: { short: '从 β、储能和中子率走向聚变功率、Q、alpha 加热、燃料比与氦灰控制。', time: '10 ms–100 s', state: 'βN · W · Pfus · Q · D/T · helium ash', actuator: 'H&CD · 燃料 · 杂质 · 形状/排热', minSeconds: 1e-2, maxSeconds: 100 },
  T7: { short: '区分预测、避免、恢复、受控终止和缓解请求，并保持机器保护的独立权威。', time: '10 μs–10 s', state: '风险 · 可恢复域 · VDE/热能/电磁负荷', actuator: '加热/燃料/形状 · 终止轨迹 · 缓解请求', minSeconds: 1e-5, maxSeconds: 10 },
  T8: { short: '显式处理共享执行器、目标优先级、约束、冲突、故障重构和确定性降级。', time: '1 ms–10 s', state: '任务请求 · 能力矩阵 · 约束/健康 · 未满足量', actuator: '控制分配器 · 监督器 · 参考治理器', minSeconds: 1e-3, maxSeconds: 10 },
  T9: { short: '承载配置、状态机、时钟、I/O、实时算法、回放、权限以及 SIL/HIL 验证。', time: 'μs–脉冲生命周期', state: '配置 · 阶段 · 数据新鲜度 · 运行时 · 证据', actuator: 'PCS/CODAC · 实时框架 · I/O · 测试设施', minSeconds: 1e-6, maxSeconds: 100, openEnded: true },
};

const taskTimescaleData: ControlTimescaleDatum[] = (Object.keys(controlTaskMeta) as ControlTaskId[]).map((task) => ({
  id: task,
  label: controlTaskMeta[task].label,
  timeLabel: taskBriefs[task].time,
  minSeconds: taskBriefs[task].minSeconds,
  maxSeconds: taskBriefs[task].maxSeconds,
  openEnded: taskBriefs[task].openEnded,
}));

const evidenceSteps = [
  ['E0', '概念 / 需求', '只说明目标、架构或需求，尚无足够动态结果。'],
  ['E1', '数值闭环', '植物模型、合成测量或控制器设计验证。'],
  ['E2', '装置离线', '真实历史炮次、回放或独立诊断比较。'],
  ['E3', '实时 / HIL / 影子', '满足实时链或系统测试，但不直接控制装置。'],
  ['E4', '装置闭环', '真实装置中动作影响执行器或放电轨迹。'],
];

const gaps = [
  ['配置权威', '模型、线圈、电源、诊断、标定、壁与限值必须绑定到具体装置/炮次版本。'],
  ['状态可信', '状态值之外还要发布时间戳、质量、置信度、物理/测量残差和降级标志。'],
  ['任务契约', '目标、约束、优先级、执行器能力、未满足请求和切换原因需机器可读。'],
  ['系统级 VVUQ', '控制模型、代理、PCS、网络、电源和保护接口必须共同进入 SIL/HIL 证据链。'],
  ['超域与失败', '诊断缺失、时延、饱和、故障、训练域外和失败炮次必须进入版本验收。'],
  ['责任与权限', '孪生建议、操作员批准、PCS 命令、机器保护与安全系统边界必须可审计。'],
  ['持续校准', '每炮更新预测残差；生产控制模型只有重新过门后才允许发布新版本。'],
  ['电厂目标', '逐步把部件寿命、RAMI、氚、热循环、净电效率、维护和安全论证纳入目标。'],
];

const roadmap = [
  ['C0', '磁控制可信回放', 'DINA/MEQ 资产包、合成磁诊断、真实控制器、线圈/电源约束和历史基准。', '重放一致；配置、模型和误差可追溯'],
  ['C1', '控制数字影子', '实时/准实时状态、候选动作和风险预测，不写执行器。', '每炮形成预测—实测残差与 OOD 报告'],
  ['C2', '跨任务预测', '接入快速输运、MHD、排热/热负荷和执行器能力模型。', '共享执行器冲突可预测、可解释'],
  ['C3', '系统级 SIL/HIL', '连接 PCS 实码、I/O、网络、电源/仿真器与故障注入。', '最坏时延、降级和回退自动通过'],
  ['C4', '有限装置闭环', '从低风险参考治理、局部分配或 MPC 开始，经装置治理逐项放权。', '受限适用域 E4；版本冻结并可回退'],
  ['C5', '堆/电厂控制孪生', '燃烧、工程限值、氚/RAMI、热循环、维护和电网协同。', '长期可用率、安全证据和生命周期治理'],
];

const taskBriefsEn:Record<ControlTaskId,TaskBrief>={
  T0:{short:'Convert asynchronous, noisy and potentially failed diagnostics into real-time control states with quality and uncertainty.',time:'10 μs–1 s',state:'Boundary · q/profile · modes · radiation front',actuator:'No direct actuation; serves all loops',minSeconds:1e-5,maxSeconds:1},
  T1:{short:'Execute breakdown, current ramp-up, flat-top and controlled ramp-down within volt-second, magnet, power-supply, eddy-current and stability constraints.',time:'0.1 ms–100 s',state:'Ip · loop voltage · flux · li · startup feasibility',actuator:'CS/PF · pre-ionization · H&CD · fuelling',minSeconds:1e-4,maxSeconds:100},
  T2:{short:'Coordinate fast and slow coils for vertical stability, position, boundary, gaps, X-points and strike-point topology.',time:'10 μs–100 ms',state:'Z/R · gaps · X-points · strike points · stability margin',actuator:'VS coils · PF · supply voltage/current',minSeconds:1e-5,maxSeconds:1e-1},
  T3:{short:'Control q, current, temperature, density, pressure and rotation profiles under transport memory and sparse diagnostics.',time:'10 ms–10 s',state:'q(r) · Te/Ti · ne · p · rotation',actuator:'NBI · EC/IC/LH · gas/pellets · Ip',minSeconds:1e-2,maxSeconds:10},
  T4:{short:'Detect, localize and control NTMs, RWMs, sawteeth, AEs, ELMs and error fields according to their distinct physics.',time:'10 μs–1 s',state:'Mode amplitude/phase/location · growth rate · confinement state',actuator:'ECCD · RMP · coils · heating · pellets',minSeconds:1e-5,maxSeconds:1},
  T5:{short:'Maintain a sustainable operating window across core performance, radiation, detachment, heat flux, impurities, wall inventory and component life.',time:'1 ms–10 s',state:'Radiation front · q⊥ · Te,target · W · wall state',actuator:'Impurity/fuel · pumping · shape/sweep · heating',minSeconds:1e-3,maxSeconds:10},
  T6:{short:'Progress from beta, stored energy and neutron rate to fusion power, Q, alpha heating, fuel ratio and helium-ash control.',time:'10 ms–100 s',state:'βN · W · Pfus · Q · D/T · helium ash',actuator:'H&CD · fuelling · impurity · shaping/exhaust',minSeconds:1e-2,maxSeconds:100},
  T7:{short:'Separate prediction, avoidance, recovery, controlled termination and mitigation requests while preserving independent machine-protection authority.',time:'10 μs–10 s',state:'Risk · recoverable domain · VDE/thermal/electromagnetic loads',actuator:'Heating/fuelling/shape · termination trajectory · mitigation request',minSeconds:1e-5,maxSeconds:10},
  T8:{short:'Handle shared actuators, target priorities, constraints, conflicts, fault reconfiguration and deterministic degradation explicitly.',time:'1 ms–10 s',state:'Task requests · capability matrix · constraints/health · unmet demand',actuator:'Control allocator · supervisor · reference governor',minSeconds:1e-3,maxSeconds:10},
  T9:{short:'Provide configuration, state machines, clocks, I/O, real-time algorithms, replay, authorization and SIL/HIL verification.',time:'μs–pulse lifecycle',state:'Configuration · phase · data freshness · runtime · evidence',actuator:'PCS/CODAC · real-time framework · I/O · test facilities',minSeconds:1e-6,maxSeconds:100,openEnded:true},
};
const taskTimescaleDataEn:ControlTimescaleDatum[]=(Object.keys(controlTaskMeta) as ControlTaskId[]).map(task=>({id:task,label:controlTaskMeta[task].en,timeLabel:taskBriefsEn[task].time,minSeconds:taskBriefsEn[task].minSeconds,maxSeconds:taskBriefsEn[task].maxSeconds,openEnded:taskBriefsEn[task].openEnded}));
const evidenceStepsEn=[['E0','Concept / requirement','States an objective, architecture or requirement without sufficient dynamic evidence.'],['E1','Numerical closed loop','Plant model, synthetic-measurement or controller-design validation.'],['E2','Offline facility evidence','Historical shots, replay or independent diagnostic comparison.'],['E3','Real-time / HIL / shadow','Meets a real-time chain or system-test requirement without directly controlling the facility.'],['E4','Facility closed loop','An action affected an actuator or discharge trajectory on the real facility.']];
const gapsEn=[['Configuration authority','Models, coils, power supplies, diagnostics, calibrations, walls and limits must bind to a specific facility/shot revision.'],['Trusted state','Publish timestamps, quality, confidence, physics/measurement residuals and degradation flags alongside state values.'],['Task contracts','Objectives, constraints, priorities, actuator capability, unmet requests and switch reasons must be machine-readable.'],['System-level VVUQ','Control models, surrogates, PCS, network, power supplies and protection interfaces must enter one SIL/HIL evidence chain.'],['Out-of-domain and failure','Diagnostic loss, latency, saturation, faults, training-domain excursions and failed shots must enter version acceptance.'],['Responsibility and authorization','Twin recommendations, operator approval, PCS commands, machine protection and safety-system boundaries must be auditable.'],['Continuous calibration','Update predictive residuals after every shot; release production-control models only after they re-pass gates.'],['Power-plant objectives','Progressively include component life, RAMI, tritium, thermal cycles, net efficiency, maintenance and safety cases.']];
const controlRoadmapEn=[['C0','Trusted magnetic-control replay','DINA/MEQ asset package, synthetic magnetic diagnostics, actual controller, coil/power-supply constraints and historical benchmark.','Replay consistent; configuration, model and error traceable'],['C1','Control digital shadow','Real-time/near-real-time state, candidate action and risk prediction without actuator writes.','Every shot produces predicted–measured residual and OOD reports'],['C2','Cross-task prediction','Integrate fast transport, MHD, exhaust/heat-load and actuator-capability models.','Shared-actuator conflict becomes predictable and explainable'],['C3','System-level SIL/HIL','Connect production PCS code, I/O, network, power supplies/simulators and fault injection.','Worst-case latency, degradation and fallback pass automatically'],['C4','Bounded facility closed loop','Begin with low-risk reference governance, local allocation or MPC and grant authority incrementally under facility governance.','Bounded-domain E4 evidence; frozen version with rollback'],['C5','Reactor / plant control twin','Burning plasma, engineering limits, tritium/RAMI, thermal cycles, maintenance and grid coordination.','Long-term availability, safety evidence and lifecycle governance']];

export async function generateMetadata(){const store=await cookies();const en=(resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value)??DEFAULT_LOCALE)==='en';return{title:en?'Integrated Control and PCS':'集成控制与 PCS',description:en?'A task- and facility/PCS-indexed atlas of tokamak configuration, profiles, stability, exhaust, power, protection, multi-actuator integration, real-time systems, papers and code.':'按控制任务与装置/PCS双索引梳理托卡马克位形、剖面、稳定性、排热、功率、保护、多执行器集成、实时系统、论文与代码。'};}

function ControlContent({en}:{en:boolean}) {
  const uniquePapers = new Set(controlResearchItems.flatMap((item) => item.papers.map((paper) => paper.doi ? `doi:${paper.doi.toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '')}` : paper.url.toLowerCase().replace(/[?#].*$/, '')))).size;
  const closedLoop = controlResearchItems.filter((item) => item.evidenceLevel === 'E4').length;
  const directCode = controlResearchItems.filter((item) => item.code.some((code) => code.status === 'official-direct')).length;

  if(en)return <main className="controlPage"><SiteNav active="control"/><KnowledgeBackLink/>
    <header className="controlHero"><div className="controlHeroCopy"><p className="controlEyebrow">FUSIONDIGITAL / INTEGRATED CONTROL &amp; PCS ATLAS / 2026</p><h1><span className="controlHeroLead">Make every control action</span><span>verifiable, replayable</span><span>and reviewable.</span></h1><p>Use the T0–T9 control-task taxonomy and a dual facility/PCS index to connect state estimation, configuration, profiles, MHD, exhaust, fusion power, disruption avoidance, multi-actuator coordination and real-time infrastructure to primary papers and code.</p><div className="controlActions"><a href="#research">Search key work</a><a href="/fusion-integrated-control-research-report.docx" download>Download full report (Chinese)</a></div><dl className="controlHeroStats"><div><dt>{controlResearchItems.length}</dt><dd>key control records</dd></div><div><dt>{uniquePapers}</dt><dd>unique primary sources</dd></div><div><dt>{controlDeviceProfiles.length}</dt><dd>facility and PCS profiles</dd></div><div><dt>{closedLoop} / {directCode}</dt><dd>E4 facility closed-loop records / records with direct code assets</dd></div></dl></div><figure className="controlHeroFigure"><img src="/figures/control-closed-loop-architecture-nature.png" alt="Closed-loop architecture linking fusion facility, diagnostics, state estimation, task control, multi-actuator coordination, PCS and independent protection"/><figcaption>Control loop: diagnostics, state estimation, task control, actuator coordination and PCS.</figcaption></figure></header>
    <section className="controlThesis"><p className="controlIndex">00 / CENTRAL THESIS</p><h2>Integrated control is not every loop in one program. It keeps <span>state, objectives, constraints, actuators, events and accountability coherent across time scales.</span></h2><div><p>Control tasks answer how to change plasma and facility state. The PCS determines how algorithms execute on time, under a controlled configuration and authorization. A digital twin additionally carries live synchronization, model applicability, predicted–measured residuals, versions and validation evidence.</p><p>This atlas is therefore organized by controlled object and evidence, then cross-indexed by facility to distinguish offline data use, real-time deployment, shadow operation, closed loop and routine operation.</p></div></section>
    <section className="controlArchitecture" id="architecture"><div className="controlSectionHead"><p className="controlIndex">01 / CLOSED-LOOP ARCHITECTURE</p><h2>One loop, six information classes and two authority chains</h2><p>Diagnostics and equipment data form state; task controllers request physical effects; supervision/allocation resolves shared actuators and constraints; the PCS executes deterministically. A sidecar twin predicts, replays and updates evidence. Independent machine protection may consume common state, but cannot be replaced by the twin or optimizer.</p></div><figure><img src="/figures/control-pcs-layers-nature.png" alt="Relationship among tokamak PCS layers, digital twin and independent protection" loading="lazy" decoding="async"/><figcaption>PCS layering does not imply one large controller: fast inner loops, task control, slow supervision and pulse orchestration have different budgets and fallback.</figcaption></figure><div className="controlLayerStrip"><span>Signals and time</span><span>State and quality</span><span>Tasks and constraints</span><span>Actuator capability</span><span>Events and phases</span><span>Authorization and evidence</span></div></section>
    <section className="controlTasks" id="tasks"><div className="controlSectionHead"><p className="controlIndex">02 / T0–T9 TASK TAXONOMY</p><h2>Ten tasks: T0 and T9 are cross-cutting;<br/>T1–T8 form the controlled chain</h2><p>The taxonomy preserves core configuration, profile, instability, heat-load, power and integration concepts while separating startup/flux, state estimation, off-normal termination and PCS/V&amp;V from software-platform concerns.</p></div><figure className="controlTimescale"><ControlTimescaleChart tasks={taskTimescaleDataEn}/><figcaption>Representative time scales guide architecture; they are not a common cycle requirement. Follow a task to its research catalogue and verify exact budgets against hardware, diagnostics and plasma response.</figcaption></figure><div className="controlTaskGrid">{(Object.keys(controlTaskMeta) as ControlTaskId[]).map(task=>{const meta=controlTaskMeta[task];const brief=taskBriefsEn[task];const count=controlResearchItems.filter(item=>[item.primaryTask,...item.relatedTasks].includes(task)).length;return <article key={task} className={meta.role==='cross-cutting'?'crossCutting':''}><header><b>{task}</b><span>{meta.en}</span><i>{count} linked records</i></header><h3>{meta.en}</h3><p>{brief.short}</p><dl><div><dt>Typical time</dt><dd>{brief.time}</dd></div><div><dt>Core state</dt><dd>{brief.state}</dd></div><div><dt>Principal actuation</dt><dd>{brief.actuator}</dd></div></dl><Link href={`/control?task=${task}#catalog`} className="controlTaskLink">View all {task} records ↗</Link></article>})}</div></section>
    <section className="controlResearch" id="research"><div className="controlSectionHead controlResearchHead"><div><p className="controlIndex">03 / SEARCHABLE RESEARCH LANDSCAPE</p><h2>Search key work by task, facility, evidence and code relationship</h2><p>Records aggregate the problem, architecture, sensors, actuators, facility, validation, results, limitations, papers and code; facility data use, real-time operation and closed-loop actuation are labelled separately.</p></div><div className="controlDownloads"><a href="/fusion-integrated-control-research-report.docx" download><b>WORD</b><span>Full report (Chinese)</span></a><a href="/data/fusion-control-landscape.json" download><b>JSON</b><span>Control research data</span></a><a href="/fusion-control-paper-code-index.csv" download><b>CSV</b><span>Paper/code index</span></a><a href="/fusion-control-references.bib" download><b>BIB</b><span>Citation metadata</span></a></div></div><ControlResearchCatalog/></section>
    <section className="controlEvidence" id="evidence"><div className="controlSectionHead"><p className="controlIndex">04 / EVIDENCE &amp; VERIFICATION</p><h2>Judge scientific evidence E separately from deployment responsibility D</h2><p>Qualification must test models, data, software runtime, hardware interfaces and fault fallback together; one optimal trajectory does not establish real-time or safety qualification.</p></div><div className="evidenceLayout"><figure><ControlEvidenceHeatmap/><figcaption>The heatmap aggregates research across E0–E4 evidence and D1–D5 deployment responsibility. If interaction is unavailable, use the qualification ladder: numerical benchmark → historical replay → SIL → real-time/HIL → shadow → low-risk closed loop → target regime → sustained operation.</figcaption></figure><div className="evidenceSteps">{evidenceStepsEn.map(step=><article key={step[0]}><span>{step[0]}</span><div><h3>{step[1]}</h3><p>{step[2]}</p></div></article>)}</div></div></section>
    <section className="controlGaps"><div className="controlSectionHead"><p className="controlIndex">05 / FROM INTEGRATED CONTROL TO DIGITAL TWIN</p><h2>Eight sustained-operation capabilities remain</h2><p>Advanced control addresses how to reach a target. A trustworthy twin must also identify the authoritative current state, explain model credibility, record who approved an action, use outcomes to challenge the model and govern the next release.</p></div><div className="controlGapGrid">{gapsEn.map((gap,index)=><article key={gap[0]}><span>{String(index+1).padStart(2,'0')}</span><h3>{gap[0]}</h3><p>{gap[1]}</p></article>)}</div></section>
    <section className="controlRoadmap" id="roadmap"><div className="controlSectionHead"><p className="controlIndex">06 / FUSIONDIGITAL ROADMAP</p><h2>Progress from DINA/MEQ control services to reactor and power-plant control twins</h2><p>Shadow operation precedes closed loop; multi-task coordination proves explainability and rollback before integrating burning-plasma, engineering-limit, RAMI, tritium, thermal-cycle and grid objectives.</p></div><figure><img src="/figures/control-digital-twin-roadmap-nature.png" alt="FusionDigital roadmap from magnetic-control replay to a fusion-power-plant control digital twin" loading="lazy" decoding="async"/><figcaption>From magnetic-control replay and digital shadow through SIL/HIL to bounded closed loop and plant-level coordination.</figcaption></figure><div className="controlRoadmapGrid">{controlRoadmapEn.map(item=><article key={item[0]}><header><span>{item[0]}</span><b>{item[1]}</b></header><p>{item[2]}</p><footer>{item[3]}</footer></article>)}</div></section>
    <section className="controlClosing"><div><p className="controlIndex">07 / NEXT</p><h2>Move from control research into platform implementation.</h2></div><div><Link href="/platform#contracts">View unified data contracts and technical route →</Link></div></section><SiteFooter/>
  </main>;

  return <main className="controlPage">
    <SiteNav active="control" />
    <KnowledgeBackLink />

    <header className="controlHero">
      <div className="controlHeroCopy">
        <p className="controlEyebrow">FUSIONDIGITAL / INTEGRATED CONTROL &amp; PCS ATLAS / 2026</p>
        <h1><span className="controlHeroLead">把每一次控制动作，</span><span>变成可验证、可回放、</span><span>可复核的决策。</span></h1>
        <p>以 T0–T9 十类控制任务和装置/PCS 双索引，连接状态估计、位形、剖面、MHD、排热、功率、破裂规避、多执行器协调、实时基础设施及其原始论文与代码。</p>
        <div className="controlActions">
          <a href="#research">检索关键工作</a>
          <a href="/fusion-integrated-control-research-report.docx" download>下载 5 万字以上 Word 报告</a>
        </div>
        <dl className="controlHeroStats">
          <div><dt>{controlResearchItems.length}</dt><dd>项关键控制工作</dd></div>
          <div><dt>{uniquePapers}</dt><dd>篇/项原始来源</dd></div>
          <div><dt>{controlDeviceProfiles.length}</dt><dd>个装置与 PCS 档案</dd></div>
          <div><dt>{closedLoop} / {directCode}</dt><dd>E4 真机闭环记录 / 含直接代码资产</dd></div>
        </dl>
      </div>
      <figure className="controlHeroFigure">
        <img src="/figures/control-closed-loop-architecture-nature.png" alt="聚变装置、诊断、状态估计、任务控制、多执行器协调、PCS和独立保护之间的闭环架构" />
        <figcaption>控制闭环：诊断、状态估计、任务控制、执行器协调与 PCS。</figcaption>
      </figure>
    </header>

    <section className="controlThesis">
      <p className="controlIndex">00 / CENTRAL THESIS</p>
      <h2>集成控制不是把所有回路写进一个程序；它是在多时间尺度下，<span>让状态、目标、约束、执行器、事件和责任保持一致。</span></h2>
      <div><p>控制任务回答“如何改变等离子体与装置状态”；PCS 回答“算法怎样按时、按配置、按权限运行”；数字孪生再增加真实状态同步、模型适用域、预测—实测残差、版本和验证证据。</p><p>因此本专题不以算法名称排序，而以控制对象与证据排序，并从装置角度反查每项能力是否真正进入实时、影子、闭环或常规运行。</p></div>
    </section>

    <section className="controlArchitecture" id="architecture">
      <div className="controlSectionHead"><p className="controlIndex">01 / CLOSED-LOOP ARCHITECTURE</p><h2>同一闭环，六类信息和两条权威链</h2><p>诊断与设备数据形成状态，任务控制提出物理效果请求，监督/分配层处理共享执行器和约束，PCS 确定性执行；数字孪生在旁路完成预测、回放和证据更新。独立机器保护/安全链可以消费相同状态，却不能被孪生或优化器取代。</p></div>
      <figure><img src="/figures/control-pcs-layers-nature.png" alt="托卡马克PCS分层、数字孪生和独立保护的关系" loading="lazy" decoding="async"/><figcaption>PCS 分层并不意味着一个大控制器：快内环、中层任务、慢监督与脉冲编排拥有不同时间预算和回退策略。</figcaption></figure>
      <div className="controlLayerStrip"><span>信号与时间</span><span>状态与质量</span><span>任务与约束</span><span>执行器能力</span><span>事件与阶段</span><span>权限与证据</span></div>
    </section>

    <section className="controlTasks" id="tasks">
      <div className="controlSectionHead"><p className="controlIndex">02 / T0–T9 TASK TAXONOMY</p><h2>十类任务：T0 与 T9 横切，<br />T1–T8 构成被控主链</h2><p>分类保留位形、剖面、不稳定性、热负荷、功率和控制集成等核心概念，同时把启动/磁通、状态估计、失稳终止和 PCS/V&amp;V 单独列出，避免将物理任务与软件平台混为一层。</p></div>
      <figure className="controlTimescale"><ControlTimescaleChart tasks={taskTimescaleData}/><figcaption>典型时间尺度用于架构分层，不是统一周期要求；箭头表示开放端或数量级示意。点击任务条带可进入对应研究目录，具体值仍须回到装置硬件、诊断与物理响应。</figcaption></figure>
      <div className="controlTaskGrid">{(Object.keys(controlTaskMeta) as ControlTaskId[]).map((task) => {
        const meta = controlTaskMeta[task]; const brief = taskBriefs[task];
        const count = controlResearchItems.filter((item) => [item.primaryTask, ...item.relatedTasks].includes(task)).length;
        return <article key={task} className={meta.role === 'cross-cutting' ? 'crossCutting' : ''}>
          <header><b>{task}</b><span>{meta.en}</span><i>{count} 项关联工作</i></header><h3>{meta.label}</h3><p>{brief.short}</p>
          <dl><div><dt>典型时间</dt><dd>{brief.time}</dd></div><div><dt>核心状态</dt><dd>{brief.state}</dd></div><div><dt>主要执行</dt><dd>{brief.actuator}</dd></div></dl>
          <Link href={`/control?task=${task}#catalog`} className="controlTaskLink">查看 {task} 全部关联工作 ↗</Link>
        </article>;
      })}</div>
    </section>

    <section className="controlResearch" id="research">
      <div className="controlSectionHead controlResearchHead"><div><p className="controlIndex">03 / SEARCHABLE RESEARCH LANDSCAPE</p><h2>按任务、装置、证据与代码关系检索关键工作</h2><p>聚合问题、架构、传感器、执行器、装置、验证、结果、局限、论文与代码；装置数据、实时运行和真机闭环分别标注。</p></div><div className="controlDownloads"><a href="/fusion-integrated-control-research-report.docx" download><b>WORD</b><span>完整技术报告</span></a><a href="/data/fusion-control-landscape.json" download><b>JSON</b><span>控制工作数据</span></a><a href="/fusion-control-paper-code-index.csv" download><b>CSV</b><span>论文代码索引</span></a><a href="/fusion-control-references.bib" download><b>BIB</b><span>引用元数据</span></a></div></div>
      <ControlResearchCatalog />
    </section>

    <section className="controlEvidence" id="evidence">
      <div className="controlSectionHead"><p className="controlIndex">04 / EVIDENCE &amp; VERIFICATION</p><h2>科学证据 E 与工程部署 D 分开判断</h2><p>升级同时验证模型、数据、软件运行时、硬件接口和故障回退；单次最优曲线不代表实时或安全资格。</p></div>
      <div className="evidenceLayout"><figure><ControlEvidenceHeatmap/><figcaption>热图按 E0–E4 证据与 D1–D5 部署责任聚合全部工作；点击格子可筛选目录。若交互组件不可用，则回退显示原验证阶梯：数值基准 → 历史回放 → SIL → 实时/HIL → 影子 → 低风险闭环 → 目标工况 → 持续运行。</figcaption></figure><div className="evidenceSteps">{evidenceSteps.map((step)=><article key={step[0]}><span>{step[0]}</span><div><h3>{step[1]}</h3><p>{step[2]}</p></div></article>)}</div></div>
    </section>

    <section className="controlGaps">
      <div className="controlSectionHead"><p className="controlIndex">05 / FROM INTEGRATED CONTROL TO DIGITAL TWIN</p><h2>距离可信数字孪生，还差八种持续运行能力</h2><p>先进控制主要解决“怎样达到目标”；数字孪生还必须说明当前装置的权威状态、模型为何可信、动作由谁批准、结果如何反证模型以及下一版怎样受控发布。</p></div>
      <div className="controlGapGrid">{gaps.map((gap,index)=><article key={gap[0]}><span>{String(index+1).padStart(2,'0')}</span><h3>{gap[0]}</h3><p>{gap[1]}</p></article>)}</div>
    </section>

    <section className="controlRoadmap" id="roadmap">
      <div className="controlSectionHead"><p className="controlIndex">06 / FUSIONDIGITAL ROADMAP</p><h2>从 DINA / MEQ 控制服务，逐级走向堆与电厂控制孪生</h2><p>影子模式先于闭环，多任务协调先验证可解释与可回退，再接入燃烧、工程限值、RAMI、氚、热循环和电网目标。</p></div>
      <figure><img src="/figures/control-digital-twin-roadmap-nature.png" alt="FusionDigital从磁控制回放到聚变电厂控制数字孪生的路线图" loading="lazy" decoding="async"/><figcaption>从磁控制回放、数字影子和 SIL/HIL 走向有限闭环与电厂级协同。</figcaption></figure>
      <div className="controlRoadmapGrid">{roadmap.map((item)=><article key={item[0]}><header><span>{item[0]}</span><b>{item[1]}</b></header><p>{item[2]}</p><footer>{item[3]}</footer></article>)}</div>
    </section>

    <section className="controlClosing"><div><p className="controlIndex">07 / NEXT</p><h2>从控制研究进入平台实施。</h2></div><div><Link href="/platform#contracts">查看统一数据契约与技术路线 →</Link></div></section>
    <SiteFooter />
  </main>;
}

export default function ControlPage(){return <StaticLocaleContent zh={<ControlContent en={false}/>} en={<ControlContent en/>}/>;}
