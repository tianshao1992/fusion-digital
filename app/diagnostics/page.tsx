import Image from 'next/image';
import type { Metadata } from 'next';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import DiagnosticsResearchCatalog from './DiagnosticsResearchCatalog';
import {
  DiagnosticsClosedLoopGraph,
  DiagnosticsDeviceCoverageChart,
  DiagnosticsEvidenceHeatmap,
  DiagnosticsRoadmapChart,
  DiagnosticsTaskCoverageChart,
  DiagnosticsTimescaleChart,
} from './DiagnosticsCharts';
import {
  diagnosticsDeviceProfiles,
  diagnosticsResearchItems,
  diagnosticsTaskMeta,
  type DiagnosticsTaskId,
} from './diagnosticsResearch';
import { parseDiagnosticsCatalogState, type DiagnosticsSearchParams } from './diagnosticsFilters';
import './diagnostics.css';

export const metadata: Metadata = {
  title: '诊断感知：聚变诊断、合成观测与装置证据图谱',
  description: '按 DG0–DG11、技术类型和装置检索 97 项聚变诊断工作、167 篇论文与来源、35 项代码资产和 18 个装置档案，并区分科学证据与工程部署。',
};

const taskBriefs: Record<DiagnosticsTaskId, { boundary: string; signals: string }> = {
  DG0: {
    boundary: '管理需求、几何、标定、时钟、数据质量、环境适配、可维护性与诊断自身健康，是全部测量链的共同底座。',
    signals: '配置 · 标定证书 · 时间基准 · 质量位 · 不确定度 · 健康状态',
  },
  DG1: {
    boundary: '由磁探针、磁通环、Rogowski、抗磁与 MSE 等观测重建磁平衡、电流和等离子体位形。',
    signals: '边界 · 轴位置 · 电流 · q / 磁剪切 · 磁能 · 环电压',
  },
  DG2: {
    boundary: '以干涉、偏振、反射、Thomson scattering、ECE/ECEI 等获得电子密度与电子温度。',
    signals: 'ne · Te · 线积分 · 径向剖面 · 二维涨落',
  },
  DG3: {
    boundary: '由 CXRS/CER、XICS、可见/VUV 光谱与粒子分析测量离子状态、流动、组分和中性粒子。',
    signals: 'Ti · 转动 · 燃料比 · 杂质电荷态 · 中性粒子分布',
  },
  DG4: {
    boundary: '以 bolometry、软/硬 X 射线和光谱观测总辐射、局部辐射、杂质与功率损失。',
    signals: 'Prad · Zeff · 杂质源 · 辐射分布 · 逃逸能量',
  },
  DG5: {
    boundary: '覆盖中子、伽马、聚变产物和高能粒子的产额、谱、空间分布、约束与损失。',
    signals: '中子率/谱 · 聚变功率代理 · 快离子分布 · 逃逸粒子',
  },
  DG6: {
    boundary: '以 Mirnov、BES、DBS、相关反射、PCI、ECEI、GPI 等识别 MHD、波动与湍流结构。',
    signals: '模式频率/数 · 相位 · 相干性 · 湍流谱 · 模式位置',
  },
  DG7: {
    boundary: '诊断边界、SOL、偏滤器和面对等离子体部件的热流、侵蚀沉积、尘埃与壁状态。',
    signals: '热流 · 表面温度 · 粒子通量 · 回收 · 侵蚀 · 热事件',
  },
  DG8: {
    boundary: '把温度、力、位移、应变、振动、声学与光纤等传感扩展到磁体、结构、真空、低温、氚与电厂设备。',
    signals: '温度 · 应力/应变 · 位移 · 振动 · 泄漏 · 绝缘 · 设备健康',
  },
  DG9: {
    boundary: '用仪器几何、传递函数、噪声和采样模型，把物理/工程状态映射为可与真实信号比较的观测量。',
    signals: '虚拟通道 · 仪器响应 · 可观测性 · 设计裕量 · 残差',
  },
  DG10: {
    boundary: '联合多诊断开展 Bayesian/GP/滤波、层析与数据同化，输出带不确定度且相互一致的状态。',
    signals: '后验状态 · 协方差 · 三维辐射/发射率 · 一致性残差',
  },
  DG11: {
    boundary: '把已计时、可降级的实时特征、代理反演、异常检测和质量门接入 PCS、保护与人机界面。',
    signals: '实时状态 · 置信度 · 质量门 · 告警 · 决策接口 · 审计回执',
  },
};

