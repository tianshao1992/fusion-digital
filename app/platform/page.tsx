import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import StaticLocaleContent from '../components/StaticLocaleContent';
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, resolveLocale } from '../i18n/config';
import './platform.css';
import VisualizationRoutePlanner from './VisualizationRoutePlanner';

export async function generateMetadata():Promise<Metadata>{const store=await cookies();const en=(resolveLocale(store.get(LOCALE_COOKIE_NAME)?.value)??DEFAULT_LOCALE)==='en';return{title:en?'Platform Architecture and Technical Roadmap':'平台架构与技术路线',description:en?'FusionDigital system boundaries, unified data and simulation contracts, technology choices and staged delivery roadmap.':'FusionDigital 当前系统边界、统一数据与仿真合同、技术栈选型及分阶段建设路线。'};}

const currentCapabilities = [
  ['公开体验', 'vinext / React / Worker', '知识浏览、检索问答、图谱、数字样机与 EFIT 回放'],
  ['轻量控制面', 'D1 / SIWC', '账户、角色、配额、审计、研究候选与人工审核'],
  ['科学资产', 'GLB / JSON / Binary chunks', '10 炮 EFIT、装置清单、三维派生包与研究快照'],
  ['当前缺口', 'No runtime connectors', '尚未运行接入 MDSplus、NAS、PLM、CAE、仿真容器或 PCS'],
] as const;

const contracts = [
  ['DeviceRevision', '装置、部件、坐标、单位、几何版本与访问级别'],
  ['Shot / Signal', '炮号、MDSplus 路径、时间基、标定、质量位与数据产品'],
  ['ArtifactManifest', '对象 URI、SHA‑256、格式、来源、权限和保留策略'],
  ['SimulationRun', '模型版本、OCI digest、输入、参数、资源、状态与重放信息'],
  ['ResultManifest', '网格、变量、单位、时间步、部件映射、误差与 VVUQ 状态'],
  ['Entity / Claim / Evidence', '知识实体、可审核主张、原始证据与发布关系'],
  ['AgentRun', '模型、工具权限、输入输出哈希、审批和执行回执'],
  ['Release', '脱敏范围、签名快照、目标环境、回滚和替代关系'],
] as const;

const storageRoles = [
  ['MDSplus', '实验炮数据与信号的权威来源', '由只读网关接入，不由浏览器直连'],
  ['NAS', '原始文件落地区、归档与备份来源', '不是 Web API，也不是跨系统主目录'],
  ['S3 对象存储', '大型不可变资产、派生数据、模型和结果', 'MinIO / Ceph；公开副本可投影到 R2'],
  ['PostgreSQL', '目录、权限、血缘、任务、知识与审核', '私有平台主元数据；FTS + pgvector 起步'],
  ['D1', '公开站账户、配额、审计与发布投影', '不保存科学大数组、CAD、CAE 或长任务状态'],
  ['PLM / PDM', 'CAD、材料、配置基线与工程审批', 'STEP / Parasolid 等权威源不进入公开站'],
] as const;

const stack = [
  ['公开体验层', 'React 19 · vinext · Cloudflare Worker · D1', '保留现有栈，负责公开内容与短请求'],
  ['领域 API', 'Python FastAPI · Pydantic · OpenAPI 3.1', '模块化单体起步，稳定后按负载拆分'],
  ['服务与大数组', 'gRPC / Protobuf · Arrow Flight', '内部强类型调用；大型列式数据流'],
  ['主数据', 'PostgreSQL · JSONB · FTS · pgvector', '统一目录、知识、血缘、权限和任务元数据'],
  ['科学文件', 'MDSplus · Zarr / HDF5 · Parquet · Arrow', '原始、Canonical、Curated、Serving 四层'],
  ['三维与场结果', 'Three.js · Blender/OpenUSD · ParaView/trame', '开放格式统一上下文；超大场结果服务端渲染；Omniverse 仅作可选适配'],
  ['计算与编排', 'Docker · Kubernetes Jobs · Argo · Slurm Adapter', '容器化模型与既有 HPC 并存'],
  ['事件', 'NATS JetStream · CloudEvents', '事件只传引用与哈希，不传大型数组'],
  ['模型与智能体', 'Responses API · AI Gateway · MLflow · ONNX/FMU', '受控工具调用、模型卡、适用域与回退'],
  ['可观测与安全', 'OpenTelemetry · Prometheus/Grafana · OIDC · Vault/KMS', '全链路追踪、短期凭据与最小权限'],
] as const;

