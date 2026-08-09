'use client';
import { useEffect, useMemo, useState } from 'react';
import './engineering.css';

type Tool = {
  category:string;
  tool_or_platform:string;
  license_and_stack:string;
  license_class:string;
  scope_and_validation:string;
  limitations_and_twin_gap:string;
  evidence_cutoff:string;
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

const stages = [
  ['E0','载荷接口基线','0—12 个月','DINA/MEQ 历史回放；建立资产 ID、CAD/线圈/导体版本、场景时间线、单位和守恒检查。'],
  ['E1','破裂电磁窄孪生','12—24 个月','接入三维导体模型和结构 ROM；比较磁探针、壁电压、应变、位移与反力；先影子运行，再影响阈值。'],
  ['E2','热与磁体状态','2—3 年','以 IR/量热校准 PFC 热状态；以电压、流量、压力和模型线圈数据校准 CICC/低温状态估计。'],
  ['E3','核—包层—氚','3—5 年','连接核热/TBR/活化、冷却/MHD、氚渗透和库存；形成部件寿命、停机剂量和材料批次账本。'],
  ['E4','整厂运行与 RAMI','4—8 年','把安全、维护、备件、可用率、功率转换、电网和许可证据接入全生命周期数字线程。'],
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
    <nav><a className="brand" href="/">FUSION / SIMULATION ATLAS</a><div><a href="/">物理模拟</a><a className="active" href="#top">工程仿真</a><a href="#domains">工程域</a><a href="#tools">工具目录</a><a href="#route">路线图</a></div></nav>
    <header id="top" className="engHero"><div><p className="eyebrow">TOKAMAK ENGINEERING SIMULATION · 2026</p><h1>把等离子体载荷，转化为<br/><em>可验证的工程裕量</em></h1><p className="lede">一份面向数字孪生与系统工程团队的 Tokamak 工程仿真图谱：系统梳理 CAD/PLM、电磁、结构、磁体失超、热流体、中子学、包层、氚、安全和远程维护工具，并解释它们如何与物理模型和实验数据闭环。</p><div className="engActions"><a className="primary" href="/tokamak-engineering-simulation-report.pdf">下载 PDF 报告</a><a href="/tokamak-engineering-simulation-report.docx">下载 Word</a><a href="#tools">浏览工具矩阵</a></div><div className="engStats"><span><b>55</b> 工具/平台组</span><span><b>87</b> 来源</span><span><b>12</b> 开放全文</span><span><b>15</b> 解释图</span></div></div><img src="/figures/engineering-tokamak-systems-nature.png" alt="Tokamak工程系统科学剖面图"/></header>

    <section className="engThesis"><p className="eyebrow">核心判断</p><h2>没有一个“Tokamak 工程超级求解器”。应统一资产身份、场景、载荷和证据，而不是强迫所有方程进入一个网格。</h2><div className="engThree"><article><b>物理给载荷</b><p>平衡、线圈电流、VDE/CQ/halo、热流、中子和粒子源必须成为带版本、坐标、单位、时间和不确定度的正式载荷包。</p></article><article><b>工程算响应</b><p>不同求解器负责涡流、温度、应力、压降、核热、活化、氚库存、失效概率和维修时间，并回传可执行限值。</p></article><article><b>实验定可信度</b><p>磁探针、应变、IR、量热、模型线圈、HHF、活化箔、停机剂量和维护训练共同决定模型是否适合指定决策。</p></article></div></section>

    <section className="loadThread"><div className="sectionHead"><p className="eyebrow">01 / 载荷数字线程</p><h2>求解器之前，先把物理与工程的接口做对</h2><p>工程风险往往来自错误 CAD 版本、坐标/单位不一致、过度平滑、非守恒映射或缺失的不确定度，而不是有限元迭代器本身。</p></div><img src="/figures/engineering-load-chain-nature.png" alt="物理载荷到工程决策数字线程"/><div className="principles"><span>资产身份</span><span>单位与坐标</span><span>力/能量/电流守恒</span><span>数值误差预算</span><span>适用域与 UQ</span></div></section>

    <section id="domains" className="domains"><div className="sectionHead"><p className="eyebrow">02 / 工程域全景</p><h2>八个工程域，跨越微秒到全寿期</h2><p>高频破裂载荷、秒级失超、小时级热工、年级活化和维护不能共享统一时间步，但可以共享一条配置受控数字线程。</p></div><div className="domainGrid">{domains.map(d=><article key={d[0]}><span>{d[0]}</span><h3>{d[1]}</h3><b>{d[2]}</b><p>{d[3]}</p></article>)}</div><div className="engScienceGrid"><figure><img src="/figures/engineering-domain-matrix-nature.png" alt="工程仿真时间尺度矩阵"/><figcaption>工程域—时间尺度矩阵：深色表示主要决策尺度。</figcaption></figure><figure><img src="/figures/engineering-tool-landscape-nature.png" alt="工程仿真工具版图"/><figcaption>工具版图：位置为典型任务耗时数量级，不构成性能承诺。</figcaption></figure></div></section>

    <section className="workflows"><div className="sectionHead"><p className="eyebrow">03 / 三条高价值工作流</p><h2>先形成可验证的“窄孪生”</h2></div><div className="workflowGrid"><figure><img src="/figures/engineering-disruption-workflow-nature.png" alt="破裂电磁结构工作流"/><figcaption><b>破裂电磁—结构</b><p>DINA/JOREK/MEQ → CARIDDI/ThinCurr/Maxwell → Ansys/Abaqus → 保护阈值；用磁探针、壁电压、应变和位移确认。</p></figcaption></figure><figure><img src="/figures/engineering-magnet-quench-nature.png" alt="超导磁体失超工作流"/><figcaption><b>磁体—低温—保护</b><p>Maxwell/Opera → JackPot → 4C/THEA → 结构/保护；用模型线圈、SULTAN/EDIPO 和装置低温数据确认。</p></figcaption></figure><figure><img src="/figures/engineering-pfc-life-nature.png" alt="PFC热机械寿命工作流"/><figcaption><b>PFC 热状态与寿命</b><p>HEAT/SOLPS → 三维表面映射 → CFD/共轭传热 → 热机械与 MEMENTO；用 IR、量热和 HHF 试验确认。</p></figcaption></figure></div></section>

    <section className="nuclear"><div className="sectionHead"><p className="eyebrow">04 / 核环境与包层</p><h2>同一 CAD 基线，派生多个几何与时间阶段</h2></div><div className="engScienceGrid"><figure><img src="/figures/engineering-neutronics-chain-nature.png" alt="中子活化停机剂量链"/><figcaption>源—输运—活化—工程量：MCNP/TRIPOLI-4/OpenMC 与 FISPACT-II/R2S/D1S 连接核热、TBR、dpa 和停机剂量。</figcaption></figure><figure><img src="/figures/engineering-blanket-coupling-nature.png" alt="包层多物理耦合图"/><figcaption>包层可行性是核、热、流、液态金属 MHD、氚、结构与安全的交集。</figcaption></figure></div><div className="originalBand"><img src="/figures/original-freemhd-vv-fig1-2.png" alt="FreeMHD原论文验证图"/><div><p className="eyebrow">原论文证据</p><h3>FreeMHD 不只展示流场，也公开了解析验证和实验确认算例</h3><p>原论文图同时展示 Shercliff/Hunt 管道、fringing field、dam breaking、LMX-U 和 Divertorlets 等算例与网格，说明高 Hartmann 数液态金属模型必须经过分层 V&amp;V。</p><a href="https://arxiv.org/abs/2409.08950" target="_blank" rel="noreferrer">阅读原论文 ↗</a></div></div></section>

    <section id="tools" className="toolCatalog"><div className="sectionHead"><p className="eyebrow">05 / 可维护工具矩阵</p><h2>55 个工具与平台组</h2><p>目录保留开放性/技术栈、适用范围与验证，以及距离运行级数字孪生的差距。可搜索并按四类工程域筛选；CSV/JSON 可下载后继续维护。</p></div><div className="toolDownloads"><a href="/data/tokamak-engineering-tool-catalog.csv">下载 CSV</a><a href="/data/tokamak-engineering-tool-catalog.json">下载 JSON</a><a href="/data/tokamak-engineering-literature-manifest.csv">下载 87 条来源清单</a></div><div className="engFilters"><input aria-label="搜索工程仿真工具" value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索工具、目标、技术栈、验证或局限…"/><select aria-label="选择工具类别" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select><span>{filtered.length} / {tools.length}</span></div><div className="toolCards">{filtered.map((t,i)=><article key={`${t.category}-${t.tool_or_platform}`}><header><span>{String(i+1).padStart(2,'0')}</span><b>{t.license_class}</b></header><h3>{t.tool_or_platform}</h3><p className="toolCategory">{t.category}</p><dl><div><dt>开放性与栈</dt><dd>{t.license_and_stack}</dd></div><div><dt>范围与验证</dt><dd>{t.scope_and_validation}</dd></div><div><dt>限制/孪生差距</dt><dd>{t.limitations_and_twin_gap}</dd></div></dl></article>)}</div></section>

    <section className="experiments"><div><p className="eyebrow">06 / 物理—工程—实验闭环</p><h2>验证要比较“合成传感器输出”，而不是节点值</h2><p>工程模型的温度、应变、磁场和中子通量必须经过传感器体积、方向、动态响应、发射率或能量响应函数后，才能与真实仪器读数比较。试验结果随后用于更新参数、适用域和不确定度，而不是只生成一张吻合曲线。</p><ul><li>电磁/结构：磁探针、Rogowski、应变、位移、加速度与支撑反力。</li><li>热/磁体：IR、热电偶、量热、压降、流量、电压抽头、热点与模型线圈。</li><li>核/氚：活化箔、剂量计、FNG/OKTAVIAN、JET D–T、渗透和热脱附谱。</li><li>维护/制造：扫描几何、碰撞检查、力反馈、任务时间和全尺寸训练。</li></ul></div><img src="/figures/engineering-vv-pyramid-nature.png" alt="工程模型验证确认金字塔"/></section>

    <section className="cases"><div className="sectionHead"><p className="eyebrow">07 / 装置实践</p><h2>装置不是“选一个软件”，而是组合一条证据链</h2></div><div className="caseGrid">{cases.map((c,i)=><article key={c[0]}><span>{String(i+1).padStart(2,'0')}</span><h3>{c[0]}</h3><p>{c[1]}</p></article>)}</div></section>

    <section id="route" className="engRoute"><div className="sectionHead"><p className="eyebrow">08 / 路线图</p><h2>从 DINA / MEQ 控制服务到聚变电厂工程孪生</h2><p>每个阶段都必须通过能力门：历史回放、盲预测、跨试验验证、多源项账本闭合和运行治理，而不是只以“接入代码数量”验收。</p></div><img src="/figures/engineering-roadmap-nature.png" alt="DINA MEQ到工程数字孪生路线图"/><div className="routeCards">{stages.map(s=><article key={s[0]}><span>{s[0]}</span><p>{s[2]}</p><h3>{s[1]}</h3><div>{s[3]}</div></article>)}</div></section>

    <section className="twinGap"><img src="/figures/engineering-twin-architecture-nature.png" alt="工程数字孪生参考架构"/><div><p className="eyebrow">09 / 最终架构</p><h2>工程仿真距离数字孪生，还差一套运行能力</h2><p>离线仿真通常缺少持续状态同步、可观测性、最坏时延、自动超域检测、安全回退、配置/权限控制、模型发布与撤回、网络安全和持续 V&amp;V。目标架构必须把在线状态环和离线证据工厂分开，再用统一资产 ID、载荷包和证据账本连接。</p><a href="/tokamak-engineering-simulation-report.pdf">阅读完整路线与验收门 →</a></div></section>

    <section className="engEvidence"><div className="sectionHead"><p className="eyebrow">10 / 核心来源与下载</p><h2>从报告结论回到原始证据</h2><p>网页展示核心入口；完整清单含 87 条官方文档、论文和报告，以及 12 份已校验文件头的开放全文本地副本。</p></div><div className="sourceGrid">{sources.map(s=><a key={s[0]} href={s[2]} target="_blank" rel="noreferrer"><span>{s[0]}</span><h3>{s[1]}</h3><b>打开原始来源 ↗</b></a>)}</div><div className="downloadPanel"><div><h3>技术报告</h3><a href="/tokamak-engineering-simulation-report.pdf">PDF</a><a href="/tokamak-engineering-simulation-report.docx">Word</a></div><div><h3>可维护数据</h3><a href="/data/tokamak-engineering-tool-catalog.csv">工具 CSV</a><a href="/data/tokamak-engineering-literature-manifest.csv">文献 CSV</a></div></div></section>
    <footer><div><b>FUSION / SIMULATION ATLAS</b><p>聚变物理模拟与 Tokamak 工程仿真双页图谱</p></div><p>资料截止 2026-08-09 · 生成图用于技术解释，不替代正式工程设计、安全分析或许可活动。</p></footer>
  </main>
}
