'use client';
import { useEffect, useMemo, useState } from 'react';
import SiteFooter from '../components/SiteFooter';
import KnowledgeBackLink from '../components/KnowledgeBackLink';
import SiteNav from '../components/SiteNav';
import {
  EngineeringDomainMatrixChart,
  EngineeringRoadmapChart,
  EngineeringToolLandscapeChart,
  engineeringRoadmapStages,
} from './EngineeringCharts';
import './engineering.css';

type Tool = {
  category:string;
  tool_or_platform:string;
  license_and_stack:string;
  license_class:string;
  scope_and_validation:string;
  limitations_and_twin_gap:string;
  evidence_cutoff:string;
  url:string;
};

const domains = [
  ['01','几何与配置','CAD / PLM / 几何派生','CATIA · ENOVIA · SALOME · Paramak · bluemira'],
  ['02','破裂电磁与结构','等离子体、电路、三维导体和动力响应','DINA · MEQ · CARIDDI · ThinCurr · Ansys · Abaqus'],
  ['03','磁体与低温','线圈场、CICC、失超、绝缘和保护','4C · THEA · JackPot · Maxwell · Opera'],
  ['04','PFC 与冷却','热流映射、共轭传热、熔化与循环寿命','HEAT · MEMENTO · CFX · OpenFOAM · NekRS'],
  ['05','中子与活化','核热、TBR、dpa、活化和停机剂量','MCNP · TRIPOLI-4 · OpenMC · FISPACT-II · R2S'],
  ['06','包层与氚','系统热工、液态金属 MHD、渗透和库存','GETTHEM · RELAP5 · FreeMHD · FESTIM · TMAP8'],
  ['07','安全与厂用系统','事故、真空、低温、电源与厂房屏障','MELCOR Fusion · ATHENA-INTRA · Molflow+'],
  ['08','维护与生命周期','远程操作、装配、RAMI 和维修物流','DELMIA · Tecnomatix · ROS / MoveIt · VR'],
];

const cases = [
  ['ITER','CATIA/ENOVIA 统一大装配配置；CARIDDI/有限元分析破裂载荷；MCNP/TRIPOLI-4 与 FISPACT-II 支持核热、屏蔽和停机剂量；4C、MELCOR Fusion、远程维护全尺寸训练构成工程证据链。'],
  ['SPARC','以参数化 CAD 和 physics-to-engineering workflow 把平衡、三维导体、热流与结构连接起来；ThinCurr 支持被动结构与 REMC，HEAT 用于 PFC 热负荷，OpenMC 用于诊断和屏蔽范围研究。'],
  ['JT-60SA','Ansys Maxwell/Workbench 和全局有限元模型用于偏滤器与整机电磁—结构载荷；装配与线圈测量数据用于确认模型，全球协作要求严格的接口与配置控制。'],
  ['EAST / CFETR','EAST 用真实破裂放电重建 COMSOL 载荷、用量热和冷却数据验证 PFC 热模型，并为 4C 低温/磁体模型提供装置数据；CFETR 已开展中子—热工和 CFX 包层流道优化。'],
  ['JET / DIII-D / MAST-U','JET D–T 数据为中子学、活化与停机剂量提供稀缺系统级验证；DIII-D 的 IR 和磁诊断支撑 HEAT、ThinCurr/VALEN；MAST-U 以高热流部件和 RWM 控制验证模型与控制接口。'],
  ['DTT / KSTAR','DTT 把虚拟样机、超冗余机械臂和维护可达性纳入设计；KSTAR 的涡流/垂直力分析和长期运行数据适合支撑结构响应与状态估计研究。'],
];

