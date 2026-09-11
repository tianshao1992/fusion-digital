import FusionTwinSystemMap from './components/FusionTwinSystemMap';
import PhaseOneRoadmap from './components/PhaseOneRoadmap';
import SiteFooter from './components/SiteFooter';
import SiteNav from './components/SiteNav';
import StaticLocaleContent from './components/StaticLocaleContent';
import MultiDeviceWorkspace from './digital-prototype/MultiDeviceWorkspace';
import { parseDeviceCatalog } from './digital-prototype/deviceCatalog';
import deviceCatalogJson from '../public/models/device-catalog.json';
import { knowledgeModules } from './data/knowledge-modules';
import { isPublicAnonymousMode } from './deployment-mode';
import './portal.css';
import './digital-prototype/prototype.css';
import './digital-prototype/workspace-layout.css';
import './digital-prototype/turntable.css';

const deviceCatalog = parseDeviceCatalog(deviceCatalogJson);
const domainNotes = [
  ['平衡、输运与多物理模型', 'Equilibrium, transport and multiphysics models', 'physics'],
  ['载荷、结构与热流分析', 'Loads, structures and thermal analysis', 'engineering'],
  ['控制任务、PCS 与闭环验证', 'Control tasks, PCS and closed-loop validation', 'integrated-control'],
  ['传感器、反演与合成诊断', 'Sensors, inversion and synthetic diagnostics', 'intelligent-diagnostics'],
  ['热取出、发电循环与电网', 'Heat extraction, power cycles and the grid', 'energy-conversion'],
  ['真空、低温、燃料与电源', 'Vacuum, cryogenics, fuel and power', 'auxiliary-systems'],
  ['运行界面与人在回路', 'Operator interfaces and human oversight', 'human-machine-interaction'],
  ['IMAS、数据接口与溯源', 'IMAS, data interfaces and provenance', 'data-foundation'],
  ['系统架构、接口与协同仿真', 'Architecture, interfaces and co-simulation', 'whole-plant-integration'],
  ['代理模型、基础模型与智能体', 'Surrogates, foundation models and agents', 'ai-native'],
] as const;

