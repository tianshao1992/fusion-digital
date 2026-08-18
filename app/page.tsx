import BrandWordmark from './components/BrandWordmark';
import FusionTwinSystemMap from './components/FusionTwinSystemMap';
import PhaseOneRoadmap from './components/PhaseOneRoadmap';
import SiteFooter from './components/SiteFooter';
import SiteNav from './components/SiteNav';
import StaticLocaleContent from './components/StaticLocaleContent';
import MultiDeviceWorkspace from './digital-prototype/MultiDeviceWorkspace';
import { parseDeviceCatalog } from './digital-prototype/deviceCatalog';
import deviceCatalogJson from '../public/models/device-catalog.json';
import { knowledgeModules } from './data/knowledge-modules';
import { dataFoundationRecords } from './data-foundation/dataFoundation';
import { isPublicAnonymousMode } from './deployment-mode';
import './portal.css';
import './digital-prototype/prototype.css';
import './digital-prototype/turntable.css';

const deviceCatalog = parseDeviceCatalog(deviceCatalogJson);
const dataFoundationRecordCount = dataFoundationRecords.length;

const domainDefinitions = [
  {id:'01', status:'已开放', title:'物理模拟', en:'PHYSICS', copy:'从平衡、输运、MHD、边界到中子学与整厂系统模型，建立多保真物理地图和集成模拟证据链。', href:'/physics', figure:'/figures/domain-physics-dark-image2.png', meta:'14 类物理域 · 140+ 代码/平台'},
  {id:'02', status:'已开放', title:'工程仿真', en:'ENGINEERING', copy:'把等离子体载荷连接到电磁、结构、磁体、热流体、中子、氚、安全与维护的工程裕量。', href:'/engineering', figure:'/figures/domain-engineering-dark-image2.png', meta:'8 类工程域 · 55 个工具组'},
  {id:'03', status:'已开放', title:'集成控制', en:'INTEGRATED CONTROL', copy:'按 T0–T9 控制任务与装置 / PCS 双索引，连接状态估计、位形、剖面、稳定性、排热、功率、保护、多执行器协调和可验证实时基础设施。', href:'/control', figure:'/figures/domain-integrated-control-dark-image2.png', meta:'控制任务 · 装置 PCS · SIL/HIL · 论文代码'},
  {id:'04', status:'已开放', title:'诊断感知', en:'DIAGNOSTICS & SENSING', copy:'从传感器、几何与标定出发，连接采集质控、反演层析、合成诊断、数据同化与实时决策接口，形成带不确定度和证据链的可信状态。', href:'/diagnostics', figure:'/figures/domain-intelligent-diagnostics-dark-image2.png', meta:'12 类诊断任务 · 97 项关键工作 · 18 个装置档案'},
  {id:'05', status:'规划中', title:'能量转化', en:'ENERGY CONVERSION', copy:'贯通包层热取出、一次/二次回路、蒸汽或先进发电循环、厂用电与电网，追踪从聚变热功率到稳定净电力的效率与约束。', href:'/#domain-energy', figure:'/figures/domain-energy-conversion-dark-image2.png', meta:'包层热取出 · 热力循环 · 厂用电 · 电网'},
  {id:'06', status:'规划中', title:'辅机模拟', en:'AUXILIARY SYSTEMS', copy:'模拟真空、低温、加热与电流驱动、燃料与氚处理、水冷和电源等辅助系统，评估动态负荷、联锁、故障传播与厂用能耗。', href:'/#domain-auxiliary', figure:'/figures/domain-auxiliary-systems-dark-image2.png', meta:'真空 · 低温 · 燃料 · 冷却 · 电源'},
  {id:'07', status:'规划中', title:'人机交互', en:'HUMAN–MACHINE INTERACTION', copy:'面向运行员、物理学家和工程师组织态势感知、告警解释、方案比较、沉浸式操作与人在回路审批。', href:'/#domain-hmi', figure:'/figures/domain-human-machine-interaction-dark-image2.png', meta:'态势感知 · 解释交互 · 人在回路'},
  {id:'08', status:'已开放', title:'数据基座', en:'DATA FOUNDATION', copy:'以装置资产、炮次/事件时间轴、IMAS 语义、联邦访问、血缘和 VVUQ 证据贯通实验、模拟与工程数据。', href:'/data-foundation', figure:'/figures/domain-data-foundation-dark-image2.png', meta:`${dataFoundationRecordCount} 项标准/平台/数据库 · 8 层数据路线`},
  {id:'09', status:'重点规划', title:'总体集成', en:'WHOLE-PLANT INTEGRATION', copy:'以统一需求、系统架构、接口契约、配置基线和 VVUQ 证据编排各专业孪生，把局部最优连接为可验证的电厂级决策能力。', href:'/#domain-integration', figure:'/figures/domain-whole-plant-integration-dark-image2.png', meta:'系统架构 · 协同仿真 · 配置管理 · VVUQ', featured:'fusion'},
  {id:'10', status:'初步开放', title:'智能原生', en:'AI-NATIVE', copy:'把机器学习、深度学习、基础模型和智能体嵌入孪生的观测、预测、规划、执行与持续学习。', href:'/ai', figure:'/figures/domain-ai-native-dark-image2.png', meta:'代理模型 · 基础模型 · 智能体 · AI安全', featured:'ai'},
];

