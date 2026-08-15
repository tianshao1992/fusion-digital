import type { Metadata } from 'next';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import './platform.css';

export const metadata: Metadata = {
  title: '平台架构与技术路线',
  description: 'FusionDigital 当前系统边界、统一数据与仿真合同、技术栈选型及分阶段建设路线。',
};

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
  ['三维与场结果', 'Three.js · glTF/meshopt · vtk.js · XDMF/HDF5', '几何与科学场分工；超大场结果服务端渲染'],
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

export default function PlatformPage() {
  return <main className="platformPage">
    <SiteNav active="platform" />

    <header className="platformHero">
      <p>PLATFORM ARCHITECTURE / 2026</p>
      <h1>从公开原型，走向可复现的科学与工程平台</h1>
      <div>现有网站保留为公开体验和发布投影层；实验数据、工程资产、科学计算与控制能力进入独立的内网平台和实时域，通过版本化合同连接。</div>
      <nav aria-label="平台架构页目录"><a href="#current">当前状态</a><a href="#architecture">目标架构</a><a href="#contracts">统一合同</a><a href="#stack">技术栈</a><a href="#roadmap">建设路线</a></nav>
      <a className="platformDownload" href="/FusionDigital-technical-roadmap-2026-08-15.docx">下载完整技术路线报告</a>
    </header>

    <section className="platformCurrent" id="current" aria-labelledby="platform-current-title">
      <div className="platformSectionHead"><p>01 / CURRENT BASELINE</p><h2 id="platform-current-title">先确认已经实现什么</h2><span>当前系统不是纯静态站，但也还不是实验与仿真后端。</span></div>
      <div className="platformCurrentGrid">{currentCapabilities.map(([title, tech, copy]) => <article key={title}><span>{tech}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
    </section>

    <section className="platformArchitecture" id="architecture" aria-labelledby="platform-architecture-title">
      <div className="platformSectionHead"><p>02 / THREE PLANES</p><h2 id="platform-architecture-title">三平面隔离，数据产品连接</h2><span>公网体验、科学计算和实时控制具有不同的时延、权限与可靠性要求。</span></div>
      <div className="platformPlanes" role="img" aria-label="公开投影面、内网科学平台面和实验实时面三层架构">
        <article className="public"><span>PUBLIC PROJECTION</span><h3>公开投影面</h3><p>Sites / Worker / D1 / R2</p><b>知识、公开三维、公开 EFIT、带引用问答</b></article>
        <i aria-hidden="true">签名快照 ↓</i>
        <article className="science"><span>SCIENTIFIC PLATFORM</span><h3>内网科学平台面</h3><p>API / PostgreSQL / S3 / MDSplus Gateway / Jobs</p><b>目录、知识、CAD/CAE、仿真、诊断和智能体工具</b></article>
        <i aria-hidden="true">只读同步 ↓ · 已审批参数包 ↑</i>
        <article className="realtime"><span>EXPERIMENT REAL-TIME</span><h3>实验实时面</h3><p>DAQ / PCS / Interlock / RT Linux</p><b>确定性控制、联锁与保护；浏览器和 LLM 不直连</b></article>
      </div>
    </section>

    <section className="platformContracts" id="contracts" aria-labelledby="platform-contracts-title">
      <div className="platformSectionHead"><p>03 / CONTRACT FIRST</p><h2 id="platform-contracts-title">模块共用合同，不共用一套大表</h2><span>每个新模块必须交付 Schema、Adapter、Contract tests 和 Search/graph projection。</span></div>
      <div className="platformContractGrid">{contracts.map(([title, copy], index) => <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      <div className="platformStorageTable" role="table" aria-label="数据系统权威角色">
        <div role="row" className="head"><b role="columnheader">系统</b><b role="columnheader">权威角色</b><b role="columnheader">接入规则</b></div>
        {storageRoles.map(([system, role, rule]) => <div role="row" key={system}><strong role="cell">{system}</strong><span role="cell">{role}</span><span role="cell">{rule}</span></div>)}
      </div>
    </section>

    <section className="platformStack" id="stack" aria-labelledby="platform-stack-title">
      <div className="platformSectionHead"><p>04 / TECHNOLOGY CHOICES</p><h2 id="platform-stack-title">以负载和边界选择技术</h2><span>不同时引入多套消息、图数据库、工作流或检索系统。</span></div>
      <div className="platformStackTable" role="table" aria-label="推荐技术栈">
        <div role="row" className="head"><b role="columnheader">层</b><b role="columnheader">推荐选型</b><b role="columnheader">决策</b></div>
        {stack.map(([layer, choice, decision]) => <div role="row" key={layer}><strong role="cell">{layer}</strong><span role="cell">{choice}</span><span role="cell">{decision}</span></div>)}
      </div>
    </section>

    <section className="platformRoadmap" id="roadmap" aria-labelledby="platform-roadmap-title">
      <div className="platformSectionHead"><p>05 / DELIVERY ROADMAP</p><h2 id="platform-roadmap-title">先数据与合同，再仿真、诊断和控制</h2><span>工期按 8–10 人核心团队估算；安全关键闭环需要独立装置安全流程。</span></div>
      <ol>{roadmap.map(([id, period, title, copy]) => <li key={id}><span>{id}</span><time>{period}</time><h3>{title}</h3><p>{copy}</p></li>)}</ol>
      <aside className="platformFirst90"><p>未来 90 天</p><div><b>冻结核心合同</b><b>建立 18303 黄金炮</b><b>MDSplus 只读网关</b><b>MEQ / DINA Run API</b><b>CAD–EFIT 坐标注册</b><b>发布与 VVUQ 门禁</b></div></aside>
    </section>

    <section className="platformReferences" aria-labelledby="platform-reference-title">
      <div><p>REFERENCE</p><h2 id="platform-reference-title">规范与官方文档</h2></div>
      <p><a href="https://www.mdsplus.org/index.php/Documentation" target="_blank" rel="noreferrer">MDSplus</a><a href="https://zarr-specs.readthedocs.io/en/latest/v3/core/" target="_blank" rel="noreferrer">Zarr v3</a><a href="https://arrow.apache.org/docs/format/Flight.html" target="_blank" rel="noreferrer">Arrow Flight</a><a href="https://grpc.io/docs/what-is-grpc/introduction/" target="_blank" rel="noreferrer">gRPC</a><a href="https://kubernetes.io/docs/concepts/workloads/controllers/job/" target="_blank" rel="noreferrer">Kubernetes Jobs</a><a href="https://docs.nats.io/nats-concepts/jetstream" target="_blank" rel="noreferrer">NATS JetStream</a><a href="https://opentelemetry.io/docs/" target="_blank" rel="noreferrer">OpenTelemetry</a></p>
    </section>

    <SiteFooter />
  </main>;
}
