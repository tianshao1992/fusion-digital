import Link from 'next/link';
import BrandWordmark from './components/BrandWordmark';
import SiteFooter from './components/SiteFooter';
import SiteNav from './components/SiteNav';
import MultiDeviceWorkspace from './digital-prototype/MultiDeviceWorkspace';
import { parseDeviceCatalog } from './digital-prototype/deviceCatalog';
import deviceCatalogJson from '../public/models/device-catalog.json';
import './portal.css';
import './digital-prototype/prototype.css';
import './digital-prototype/turntable.css';

const deviceCatalog = parseDeviceCatalog(deviceCatalogJson);

const plantValues = [
  {id:'01', cn:'成本可控', en:'COST-CONTROLLED', copy:'在设计、建造、调试、运行、维护与退役之间提前识别代价，降低全生命周期成本、实体试错和非计划停机。'},
  {id:'02', cn:'高效运行', en:'EFFICIENT OPERATION', copy:'联动等离子体、热循环、辅机与电网约束，持续优化净电功率、可控工况和资源利用。'},
  {id:'03', cn:'可靠可用', en:'RELIABLE & AVAILABLE', copy:'以状态估计、寿命预测和预测性维护提升任务成功率、设备可靠性与电厂可用率。'},
  {id:'04', cn:'安全可证', en:'EVIDENCE-BASED SAFETY', copy:'以可信模型、实体试验和 V&V 共同形成可追溯的安全证据；数字孪生增强安全论证，但不替代实体验证。'},
];

export default function Home() {
  return <main className="portalPage">
    <SiteNav active="home" />
    <header className="portalHero" id="top">
      <div className="heroText">
        <p className="kicker"><BrandWordmark /> / FUSION DIGITAL TWIN COMMUNITY</p>
        <h1>聚变数字孪生：支撑未来电厂<span className="heroTitleValues">成本可控 · 高效运行 · 可靠可用 · 安全可证</span></h1>
        <p className="heroValueEnglish">FUSION DIGITAL TWIN FOR FUTURE POWER PLANTS<br/><b>LIFECYCLE COST CONTROL · EFFICIENT OPERATION · RELIABLE AVAILABILITY · EVIDENCE-BASED SAFETY</b></p>
        <p className="heroLead">以经过验证的多物理模型、运行与实验数据及智能决策技术，贯通设计、建造、调试、运行、维护与退役全过程，为降低全寿命成本、提升系统效能和电厂可用率、强化安全论证提供持续更新、可追溯且带有不确定度说明的工程依据。</p>
        <div className="heroActions"><a className="solid" href="#prototype-workspace">进入数字样机工作台</a><a href="/knowledge-graph#modules">进入十大知识模块</a><a href="/facilities">查看全球装置状态</a></div>
        <div className="heroMetrics"><span><b>05</b>已开放知识域</span><span><b>195+</b>代码与工具条目</span><span><b>18+</b>重点装置/项目</span><span><b>2026-08</b>证据截止</span></div>
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

    <section className="aiNativePortal" aria-labelledby="ai-native-portal-title">
      <div className="aiNativePortalIntro">
        <p className="sectionIndex">KNOWLEDGE</p>
        <h2 id="ai-native-portal-title">从模块、文档或关系图进入已有研究。</h2>
        <p>十大模块由 Knowledge 统一管理；搜索用于快速定位条目，图谱用于查看装置、论文、代码和任务之间的关系。</p>
      </div>
      <div className="aiNativePortalGrid">
        <a href="/knowledge-graph#modules"><span>01 / MODULES</span><h3>十大知识模块</h3><p>集中访问各模块页面、研究报告、数据索引和建设状态。</p><b>选择模块 →</b></a>
        <a href="/search"><span>02 / SEARCH</span><h3>检索与问答</h3><p>跨模块检索论文、代码、装置和研究工作。</p><b>开始检索 →</b></a>
        <a href="/knowledge-graph#graph"><span>03 / GRAPH</span><h3>知识关系图</h3><p>从装置或任务展开邻域，查看论文、代码和机构关系。</p><b>查看关系 →</b></a>
      </div>
    </section>

    <section className="facilityPreview">
      <div><p className="sectionIndex">03 / GLOBAL FACILITIES</p><h2>装置建设与运行状态，是模型需求最真实的时间轴。</h2><p>跟踪建设中、运行中、升级维护、设计阶段与退役中的代表性聚变装置，并把状态回链到项目官方页面或原始论文。</p><a href="/facilities">打开全球装置观测台 →</a></div>
      <div className="facilityTicker"><span><b>EXL-50U</b>运行中：聚焦 p-¹¹B、非感应启动与 AI 实时控制</span><span><b>EHL-2</b>物理与工程设计推进，目标 2027 年完成建设</span><span><b>ITER</b>6 / 9 真空室扇区模块已就位</span><span><b>SPARC</b>装置设施约完成 75%，机器装配中</span><span><b>BEST</b>主机全面装配，计划 2027 年完成</span></div>
    </section>

    <section className="resourceSection" id="resources">
      <div className="sectionIntro"><p className="sectionIndex">04 / TOOLCHAINS</p><h2>工具不是孤立清单，而是从输入、求解、验证到决策的链条。</h2><p>每条工具链都明确数据接口、尺度转换、验证证据、适用域和输出责任；任何一个环节不可追溯，整条链就不能进入数字孪生。</p></div>
      <div className="resourceGrid"><Link href="/knowledge-graph/modules/physics"><span>P</span><h3>物理预测链</h3><p>平衡 → 输运 → MHD → 边界 → 中子与燃料循环。</p><b>浏览物理模块 ↗</b></Link><Link href="/knowledge-graph/modules/engineering"><span>E</span><h3>工程裕量链</h3><p>载荷 → 电磁 → 结构/热流 → 损伤 → 寿命与维护。</p><b>浏览工程模块 ↗</b></Link><Link href="/knowledge-graph/modules/control"><span>C</span><h3>集成控制链</h3><p>状态 → 位形/剖面/MHD/排热 → 多执行器协调 → PCS。</p><b>浏览控制模块 ↗</b></Link><Link href="/knowledge-graph/modules/diagnostics"><span>D</span><h3>诊断证据链</h3><p>传感器/标定 → 质控 → 反演/合成诊断 → 同化。</p><b>浏览诊断模块 ↗</b></Link><Link href="/knowledge-graph/modules/ai"><span>A</span><h3>智能原生链</h3><p>数据 → 表征 → 代理模型 → 智能体。</p><b>浏览智能模块 ↗</b></Link></div>
    </section>

    <section className="communityBand" id="community"><div><p className="sectionIndex">06 / BUILD WITH US</p><h2>让聚变模型、实验与工程经验真正互相理解。</h2></div><div><p><BrandWordmark className="brandWordmarkInline" /> 将逐步开放装置、控制、诊断、数据、AI、VVUQ 与社区协作模块。欢迎研究机构、装置团队、软件开发者和工业伙伴共同完善工具条目、验证证据与装置案例。</p><a href="mailto:tianshao1992@gmail.com">联系新奥聚变人工智能团队 →</a></div></section>
    <SiteFooter />
  </main>;
}