const domains = domainDefinitions.map((domain) => {
  const knowledgeModule = knowledgeModules.find((candidate) => candidate.no === domain.id);
  if (!knowledgeModule) throw new Error(`Missing shared knowledge module ${domain.id}.`);
  return { ...domain, moduleId: knowledgeModule.id, href: knowledgeModule.href };
});

const plantValues = [
  {id:'01', cn:'成本可控', en:'COST-CONTROLLED', copy:'在设计、建造、调试、运行、维护与退役之间提前识别代价，降低全生命周期成本、实体试错和非计划停机。'},
  {id:'02', cn:'高效运行', en:'EFFICIENT OPERATION', copy:'联动等离子体、热循环、辅机与电网约束，持续优化净电功率、可控工况和资源利用。'},
  {id:'03', cn:'可靠可用', en:'RELIABLE & AVAILABLE', copy:'以状态估计、寿命预测和预测性维护提升任务成功率、设备可靠性与电厂可用率。'},
  {id:'04', cn:'安全可证', en:'EVIDENCE-BASED SAFETY', copy:'以可信模型、实体试验和 V&V 共同形成可追溯的安全证据；数字孪生增强安全论证，但不替代实体验证。'},
];

const englishDomains = [
  { id: '01', status: 'Open', title: 'Physics Simulation', en: 'PHYSICS', copy: 'A multi-fidelity physics map spanning equilibrium reconstruction, transport, MHD, plasma boundary physics, neutronics and whole-plant systems.', meta: '14 physics domains · 140+ codes and platforms' },
  { id: '02', status: 'Open', title: 'Engineering Simulation', en: 'ENGINEERING', copy: 'Connect plasma loads to electromagnetic, structural, magnet, thermal-fluid, neutronics, tritium, safety and maintainability margins.', meta: '8 engineering domains · 55 tool groups' },
  { id: '03', status: 'Open', title: 'Integrated Control', en: 'INTEGRATED CONTROL', copy: 'Link state estimation, plasma current and shape, profile, stability, exhaust and protection tasks to multi-actuator coordination and verifiable real-time infrastructure.', meta: 'Control tasks · device PCS · SIL/HIL · papers and code' },
  { id: '04', status: 'Open', title: 'Diagnostics & Sensing', en: 'DIAGNOSTICS & SENSING', copy: 'Build trustworthy state estimates from sensors, geometry, calibration, acquisition quality, inversion, tomography, synthetic diagnostics and data assimilation.', meta: '12 diagnostic task groups · 97 studies · 18 device profiles' },
  { id: '05', status: 'Planned', title: 'Energy Conversion', en: 'ENERGY CONVERSION', copy: 'Trace blanket heat extraction, primary and secondary loops, power cycles, plant auxiliaries and the grid from fusion heat to stable net electricity.', meta: 'Blanket heat extraction · power cycles · auxiliaries · grid' },
  { id: '06', status: 'Planned', title: 'Auxiliary Systems', en: 'AUXILIARY SYSTEMS', copy: 'Model vacuum, cryogenics, heating and current drive, fuel and tritium processing, cooling and power systems, including interlocks and fault propagation.', meta: 'Vacuum · cryogenics · fuel · cooling · power supplies' },
  { id: '07', status: 'Planned', title: 'Human–Machine Interaction', en: 'HUMAN–MACHINE INTERACTION', copy: 'Support operators, physicists and engineers with situation awareness, explainable alarms, scenario comparison and human-in-the-loop approval.', meta: 'Situation awareness · explainability · human in the loop' },
  { id: '08', status: 'Open', title: 'Data Foundation', en: 'DATA FOUNDATION', copy: 'Connect experimental, simulated and engineering data through asset identity, pulse/event time, IMAS semantics, federated access, provenance and VVUQ evidence.', meta: `${dataFoundationRecordCount} standards/platforms/databases · 8-layer data route` },
  { id: '09', status: 'Priority', title: 'Whole-Plant Integration', en: 'WHOLE-PLANT INTEGRATION', copy: 'Orchestrate specialist twins through requirements, system architecture, interface contracts, configuration baselines and VVUQ evidence.', meta: 'System architecture · co-simulation · configuration · VVUQ' },
  { id: '10', status: 'Initial release', title: 'AI-Native Systems', en: 'AI-NATIVE', copy: 'Embed machine learning, deep learning, foundation models and agents into observation, prediction, planning, execution and continual learning.', meta: 'Surrogates · foundation models · agents · AI safety' },
].map((domain) => {
  const base = domains.find((candidate) => candidate.id === domain.id)!;
  return { ...base, ...domain };
});

