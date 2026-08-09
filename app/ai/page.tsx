import SiteFooter from '../components/SiteFooter';
import SiteNav from '../components/SiteNav';
import TwinAgentMotion from '../components/TwinAgentMotion';
import './ai.css';

const capabilityLayers = [
  {index:'01',title:'机器学习',en:'MACHINE LEARNING',role:'把放电数据转化为可校准的分类、回归、异常检测和剩余寿命模型。',tasks:'破裂预警、状态估计、参数辨识、设备健康、实验分群',gate:'必须做按时间/炮次隔离的外部测试，并报告概率校准、误报和漏报。'},
  {index:'02',title:'深度学习',en:'DEEP LEARNING',role:'学习多通道时序、图像、谱和控制量之间的非线性表征。',tasks:'多模态诊断、神经状态空间、快速代理、强化学习控制',gate:'必须验证传感器缺失、分布漂移、最坏时延及 sim-to-real 鲁棒性。'},
  {index:'03',title:'基础模型',en:'FOUNDATION MODELS',role:'在跨诊断、跨任务和潜在跨装置数据上预训练统一状态表征。',tasks:'缺失诊断重建、少样本迁移、通用表征、跨任务接口',gate:'不能把“规模”当作可信度；需要数据谱系、适用域、探针任务和独立装置验证。'},
  {index:'04',title:'智能体',en:'AI AGENTS',role:'调用检索、仿真、数据分析和优化工具，编排可审计的任务计划。',tasks:'实验检索、场景搜索、仿真编排、报告生成、操作副驾驶',gate:'不得绕过安全控制器；写操作需要权限门、计划预检、人工批准和完整审计。'},
];

const evidence = [
  {kind:'深度学习',title:'跨装置破裂预测',detail:'2019 年 Nature 工作以 JET 与 DIII-D 数据展示深度时序模型的跨装置预测潜力，同时暴露未来装置迁移验证的重要性。',tag:'PEER REVIEWED',url:'https://www.nature.com/articles/s41586-019-1116-4'},
  {kind:'强化学习',title:'TCV 磁位形控制',detail:'单一深度强化学习控制器在 TCV 上直接输出 19 个线圈电压命令；实验部署建立在高质量模拟器和显式约束之上。',tag:'EXPERIMENTAL',url:'https://www.nature.com/articles/s41586-021-04301-9'},
  {kind:'科学机器学习',title:'可预测降电流轨迹',detail:'TCV 的 predict-first 实验使用神经状态空间模型学习等离子体动力学，并在实验前筛选更鲁棒的 ramp-down 轨迹。',tag:'EXPERIMENTAL',url:'https://www.nature.com/articles/s41467-025-63917-x'},
  {kind:'基础模型',title:'FusionMAE',detail:'基于 HL-3 多诊断信号预训练统一等离子体状态表征，研究缺失诊断重建和多任务接口，是“融合基础模型”方向的同行评议案例。',tag:'PEER REVIEWED',url:'https://www.nature.com/articles/s42005-026-02626-3'},
  {kind:'基础模型',title:'TokaMind',detail:'面向公开 MAST 数据的多模态 Transformer 框架，探索异构诊断预训练和动力学建模；目前应按预印本证据使用。',tag:'PREPRINT',url:'https://arxiv.org/abs/2602.15084'},
  {kind:'智能体',title:'TORAX 场景搜索',detail:'Google DeepMind 提出将可微分输运模拟 TORAX 与强化学习或演化搜索结合，让智能体在模拟环境中探索运行场景。',tag:'OFFICIAL R&D',url:'https://deepmind.google/blog/bringing-ai-to-the-next-generation-of-fusion-energy/'},
  {kind:'智能体',title:'聚变运行副驾驶',detail:'基于实验日志的 RAG 原型用于语义检索、装置操作辅助和 Tokamak 问答，显示装置专属知识库比通用问答更有价值。',tag:'WORKSHOP',url:'https://openreview.net/pdf?id=yGVChrbJ4E'},
  {kind:'智能体',title:'数值数据分析代理',detail:'ACL 2026 工作以代码生成和多模态推理处理数值数据，并报告在聚变实验规划与分析中的应用。',tag:'PEER REVIEWED',url:'https://aclanthology.org/2026.findings-acl.1924/'},
];

