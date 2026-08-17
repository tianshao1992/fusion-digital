import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import { ProgramPhaseChart, ProgramSystemMap } from './ProgramRoadmapCharts';
import {
  acceptanceDimensions,
  deanDecisions,
  digitalThread,
  knowledgeModuleRoutes,
  roadmapPhases,
  roadmapSources,
  technologyDecisions,
} from './program-roadmap-data';
import './roadmap.css';

export const metadata: Metadata = {
  title: '聚变数字孪生两期建设路线｜EXL‑50U 到 EHL‑2',
  description: 'EXL‑50U 三个月最小闭环与 EHL‑2 六个月首等离子体虚拟调试路线，覆盖物理、控制、诊断、工程、IMAS 数据基座和可验证交付。',
};

export default function ProgramRoadmapPage() {
  const phaseOne = roadmapPhases[0];
  const phaseTwo = roadmapPhases[1];
  const moduleById = new Map(knowledgeModuleRoutes.map((module) => [module.id, module]));
  return <main className="programRoadmapPage">
    <SiteNav active="roadmap" />

    <header className="programHero">
      <div className="programHeroCopy">
        <p className="programEyebrow">FUSION DIGITAL TWIN PROGRAM · 3 + 6 MONTHS</p>
        <h1>从 EXL‑50U 最小闭环，走向<br/><em>EHL‑2 首等离子体虚拟实验</em></h1>
        <p className="programHeroLead">以装置描述（Machine Description）为基础、以统一数据契约为骨架、以经过验证的物理与工程模型为核心、以真实实验闭环作为验收对象，建设可安全演进的聚变数字孪生基础设施。</p>
        <div className="programHeroActions"><a href="#system-map">总体技术路线</a><a href="#phase-one">一期实施计划</a><a href="#phase-two">二期实施计划</a><a href="#technology">选型审计表</a><Link href="/knowledge-graph">进入知识图谱</Link></div>
      </div>
      <aside className="programMandate">
        <span>汇报主张 / EXECUTIVE THESIS</span>
        <blockquote>第一期证明一次实验能从计划、验证、执行到复盘完整且可追溯地跑通；第二期证明平台能在不接管安全控制的前提下，为 EHL‑2 首等离子体提供虚拟调试和在线只读影子运行。</blockquote>
        <p>数字孪生增强实验决策与证据管理，不替代实验、独立保护、工程审查或正式 Go / No-Go 组织。</p>
      </aside>
      <dl className="programHeroMetrics">
        <div><dt>12 周</dt><dd>EXL‑50U 最小闭环</dd></div>
        <div><dt>6 个月</dt><dd>EHL‑2 虚拟 first plasma</dd></div>
        <div><dt>10 模块</dt><dd>知识、数据与模型协同</dd></div>
        <div><dt>0 网页控机写通道</dt><dd>KG / LLM 与独立 PCS、联锁隔离</dd></div>
      </dl>
    </header>

    <section className="programDefinition" aria-labelledby="program-definition-title">
      <div className="programSectionHead">
        <p>00 / PROGRAM DEFINITION</p>
        <h2 id="program-definition-title">交付的不是“大屏”，而是一条有证据的实验数字线程。</h2>
        <span>每个结果必须绑定 shot / run、装置与几何版次、坐标与时基、校准和数据字典版本、代码与容器、输入输出校验和、适用域和审批状态。</span>
      </div>
      <ol className="programDigitalThread">
        {digitalThread.map((step, index) => <li key={step}><small>{String(index + 1).padStart(2, '0')}</small><b>{step}</b>{index < digitalThread.length - 1 && <i aria-hidden="true">→</i>}</li>)}
      </ol>
      <div className="programArchitectureBand">
        <article><small>事实源</small><b>MDSplus / 权威档案 / 工程时序</b><p>原始实验数据与获批控制配置记录保持不可变；平台通过只读适配器获取。</p></article>
        <article><small>语义层</small><b>IMAS + 工程资产合同</b><p>冻结 DD、COCOS、单位、时标、质量和校准；工程信号不被强塞入不适配 IDS。</p></article>
        <article><small>证据工厂</small><b>模型 adapter + HPC + V&V</b><p>高保真计算留在受控计算域，产生不可变 run manifest 与验证证据。</p></article>
        <article><small>决策界面</small><b>Knowledge + ECharts + 3D</b><p>前端只编排、比较和追溯结果；界面联动不等于模型已经科学耦合。</p></article>
      </div>
    </section>

    <section className="programSystemMap" id="system-map" aria-labelledby="system-map-title">
      <div className="programSectionHead">
        <p>01 / INTEGRATED TECHNICAL ROUTE</p>
        <h2 id="system-map-title">五大专业环节，共同把模型变成可验证的实验能力。</h2>
        <span>先看总览中的支撑关系，再点击任一环节，下钻“聚变专业覆盖 → 候选工具链 → 技术子路线 → 一期 / 二期交付”；每条路线同步显示输入输出、V&amp;V 证据、适用边界、工作包与阶段门。</span>
      </div>
      <ProgramSystemMap />
    </section>

    <section className="programPhase programPhaseOne" id="phase-one" aria-labelledby="phase-one-title">
      <PhaseHeader phase={phaseOne} number="02A" titleId="phase-one-title" />
      <ProgramPhaseChart phaseId="phase-1" />
      <GateStrip phase={phaseOne} />
    </section>

    <section className="programPhase programPhaseTwo" id="phase-two" aria-labelledby="phase-two-title">
      <PhaseHeader phase={phaseTwo} number="02B" titleId="phase-two-title" />
      <div className="firstPlasmaSequence" aria-label="EHL-2 首等离子体任务边界">
        {['真空场 / 电源 dry-run', 'null / 误差场与涡流', '实际预电离源 / 击穿', 'burn-through / Ip 建立', '成形后 R / Z 控制', '基础诊断确认', '安全终止'].map((step, index) => <span key={step}><small>{String(index + 1).padStart(2, '0')}</small>{step}</span>)}
      </div>
      <div className="ehlEntryCriteria"><b>六个月入口条件</b><p>M1 必须已有具名代码负责人、可运行且经过基准测试的模型链、受控的 EHL‑2 装置描述 / 剖面假设和可用算力；缺少任一项时，非线性 MHD 与高功率加热转为拓展交付，不阻断 first-plasma 虚拟调试主线。</p></div>
      <ProgramPhaseChart phaseId="phase-2" />
      <GateStrip phase={phaseTwo} />
      <div className="ehlDesignBoundary"><b>设计目标 ≠ 首炮验收</b><p>EHL‑2 官方公开设计目标包括 B₀≈3 T、Iₚ≈3 MA、17 MW NBI 和 6 MW ECRH；本路线将其作为后续高性能离线设计包络。first plasma 只按实际 commissioning configuration 验收低能量建立、位置控制、最小诊断和安全终止。</p><a href="https://en.ennresearch.com/researchfield/Compactfusion/EHL_2/" target="_blank" rel="noreferrer">核对 EHL‑2 官方参数 ↗</a></div>
    </section>

    <section className="programAcceptance" id="acceptance" aria-labelledby="acceptance-title">
      <div className="programSectionHead">
        <p>03 / ACCEPTANCE &amp; CREDIBILITY</p>
        <h2 id="acceptance-title">按证据过门，不按日历自动“完成”。</h2>
        <span>数值误差、实时预算和装置成功判据必须在 G0 / G5 由责任人结合本地基线冻结；本页不凭空替专家定义科学容差。</span>
      </div>
      <div className="acceptanceGrid">{acceptanceDimensions.map((item, index) => <article key={item.title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{item.title}</h3><b>{item.target}</b><p>{item.detail}</p></article>)}</div>
      <div className="programRedLines">
        <b>五条技术红线</b>
        <span>展示成功 ≠ 科学验证</span><span>合成数据 ≠ 实验数据</span><span>跨机迁移 ≠ EHL‑2 验证</span><span>离线高保真 ≠ 实时能力</span><span>数字孪生 ≠ 安全联锁</span>
      </div>
    </section>

    <section className="programTechnology" id="technology" aria-labelledby="technology-title">
      <div className="programSectionHead">
        <p>04 / TECHNOLOGY DECISIONS</p>
        <h2 id="technology-title">技术选型服从问题、证据与部署边界。</h2>
        <span>不是集成尽可能多的求解器，而是为每个决策选择一条被验证、能复现、可替换的模型链。</span>
      </div>
      <div className="technologyTable" role="table" aria-label="聚变数字孪生技术路线选型">
        <div className="technologyTableHead" role="row"><span role="columnheader">架构层</span><span role="columnheader">推荐路线</span><span role="columnheader">选择依据与边界</span><span role="columnheader">模块</span></div>
        {technologyDecisions.map((item, index) => <div className="technologyRow" role="row" key={item.layer}><span role="cell"><small>{String(index + 1).padStart(2, '0')}</small><b>{item.layer}</b></span><strong role="cell">{item.choice}</strong><p role="cell">{item.rationale}</p><span role="cell" className="technologyModules">{item.modules.map((moduleId) => { const knowledgeMeta = moduleById.get(moduleId); return <a href={`#module-${moduleId}`} key={moduleId}>{knowledgeMeta?.title ?? moduleId}</a>; })}</span></div>)}
      </div>
    </section>

    <section className="programModuleMap" id="modules" aria-labelledby="module-map-title">
      <div className="programSectionHead">
        <p>05 / KNOWLEDGE MODULE MAPPING</p>
        <h2 id="module-map-title">十大模块不是十条平行线，而是同一实验闭环的职责分工。</h2>
        <span>“关联模块”表示项目归属；当前知识图谱已结构化的证据域主要覆盖物理、工程、控制、诊断、AI 与装置，05–09 的独立证据域仍需后续扩建。</span>
      </div>
      <div className="programModuleGrid">{knowledgeModuleRoutes.map((module) => <Link href={module.route} id={`module-${module.id}`} data-roadmap-module={module.id} key={module.id}><span>{module.no}</span><h3>{module.title}</h3><dl><div><dt>一期</dt><dd>{module.phase1}</dd></div><div><dt>二期</dt><dd>{module.phase2}</dd></div></dl><b>进入模块 ↗</b></Link>)}</div>
      <div className="programEvidenceProjection"><p><b>证据投影</b>　路线页把工作包映射到现有知识模块；论文、代码、装置和模型依据仍由 Knowledge Graph 管理，不复制大规模数据或求解结果。</p><Link href="/knowledge-graph">从图谱核对论文、代码与装置证据 →</Link></div>
    </section>

    <section className="programDecision" id="decisions" aria-labelledby="decision-title">
      <div>
        <p>06 / DECISIONS REQUESTED</p>
        <h2 id="decision-title">需要院级确认的三项决定</h2>
        <span>先冻结共同接口和责任边界，再增加求解器与页面；否则三个月会被数据、坐标与版本争议耗尽。</span>
      </div>
      <ol>{deanDecisions.map((decision, index) => <li key={decision}><span>{String(index + 1).padStart(2, '0')}</span><p>{decision}</p></li>)}</ol>
    </section>

    <section className="programSources" aria-labelledby="sources-title">
      <div className="programSectionHead"><p>07 / PRIMARY SOURCES</p><h2 id="sources-title">规划依据与一手入口</h2><span>时间区间与工作包是本项目建议，并非来源机构的承诺；装置参数和技术能力以链接中的官方 / 原始材料为准。</span></div>
      <div>{roadmapSources.map((source, index) => <a href={source.url} key={source.url} target="_blank" rel="noreferrer"><span>S{String(index + 1).padStart(2, '0')}</span><b>{source.label}</b><i>↗</i></a>)}</div>
    </section>

    <SiteFooter />
  </main>;
}

function PhaseHeader({ phase, number, titleId }: { phase: (typeof roadmapPhases)[number]; number: string; titleId: string }) {
  return <header className="programPhaseHeader">
    <div><p>{number} / {phase.label}</p><h2 id={titleId}>{phase.device} · {phase.duration}</h2><h3>{phase.thesis}</h3><span>{phase.promise}</span></div>
    <aside><b>不纳入本期默认承诺</b>{phase.exclusions.map((item) => <p key={item}>{item}</p>)}</aside>
  </header>;
}

function GateStrip({ phase }: { phase: (typeof roadmapPhases)[number] }) {
  return <div className="programGateStrip" aria-label={`${phase.device}阶段门`}>
    {phase.gates.map((gate) => <article key={gate.id}><span>{gate.id}</span><div><b>{gate.title}</b><p>{gate.go}</p></div><small>{phase.axisLabel} {gate.at}</small></article>)}
  </div>;
}