const roadmap = [
  ['P0', '4–6 周', '清债与合同冻结', '统一 ID、单位、坐标、时间和 RunManifest；以 18303 炮、一个 CAD 装配和一个仿真任务做黄金链路。'],
  ['P1', '8–12 周', '数据基座', 'PostgreSQL、对象存储、MDSplus/NAS/CAD/文档适配器、目录、血缘、权限和恢复演练。'],
  ['P2', '10–14 周', '仿真与三维', 'MEQ/FGE、DINA、EFIT 统一 SimulationRun；Kubernetes/Slurm 调度；ResultManifest 与 vtk.js 场结果。'],
  ['P3', '10–14 周', '诊断与影子状态', 'shot 事件、时间同步、质量位、状态估计、历史回放和缺失/乱序/延迟注入。'],
  ['P4', '12–18 周', 'SIL / HIL / 影子控制', '联合仿真、签名参数包、故障回退、时延验证和双人审批；实时保护域保持独立。'],
  ['P5', '8–12 周', '智能体平台化', 'AI Gateway、Tool Broker、RAG、离线任务建议、候选发布和权限/注入红队测试。'],
] as const;

const currentCapabilitiesEn = [
  ['Public experience','vinext / React / Worker','Knowledge browsing, search and evidence Q&A, graph exploration, digital prototypes and EFIT replay'],
  ['Lightweight control plane','D1 / SIWC','Accounts, roles, quotas, audit, research candidates and human review'],
  ['Scientific assets','GLB / JSON / Binary chunks','Ten EFIT shots, facility catalogues, browser 3D derivatives and research snapshots'],
  ['Current gap','No runtime connectors','No live MDSplus, NAS, PLM, CAE, simulation-container or PCS integration yet'],
] as const;
const contractsEn = [
  ['DeviceRevision','Facility, component, coordinate system, units, geometry revision and access class'],['Shot / Signal','Shot number, MDSplus path, timebase, calibration, quality flags and data product'],['ArtifactManifest','Object URI, SHA-256, format, provenance, permissions and retention policy'],['SimulationRun','Model version, OCI digest, inputs, parameters, resources, status and replay metadata'],['ResultManifest','Mesh, variables, units, time steps, component mapping, error and VVUQ status'],['Entity / Claim / Evidence','Knowledge entity, reviewable claim, primary evidence and publication relationship'],['AgentRun','Model, tool permissions, input/output hashes, approvals and execution receipts'],['Release','Sanitization scope, signed snapshot, target environment, rollback and supersession relationships'],
] as const;
const storageRolesEn = [
  ['MDSplus','Authoritative source for experimental shots and signals','Connected through a read-only gateway; never directly from the browser'],['NAS','Landing, archive and backup source for raw files','Neither a Web API nor a cross-system master catalogue'],['S3 object storage','Large immutable assets, derived data, models and results','MinIO / Ceph internally; public copies may be projected to R2'],['PostgreSQL','Catalogue, authorization, lineage, jobs, knowledge and review','Private-platform metadata authority; begin with FTS + pgvector'],['D1','Public-site accounts, quotas, audit and publication projection','No scientific arrays, CAD, CAE or long-running job state'],['PLM / PDM','CAD, materials, configuration baselines and engineering approvals','Authoritative STEP / Parasolid sources never enter the public site'],
] as const;
const stackEn = [
  ['Public experience','React 19 · vinext · Cloudflare Worker · D1','Retain the current stack for public content and short requests'],['Domain API','Python FastAPI · Pydantic · OpenAPI 3.1','Start as a modular monolith; split only when load requires it'],['Services and large arrays','gRPC / Protobuf · Arrow Flight','Strongly typed internal calls and large columnar data streams'],['Master data','PostgreSQL · JSONB · FTS · pgvector','Unified catalogue, knowledge, lineage, authorization and job metadata'],['Scientific files','MDSplus · Zarr / HDF5 · Parquet · Arrow','Raw, Canonical, Curated and Serving layers'],['3D and field results','Three.js · Blender/OpenUSD · ParaView/trame','Open contracts share context; oversized fields render server-side; Omniverse stays optional'],['Compute orchestration','Docker · Kubernetes Jobs · Argo · Slurm Adapter','Containerized models coexist with established HPC'],['Events','NATS JetStream · CloudEvents','Events carry references and hashes, never large arrays'],['Models and agents','Responses API · AI Gateway · MLflow · ONNX/FMU','Governed tool use, model cards, applicability domains and fallback'],['Observability and security','OpenTelemetry · Prometheus/Grafana · OIDC · Vault/KMS','End-to-end tracing, short-lived credentials and least privilege'],
] as const;
const roadmapEn = [
  ['P0','4–6 weeks','Debt reduction and contract freeze','Unify IDs, units, coordinates, time and RunManifest; establish a golden path with shot 18303, one CAD assembly and one simulation job.'],['P1','8–12 weeks','Data foundation','PostgreSQL, object storage, MDSplus/NAS/CAD/document adapters, catalogue, lineage, authorization and recovery exercises.'],['P2','10–14 weeks','Simulation and 3D','Unify MEQ/FGE, DINA and EFIT under SimulationRun; Kubernetes/Slurm scheduling; ResultManifest and vtk.js field results.'],['P3','10–14 weeks','Diagnostics and shadow state','Shot events, time synchronization, quality flags, state estimation, historical replay and missing/out-of-order/delay injection.'],['P4','12–18 weeks','SIL / HIL / shadow control','Co-simulation, signed parameter packages, fault fallback, latency validation and dual approval; keep real-time protection independent.'],['P5','8–12 weeks','Agent platform','AI Gateway, Tool Broker, RAG, offline job recommendations, candidate publication and authorization/prompt-injection red-team tests.'],
] as const;

