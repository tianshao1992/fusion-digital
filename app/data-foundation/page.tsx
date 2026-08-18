import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import KnowledgeBackLink from '../components/KnowledgeBackLink';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from '../i18n/config';
import DataFoundationCatalog from './DataFoundationCatalog';
import { DataArchitectureChart, DataLandscapeChart } from './DataFoundationCharts';
import {
  dataFoundationCutoff,
  dataFoundationRecords,
  dataFoundationRoute,
  fusionDataCharacteristics,
} from './dataFoundation';
import './data-foundation.css';

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const en = (resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE) === 'en';
  return {
    title: en ? 'Fusion Data Foundation: Standards, Archives, Platforms and Evidence' : '聚变数据基座：标准、档案、平台与可信证据',
    description: en
      ? 'An evidence-linked atlas of fusion data standards, facility archives, public platforms, scientific databases, workflow code, provenance and VVUQ.'
      : '聚变数据标准、装置档案、开放平台、专业数据库、工作流代码、血缘和 VVUQ 的可追溯证据图谱。',
  };
}

const distinctions = [
  { zh: '存储表示', en: 'Physical representation', examples: 'HDF5 · Zarr · Parquet · object storage', answerZh: '回答数据怎样编码、分块和持久化。', answerEn: 'Answers how bytes are encoded, chunked and persisted.', boundaryZh: '不提供聚变物理语义、权限或可信度。', boundaryEn: 'Does not provide fusion semantics, authorization or credibility.' },
  { zh: '炮次与运行档案', en: 'Pulse and operational archive', examples: 'MDSplus · EPICS Archiver · W7-X ArchiveDB', answerZh: '回答装置何时采集了什么信号和事件。', answerEn: 'Answers what signals and events a facility acquired and when.', boundaryZh: '站点节点名通常不能直接跨装置比较。', boundaryEn: 'Facility-specific paths are rarely comparable across machines without mapping.' },
  { zh: '领域语义', en: 'Domain semantics', examples: 'IMAS DD / IDS · COCOS · machine mapping', answerZh: '回答数据在物理上是什么意思。', answerEn: 'Answers what the data mean physically.', boundaryZh: '不是实时协议，也不替代原始档案。', boundaryEn: 'It is neither a real-time protocol nor a replacement for source archives.' },
  { zh: '访问抽象', en: 'Access abstraction', examples: 'IMAS Access Layer · UDA · facility adapters', answerZh: '回答不同后端如何以统一方式读取。', answerEn: 'Answers how heterogeneous backends are read through a common interface.', boundaryZh: '统一取数不等于统一语义或开放权限。', boundaryEn: 'Common access does not imply common semantics or open permission.' },
  { zh: '目录、标识与血缘', en: 'Catalogue, identifiers and provenance', examples: 'DCAT 3 · DataCite · W3C PROV · fusionprov', answerZh: '回答数据如何发现、引用、版本化和追溯。', answerEn: 'Answers how data are discovered, cited, versioned and traced.', boundaryZh: '血缘只说明如何产生，不证明结果正确。', boundaryEn: 'Lineage explains how a result was produced; it does not prove correctness.' },
  { zh: '可信度证据', en: 'Credibility evidence', examples: 'ASME VVUQ · JCGM GUM · validation ledger', answerZh: '回答结果在何种用途、验证域和不确定度下可信。', answerEn: 'Answers for which context of use, validation domain and uncertainty a result is credible.', boundaryZh: '一次 benchmark 不能外推为全工况认证。', boundaryEn: 'One benchmark cannot be generalized into qualification over the full operating envelope.' },
] as const;