const evidenceDefinitions = [
  ['E0', '需求 / 概念', '只有需求、架构或原理描述，尚无足够动态结果。'],
  ['E1', '数值 / 合成验证', '在数值模型或合成数据上验证，不代表仪器已完成标定。'],
  ['E2', '实验室 / 原型 / 标定', '在标定台、实验室或受控部件上形成可重复证据。'],
  ['E3', '装置数据 / 交叉验证', '使用真实装置数据离线分析、安装调试或与独立诊断交叉验证。'],
  ['E4', '装置在线 / 常规使用', '进入真实装置在线、实时或常规实验流程；不自动等同安全资格。'],
];

const deploymentDefinitions = [
  ['D1', '概念 / 需求'],
  ['D2', '软件或实验室原型'],
  ['D3', '安装、联调、回放、影子或 HIL'],
  ['D4', '常规装置工作流'],
  ['D5', '经治理批准的安全 / 保护关键用途'],
];

const twinGaps = [
  ['G1', '观测不是状态', '多数诊断输出局部或线积分信号；数字孪生还需要联合反演、可观测性分析和跨域一致状态。'],
  ['G2', '标定尚未数字线程化', '几何、时钟、响应函数、校准证书、有效期、漂移和维修事件必须随每个数据产品可查询。'],
  ['G3', '合成—真实残差未闭环', '前向模型不能只做论文后处理；需要与原始通道持续对齐，并把残差反馈给模型、仪器和不确定度。'],
  ['G4', '质量与失效缺少在线语义', '缺数、饱和、污染、辐照漂移、时间错位和算法失效要形成机器可读质量位与降级策略。'],
  ['G5', '等离子体与工程健康割裂', '位形、热流与中子源应能关联温度、力、位移、应变及辅机状态，支撑故障传播和寿命判断。'],
  ['G6', '实时不等于可信控制', '低平均延迟不足以进入闭环；还需要最坏时延、故障注入、HIL、权限、回退和独立保护证据。'],
  ['G7', '跨装置语义仍不统一', '通道名、坐标、单位、配置和处理版本差异阻碍迁移；IMAS/OMAS 等契约仍需站点适配与审计。'],
  ['G8', '生命周期证据不足', '长脉冲、辐照老化、维护后再标定、备件替换和软件升级必须进入同一配置与责任体系。'],
];

const roadmap = [
  ['R0', '测量资产与计量底座', '盘点通道、视线、采样、时钟、标定、误差、依赖和责任人；保留原始 ADC 与不可变配置快照。', '近期 · 可立即实施'],
  ['R1', '回放与合成诊断闭环', '统一炮次回放接口；让 DINA / MEQ、输运与工程模型生成虚拟通道，并以残差和交叉诊断验证。', '近期 → 中期'],
  ['R2', '多诊断状态与影子运行', '构建带 UQ 的集成反演和数据同化，在影子模式验证时延、漂移、缺失通道与异常工况。', '中期'],
  ['R3', '控制与工程健康联动', '把可信状态、热流和载荷接入场景规划、保护建议、预测维护与实验协同；所有动作经过确定性门。', '中期 → 远期'],
  ['R4', '电厂级持续可信运行', '形成跨班次、跨维护周期、跨软件版本的证据链，覆盖降级、再标定、老化、网络安全与安全论证。', '远期'],
];

const taskIds = Object.keys(diagnosticsTaskMeta) as DiagnosticsTaskId[];
const directCodeCount = diagnosticsResearchItems.filter((item) =>
  item.code.some((asset) => asset.status === 'official-direct'),
).length;
const onlineCount = diagnosticsResearchItems.filter((item) => item.evidenceLevel === 'E4').length;
const uniquePaperCount = new Set(
  diagnosticsResearchItems.flatMap((item) => item.papers.map((paper) => {
    const record = paper as { doi?: string | null; url?: string | null; title: string };
    return record.doi || record.url || record.title;
  })),
).size;