const sources = [
  ['E15','ThinCurr：SPARC 与 DIII-D 三维薄壁导体','https://arxiv.org/abs/2309.15336'],
  ['E23','4C 资格与验证综述（IAEA FEC 2025）','https://conferences.iaea.org/event/392/papers/36422/files/13780-FEC2025_Paper_4C_v3_final.pdf'],
  ['E27','SPARC TF Model Coil Program','https://arxiv.org/abs/2308.12301'],
  ['E32','MEMENTO 宏观熔层运动代码','https://arxiv.org/abs/2404.12904'],
  ['E44','ITER 集成中子学模型与代码比较','https://www.iter.org/sites/default/files/media/2025-07/l-15_khodak.pdf'],
  ['E57','JET D–T 运行对 ITER 中子学的经验','https://conferences.iaea.org/event/392/contributions/35802/attachments/19803/36325/Villari_TEC_2937_FEC2025.pdf'],
  ['E62','FreeMHD 验证与确认','https://arxiv.org/abs/2409.08950'],
  ['E86','IAEA TECDOC-1851 聚变结构设计准则','https://www-pub.iaea.org/MTCD/Publications/PDF/TE1851web.pdf'],
];

export default function Engineering(){
  const [tools,setTools]=useState<Tool[]>([]); const [query,setQuery]=useState(''); const [category,setCategory]=useState('全部');
  useEffect(()=>{fetch('/data/tokamak-engineering-tool-catalog.json').then(r=>r.json()).then(setTools).catch(()=>setTools([]));},[]);
  const categories=useMemo(()=>['全部',...Array.from(new Set(tools.map(t=>t.category)))],[tools]);
  const filtered=useMemo(()=>tools.filter(t=>(category==='全部'||t.category===category)&&Object.values(t).join(' ').toLowerCase().includes(query.toLowerCase())),[tools,query,category]);
  return <main className="engPage">
   <SiteNav active="engineering" />
   <KnowledgeBackLink />
    <header id="top" className="engHero"><div><p className="eyebrow">TOKAMAK ENGINEERING SIMULATION · 2026</p><h1>把等离子体载荷，转化为<br/><em>可验证的工程裕量</em></h1><p className="lede">一份面向数字孪生与系统工程团队的 Tokamak 工程仿真图谱：系统梳理 CAD/PLM、电磁、结构、磁体失超、热流体、中子学、包层、氚、安全和远程维护工具，并解释它们如何与物理模型和实验数据闭环。</p><div className="engActions"><a className="primary" href="/tokamak-engineering-simulation-report.pdf">下载 PDF 报告</a><a href="/tokamak-engineering-simulation-report.docx">下载 Word</a><a href="#tools">浏览工具矩阵</a></div><div className="engStats"><span><b>55</b> 工具/平台组</span><span><b>87</b> 来源</span><span><b>12</b> 开放全文</span><span><b>15</b> 解释图</span></div></div><img src="/figures/engineering-tokamak-systems-nature.png" alt="Tokamak工程系统科学剖面图"/></header>

    <section className="engThesis"><p className="eyebrow">核心判断</p><h2>没有一个“Tokamak 工程超级求解器”。应统一资产身份、场景、载荷和证据，而不是强迫所有方程进入一个网格。</h2><div className="engThree"><article><b>物理给载荷</b><p>平衡、线圈电流、VDE/CQ/halo、热流、中子和粒子源必须成为带版本、坐标、单位、时间和不确定度的正式载荷包。</p></article><article><b>工程算响应</b><p>不同求解器负责涡流、温度、应力、压降、核热、活化、氚库存、失效概率和维修时间，并回传可执行限值。</p></article><article><b>实验定可信度</b><p>磁探针、应变、IR、量热、模型线圈、HHF、活化箔、停机剂量和维护训练共同决定模型是否适合指定决策。</p></article></div></section>

    <section className="loadThread"><div className="sectionHead"><p className="eyebrow">01 / 载荷数字线程</p><h2>求解器之前，先把物理与工程的接口做对</h2><p>工程风险往往来自错误 CAD 版本、坐标/单位不一致、过度平滑、非守恒映射或缺失的不确定度，而不是有限元迭代器本身。</p></div><img src="/figures/engineering-load-chain-nature.png" alt="物理载荷到工程决策数字线程"/><div className="principles"><span>资产身份</span><span>单位与坐标</span><span>力/能量/电流守恒</span><span>数值误差预算</span><span>适用域与 UQ</span></div></section>

    <section id="domains" className="domains"><div className="sectionHead"><p className="eyebrow">02 / 工程域全景</p><h2>八个工程域，跨越微秒到全寿期</h2><p>高频破裂载荷、秒级失超、小时级热工、年级活化和维护不能共享统一时间步，但可以共享配置受控数字线程。图中尺度为典型任务数量级。</p></div><div className="domainGrid">{domains.map(d=><article key={d[0]}><span>{d[0]}</span><h3>{d[1]}</h3><b>{d[2]}</b><p>{d[3]}</p></article>)}</div><div className="engScienceGrid"><figure><EngineeringDomainMatrixChart/><figcaption>工程域—时间尺度矩阵：深色表示主要决策尺度。</figcaption></figure><figure><EngineeringToolLandscapeChart/><figcaption>工具版图：位置表示典型任务耗时。</figcaption></figure></div></section>

    <section className="workflows"><div className="sectionHead"><p className="eyebrow">03 / 三条高价值工作流</p><h2>先形成可验证的“窄孪生”</h2></div><div className="workflowGrid"><figure><img src="/figures/engineering-disruption-workflow-nature.png" alt="破裂电磁结构工作流"/><figcaption><b>破裂电磁—结构</b><p>DINA/JOREK/MEQ → CARIDDI/ThinCurr/Maxwell → Ansys/Abaqus → 保护阈值；用磁探针、壁电压、应变和位移确认。</p></figcaption></figure><figure><img src="/figures/engineering-magnet-quench-nature.png" alt="超导磁体失超工作流"/><figcaption><b>磁体—低温—保护</b><p>Maxwell/Opera → JackPot → 4C/THEA → 结构/保护；用模型线圈、SULTAN/EDIPO 和装置低温数据确认。</p></figcaption></figure><figure><img src="/figures/engineering-pfc-life-nature.png" alt="PFC热机械寿命工作流"/><figcaption><b>PFC 热状态与寿命</b><p>HEAT/SOLPS → 三维表面映射 → CFD/共轭传热 → 热机械与 MEMENTO；用 IR、量热和 HHF 试验确认。</p></figcaption></figure></div></section>

    <section className="nuclear"><div className="sectionHead"><p className="eyebrow">04 / 核环境与包层</p><h2>同一 CAD 基线，派生多个几何与时间阶段</h2></div><div className="engScienceGrid"><figure><img src="/figures/engineering-neutronics-chain-nature.png" alt="中子活化停机剂量链"/><figcaption>源—输运—活化—工程量：MCNP/TRIPOLI-4/OpenMC 与 FISPACT-II/R2S/D1S 连接核热、TBR、dpa 和停机剂量。</figcaption></figure><figure><img src="/figures/engineering-blanket-coupling-nature.png" alt="包层多物理耦合图"/><figcaption>包层可行性是核、热、流、液态金属 MHD、氚、结构与安全的交集。</figcaption></figure></div><div className="originalBand"><img src="/figures/original-freemhd-vv-fig1-2.png" alt="FreeMHD原论文验证图"/><div><p className="eyebrow">原论文证据</p><h3>FreeMHD 不只展示流场，也公开了解析验证和实验确认算例</h3><p>原论文图同时展示 Shercliff/Hunt 管道、fringing field、dam breaking、LMX-U 和 Divertorlets 等算例与网格，说明高 Hartmann 数液态金属模型必须经过分层 V&amp;V。</p><a href="https://arxiv.org/abs/2409.08950" target="_blank" rel="noreferrer">阅读原论文 ↗</a></div></div></section>

    <section id="tools" className="toolCatalog"><div className="sectionHead"><p className="eyebrow">05 / 可维护工具矩阵</p><h2>55 个工具与平台组</h2><p>目录保留开放性/技术栈、适用范围与验证，以及距离运行级数字孪生的差距。每张卡片均可打开官方网站、项目文档或原始论文；CSV/JSON 也已增加 URL 字段，便于后续维护。</p></div><div className="toolDownloads"><a href="/data/tokamak-engineering-tool-catalog.csv">下载 CSV</a><a href="/data/tokamak-engineering-tool-catalog.json">下载 JSON</a><a href="/data/tokamak-engineering-literature-manifest.csv">下载 87 条来源清单</a></div><div className="engFilters"><input aria-label="搜索工程仿真工具" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索工具、目标、技术栈、验证或局限…"/><select aria-label="选择工具类别" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select><span>{filtered.length} / {tools.length}</span></div><div className="toolCards">{filtered.map((t,i)=><article key={`${t.category}-${t.tool_or_platform}`}><header><span>{String(i+1).padStart(2,'0')}</span><b>{t.license_class}</b></header><h3>{t.tool_or_platform}</h3><p className="toolCategory">{t.category}</p><dl><div><dt>开放性与栈</dt><dd>{t.license_and_stack}</dd></div><div><dt>范围与验证</dt><dd>{t.scope_and_validation}</dd></div><div><dt>限制/孪生差距</dt><dd>{t.limitations_and_twin_gap}</dd></div></dl><a className="toolLink" href={t.url} target="_blank" rel="noreferrer">官方网站 / 原始来源 ↗</a></article>)}</div></section>

    <section className="experiments"><div><p className="eyebrow">06 / 物理—工程—实验闭环</p><h2>验证要比较“合成传感器输出”，而不是节点值</h2><p>工程模型的温度、应变、磁场和中子通量必须经过传感器体积、方向、动态响应、发射率或能量响应函数后，才能与真实仪器读数比较。试验结果随后用于更新参数、适用域和不确定度，而不是只生成一张吻合曲线。</p><ul><li>电磁/结构：磁探针、Rogowski、应变、位移、加速度与支撑反力。</li><li>热/磁体：IR、热电偶、量热、压降、流量、电压抽头、热点与模型线圈。</li><li>核/氚：活化箔、剂量计、FNG/OKTAVIAN、JET D–T、渗透和热脱附谱。</li><li>维护/制造：扫描几何、碰撞检查、力反馈、任务时间和全尺寸训练。</li></ul></div><img src="/figures/engineering-vv-pyramid-nature.png" alt="工程模型验证确认金字塔"/></section>

    <section id="phase-one" className="phaseOne"><div className="phaseOneLead"><p className="eyebrow">07 / 一期联合攻关建议</p><h2>电磁—热管理—实验验证—代理模型</h2><p>面向新奥聚变人工智能团队与西安交通大学的首期协作，建议先选定一个部件或子系统，建立可复算、可校核、可被实验数据约束的高保真计算基线，再训练具有明确适用域和回退机制的快速代理模型。首期目标是“可验证窄孪生”，不是一步构建整机万能模型。</p><div className="phaseOneActions"><a href="/xjtu-engineering-digital-twin-phase1-brief.docx">下载联合攻关交流提纲</a><span>讨论稿 · 商业软件计算 + 代理模型训练</span></div></div><figure className="phaseOneFigure"><img src="/figures/phase1-engineering-twin-trust-chain.png" alt="一期工程数字孪生从输入基线、电磁高保真、热结构响应、实验确认到代理模型服务的可信链"/><figcaption>一期可信链：用求解验证、传感器对齐、独立盲测和生命周期治理，把商业软件模型转化为可部署、可拒绝超域输入的代理服务。</figcaption></figure><div className="phaseOneScope"><article><span>核心输入</span><p>受控 CAD/材料、线圈与等离子体电流时序、边界与接触、冷却条件、工况和传感器元数据。</p></article><article><span>核心输出</span><p>B/E/J、涡流损耗、J×B 体力与合力/力矩、温度与梯度，以及位移、应变、应力和裕量。</p></article><article><span>验证口径</span><p>力、位移、应变和温度可与标定后的测量链比较；应力通常由应变—本构—边界条件反演，除非确有经标定的直接应力测量。</p></article></div><div className="phaseWorkPackages"><article><span>WP0</span><h3>配置与工况基线</h3><p>冻结部件边界、坐标/单位、材料随温度变化、载荷时序、测点位置方向、采样与校准记录；形成可追溯输入包。</p></article><article><span>WP1</span><h3>电磁场与电磁力</h3><p>用商业软件建立参数化三维模型，完成网格/时间步收敛、解析或简化算例核验，输出场、涡流、损耗及守恒检查后的载荷包。</p></article><article><span>WP2</span><h3>热管理与热—结构响应</h3><p>将体积/表面热源映射到导热、对流或共轭传热模型，覆盖冷却边界和接触热阻，并计算温度、热变形、应变与应力。</p></article><article><span>WP3</span><h3>合成传感器与 VVUQ</h3><p>在模型中复现测点体积、方向、安装、动态响应和不确定度；按工况进行盲测，建立误差预算与适用域。</p></article><article><span>WP4</span><h3>代理模型与服务化</h3><p>以经审计的高保真样本开展 DoE、多保真或降阶学习；交付误差与超域检测、版本模型卡、API/ONNX/FMU 和高保真回退路径。</p></article></div><aside><b>建议本次交流锁定六项决策：</b><span>首个部件与应用问题</span><span>商业软件及许可/自动化方式</span><span>可提供的工况与传感器数据</span><span>验证与盲测判据</span><span>代理模型部署时延和输入输出</span><span>模型、数据、脚本与知识产权边界</span></aside></section>

    <section className="cases"><div className="sectionHead"><p className="eyebrow">08 / 装置实践</p><h2>装置不是“选一个软件”，而是组合一条证据链</h2></div><div className="caseGrid">{cases.map((c,i)=><article key={c[0]}><span>{String(i+1).padStart(2,'0')}</span><h3>{c[0]}</h3><p>{c[1]}</p></article>)}</div></section>

    <section id="route" className="engRoute"><div className="sectionHead"><p className="eyebrow">09 / 路线图</p><h2>从 DINA / MEQ 控制服务到聚变电厂工程孪生</h2><p>每个阶段通过历史回放、盲预测、跨试验验证和多源项账本闭合等能力门验收。</p></div><figure className="engRoadmapFigure"><EngineeringRoadmapChart/><figcaption>路线允许并行推进：E3（3—5 年）与 E4（4—8 年）在第 4—5 年重叠。</figcaption></figure><div className="routeCards">{engineeringRoadmapStages.map(s=><article key={s.id}><span>{s.id}</span><p>{s.period}</p><h3>{s.title}</h3><div>{s.detail}</div></article>)}</div></section>

    <section className="twinGap"><img src="/figures/engineering-twin-architecture-nature.png" alt="工程数字孪生参考架构"/><div><p className="eyebrow">10 / 最终架构</p><h2>工程仿真距离数字孪生，还差一套运行能力</h2><p>离线仿真通常缺少持续状态同步、可观测性、最坏时延、自动超域检测、安全回退、配置/权限控制、模型发布与撤回、网络安全和持续 V&amp;V。目标架构必须把在线状态环和离线证据工厂分开，再用统一资产 ID、载荷包和证据账本连接。</p><a href="/tokamak-engineering-simulation-report.pdf">阅读完整路线与验收门 →</a></div></section>

    <section className="engEvidence"><div className="sectionHead"><p className="eyebrow">11 / 核心来源与下载</p><h2>从报告结论回到原始证据</h2><p>网页展示核心入口；完整清单含 87 条官方文档、论文和报告，以及 12 份已校验文件头的开放全文本地副本。</p></div><div className="sourceGrid">{sources.map(s=><a key={s[0]} href={s[2]} target="_blank" rel="noreferrer"><span>{s[0]}</span><h3>{s[1]}</h3><b>打开原始来源 ↗</b></a>)}</div><div className="downloadPanel"><div><h3>技术报告</h3><a href="/tokamak-engineering-simulation-report.pdf">PDF</a><a href="/tokamak-engineering-simulation-report.docx">Word</a></div><div><h3>可维护数据</h3><a href="/data/tokamak-engineering-tool-catalog.csv">工具 CSV</a><a href="/data/tokamak-engineering-literature-manifest.csv">文献 CSV</a></div></div></section>
    <SiteFooter />
  </main>
}