const exlEhlRoute = [
  { zh: '装置事实源', en: 'Facility sources', stack: 'EXL-50U / EHL-2 DAQ · PCS · diagnostics · engineering sensors', outputZh: '原生炮号、绝对时间、触发、硬件与配置身份', outputEn: 'Native pulse, absolute time, trigger, hardware and configuration identity' },
  { zh: '权威源档案与锁定快照', en: 'Authoritative source archive and locked snapshot', stack: 'MDSplus/EPICS source · WRITE_ONCE/ACL · Object Lock/WORM · SHA-256 manifest', outputZh: '保留源修订；原样导出经保留锁、审计和恢复验证后形成不可变证据快照', outputEn: 'Preserve source revisions; exact exports become immutable evidence snapshots only after retention lock, audit and recovery verification' },
  { zh: '语义标准化', en: 'Semantic harmonisation', stack: 'IMAS DD / IDS · IMAS-Python · COCOS · mapping registry', outputZh: '版本化 PV/signal/file → IDS 映射与装置描述', outputEn: 'Versioned PV/signal/file-to-IDS mappings and Machine Description' },
  { zh: '数据产品', en: 'Data products', stack: 'calibration · EFIT/PTEFIT · synthetic diagnostics · simulation', outputZh: '实验、重构、模拟、合成数据分命名空间并携带 UQ', outputEn: 'Separate namespaces for experiment, reconstruction, simulation and synthetic data with UQ' },
  { zh: '计算与服务', en: 'Compute and serving', stack: 'UDA · TokSearch · HPC scheduler · notebooks · APIs', outputZh: '计算近数据、切片读取、稳定训练/留出集与炮间分析', outputEn: 'Compute-to-data, sliced reads, stable train/hold-out sets and between-shot analysis' },
  { zh: '证据发布', en: 'Evidence release', stack: 'catalogue · PID · PROV · model cards · VVUQ gates', outputZh: '可引用快照、访问策略、责任人与适用域', outputEn: 'Citable snapshots, access policy, accountable owner and applicability domain' },
] as const;

const redLines = [
  { zh: '实时控制与科学数据平面分离', en: 'Separate control and scientific data planes', detailZh: '网页、知识图谱和大模型没有到 PCS、保护或执行器的写通道；控制热路径保留在经验证的原生接口。', detailEn: 'The website, knowledge graph and language model have no write path to PCS, protection or actuators; the control hot path remains on qualified native interfaces.' },
  { zh: '原始、校准、重构、模拟、合成不混写', en: 'Never conflate raw, calibrated, reconstructed, simulated and synthetic data', detailZh: '每层有独立命名空间、版本、质量位和血缘；合成诊断不能被标记为实验观测。', detailEn: 'Each layer has its own namespace, version, quality state and lineage; synthetic diagnostics are never labelled as observations.' },
  { zh: 'FAIR 不等于匿名公开', en: 'FAIR is not the same as anonymously open', detailZh: '公开、科学使用条款、注册、合作、受控和装置内部可并存，目录应如实呈现授权规则。', detailEn: 'Open, scientifically conditioned, registered, consortium, controlled and facility-internal access can coexist; the catalogue must state the governing rule.' },
  { zh: '开放代码不等于开放实验数据', en: 'Open code does not imply open experimental data', detailZh: 'MDSplus、IMAS、UDA 或 API 的公开，不改变装置档案本身的数据权属和访问边界。', detailEn: 'Open MDSplus, IMAS, UDA or API code does not change ownership or access controls on a facility archive.' },
] as const;