function ScientificFigure({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="diagnosticsFigure">
      <Image src={src} alt={alt} width={2400} height={1380} sizes="(max-width: 1120px) 89vw, 47vw" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export default async function DiagnosticsPage({ searchParams }: { searchParams?: Promise<DiagnosticsSearchParams> }) {
  const initialCatalogState = parseDiagnosticsCatalogState(await (searchParams ?? Promise.resolve({})));
  return (
    <main className="diagnosticsPage">
      <SiteNav active="diagnostics" />

      <header className="diagnosticsHero">
        <div className="diagnosticsHeroCopy">
          <p className="diagnosticsEyebrow">DIAGNOSTICS &amp; SENSING · KNOWLEDGE DOMAIN 04</p>
          <h1>诊断感知：<span>让不可直接看见的聚变状态，成为可校准、可验证的决策证据。</span></h1>
          <p>
            聚变诊断不是传感器清单，也不等于“智能诊断”。它贯通仪器物理、计量标定、数据采集、反演与同化、
            合成诊断、实时接口和工程健康，把真实装置与数字孪生放在同一时间、几何、配置和不确定度语境中。
          </p>
          <div className="diagnosticsActions">
            <a href="#catalog">检索主要工作</a>
            <a href="/fusion-diagnostics-research-report.docx" download>下载完整报告</a>
          </div>
          <dl className="diagnosticsHeroStats">
            <div><dt>{diagnosticsResearchItems.length}</dt><dd>项结构化工作</dd></div>
            <div><dt>{uniquePaperCount}</dt><dd>篇去重论文 / 来源</dd></div>
            <div><dt>{directCodeCount}</dt><dd>项关联官方直接代码</dd></div>
            <div><dt>{diagnosticsDeviceProfiles.length}</dt><dd>个装置证据档案</dd></div>
            <div><dt>{onlineCount}</dt><dd>项达到 E4 在线 / 常规使用证据</dd></div>
          </dl>
        </div>
        <ScientificFigure
          src="/figures/diagnostics-digital-twin-architecture-nature.png"
          alt="聚变诊断与数字孪生参考架构：真实装置、测量链、状态反演、合成诊断、决策与证据治理"
          caption="图 1｜诊断感知在聚变数字孪生中的位置。真实观测和模型预测必须通过配置、时钟、标定、不确定度与证据治理相遇；AI 只能在这些边界内赋能。"
        />
      </header>

      <section className="diagnosticsThesis">
        <p className="diagnosticsIndex">00 / DOMAIN THESIS</p>
        <h2><span>数字孪生的本质不是“显示信号”，</span>而是持续回答：装置此刻处于什么状态、我们为何相信它、误差有多大、模型与观测为何不一致，以及据此可以安全地做什么。</h2>
        <div>
          <p>真实诊断给出带噪声、带选择效应的局部观测；集成反演把多诊断转化为带不确定度的状态；合成诊断把模型状态重新投影回仪器空间。只有两条路径在同一配置下闭合，模型校准才有物理含义。</p>
          <p>面向电厂，诊断责任还必须覆盖磁体、结构、真空、低温、燃料/氚、冷却与能量转换设备。等离子体状态和工程健康不能继续作为两套相互孤立的数据产品。</p>
        </div>
      </section>

      <section className="diagnosticsLoop" id="closed-loop">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">01 / OBSERVATION–MODEL–DECISION LOOP</p>
          <h2>真实诊断与合成诊断构成“双向测量链”，不是单向数据管道。</h2>
          <p>点击节点查看它在闭环中的责任。实时决策只消费通过质量门的冻结数据产品；原始信号、标定与处理版本始终保留，支持回放、归因和再验证。</p>
        </div>
        <div className="diagnosticsLoopGrid">
          <figure className="diagnosticsChartFigure">
            <DiagnosticsClosedLoopGraph />
            <figcaption>交互图 1｜从装置真实状态，经仪器与数据链形成后验状态；模型再经合成诊断返回仪器空间，以残差驱动校准、设计和决策。节点位置表达责任关系，不代表固定软件部署拓扑。</figcaption>
          </figure>
          <div className="diagnosticsLoopPrinciples">
            <article><span>01</span><div><b>计量可追溯</b><p>每个量值都能回到原始信号、单位、坐标、标定系数、有效期和几何版本。</p></div></article>
            <article><span>02</span><div><b>观测算子显式化</b><p>视线、卷积、响应、噪声、采样和遮挡必须进入前向模型，不能把模型网格值直接当测量值。</p></div></article>
            <article><span>03</span><div><b>不确定度随链传播</b><p>仪器误差、模型结构误差和反演后验要区分表达，并随决策产品传播。</p></div></article>
            <article><span>04</span><div><b>安全职责分离</b><p>AI 可识别模式和编排分析，但不得越过质量门、权限、确定性控制器与独立保护。</p></div></article>
          </div>
        </div>
      </section>

      <section className="diagnosticsTaxonomy" id="taxonomy">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">02 / ONE FOUNDATION + ELEVEN TASKS</p>
          <h2>一个系统工程与计量底座，支撑十一类测量、反演和实时任务。</h2>
          <p>DG0 是跨域底座；DG1–DG8 按主要被测对象划分，DG9–DG11负责前向模型、联合反演与决策接口。一项工作只有一个主任务，但可以关联多个任务，避免重复计数。</p>
        </div>
        <figure className="diagnosticsChartFigure diagnosticsCoverage">
          <DiagnosticsTaskCoverageChart />
          <figcaption>交互图 2｜97 项工作按主任务聚合。点击条形可进入目录筛选；数量反映本版调研覆盖，不代表某类诊断的重要性或全球总工作量。</figcaption>
        </figure>
        <div className="diagnosticsTaskGrid">
          {taskIds.map((taskId) => {
            const meta = diagnosticsTaskMeta[taskId];
            const brief = taskBriefs[taskId];
            const count = diagnosticsResearchItems.filter((item) => item.primaryTask === taskId).length;
            return (
              <article className={meta.role === 'cross-cutting' ? 'crossCutting' : ''} key={taskId} id={`task-${taskId}`}>
                <header><b>{taskId}</b><span>{meta.en}</span><i>{count} 项</i></header>
                <h3>{meta.label}</h3>
                <p>{brief.boundary}</p>
                <dl><div><dt>代表产品</dt><dd>{brief.signals}</dd></div><div><dt>域角色</dt><dd>{meta.role === 'cross-cutting' ? '跨测量链能力' : '被测对象与状态'}</dd></div></dl>
                <a href={`/diagnostics?task=${taskId}#catalog`}>检索该类工作 <span aria-hidden="true">↗</span></a>
              </article>
            );
          })}
        </div>
      </section>

      <section className="diagnosticsResearch" id="catalog">
        <div className="diagnosticsSectionHead diagnosticsResearchHead">
          <div>
            <p className="diagnosticsIndex">03 / SEARCHABLE EVIDENCE ATLAS</p>
            <h2>按任务、技术、装置、证据和软件关系检索主要工作。</h2>
            <p>条目区分“论文原代码、官方使能工具、社区复现、商业/受控软件和未公开代码”。没有公开实现时明确标注，不以通用框架或论文链接冒充源码。</p>
          </div>
          <nav className="diagnosticsDownloads" aria-label="诊断研究数据下载">
            <a href="/fusion-diagnostics-research-report.docx" download><b>DOCX</b><span>完整技术报告</span></a>
            <a href="/data/fusion-diagnostics-landscape.json" download><b>JSON</b><span>工作事实库</span></a>
            <a href="/fusion-diagnostics-paper-code-index.csv" download><b>CSV</b><span>论文代码索引</span></a>
            <a href="/fusion-diagnostics-references.bib" download><b>BIB</b><span>参考文献库</span></a>
            <a href="/data/fusion-diagnostics-device-profiles.json" download><b>DEVICE</b><span>装置档案 JSON</span></a>
          </nav>
        </div>
        <DiagnosticsResearchCatalog initialState={initialCatalogState} />
      </section>

      <section className="diagnosticsEvidence" id="evidence">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">04 / EVIDENCE ≠ DEPLOYMENT</p>
          <h2>科学证据 E 与工程部署 D 是两条独立坐标轴。</h2>
          <p>E4 只说明曾进入真实装置在线、实时或常规工作流，不自动推导为 D5 安全资格。任何 D5 声明必须有审批、配置责任、测试、变更和生命周期证据。</p>
        </div>
        <div className="diagnosticsEvidenceLayout">
          <figure className="diagnosticsChartFigure">
            <DiagnosticsEvidenceHeatmap />
            <figcaption>交互图 3｜工作按 E0–E4 与 D1–D5 交叉聚合。点击单元格可进入目录筛选；空格表示本版事实库未记录对应组合，不表示全球没有相关工作。</figcaption>
          </figure>
          <div className="diagnosticsEvidenceScales">
            <div>
              <h3>E · 科学与运行证据</h3>
              {evidenceDefinitions.map(([id, label, description]) => <article key={id}><span>{id}</span><div><b>{label}</b><p>{description}</p></div></article>)}
            </div>
            <div>
              <h3>D · 部署责任等级</h3>
              {deploymentDefinitions.map(([id, label]) => <article key={id}><span>{id}</span><div><b>{label}</b></div></article>)}
            </div>
          </div>
        </div>
      </section>

      <section className="diagnosticsScientificViews" id="scientific-views">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">05 / SCIENTIFIC VIEWS</p>
          <h2>从时间尺度、装置覆盖到反演治理：五张互补视图解释同一系统。</h2>
          <p>这些图是架构与方法视图，不替代具体诊断的标定曲线、误差预算或装置安全文件；图中数量级和关系应结合每项工作的原始来源阅读。</p>
        </div>
        <div className="diagnosticsFigureGrid">
          <figure className="diagnosticsChartFigure diagnosticsScientificChart"><DiagnosticsTimescaleChart /><figcaption>交互图 4｜多时间尺度：快速保护、实时状态、炮内演化、炮间校准与全生命周期健康需要不同数据链和验证方法。区间为综合示意，不是性能承诺。</figcaption></figure>
          <figure className="diagnosticsChartFigure diagnosticsScientificChart"><DiagnosticsDeviceCoverageChart /><figcaption>交互图 5｜装置证据索引：不同装置的任务、数据开放度、实时接口和验证环境不同；着色不代表所有系统同时可用或成熟度相同。</figcaption></figure>
          <ScientificFigure src="/figures/diagnostics-synthetic-loop-nature.png" alt="真实诊断与合成诊断残差闭环图" caption="图 7｜合成诊断闭环：模型经过仪器前向算子后再与原始观测比较，残差用于定位物理、几何、校准或噪声模型偏差。" />
          <ScientificFigure src="/figures/diagnostics-inference-graph-nature.png" alt="多诊断联合反演和不确定度传播图" caption="图 8｜集成反演：联合多个互补观测，显式表达先验、似然、空间几何和后验不确定度，避免各诊断各自产生互不一致的状态。" />
          <ScientificFigure src="/figures/diagnostics-realtime-governance-nature.png" alt="实时诊断、人工智能、质量门和安全治理图" caption="图 9｜实时治理：模型发布、输入质量、最坏时延、OOD、降级和权限门决定输出能否进入 PCS、保护或只供人机界面参考。" />
        </div>
      </section>

      <section className="diagnosticsGaps" id="gaps">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">06 / GAP TO A DIGITAL TWIN</p>
          <h2>距离数字孪生，缺口不在“再加一个模型”，而在观测、状态、证据与责任能否连续闭合。</h2>
        </div>
        <div className="diagnosticsGapGrid">
          {twinGaps.map(([id, title, description]) => <article key={id}><span>{id}</span><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>

      <section className="diagnosticsRoadmap" id="roadmap">
        <div className="diagnosticsSectionHead">
          <p className="diagnosticsIndex">07 / FUSIONDIGITAL ROADMAP</p>
          <h2>从炮次级证据链切入，逐步形成电厂级持续观测与可信决策。</h2>
          <p>每一阶段都应保留“可回放、可对比、可降级、可追责”的验收门。建议节奏取决于 EXL-50U / EHL-2 的仪器配置、数据权限与实验计划，不把网页阶段直接等同工程承诺。</p>
        </div>
        <figure className="diagnosticsChartFigure diagnosticsRoadmapFigure"><DiagnosticsRoadmapChart /><figcaption>交互图 6｜建议阶段允许并行，并以证据门而非日历自动晋级；时间窗口用于架构规划，不是已批准进度承诺。</figcaption></figure>
        <div className="diagnosticsRoadmapGrid">
          {roadmap.map(([id, title, description, horizon]) => <article key={id}><header><span>{id}</span><b>{horizon}</b></header><h3>{title}</h3><p>{description}</p><footer>配置基线 → 验证记录 → 责任批准 → 可回退发布</footer></article>)}
        </div>
      </section>

      <section className="diagnosticsMethod">
        <div><p className="diagnosticsIndex">08 / METHOD &amp; LIMITS</p><h2>如何严谨地使用本知识域</h2></div>
        <div className="diagnosticsMethodGrid">
          <article><b>收录口径</b><p>优先原始论文、装置/机构官方页面和作者仓库；工作按稳定 ID 去重，一项工作只计一个主任务。</p></article>
          <article><b>代码口径</b><p>“使能工具”不等于论文原实现；商业、受控和未公开软件分别标注，未发现公开仓库时不补猜链接。</p></article>
          <article><b>装置口径</b><p>装置档案是证据索引，不声称所有诊断在每个实验周期同时可用；装机、调试、离线和实时使用需要分开判断。</p></article>
          <article><b>维护口径</b><p>新增记录需补齐问题、测量原理、时空尺度、标定、反演、验证、E/D、论文、代码关系、局限与更新时间。</p></article>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