const englishPlantValues = [
  { id: '01', title: 'Cost controlled', en: 'COST-CONTROLLED', copy: 'Identify cost drivers across design, construction, commissioning, operation, maintenance and decommissioning to reduce lifecycle cost, physical trial-and-error and unplanned downtime.' },
  { id: '02', title: 'Efficient operation', en: 'EFFICIENT OPERATION', copy: 'Coordinate plasma, power-cycle, auxiliary-system and grid constraints to improve net electric output, controllable operating space and resource use.' },
  { id: '03', title: 'Reliable and available', en: 'RELIABLE & AVAILABLE', copy: 'Use state estimation, life prediction and predictive maintenance to improve mission success, equipment reliability and plant availability.' },
  { id: '04', title: 'Evidence-based safety', en: 'EVIDENCE-BASED SAFETY', copy: 'Combine credible models, physical tests and V&V into traceable safety evidence. Digital twins strengthen, but never replace, physical validation.' },
];

function ChineseHome() {
  const publicAnonymousMode = isPublicAnonymousMode();
  return <main className="portalPage">
    <SiteNav active="home" />
    <header className="portalHero" id="top">
      <div className="heroText">
        <p className="kicker"><BrandWordmark /> / FUSION DIGITAL TWIN COMMUNITY</p>
        <h1>聚变数字孪生：支撑未来电厂<span className="heroTitleValues">成本可控 · 高效运行 · 可靠可用 · 安全可证</span></h1>
        <p className="heroValueEnglish">FUSION DIGITAL TWIN FOR FUTURE POWER PLANTS<br/><b>LIFECYCLE COST CONTROL · EFFICIENT OPERATION · RELIABLE AVAILABILITY · EVIDENCE-BASED SAFETY</b></p>
        <p className="heroLead">以经过验证的多物理模型、运行与实验数据及智能决策技术，贯通设计、建造、调试、运行、维护与退役全过程，为降低全寿命成本、提升系统效能和电厂可用率、强化安全论证提供持续更新、可追溯且带有不确定度说明的工程依据。</p>
        <div className="heroActions"><a className="solid" href="#prototype-workspace">进入数字样机工作台</a><a href="#domains">探索知识域</a><a href="/facilities">查看全球装置状态</a></div>
        <div className="heroMetrics"><span><b>06</b>已开放知识域</span><span><b>{dataFoundationRecordCount}</b>数据标准/平台/数据库条目</span><span><b>18+</b>重点装置/项目</span><span><b>2026-08</b>证据截止</span></div>
      </div>
      <figure className="heroArchitectureFigure">
        <a href="/figures/fusion-twin-ai-native-overview.png" target="_blank" rel="noreferrer" aria-label="打开聚变数字孪生与智能体总体架构原图">
          <img src="/figures/fusion-twin-ai-native-overview.png" alt="聚变装置、数字孪生、人工智能智能体、安全权限门与经验证控制之间的总体关系图" />
        </a>
        <figcaption className="srOnly">聚变、数字孪生与智能体关系图。实测与模拟共同更新孪生状态，智能体提出候选行动；只有通过权限、安全与物理约束门的方案才可进入控制或实验决策。本图表达信息流与治理边界，并非特定装置的实时控制拓扑。</figcaption>
      </figure>
      <section className="plantValue" aria-labelledby="plant-value-title">
        <p>FUSION POWER PLANT VALUE</p>
        <div className="plantValueStatement">
          <h2 id="plant-value-title">贯穿设计、建造、调试、运行、维护与退役，让聚变电厂的每个关键决策<span>可计算、可验证、可追溯。</span></h2>
          <div className="plantValueEnglish">Across design, construction, commissioning, operation, maintenance and decommissioning, digital twins make critical decisions <b>computable, verifiable and traceable.</b></div>
        </div>
        <div className="plantValueGrid">{plantValues.map(value=><article key={value.id}><span>{value.id}</span><h3>{value.cn}</h3><b>{value.en}</b><p>{value.copy}</p></article>)}</div>
      </section>
    </header>

    <div className="prototypePage prototypePage--embedded">
      <MultiDeviceWorkspace catalog={deviceCatalog} />
    </div>

    <FusionTwinSystemMap />

    <section className="aiNativePortal" aria-labelledby="ai-native-portal-title">
      <div className="aiNativePortalIntro">
        <p className="sectionIndex">AI-NATIVE KNOWLEDGE OPERATING SYSTEM</p>
        <h2 id="ai-native-portal-title">让调研、证据、关系与更新，成为一套可持续运行的知识基础设施。</h2>
        <p>大模型只负责连接问题与已核验资料；论文、代码、装置和结论仍由结构化来源、权限、配额、审核与版本记录共同约束。模型不可用时，系统自动回退到确定性检索。</p>
      </div>
      <div className="aiNativePortalGrid">
        <a href="/search"><span>01 / SEARCH & ASK</span><h3>证据检索与问答</h3><p>跨知识域检索论文、代码、装置与工作，并以来源白名单约束模型回答。</p><b>开始检索 →</b></a>
        <a href="/knowledge-graph"><span>02 / KNOWLEDGE GRAPH</span><h3>知识图谱</h3><p>从装置或任务展开一至两跳邻域，追溯论文、代码、机构和验证关系。</p><b>探索图谱 →</b></a>
        {!publicAnonymousMode && <a href="/research-review"><span>03 / HUMAN REVIEW</span><h3>智能体候选审核</h3><p>一期已建立候选生成与职责分离审核；联网发现仍处于安全演练阶段，任何接受项也不会自动发布。</p><b>进入审核台 →</b></a>}
        {!publicAnonymousMode && <a href="/account"><span>04 / IDENTITY & GOVERNANCE</span><h3>账户、角色与配额</h3><p>使用可信平台身份，统一管理成员角色、模型额度、使用记录和审计边界。</p><b>查看账户 →</b></a>}
      </div>
    </section>

    <section className="domainSection" id="domains">
      <div className="sectionIntro"><p className="sectionIndex">02 / KNOWLEDGE DOMAINS</p><h2>从专业孪生走向总体集成与智能原生</h2><p>十个知识域共同覆盖聚变电厂的物理规律、工程系统、运行认知、能量链、辅机、人机协同、数据与智能；总体集成和智能原生作为并列重点，将各域组织为可验证的整体能力。</p></div>
      <div className="domainCards">{domains.map(domain=><a id={`domain-${domain.moduleId}`} href={domain.href} key={domain.id} className={`domainCard${domain.featured?` featuredDomainCard ${domain.featured}Featured`:''}`}><div className="domainFigure">{domain.figure?<img src={domain.figure} alt={`${domain.title}核心结构科学信息图`} loading="lazy" decoding="async"/>:<div className="aiDomainVisual" aria-hidden="true"><span className="miniPlasma"/><span className="miniTwin">Δt</span><span className="miniAgent">A</span><i/><i/></div>}<span>{domain.status}</span></div><div className="domainBody"><p>{domain.id} / {domain.en}</p><h3>{domain.title}</h3><div>{domain.copy}</div><b>{domain.meta}</b><i>{domain.status.includes('开放') ? '进入知识域 ↗' : '查看模块定义 ↗'}</i></div></a>)}</div>
    </section>

    <section className="facilityPreview">
      <div><p className="sectionIndex">03 / GLOBAL FACILITIES</p><h2>装置建设与运行状态，是模型需求最真实的时间轴。</h2><p>跟踪建设中、运行中、升级维护、设计阶段与退役中的代表性聚变装置，并把状态回链到项目官方页面或原始论文。</p><a href="/facilities">打开全球装置观测台 →</a></div>
      <div className="facilityTicker"><span><b>EXL-50U</b>运行中：聚焦 p-¹¹B、非感应启动与 AI 实时控制</span><span><b>EHL-2</b>物理与工程设计推进，目标 2027 年完成建设</span><span><b>ITER</b>6 / 9 真空室扇区模块已就位</span><span><b>SPARC</b>装置设施约完成 75%，机器装配中</span><span><b>BEST</b>主机全面装配，计划 2027 年完成</span></div>
    </section>

    <section className="resourceSection" id="resources">
      <div className="sectionIntro"><p className="sectionIndex">04 / TOOLCHAINS</p><h2>工具不是孤立清单，而是从输入、求解、验证到决策的链条。</h2><p>每条工具链都明确数据接口、尺度转换、验证证据、适用域和输出责任；任何一个环节不可追溯，整条链就不能进入数字孪生。</p></div>
      <div className="resourceGrid"><a href="/physics#catalog"><span>P</span><h3>物理预测链</h3><p>平衡 → 输运 → MHD → 边界 → 中子与燃料循环。</p><b>浏览物理工具链 ↗</b></a><a href="/engineering#tools"><span>E</span><h3>工程裕量链</h3><p>载荷 → 电磁 → 结构/热流 → 损伤 → 寿命与维护。</p><b>浏览工程工具链 ↗</b></a><a href="/control"><span>C</span><h3>集成控制链</h3><p>状态 → 位形/剖面/MHD/排热 → 多执行器协调 → PCS → SIL/HIL 与闭环证据。</p><b>进入集成控制图谱 ↗</b></a><a href="/diagnostics"><span>D</span><h3>诊断证据链</h3><p>传感器/标定 → 采集与质控 → 反演/合成诊断 → 同化 → 实时决策接口。</p><b>进入诊断感知图谱 ↗</b></a><a href="/data-foundation"><span>F</span><h3>数据证据链</h3><p>采集/炮次档案 → IMAS 语义 → 联邦访问 → 血缘/PID → VVUQ 发布。</p><b>进入数据基座图谱 ↗</b></a><a href="/ai"><span>A</span><h3>智能原生链</h3><p>数据 → 表征 → 代理模型 → 智能体 → 权限与安全门。</p><b>进入智能原生 ↗</b></a></div>
    </section>

    <PhaseOneRoadmap />

    <section className="communityBand" id="community"><div><p className="sectionIndex">06 / BUILD WITH US</p><h2>让聚变模型、实验与工程经验真正互相理解。</h2></div><div><p><BrandWordmark className="brandWordmarkInline" /> 将逐步开放装置、控制、诊断、数据、AI、VVUQ 与社区协作模块。欢迎研究机构、装置团队、软件开发者和工业伙伴共同完善工具条目、验证证据与装置案例。</p><a href="mailto:tianshao1992@gmail.com">联系新奥聚变人工智能团队 →</a></div></section>
    <SiteFooter />
  </main>;
}