function HomeContent({ en }: { en: boolean }) {
  const publicAnonymousMode = isPublicAnonymousMode();
  return <main className="portalPage editorialHome">
    <SiteNav active="home" />
    <header className="portalHero" id="top">
      <div className="heroText">
        <p className="kicker">FUSION / DIGITAL / RESEARCH</p>
        <h1>{en ? <>See the device.<br /><span>Understand the data.</span></> : <>看见装置。<br /><span>理解数据。</span></>}</h1>
        <p className="heroLead">{en ? 'Explore fusion devices, experimental data and simulation tools in one workspace.' : '连接聚变装置、实验数据与仿真工具。'}</p>
        <div className="heroActions">
          <a className="solid" href="#prototype-workspace">{en ? 'Explore the prototype' : '探索数字样机'} <span aria-hidden="true">↗</span></a>
          <a href="/fusion-data">{en ? 'Browse experimental data' : '查看实验数据'} <span aria-hidden="true">→</span></a>
        </div>
      </div>
      <figure className="heroPhotography">
        <img src="/photos/alcator-cmod-interior.jpg" alt={en ? 'Interior of MIT’s Alcator C-Mod tokamak, with its central column and plasma-facing components' : 'MIT Alcator C-Mod 托卡马克内部的中心柱与面向等离子体部件'} width="1800" height="1331" fetchPriority="high" />
        <figcaption><span>ALCATOR C-MOD · MIT</span><a href="/photos/credits.json" target="_blank" rel="noreferrer">Mike Garrett · CC BY 3.0 ↗</a></figcaption>
      </figure>
      <nav className="heroShortcuts" aria-label={en ? 'Research workspaces' : '研究工作台'}>
        <a href="/facilities"><span>01</span>{en ? 'Global facilities' : '全球装置'}<i>↗</i></a>
        <a href="/simulations"><span>02</span>{en ? 'Simulation engines' : '仿真引擎'}<i>↗</i></a>
        <a href="/search"><span>03</span>{en ? 'Papers & code' : '论文与代码'}<i>↗</i></a>
        <a href="#domains"><span>04</span>{en ? 'Knowledge domains' : '知识领域'}<i>↓</i></a>
      </nav>
    </header>

    <div className="prototypePage prototypePage--embedded"><MultiDeviceWorkspace catalog={deviceCatalog} /></div>

    <section className="domainSection" id="domains">
      <div className="sectionIntro"><p className="sectionIndex">01 / KNOWLEDGE</p><h2>{en ? 'Find your field.' : '从你的研究领域出发。'}</h2><p>{en ? 'Models, tools and source material, organised by discipline.' : '按专业查找模型、工具和原始资料。'}</p></div>
      <div className="domainCards">{knowledgeModules.map((domain, index) => <article className="domainCard" id={`domain-${domain.id}`} key={domain.id}>
        <span className="domainNumber">{domain.no}</span>
        <div className="domainBody"><h3><a href={domain.href}>{en ? domain.en : domain.zh} <span aria-hidden="true">↗</span></a></h3><p>{domainNotes[index][en ? 1 : 0]}</p></div>
        <div className="domainMeta">{domain.href.startsWith('/#') && <span>{en ? 'Planned' : '规划中'}</span>}<a href={`/figures/domain-${domainNotes[index][2]}-dark-image2.png`} target="_blank" rel="noreferrer" aria-label={`${en ? domain.en : domain.zh} · ${en ? 'systems diagram' : '结构图解'}`}>{en ? 'Diagram' : '图解'} ↗</a></div>
      </article>)}</div>
    </section>

    <section className="facilityPreview">
      <figure><img src="/photos/w7x-interior.jpg" alt={en ? 'A view inside the Wendelstein 7-X stellarator during assembly' : 'Wendelstein 7-X 仿星器装配期间的内部实景'} width="1800" height="1201" loading="lazy" decoding="async" /><figcaption>WENDELSTEIN 7-X · <a href="/photos/credits.json" target="_blank" rel="noreferrer">Gwurden · CC BY-SA 3.0 ↗</a></figcaption></figure>
      <div><p className="sectionIndex">02 / EXPLORE</p><h2>{en ? 'Real machines. Connected research.' : <>真实装置。<br />相互连接的研究。</>}</h2><p>{en ? 'Compare facilities, follow a research question, and open the original paper or code.' : '查看装置，追踪研究问题，直达论文与代码。'}</p><div className="editorialLinks"><a href="/facilities">{en ? 'Global facilities' : '全球装置'} ↗</a><a href="/knowledge-graph">{en ? 'Knowledge graph' : '知识图谱'} ↗</a><a href="/search">{en ? 'Evidence search & dialogue' : '证据检索与问答'} ↗</a></div></div>
    </section>

    <section className="resourceSection" id="resources">
      <div className="sectionIntro"><p className="sectionIndex">03 / TOOLS & METHODS</p><h2>{en ? 'Go deeper, when you need to.' : '需要时，再深入一步。'}</h2></div>
      <div className="resourceLinks"><a href="/physics#catalog">{en ? 'Physics tools' : '物理工具'} ↗</a><a href="/engineering#tools">{en ? 'Engineering tools' : '工程工具'} ↗</a><a href="/control">{en ? 'Control' : '集成控制'} ↗</a><a href="/diagnostics">{en ? 'Diagnostics' : '诊断感知'} ↗</a><a href="/data-foundation">{en ? 'Data foundation' : '数据基座'} ↗</a><a href="/ai">{en ? 'AI-native' : '智能原生'} ↗</a></div>
      <details className="editorialDisclosure"><summary>{en ? 'Digital-twin architecture' : '数字孪生架构'}<span aria-hidden="true">＋</span></summary><div className="editorialDisclosureBody"><p>{en ? 'Measurements and models inform decisions; digital twins do not replace physical validation or safety systems.' : '测量与模型为决策提供依据；数字孪生不替代实体验证或安全系统。'}</p><a href="/figures/fusion-twin-ai-native-overview.png" target="_blank" rel="noreferrer">{en ? 'Open the architecture diagram' : '查看总体架构原图'} ↗</a><FusionTwinSystemMap /></div></details>
      <details className="editorialDisclosure"><summary>{en ? 'Development roadmap' : '开发路线图'}<span aria-hidden="true">＋</span></summary><div className="editorialDisclosureBody"><PhaseOneRoadmap /><a href="/roadmap">{en ? 'Open the full roadmap' : '查看完整路线图'} ↗</a></div></details>
      {!publicAnonymousMode && <div className="resourceLinks"><a href="/research-review">{en ? 'Review research candidates' : '研究候选审核'} ↗</a><a href="/account">{en ? 'Account & usage' : '账户与用量'} ↗</a></div>}
    </section>
    <section className="communityBand" id="community"><h2>{en ? 'Build with us.' : '一起完善。'}</h2><a href="mailto:tianshao1992@gmail.com">{en ? 'Contact the ENN Fusion AI Team' : '联系新奥聚变人工智能团队'} ↗</a></section>
    <SiteFooter />
  </main>;
}

export default function Home() {
  return <StaticLocaleContent zh={<HomeContent en={false} />} en={<HomeContent en />} />;
}