function PlatformContent({en}:{en:boolean}) {
  const capabilityRows=en?currentCapabilitiesEn:currentCapabilities;
  const contractRows=en?contractsEn:contracts;
  const storageRows=en?storageRolesEn:storageRoles;
  const stackRows=en?stackEn:stack;
  const roadmapRows=en?roadmapEn:roadmap;
  return <main className="platformPage">
    <SiteNav active="platform" />

    <header className="platformHero">
      <p>PLATFORM ARCHITECTURE / 2026</p>
      <h1>{en?'From a public prototype to a reproducible scientific and engineering platform':'从公开原型，走向可复现的科学与工程平台'}</h1>
      <div>{en?'Retain the current site as the public experience and publication-projection layer. Experimental data, engineering assets, scientific computing and control capabilities belong in separate intranet and real-time domains connected through versioned contracts.':'现有网站保留为公开体验和发布投影层；实验数据、工程资产、科学计算与控制能力进入独立的内网平台和实时域，通过版本化合同连接。'}</div>
      <nav aria-label={en?'Platform architecture contents':'平台架构页目录'}><a href="#current">{en?'Current baseline':'当前状态'}</a><a href="#architecture">{en?'Target architecture':'目标架构'}</a><a href="#contracts">{en?'Unified contracts':'统一合同'}</a><a href="#stack">{en?'Technology stack':'技术栈'}</a><a href="#visualization">{en?'Visualization fabric':'可视化平台'}</a><a href="#roadmap">{en?'Delivery roadmap':'建设路线'}</a></nav>
      <a className="platformDownload" href="/FusionDigital-technical-roadmap-2026-08-15.docx">{en?'Download the full technical roadmap (Chinese)':'下载完整技术路线报告'}</a>
    </header>

    <section className="platformCurrent" id="current" aria-labelledby="platform-current-title">
      <div className="platformSectionHead"><p>01 / CURRENT BASELINE</p><h2 id="platform-current-title">{en?'Begin with what is already implemented':'先确认已经实现什么'}</h2><span>{en?'The current system is more than a static site, but it is not yet an experiment-and-simulation backend.':'当前系统不是纯静态站，但也还不是实验与仿真后端。'}</span></div>
      <div className="platformCurrentGrid">{capabilityRows.map(([title, tech, copy]) => <article key={title}><span>{tech}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="platformArchitecture" id="architecture" aria-labelledby="platform-architecture-title">
      <div className="platformSectionHead"><p>02 / THREE PLANES</p><h2 id="platform-architecture-title">{en?'Isolate three planes; connect them with governed data products':'三平面隔离，数据产品连接'}</h2><span>{en?'Public experience, scientific computing and real-time control have different latency, authorization and reliability requirements.':'公网体验、科学计算和实时控制具有不同的时延、权限与可靠性要求。'}</span></div>
      <div className="platformPlanes" role="img" aria-label={en?'Three-plane architecture: public projection, intranet scientific platform and experimental real-time plane':'公开投影面、内网科学平台面和实验实时面三层架构'}>
        <article className="public"><span>PUBLIC PROJECTION</span><h3>{en?'Public projection plane':'公开投影面'}</h3><p>Sites / Worker / D1 / R2</p><b>{en?'Knowledge, public 3D, public EFIT and citation-grounded Q&A':'知识、公开三维、公开 EFIT、带引用问答'}</b></article>
        <i aria-hidden="true">{en?'Signed snapshot ↓':'签名快照 ↓'}</i>
        <article className="science"><span>SCIENTIFIC PLATFORM</span><h3>{en?'Intranet scientific-platform plane':'内网科学平台面'}</h3><p>API / PostgreSQL / S3 / MDSplus Gateway / Jobs</p><b>{en?'Catalogue, knowledge, CAD/CAE, simulation, diagnostics and governed agent tools':'目录、知识、CAD/CAE、仿真、诊断和智能体工具'}</b></article>
        <i aria-hidden="true">{en?'Read-only synchronization ↓ · approved parameter package ↑':'只读同步 ↓ · 已审批参数包 ↑'}</i>
        <article className="realtime"><span>EXPERIMENT REAL-TIME</span><h3>{en?'Experimental real-time plane':'实验实时面'}</h3><p>DAQ / PCS / Interlock / RT Linux</p><b>{en?'Deterministic control, interlocks and protection; no direct browser or LLM connection':'确定性控制、联锁与保护；浏览器和 LLM 不直连'}</b></article>
      </div>
    </section>

    <section className="platformContracts" id="contracts" aria-labelledby="platform-contracts-title">
      <div className="platformSectionHead"><p>03 / CONTRACT FIRST</p><h2 id="platform-contracts-title">{en?'Share contracts across modules—not one giant table':'模块共用合同，不共用一套大表'}</h2><span>{en?'Every new module must deliver a schema, adapter, contract tests and search/graph projection.':'每个新模块必须交付 Schema、Adapter、Contract tests 和 Search/graph projection。'}</span></div>
      <div className="platformContractGrid">{contractRows.map(([title, copy], index) => <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      <div className="platformStorageTable" role="table" aria-label={en?'Authoritative roles of data systems':'数据系统权威角色'}>
        <div role="row" className="head"><b role="columnheader">{en?'System':'系统'}</b><b role="columnheader">{en?'Authoritative role':'权威角色'}</b><b role="columnheader">{en?'Integration rule':'接入规则'}</b></div>
        {storageRows.map(([system, role, rule]) => <div role="row" key={system}><strong role="cell">{system}</strong><span role="cell">{role}</span><span role="cell">{rule}</span></div>)}
      </div>
    </section>

    <section className="platformStack" id="stack" aria-labelledby="platform-stack-title">
      <div className="platformSectionHead"><p>04 / TECHNOLOGY CHOICES</p><h2 id="platform-stack-title">{en?'Choose technology by workload and trust boundary':'以负载和边界选择技术'}</h2><span>{en?'Do not introduce multiple message buses, graph databases, workflow engines or retrieval systems at once.':'不同时引入多套消息、图数据库、工作流或检索系统。'}</span></div>
      <div className="platformStackTable" role="table" aria-label={en?'Recommended technology stack':'推荐技术栈'}>
        <div role="row" className="head"><b role="columnheader">{en?'Layer':'层'}</b><b role="columnheader">{en?'Recommended choice':'推荐选型'}</b><b role="columnheader">{en?'Decision':'决策'}</b></div>
        {stackRows.map(([layer, choice, decision]) => <div role="row" key={layer}><strong role="cell">{layer}</strong><span role="cell">{choice}</span><span role="cell">{decision}</span></div>)}
      </div>
    </section>

    <VisualizationRoutePlanner en={en} />

    <section className="platformRoadmap" id="roadmap" aria-labelledby="platform-roadmap-title">
      <div className="platformSectionHead"><p>06 / DELIVERY ROADMAP</p><h2 id="platform-roadmap-title">{en?'Data and contracts first; simulation, diagnostics and control next':'先数据与合同，再仿真、诊断和控制'}</h2><span>{en?'Durations assume an 8–10 person core team. Safety-critical closed-loop work requires an independent facility safety process.':'工期按 8–10 人核心团队估算；安全关键闭环需要独立装置安全流程。'}</span></div>
      <ol>{roadmapRows.map(([id, period, title, copy]) => <li key={id}><span>{id}</span><time>{period}</time><h3>{title}</h3><p>{copy}</p></li>)}</ol>
      <aside className="platformFirst90"><p>{en?'Next 90 days':'未来 90 天'}</p><div><b>{en?'Freeze core contracts':'冻结核心合同'}</b><b>{en?'Establish shot 18303 as a golden shot':'建立 18303 黄金炮'}</b><b>{en?'MDSplus read-only gateway':'MDSplus 只读网关'}</b><b>MEQ / DINA Run API</b><b>{en?'CAD–EFIT coordinate registration':'CAD–EFIT 坐标注册'}</b><b>{en?'Publication and VVUQ gates':'发布与 VVUQ 门禁'}</b></div></aside>
    </section>

    <section className="platformReferences" aria-labelledby="platform-reference-title">
      <div><p>REFERENCE</p><h2 id="platform-reference-title">{en?'Standards and official documentation':'规范与官方文档'}</h2></div>
      <p><a href="https://www.mdsplus.org/index.php/Documentation" target="_blank" rel="noreferrer">MDSplus</a><a href="https://zarr-specs.readthedocs.io/en/latest/v3/core/" target="_blank" rel="noreferrer">Zarr v3</a><a href="https://arrow.apache.org/docs/format/Flight.html" target="_blank" rel="noreferrer">Arrow Flight</a><a href="https://grpc.io/docs/what-is-grpc/introduction/" target="_blank" rel="noreferrer">gRPC</a><a href="https://kubernetes.io/docs/concepts/workloads/controllers/job/" target="_blank" rel="noreferrer">Kubernetes Jobs</a><a href="https://docs.nats.io/nats-concepts/jetstream" target="_blank" rel="noreferrer">NATS JetStream</a><a href="https://opentelemetry.io/docs/" target="_blank" rel="noreferrer">OpenTelemetry</a></p>
    </section>

    <SiteFooter />
  </main>;
}

export default function PlatformPage(){return <StaticLocaleContent zh={<PlatformContent en={false}/>} en={<PlatformContent en/>}/>;}
