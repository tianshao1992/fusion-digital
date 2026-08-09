import SiteFooter from './components/SiteFooter';
import SiteNav from './components/SiteNav';
import './portal.css';

const domains = [
  {id:'01', status:'已开放', title:'物理模拟', en:'PHYSICS', copy:'从平衡、输运、MHD、边界到中子学与整厂系统模型，建立多保真物理地图和集成模拟证据链。', href:'/physics', figure:'/figures/physics-stack-image2-v2.png', meta:'14 类物理域 · 140+ 代码/平台'},
  {id:'02', status:'已开放', title:'工程仿真', en:'ENGINEERING', copy:'把等离子体载荷连接到电磁、结构、磁体、热流体、中子、氚、安全与维护的工程裕量。', href:'/engineering', figure:'/figures/engineering-tokamak-systems-image2-v2.png', meta:'8 类工程域 · 55 个工具组'},
  {id:'03', status:'规划中', title:'控制与诊断', en:'CONTROL & DIAGNOSTICS', copy:'面向 DINA、MEQ、控制器、合成诊断和状态估计的可回放、可验证闭环。', href:'/#roadmap', figure:'/figures/dina-meq-architecture-image2-v2.png', meta:'控制服务 · 合成观测 · SIL/HIL'},
  {id:'04', status:'规划中', title:'实验与数据', en:'EXPERIMENT & DATA', copy:'把提案、配置、放电、诊断、事件、模型运行与验证证据组织成一炮一链。', href:'/#roadmap', figure:'/figures/experiment-model-control-image2-v3.png', meta:'场景容器 · 数据血缘 · 评估'},
];

const mainLine = [
  ['01','实验问题','目标、配置、约束与成功判据'],
  ['02','虚拟放电','执行器、自由边界与控制状态'],
  ['03','合成观测','诊断几何、采样、噪声与质量'],
  ['04','跨域解释','物理状态、工程裕量与不确定度'],
  ['05','人机决策','评估、下一炮建议与可审计批准'],
];

const roadmap = [
  ['R0','控制服务化','当前','冻结 DINA / MEQ 接口、装置资产包、回放基线与证据门。'],
  ['R1','窄域数字影子','近期','连接合成/历史诊断、工程限值和确定性场景回放。'],
  ['R2','预测型装置孪生','中期','接入快速输运、边界风险、状态估计、代理模型与持续 V&V。'],
  ['R3','聚变堆与电厂孪生','长期','贯通中子、包层、氚、寿命、RAMI、维护、经济与电网。'],
];