const twinRoles = [
  ['观测','虚拟诊断、缺失信号重建、异常识别','AI 形成更完整的状态表征；数字孪生提供几何、物理约束和合成数据。'],
  ['预测','快速代理、神经状态空间、不确定度估计','AI 提供低时延预测；高保真模型和实验持续限定其适用域。'],
  ['规划','场景优化、主动学习、实验建议','智能体在孪生环境中搜索，不直接把未经验证的建议写入装置。'],
  ['执行','控制策略、保护触发、工程限值协调','只有通过时延、鲁棒性、HIL 和安全包络验证的确定性组件进入闭环。'],
  ['学习','参数更新、漂移监测、模型选择','每次放电更新证据账本；模型发布、回退和再验证属于孪生运行能力。'],
];

const risks = [
  ['分布外失效','新壁状态、新加热组合或异常诊断会让训练分布失效；必须实时检测 OOD。'],
  ['不确定度失真','点预测准确不代表风险可信；需校准置信区间并传播到工程与控制决策。'],
  ['相关不等于因果','数据模型可能学习装置习惯而非物理机制；用守恒律、因果干预和合成诊断约束。'],
  ['智能体越权','语言模型不应直接控制执行器；工具白名单、最小权限、双人批准和安全控制器不可省略。'],
  ['持续学习风险','在线更新可能破坏已验证行为；生产模型应冻结发布，增量模型先在影子模式重新过门。'],
  ['证据不可追溯','训练数据、代码、权重、提示词、工具调用与结果必须关联到同一配置和实验时间轴。'],
];

const roadmap = [
  ['A0','数据与基准','建立炮次级数据质量、标签、本体、装置配置和可重复评测。'],
  ['A1','辅助模型','从诊断重建、异常检测和单物理快速代理切入，不影响实时控制。'],
  ['A2','预测孪生','把代理模型与 DINA / MEQ、输运和工程约束组合，形成带 UQ 的影子预测。'],
  ['A3','操作副驾驶','提供实验检索、场景比较、仿真编排和可引用解释，保留人工决策。'],
  ['A4','受控智能体','在工具白名单与权限门内自动执行离线工作流，所有写操作可审计、可回退。'],
  ['A5','有限自治','仅在经过独立 V&V 的狭窄适用域内闭环；安全保护始终独立于生成式 AI。'],
];