export default async function DataFoundationPage() {
  const store = await cookies();
  const en = (resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value) ?? DEFAULT_LOCALE) === 'en';
  const primarySourceCount = new Set(dataFoundationRecords.flatMap((record) => record.sources.map((source) => source.url))).size;
  const publicCount = dataFoundationRecords.filter((record) => record.access === 'open').length;
  const facilityCount = new Set(dataFoundationRecords.flatMap((record) => record.devices)).size;

  return <main className="dataFoundationPage">
    <SiteNav active="data" />
    <KnowledgeBackLink />

    <header className="dataHero">
      <div className="dataHeroCopy">
        <p className="dataEyebrow">08 / {en ? 'FUSION DATA FOUNDATION' : '聚变数据基座'}</p>
        <h1>{en ? <>From stored bytes to<br/><em>credible fusion evidence</em></> : <>从“存下数据”，走向<br/><em>可信聚变证据</em></>}</h1>
        <p>{en
          ? 'A professional map of operational acquisition, pulse archives, diagnostic objects, IMAS semantics, federated access, scientific databases, provenance and VVUQ—connecting experimental and simulated data without collapsing their distinct authority.'
          : '以运行采集、炮次档案、诊断大对象、IMAS 语义、联邦访问、专业数据库、血缘与 VVUQ 为主线，连接实验与模拟数据，同时保持各自不同的权威性。'}</p>
        <div className="dataHeroActions"><a href="#architecture">{en ? 'Inspect the architecture' : '查看总体架构'}</a><a href="#catalog">{en ? 'Browse the evidence catalogue' : '浏览证据目录'}</a><Link href="/platform">{en ? 'View platform deployment' : '查看平台部署'}</Link></div>
      </div>
      <aside className="dataHeroThesis">
        <span>{en ? 'CORE POSITION' : '核心判断'}</span>
        <blockquote>{en ? 'A fusion data foundation is not one database. It is a governed composition of operational time series, pulse archives, large diagnostic objects, physics semantics, federated access, provenance and credibility evidence.' : '聚变数据基座不是一个数据库，而是实时运行时序、炮号档案、诊断大对象、物理语义、联邦访问、数据血缘与可信度证据的分层组合。'}</blockquote>
        <p>{en ? 'Storage, semantics, access, discovery, provenance and assurance answer different questions and must remain separate in the architecture.' : '存储、语义、访问、发现、血缘和可信度回答不同问题，架构上不能混为一层。'}</p>
      </aside>
      <dl className="dataHeroMetrics">
        <div><dt>{dataFoundationRecords.length}</dt><dd>{en ? 'verified records' : '核验条目'}</dd></div>
        <div><dt>{primarySourceCount}</dt><dd>{en ? 'distinct primary links' : '独立一手来源'}</dd></div>
        <div><dt>{publicCount}</dt><dd>{en ? 'open records' : '公开条目'}</dd></div>
        <div><dt>{facilityCount}+</dt><dd>{en ? 'facilities / scopes represented' : '装置/范围覆盖'}</dd></div>
      </dl>
    </header>

    <section className="dataCharacteristics" aria-labelledby="data-characteristics-title">
      <div className="dataSectionHead"><p className="dataEyebrow">01 / {en ? 'WHY FUSION DATA ARE DIFFERENT' : '聚变数据为何不同'}</p><h2 id="data-characteristics-title">{en ? 'Physics meaning is inseparable from time, geometry, configuration and uncertainty' : '物理含义与时间、几何、配置和不确定度不可分离'}</h2><p>{en ? 'These characteristics define the architecture. They are not generic big-data labels.' : '这些特征直接决定技术架构，而不是泛化的“大数据”标签。'}</p></div>
      <div className="dataCharacteristicGrid">{fusionDataCharacteristics.map((item, index) => <article key={item.id}><span>{String(index + 1).padStart(2, '0')}</span><h3>{en ? item.en : item.zh}</h3><p>{en ? item.detailEn : item.detail}</p><b>{en ? 'Architectural implication' : '架构含义'}</b><small>{en ? item.implicationEn : item.implication}</small></article>)}</div>
    </section>

    <section id="architecture" className="dataArchitecture" aria-labelledby="data-architecture-title">
      <div className="dataSectionHead"><p className="dataEyebrow">02 / {en ? 'LAYERED REFERENCE ARCHITECTURE' : '分层参考架构'}</p><h2 id="data-architecture-title">{en ? 'Connect the scientific data thread without routing control through the web' : '贯通科学数据链，但不让控制穿越网页'}</h2><p>{en ? 'The lower chain forms a reproducible scientific evidence path. The upper branch preserves the deterministic control hot path and exposes only governed, read-only shadow services.' : '下方主链形成可重现的科学证据路径；上方分支保留确定性控制热路径，只向平台暴露受治理的只读影子服务。'}</p></div>
      <DataArchitectureChart />
      <div className="dataRouteCards">{dataFoundationRoute.map((step) => <article key={step.id}><span>{step.id}</span><h3>{en ? step.en : step.zh}</h3><b>{step.tools}</b><p>{en ? step.deliverableEn : step.deliverable}</p></article>)}</div>
    </section>

    <section className="dataDistinctions" aria-labelledby="data-distinction-title">
      <div className="dataSectionHead"><p className="dataEyebrow">03 / {en ? 'DO NOT CONFUSE THE LAYERS' : '不要混淆这些层级'}</p><h2 id="data-distinction-title">{en ? 'A database, a semantic model and an evidence standard are not interchangeable' : '数据库、语义模型和证据标准不能相互替代'}</h2></div>
      <div className="dataDistinctionGrid">{distinctions.map((item) => <article key={item.en}><h3>{en ? item.en : item.zh}</h3><b>{item.examples}</b><p>{en ? item.answerEn : item.answerZh}</p><small>{en ? item.boundaryEn : item.boundaryZh}</small></article>)}</div>
    </section>

    <section className="dataImplementation" aria-labelledby="data-implementation-title">
      <div className="dataSectionHead"><p className="dataEyebrow">04 / EXL-50U → EHL-2</p><h2 id="data-implementation-title">{en ? 'A practical implementation route for the experimental minimum closed loop' : '面向实验最小闭环的可实施技术路线'}</h2><p>{en ? 'The route retains each facility’s source-of-record systems, then adds versioned semantics, governed compute and evidence publication. It does not begin with a wholesale database migration.' : '路线保留每台装置的权威事实源，在其上增加版本化语义、受治理计算和证据发布；起点不是“一次性迁库”。'}</p></div>
      <ol className="dataImplementationRoute">{exlEhlRoute.map((step, index) => <li key={step.en}><span>{String(index + 1).padStart(2, '0')}</span><div><h3>{en ? step.en : step.zh}</h3><b>{step.stack}</b><p>{en ? step.outputEn : step.outputZh}</p></div></li>)}</ol>
      <aside className="dataPhaseBoundary"><strong>{en ? 'Phase-I acceptance boundary' : '一期验收边界'}</strong><p>{en ? 'For EXL-50U, accept one scenario family and a governed subset of control-relevant diagnostics and engineering sensors: retained source revisions, a policy-locked raw snapshot, tested mappings, as-shot reconstruction, replayable workflows, residuals and a released evidence snapshot. Full-facility migration and all-diagnostic IMAS conversion remain outside the three-month promise.' : 'EXL-50U 一期只验收一个场景族和受治理的控制相关诊断/工程传感器子集：源修订保留、原始快照经策略锁定、映射可测试、as-shot 重构可回放、工作流可复现、残差可核对、证据快照可发布。全装置迁移和全诊断 IMAS 化不属于三个月承诺。'}</p></aside>
    </section>

    <section className="dataLandscape" aria-labelledby="data-landscape-title">
      <div className="dataSectionHead"><p className="dataEyebrow">05 / {en ? 'EVIDENCE LANDSCAPE' : '证据版图'}</p><h2 id="data-landscape-title">{en ? 'Platforms differ in lifecycle reach and semantic interoperability' : '平台在生命周期覆盖与语义互操作上各有侧重'}</h2><p>{en ? 'Point positions and sizes are editorial planning assessments from public evidence, not official rankings or measured performance benchmarks.' : '点位与大小是基于公开证据的编辑性规划判断，不是官方评级或实测性能排名。'}</p></div>
      <DataLandscapeChart />
    </section>

    <DataFoundationCatalog />

    <section className="dataGovernance" aria-labelledby="data-governance-title">
      <div className="dataSectionHead"><p className="dataEyebrow">06 / {en ? 'AUTHORITY AND GOVERNANCE' : '权限与治理红线'}</p><h2 id="data-governance-title">{en ? 'Data integration must not erase scientific or operational authority' : '数据集成不能抹平科学与运行权威边界'}</h2></div>
      <div className="dataGovernanceGrid">{redLines.map((item, index) => <article key={item.en}><span>R{index + 1}</span><h3>{en ? item.en : item.zh}</h3><p>{en ? item.detailEn : item.detailZh}</p></article>)}</div>
      <div className="dataEvidenceNote"><strong>{en ? `Evidence cut-off: ${dataFoundationCutoff}` : `证据核验截止：${dataFoundationCutoff}`}</strong><p>{en ? 'This atlas covers discoverable primary documentation, official repositories and published reports. It cannot enumerate undisclosed internal systems or confer access rights. Availability, licences and facility policies must be rechecked before implementation.' : '本图谱覆盖可发现的一手文档、官方仓库与已发表报告，无法穷举未公开的内部系统，也不授予数据访问权。实施前必须再次核验可用性、许可证和装置政策。'}</p></div>
    </section>
    <SiteFooter />
  </main>;
}