export default function Home() {
  return <main className="portalPage">
    <SiteNav active="home" />
    <header className="portalHero" id="top">
      <div className="heroText">
        <p className="kicker"><span>FusionDigital</span> / FUSION DIGITAL TWIN COMMUNITY</p>
        <h1>把聚变装置的每一次预测，<br/>变成<span>可追溯的共同知识。</span></h1>
        <p className="heroLead">面向聚变科学家、工程师、控制与数据团队的数字孪生技术社区。以装置和实验问题为中心，连接物理模型、工程仿真、诊断证据、控制闭环与全生命周期决策。</p>
        <div className="heroActions"><a className="solid" href="#domains">探索知识域</a><a href="/facilities">查看全球装置状态</a></div>
        <div className="heroMetrics"><span><b>02</b>已开放知识域</span><span><b>195+</b>代码与工具条目</span><span><b>12</b>重点装置/项目</span><span><b>2026-08</b>证据截止</span></div>
      </div>
      <div className="twinInterface" role="img" aria-label="FusionDigital 聚变数字孪生主界面示意">
        <div className="interfaceTop"><span>DEVICE / MODEL SYNC</span><b>SHADOW MODE</b></div>
        <div className="orbit orbitA"/><div className="orbit orbitB"/>
        <img src="/fusiondigital-mark.png" alt="FusionDigital 标识" />
        <span className="node nodeA"><i/>PLASMA<br/><b>STATE</b></span>
        <span className="node nodeB"><i/>ENGINEERING<br/><b>MARGIN</b></span>
        <span className="node nodeC"><i/>DIAGNOSTIC<br/><b>EVIDENCE</b></span>
        <span className="node nodeD"><i/>CONTROL<br/><b>DECISION</b></span>
        <div className="interfaceBottom"><span>CONFIG · 0281</span><span>MODEL RUN · VERIFIED</span><span>Δt · 10 ms</span></div>
      </div>
    </header>

    <section className="portalThesis">
      <p className="sectionIndex">00 / COMMUNITY THESIS</p>
      <h2>数字孪生不是一张实时三维图，也不是一个万能求解器。它是一套围绕决策组织的模型、数据、证据与责任体系。</h2>
      <div className="thesisGrid"><p>高保真模型界定危险边界和不确定度；快速模型承担在线估计、场景扫描与控制服务；实验数据持续校准两者的适用域。</p><p>社区内容按“装置—问题—模型—工具—验证—决策”关联，让每个结论都能回到源代码、论文、配置与实验记录。</p></div>
    </section>

    <section className="mainLine" id="mainline">
      <div className="sectionIntro"><p className="sectionIndex">01 / DIGITAL TWIN MAINLINE</p><h2>一炮一链：聚变数字孪生的共同主线</h2><p>规划报告中的七个能力域被收束到同一条可评审工作流。不同模型可以异步运行，但必须共享装置配置、场景、时间轴、坐标和模型血缘。</p></div>
      <div className="lineSteps">{mainLine.map(step=><article key={step[0]}><span>{step[0]}</span><h3>{step[1]}</h3><p>{step[2]}</p></article>)}</div>
    </section>

    <section className="domainSection" id="domains">
      <div className="sectionIntro"><p className="sectionIndex">02 / KNOWLEDGE DOMAINS</p><h2>从物理与工程开始，逐步形成完整社区图谱</h2><p>每个知识域都包含概念科普、专业分块、代码与工具、验证方法、装置实践、原始证据和数字孪生差距。</p></div>
      <div className="domainCards">{domains.map(domain=><a href={domain.href} key={domain.id} className="domainCard"><div className="domainFigure"><img src={domain.figure} alt={`${domain.title}代表图`}/><span>{domain.status}</span></div><div className="domainBody"><p>{domain.id} / {domain.en}</p><h3>{domain.title}</h3><div>{domain.copy}</div><b>{domain.meta}</b><i>进入知识域 ↗</i></div></a>)}</div>
    </section>

    <section className="facilityPreview">
      <div><p className="sectionIndex">03 / GLOBAL FACILITIES</p><h2>装置建设与运行状态，是模型需求最真实的时间轴。</h2><p>跟踪建设中、运行中、升级维护、设计阶段与退役中的代表性聚变装置，并把状态回链到项目官方页面或原始论文。</p><a href="/facilities">打开全球装置观测台 →</a></div>
      <div className="facilityTicker"><span><b>ITER</b>6 / 9 真空室扇区模块已就位</span><span><b>SPARC</b>装置设施约完成 75%，机器装配中</span><span><b>BEST</b>主机全面装配，计划 2027 年完成</span><span><b>JT-60SA</b>ME1 维护增强，准备 OP2</span></div>
    </section>

    <section className="resourceSection" id="resources">
      <div className="sectionIntro"><p className="sectionIndex">04 / TOOLS & EVIDENCE</p><h2>工具不是清单，而是可比较、可验证、可维护的技术资产</h2></div>
      <div className="resourceGrid"><a href="/physics#catalog"><span>P</span><h3>物理代码图谱</h3><p>适用范围、开放性、技术栈、装置证据、验证方式与实时性。</p><b>浏览物理工具 ↗</b></a><a href="/engineering#tools"><span>E</span><h3>工程工具矩阵</h3><p>55 个工具组均提供可点击的官方或原始来源入口。</p><b>浏览工程工具 ↗</b></a><a href="/physics#integrated"><span>I</span><h3>集成模拟专题</h3><p>框架能力、耦合策略、优缺点，以及距离运行级孪生的差距。</p><b>阅读专题 ↗</b></a><a href="/facilities"><span>F</span><h3>装置证据索引</h3><p>建设与运行状态、任务阶段、数字孪生价值及核验日期。</p><b>查看装置 ↗</b></a></div>
    </section>

    <section className="portalRoadmap" id="roadmap">
      <div className="sectionIntro"><p className="sectionIndex">05 / EVOLUTION ROADMAP</p><h2>从 DINA / MEQ 控制服务，走向聚变电厂数字孪生</h2><p>每一级都以可验证的决策能力作为交付门，而不是以“接入更多代码”作为完成标志。</p></div>
      <img src="/figures/roadmap-image2-v2.png" alt="FusionDigital 聚变数字孪生演进路线图" />
      <div className="roadmapCards">{roadmap.map(item=><article key={item[0]}><span>{item[0]}<small>{item[2]}</small></span><h3>{item[1]}</h3><p>{item[3]}</p></article>)}</div>
    </section>

    <section className="communityBand" id="community"><div><p className="sectionIndex">06 / BUILD WITH US</p><h2>让聚变模型、实验与工程经验真正互相理解。</h2></div><div><p>FusionDigital 将逐步开放装置、控制、诊断、数据、AI、VVUQ 与社区协作模块。欢迎研究机构、装置团队、软件开发者和工业伙伴共同完善工具条目、验证证据与装置案例。</p><a href="mailto:tianshao1992@gmail.com">联系新奥聚变人工智能团队 →</a></div></section>
    <SiteFooter />
  </main>;
}