export default function AIPage(){
  return <main className="aiPage">
    <SiteNav active="ai" />
    <header className="aiHero"><div><p className="aiEyebrow">AI-NATIVE FUSION DIGITAL TWIN</p><h1>智能原生不是增加一个聊天框，<br/><span>而是重构观测、预测与协作。</span></h1><p>以物理模型和实验事实为锚，以数据表征和快速代理提高实时性，以智能体编排复杂工具；任何影响装置的动作都必须经过确定性安全边界、权限控制和可审计批准。</p><div className="aiActions"><a href="#landscape">查看研究图谱</a><a href="#route">查看实施路线</a></div></div><TwinAgentMotion /></header>

    <section className="aiThesis"><p className="aiIndex">00 / OPERATING PRINCIPLE</p><h2><span>数字孪生提供“世界模型与证据”，</span>人工智能提供“表征、搜索和编排”。二者融合的目标不是取代物理，而是在已知边界内更快地做出可验证决策。</h2></section>

    <section className="aiCapabilities" id="landscape"><div className="aiSectionHead"><p className="aiIndex">01 / CAPABILITY STACK</p><h2>从机器学习到智能体：能力逐层增加，治理不能滞后。</h2><p>四类技术不是互相替代关系。基础模型可以提供表征，专用模型承担确定性任务，智能体负责调用它们；数字孪生则提供状态、仿真环境和证据边界。</p></div><div className="capabilityGrid">{capabilityLayers.map(item=><article key={item.index}><header><span>{item.index}</span><b>{item.en}</b></header><h3>{item.title}</h3><p>{item.role}</p><dl><div><dt>适合任务</dt><dd>{item.tasks}</dd></div><div><dt>进入孪生前的门</dt><dd>{item.gate}</dd></div></dl></article>)}</div></section>

    <section className="aiEvidence"><div className="aiSectionHead"><p className="aiIndex">02 / RESEARCH EVIDENCE</p><h2>已有实验突破，但“可演示”距离“可托付运行”仍很远。</h2><p>以下条目区分同行评议实验、基础模型研究、预印本和研发计划，避免把不同证据等级混为一谈。</p></div><div className="aiEvidenceGrid">{evidence.map((item,index)=><a href={item.url} target="_blank" rel="noreferrer" key={item.title}><header><span>{String(index+1).padStart(2,'0')} · {item.kind}</span><b>{item.tag}</b></header><h3>{item.title}</h3><p>{item.detail}</p><i>打开原始来源 ↗</i></a>)}</div></section>

    <section className="aiTwinRoles"><div className="aiSectionHead"><p className="aiIndex">03 / TWIN × AI</p><h2>AI 应嵌入孪生闭环的五个位置，而不是成为旁路。</h2></div><div className="roleTable">{twinRoles.map((item,index)=><article key={item[0]}><span>{String(index+1).padStart(2,'0')}</span><h3>{item[0]}</h3><b>{item[1]}</b><p>{item[2]}</p></article>)}</div></section>

    <section className="aiArchitecture"><div><p className="aiIndex">04 / REFERENCE ARCHITECTURE</p><h2>双速、分权、可回退</h2><p>在线环只部署已冻结、可计时、可回退的模型；离线智能体负责检索、仿真、训练、比较和报告。模型必须通过证据门，才能从离线工厂发布到在线影子或有限闭环。</p></div><div className="archStack"><article><span>ONLINE · ms–s</span><b>诊断 → 状态估计 → 快速预测 → 安全控制器</b><i>确定性时延 · 独立保护 · OOD 检测</i></article><article><span>EVIDENCE GATE</span><b>数据谱系 · VVUQ · HIL · 权限 · 签名发布</b><i>批准 / 拒绝 / 回退</i></article><article><span>OFFLINE · min–week</span><b>高保真模拟 → 训练评测 → 智能体编排 → 专家评审</b><i>物理约束 · 跨装置验证 · 对抗测试</i></article></div></section>

    <section className="aiRisks"><div className="aiSectionHead"><p className="aiIndex">05 / TRUST GAPS</p><h2>真正的差距集中在可信运行，而不是模型参数量。</h2></div><div className="riskGrid">{risks.map((item,index)=><article key={item[0]}><span>{String(index+1).padStart(2,'0')}</span><h3>{item[0]}</h3><p>{item[1]}</p></article>)}</div></section>

    <section className="aiRoute" id="route"><div className="aiSectionHead"><p className="aiIndex">06 / FUSIONDIGITAL ROADMAP</p><h2>从数据和窄任务开始，逐步获得受控自治。</h2><p>推荐与 DINA / MEQ 控制服务路线并行推进：先建立可复现评测，再把 AI 置于影子模式，最后只在狭窄、经过验证的范围内开放闭环权限。</p></div><div className="aiRouteGrid">{roadmap.map(item=><article key={item[0]}><span>{item[0]}</span><h3>{item[1]}</h3><p>{item[2]}</p></article>)}</div></section>
    <SiteFooter />
  </main>;
}