function EnglishHome() {
  const publicAnonymousMode = isPublicAnonymousMode();
  return <main className="portalPage">
    <SiteNav active="home" />
    <header className="portalHero" id="top">
      <div className="heroText">
        <p className="kicker"><BrandWordmark /> / FUSION DIGITAL TWIN COMMUNITY</p>
        <h1>Fusion digital twins for future power plants<span className="heroTitleValues">Cost controlled · Efficient · Reliable and available · Safety with evidence</span></h1>
        <p className="heroValueEnglish">FUSION DIGITAL TWIN FOR FUTURE POWER PLANTS<br/><b>LIFECYCLE COST CONTROL · EFFICIENT OPERATION · RELIABLE AVAILABILITY · EVIDENCE-BASED SAFETY</b></p>
        <p className="heroLead">Verified multiphysics models, operational and experimental data, and intelligent decision support connect the full lifecycle from design and construction through commissioning, operation, maintenance and decommissioning. Every engineering conclusion remains traceable, versioned and explicit about uncertainty.</p>
        <div className="heroActions"><a className="solid" href="#prototype-workspace">Open the digital prototype</a><a href="#domains">Explore knowledge domains</a><a href="/facilities">View global facilities</a></div>
        <div className="heroMetrics"><span><b>06</b>open knowledge domains</span><span><b>{dataFoundationRecordCount}</b>data standards, platforms and databases</span><span><b>18+</b>priority devices and projects</span><span><b>2026-08</b>evidence cut-off</span></div>
      </div>
      <figure className="heroArchitectureFigure">
        <a href="/figures/fusion-twin-ai-native-overview.png" target="_blank" rel="noreferrer" aria-label="Open the full fusion digital-twin and agent architecture figure">
          <img src="/figures/fusion-twin-ai-native-overview.png" alt="Architecture linking fusion devices, digital twins, AI agents, permission and safety gates, and validated control" />
        </a>
        <figcaption className="srOnly">Measurements and simulations update a shared twin state. Agents may propose candidate actions, but only options that pass permission, safety and physics-constraint gates may inform control or experimental decisions. This is an information-flow model, not a real-time control topology for a specific device.</figcaption>
      </figure>
      <section className="plantValue" aria-labelledby="plant-value-title-en">
        <p>FUSION POWER PLANT VALUE</p>
        <div className="plantValueStatement"><h2 id="plant-value-title-en">Across design, construction, commissioning, operation, maintenance and decommissioning, make every critical decision<span>computable, verifiable and traceable.</span></h2></div>
        <div className="plantValueGrid">{englishPlantValues.map((value) => <article key={value.id}><span>{value.id}</span><h3>{value.title}</h3><b>{value.en}</b><p>{value.copy}</p></article>)}</div>
      </section>
    </header>

    <div className="prototypePage prototypePage--embedded"><MultiDeviceWorkspace catalog={deviceCatalog} /></div>
    <FusionTwinSystemMap />

    <section className="aiNativePortal" aria-labelledby="ai-native-portal-title-en">
      <div className="aiNativePortalIntro"><p className="sectionIndex">AI-NATIVE KNOWLEDGE OPERATING SYSTEM</p><h2 id="ai-native-portal-title-en">Turn research, evidence, relationships and updates into sustainable knowledge infrastructure.</h2><p>Language models connect questions to verified material; structured sources, permissions, quotas, review and version records remain authoritative. If no model is available, the system returns deterministic retrieval rather than unsupported synthesis.</p></div>
      <div className="aiNativePortalGrid">
        <a href="/search"><span>01 / SEARCH & ASK</span><h3>Evidence search and dialogue</h3><p>Search papers, code, devices and research across domains, with model answers constrained by cited evidence.</p><b>Start searching →</b></a>
        <a href="/knowledge-graph"><span>02 / KNOWLEDGE GRAPH</span><h3>Knowledge graph</h3><p>Expand one- or two-hop neighborhoods from a device or task and trace papers, code, organizations and validation links.</p><b>Explore the graph →</b></a>
        {!publicAnonymousMode && <a href="/research-review"><span>03 / HUMAN REVIEW</span><h3>Agent candidate review</h3><p>Agent discoveries become candidates; responsibility-separated human review controls acceptance, and acceptance never publishes automatically.</p><b>Open the review workspace →</b></a>}
        {!publicAnonymousMode && <a href="/account"><span>04 / IDENTITY & GOVERNANCE</span><h3>Accounts, roles and quotas</h3><p>Manage trusted identity, member roles, model quotas, usage records and audit boundaries.</p><b>View account →</b></a>}
      </div>
    </section>

    <section className="domainSection" id="domains">
      <div className="sectionIntro"><p className="sectionIndex">02 / KNOWLEDGE DOMAINS</p><h2>From specialist twins to whole-plant integration and AI-native operation</h2><p>Ten domains cover fusion-plant physics, engineering systems, operational awareness, energy conversion, auxiliaries, human interaction, data and intelligence. Whole-plant integration and AI-native systems organize them into a verifiable capability.</p></div>
      <div className="domainCards">{englishDomains.map((domain) => <a id={`domain-${domain.moduleId}`} href={domain.href} key={domain.id} className={`domainCard${domain.featured ? ` featuredDomainCard ${domain.featured}Featured` : ''}`}><div className="domainFigure">{domain.figure ? <img src={domain.figure} alt={`${domain.title} scientific systems overview`} loading="lazy" decoding="async" /> : <div className="aiDomainVisual" aria-hidden="true"><span className="miniPlasma"/><span className="miniTwin">Δt</span><span className="miniAgent">A</span><i/><i/></div>}<span>{domain.status}</span></div><div className="domainBody"><p>{domain.id} / {domain.en}</p><h3>{domain.title}</h3><div>{domain.copy}</div><b>{domain.meta}</b><i>{domain.status === 'Open' ? 'Enter knowledge domain ↗' : 'View module definition ↗'}</i></div></a>)}</div>
    </section>

    <section className="facilityPreview"><div><p className="sectionIndex">03 / GLOBAL FACILITIES</p><h2>Construction and operating status provide the most realistic timeline for model requirements.</h2><p>Track representative devices in construction, operation, upgrade, design and decommissioning, with every time-sensitive statement linked to an official project page or primary publication.</p><a href="/facilities">Open the global facilities observatory →</a></div><div className="facilityTicker"><span><b>EXL-50U</b> operating: p–¹¹B research, non-inductive start-up and AI-supported real-time control</span><span><b>EHL-2</b> physics and engineering design under development</span><span><b>ITER</b> assembly and system commissioning preparation</span><span><b>SPARC</b> facility and machine assembly in progress</span><span><b>BEST</b> main-machine assembly in progress</span></div></section>

    <section className="resourceSection" id="resources"><div className="sectionIntro"><p className="sectionIndex">04 / TOOLCHAINS</p><h2>Tools form chains from input and solution through validation to decision.</h2><p>Each chain must define data interfaces, scale transfer, validation evidence, applicability and responsibility for outputs. If one link is not traceable, the chain is not ready for digital-twin use.</p></div><div className="resourceGrid"><a href="/physics#catalog"><span>P</span><h3>Physics prediction chain</h3><p>Equilibrium → transport → MHD → boundary → neutronics and fuel cycle.</p><b>Browse physics tools ↗</b></a><a href="/engineering#tools"><span>E</span><h3>Engineering margin chain</h3><p>Loads → electromagnetics → structural/thermal response → damage → life and maintenance.</p><b>Browse engineering tools ↗</b></a><a href="/control"><span>C</span><h3>Integrated control chain</h3><p>State → plasma current, shape, profiles, MHD and exhaust → actuator coordination → PCS → SIL/HIL evidence.</p><b>Open integrated control ↗</b></a><a href="/diagnostics"><span>D</span><h3>Diagnostic evidence chain</h3><p>Sensor and calibration → acquisition quality → inversion and synthetic diagnostics → assimilation → real-time interfaces.</p><b>Open diagnostics and sensing ↗</b></a><a href="/data-foundation"><span>F</span><h3>Data evidence chain</h3><p>Acquisition and pulse archives → IMAS semantics → federated access → provenance/PID → VVUQ release.</p><b>Open the data foundation ↗</b></a><a href="/ai"><span>A</span><h3>AI-native chain</h3><p>Data → representation → surrogate → agent → permission and safety gates.</p><b>Open AI-native systems ↗</b></a></div></section>

    <PhaseOneRoadmap />
    <section className="communityBand" id="community"><div><p className="sectionIndex">06 / BUILD WITH US</p><h2>Help fusion models, experiments and engineering experience understand one another.</h2></div><div><p><BrandWordmark className="brandWordmarkInline" /> is progressively opening device, control, diagnostics, data, AI, VVUQ and community workflows. Research organizations, device teams, software developers and industrial partners are welcome to improve tool records, validation evidence and device cases.</p><a href="mailto:tianshao1992@gmail.com">Contact the ENN Fusion AI Team →</a></div></section>
    <SiteFooter />
  </main>;
}

export default function Home() {
  return <StaticLocaleContent zh={<ChineseHome />} en={<EnglishHome />} />;
}
