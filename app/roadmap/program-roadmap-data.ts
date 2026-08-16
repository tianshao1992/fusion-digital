import { knowledgeModules, type KnowledgeModuleId } from '../data/knowledge-modules';

export type PhaseId = 'phase-1' | 'phase-2';

export type RoadmapWorkPackage = {
  id: string;
  lane: string;
  title: string;
  start: number;
  end: number;
  owner: string;
  deliverable: string;
  evidence: string;
  modules: readonly KnowledgeModuleId[];
};

export type RoadmapGate = {
  id: string;
  at: number;
  title: string;
  go: string;
};

export type RoadmapPhase = {
  id: PhaseId;
  label: string;
  device: string;
  duration: string;
  axisLabel: string;
  axisMax: number;
  timeSemantics: 'inclusive-periods';
  thesis: string;
  promise: string;
  exclusions: string[];
  workPackages: RoadmapWorkPackage[];
  gates: RoadmapGate[];
};

export const roadmapPhases: RoadmapPhase[] = [
  {
    id: 'phase-1',
    label: '一期 / PHASE I',
    device: 'EXL‑50U',
    duration: '12 周',
    axisLabel: '项目周 / WEEK',
    axisMax: 12,
    timeSemantics: 'inclusive-periods',
    thesis: '单场景族、单证据链、可重复的离线 / 准实时最小闭环示范',
    promise: '证明一次实验能够从计划、物理预演、控制测试、工程载荷核查，到执行、诊断复盘和模型更新完整且可追溯地跑通。',
    exclusions: [
      '不承诺全工况、全诊断或实时全耦合数字孪生',
      '不由网页、知识图谱或大模型向 PCS / 联锁写入控制量',
      '不从静态平衡直接推断破裂发生时刻或安全认证载荷',
    ],
    workPackages: [
      { id: 'P1-0', lane: '总体与 V&V', title: '场景族、坐标、时基与验收基线', start: 1, end: 2, owner: '总体 / 各域负责人', deliverable: 'Machine Description、场景清单、模型卡、接口控制文件与 V&V 矩阵', evidence: '关键输入均有 owner；坐标、单位、时间、版本和权限边界签字冻结', modules: ['data', 'integration'] },
      { id: 'P1-1', lane: '数据与诊断', title: '原始炮数据、工程传感器与 IMAS 子集', start: 1, end: 8, owner: '数据 / 诊断', deliverable: '原始—校准—派生—重构四层数据链；精选 IDS 映射与质量标记', evidence: '关键通道元数据、校准、质量、血缘和校验和完整；无静默单位转换', modules: ['diagnostics', 'data'] },
      { id: 'P1-2', lane: '位形物理', title: '预实验平衡、线圈波形与 as-shot 重构', start: 1, end: 7, owner: '物理', deliverable: '认可基线上的位形预演、合成磁诊断、EFIT / PTEFIT 回放与残差报告', evidence: '留出炮自动回放；预测—重构—实测差异按批准容差评审', modules: ['physics', 'diagnostics'] },
      { id: 'P1-3', lane: '控制验证', title: 'PCS 回放、RZIP / ROM、MIL→SIL→HIL', start: 3, end: 9, owner: '控制', deliverable: 'Ip / R / Z 与位形控制测试台；饱和、偏置、丢包、时延和异常终止用例', evidence: '批准测试矩阵通过；限幅、抗饱和、故障升级和安全终止符合要求；具备硬件时才声明 HIL', modules: ['control', 'hmi'] },
      { id: 'P1-4', lane: '工程载荷', title: '正常脉冲 + 破裂后热—电磁—结构响应', start: 3, end: 10, owner: '工程', deliverable: '正常脉冲电磁力；给定 CQ / VDE / halo / 涡流历史的破裂电磁分支；给定 TQ / 表面能量沉积的瞬态传热分支（RE 仅在明确纳入时）；统一坐标与时基后形成可审计的单向热—电磁—结构响应', evidence: '力 / 力矩与能量映射守恒，网格和时间步敏感性通过工程负责人冻结的阈值；一期不宣称全耦合，也不把包络计算表述为破裂时刻预测', modules: ['engineering', 'integration'] },
      { id: 'P1-5', lane: '工作台', title: '模型编排、三维场与证据对比', start: 4, end: 11, owner: '平台 / HMI', deliverable: '位形—控制—工程—诊断同一 shot / run 时间轴与可追溯结果包', evidence: '浏览器只读；每个结果显示来源、保真度、适用域、不确定度和版本', modules: ['hmi', 'integration', 'ai'] },
      { id: 'P1-6', lane: '闭环验收', title: '历史炮回放、留出盲测与模型回写', start: 10, end: 12, owner: '物理 / 控制 / 工程 / 运行', deliverable: '代表性历史炮集、至少一组留出盲测、自动差异报告与新版本候选', evidence: '端到端 provenance 完整；四方评审签字；偏差回写而非覆盖原始证据', modules: ['physics', 'control', 'diagnostics', 'integration'] },
    ],
    gates: [
      { id: 'G0', at: 2, title: '范围与契约冻结', go: '装置、场景、数据、模型、坐标、时基、责任人与安全边界全部明确' },
      { id: 'G1', at: 4, title: 'as-shot 基线', go: '同一 shot 身份下完成原始数据、校准、重构与可重复回放' },
      { id: 'G2', at: 9, title: '虚拟控制', go: '批准的 MIL / SIL 测试矩阵通过；HIL 仅在真实硬件接入后成立' },
      { id: 'G3', at: 10, title: '工程载荷链', go: '正常与事故包络的载荷守恒、映射和数值敏感性证据齐备' },
      { id: 'G4', at: 12, title: '盲测发布', go: '留出数据未被人工调参污染；物理、控制、工程、运行共同评审' },
    ],
  },
  {
    id: 'phase-2',
    label: '二期 / PHASE II',
    device: 'EHL‑2',
    duration: '6 个月',
    axisLabel: '项目月 / MONTH',
    axisMax: 6,
    timeSemantics: 'inclusive-periods',
    thesis: '首等离子体虚拟调试 + 与控制网隔离的只读 shadow twin',
    promise: '在 EHL‑2 实际装置与调试配置基线受控后，完成低能量首等离子体场景的虚拟试验、控制与诊断联调、运行员演练和在线只读影子运行。',
    exclusions: [
      '不以 3 MA、17 MW NBI、6 MW ECRH 或高 Ti 设计终值验收 first plasma',
      '不承诺实时 3D 非线性 MHD；高保真计算只进入精选工况的离线证据工厂',
      'shadow twin 不替代独立保护、联锁或运行授权链',
      '六个月以 M1 已有代码负责人、可运行且经过基准测试的模型链、EHL‑2 装置描述 / 剖面假设和算力为入口；不具备时，非线性 MHD 与高功率加热降为拓展项',
    ],
    workPackages: [
      { id: 'P2-0', lane: '装置与计划', title: '实际配置基线、差异登记与 first-plasma 任务冻结', start: 1, end: 2, owner: '总体 / 调试', deliverable: '装置描述（Machine Description）、线圈 / 电源、真空室、诊断、执行器、联锁与 pulse schedule 基线', evidence: '实际调试配置与设计终值分离；变更可追溯且有重新验证触发条件', modules: ['data', 'integration'] },
      { id: 'P2-1', lane: '启动与控制', title: '真空场—击穿 / burn-through—成形等离子体控制', start: 1, end: 4, owner: '启动物理 / 控制', deliverable: '真空场 / null、线圈电路与真空室涡流模型；绑定实际投运预电离源的击穿 / burn-through 模型；成形后才进入自由边界、RZIP / ROM、合成传感器与 PCS replay', evidence: '低能量调试包络内完成 Ip 建立、R / Z 控制、传感器 / 执行器故障和安全终止；SIL 必过，HIL 取决于硬件可用性', modules: ['physics', 'control'] },
      { id: 'P2-2', lane: 'MHD', title: '按物理问题组织：平衡 / 剖面—线性响应—精选非线性', start: 2, end: 5, owner: 'MHD 物理', deliverable: '经批准的平衡 / 剖面基线；CHEASE 等预处理与 MARS‑F 等针对性线性响应；已有基准时才集成精选 JOREK / MHD@Dalian 离线案例', evidence: '每个问题、代码与适用域独立验收；RZIP 只作刚性等离子体控制模型，非线性结果不包装成实时预测', modules: ['physics', 'ai'] },
      { id: 'P2-3', lane: '启动源、加热与电流驱动', title: '实际预电离源优先，形成等离子体后评估 EC / NBI', start: 2, end: 5, owner: '启动 / 加热 / 输运', deliverable: '实际投运源的预电离、击穿与 burn-through 模型；形成等离子体后以 GENRAY+CQL3D 评估 EC 吸收 / 电流驱动，以 NUBEAM+ASTRA 作为高功率离线候选', evidence: '首等离子体按真实 commissioning configuration 验收；EC 不是默认假设，NBI 与高功率场景只作离线设计证据', modules: ['energy', 'auxiliary', 'physics'] },
      { id: 'P2-4', lane: '实时诊断', title: '控制关键 / 监测诊断分级与状态估计', start: 2, end: 5, owner: '诊断 / 数据', deliverable: '磁诊断、可见光及实际可用的密度诊断等首炮最小集；逐信号冻结采样、时延、对时、质量和降级预算，建立合成诊断', evidence: '控制关键与仅监测信号明确分级；缺测、漂移、标定和降级均可观测；原始数据不可变', modules: ['diagnostics', 'data'] },
      { id: 'P2-5', lane: '虚拟调试', title: '实时 plant emulator、SIL 与条件式 HIL', start: 3, end: 5, owner: '控制 / 工程 / 运行', deliverable: 'PCS SIL、故障注入、时序校验、操作员演练；控制器 HIL 与电源 / plant HIL 分开，并仅在相应硬件和 I/O 可用时交付', evidence: '实时系统与展示层隔离；保护链独立；缺少硬件不阻断 SIL / 实时仿真基线验收', modules: ['control', 'engineering', 'hmi'] },
      { id: 'P2-6', lane: '首炮战役', title: '虚拟 first-plasma campaign 与 readiness review', start: 5, end: 6, owner: '联合调试组', deliverable: '名义 + 选定故障 campaign、只读 shadow、运行手册与证据包', evidence: '配置、测试、已知偏差、回退与签字齐备；Go / No-Go 仍由正式组织决定', modules: ['integration', 'hmi', 'diagnostics'] },
    ],
    gates: [
      { id: 'G5', at: 1, title: '动员与入口条件', go: '模型 owner、可运行基线、EHL‑2 装置描述 / 剖面假设、算力、首炮目标与配置差异登记齐备' },
      { id: 'G6', at: 2, title: '配置与模型基线', go: '实际配置冻结；真空场、击穿 / burn-through、Ip / R / Z 场景与最小诊断、执行器、保护接口可追溯' },
      { id: 'G7', at: 4, title: '虚拟调试', go: 'SIL / 实时 plant emulator、诊断时延和故障矩阵通过；HIL 仅按可用硬件验收，shadow 始终只读' },
      { id: 'G8', at: 5, title: '集成演练', go: '名义与选定故障 campaign、运行员演练和回退流程完成' },
      { id: 'G9', at: 6, title: 'Readiness review', go: '开放项、适用域和不确定度透明；证据进入正式 Go / No-Go 评审输入' },
    ],
  },
];

export const digitalThread = [
  '实验目标与场景',
  '装置 / 配置基线',
  '位形与控制预演',
  '工程载荷核查',
  '实验执行',
  '原始与工程数据',
  '重构与诊断分析',
  'V&V / 残差',
  '模型版本更新',
] as const;

const moduleRoadmapRole: Record<KnowledgeModuleId, { phase1: string; phase2: string }> = {
  physics: { phase1: '平衡、位形、事故事件包', phase2: '启动、MHD、加热 / 输运' },
  engineering: { phase1: '电磁 / 热载荷与结构响应', phase2: 'as-built、电源与调试包络' },
  control: { phase1: 'PCS replay、MIL / SIL / HIL', phase2: 'first-plasma 虚拟调试' },
  diagnostics: { phase1: '标定、EFIT、质量和残差', phase2: '最小实时诊断与合成诊断' },
  energy: { phase1: '预留数据与接口合同', phase2: '功率沉积与能量平衡' },
  auxiliary: { phase1: '工程传感器与状态合同', phase2: 'EC / NBI、电源、真空与冷却' },
  hmi: { phase1: '跨域 shot / run 工作台', phase2: '运行员演练与 readiness 看板' },
  data: { phase1: 'IMAS、时序、对象与版本', phase2: 'as-built / as-tested 配置主线' },
  integration: { phase1: '接口、编排、V&V 与阶段门', phase2: '虚拟 campaign 和 shadow twin' },
  ai: { phase1: '证据助手与经验证代理模型', phase2: 'ROM / 异常候选；不直接控机' },
};

export const knowledgeModuleRoutes = knowledgeModules.map((module) => ({
  id: module.id,
  no: module.no,
  title: module.zh,
  route: module.href,
  ...moduleRoadmapRole[module.id],
}));

export const technologyDecisions = [
  { layer: '实验源数据', choice: 'MDSplus / 现有权威档案与配置日志', rationale: '不迁移或覆盖原始炮数据与获批 PCS 配置记录；以只读适配器接入，保留校准、质量与原始时间基准。', modules: ['诊断感知', '数据基座'] },
  { layer: '语义交换', choice: 'IMAS Data Dictionary + IMAS‑Python', rationale: '冻结 DD 版本与 machine mapping；IMAS 是跨模型语义层，不强迫所有工程信号套入不适配 IDS。', modules: ['物理模拟', '诊断感知', '数据基座'] },
  { layer: '工程与实时接入', choice: '边缘适配器 + EPICS PVA / OPC UA 类合同', rationale: '保留现有 PLC / 控制协议；平台侧只读，统一单位、时标、质量、资产 ID 与校准版本。', modules: ['工程仿真', '辅机模拟', '集成控制'] },
  { layer: '模型执行', choice: '容器化 adapter + HPC scheduler + immutable run manifest', rationale: '求解器留在受控计算域；输入、代码、容器、网格、配置与输出校验和形成可重放运行包。', modules: ['物理模拟', '工程仿真', '总体集成'] },
  { layer: '平衡与控制', choice: '认可 EFIT / PTEFIT 基线 + free-boundary / RZIP / ROM + SIL / HIL', rationale: '高保真用于预演和校核，降阶 plant 用于实时测试；每级各自声明适用域。', modules: ['物理模拟', '集成控制', '诊断感知'] },
  { layer: '工程分析', choice: '给定事故事件包 → EM / 热两分支 → 结构 / 热应力', rationale: '先实现可审计的单向映射；不把静态平衡、破裂热载荷和结构响应误写成简单串联，也不把给定包络写成破裂预测。', modules: ['工程仿真', '总体集成'] },
  { layer: 'EHL‑2 MHD', choice: '批准的平衡 / 剖面 + 问题专用线性响应 + 精选非线性案例', rationale: 'CHEASE 等服务于平衡 / 预处理，MARS‑F 等回答特定线性响应问题；JOREK / 本地非线性代码仅在已有基准时提供离线设计证据。RZIP 属于控制模型，不列作 MHD 层级；具体代码均为候选，须经许可与本地 V&V 冻结。', modules: ['物理模拟', '智能原生'] },
  { layer: 'EHL‑2 启动与加热', choice: '实际预电离源 / burn-through 模型；形成后 GENRAY+CQL3D；NUBEAM+ASTRA（候选）', rationale: '先区分击穿和成形后波吸收 / 电流驱动；EC 是否进入首炮主线服从实际投运系统，NBI 与高功率场景服从许可和本地验证。', modules: ['能量转化', '辅机模拟', '物理模拟'] },
  { layer: '产品与知识', choice: '对象存储 + 元数据 / 版本库 + Knowledge Graph + ECharts / 3D viewer', rationale: '图谱保存实体、关系和证据；大场数据留在对象存储；前端只编排和展示已版本化结果。', modules: ['数据基座', '人机交互', '总体集成', '智能原生'] },
] as const;

export const acceptanceDimensions = [
  { title: '可追溯', target: '100% 关键产物', detail: 'shot / run ID、输入 hash、代码 commit、容器、配置、几何、网格、求解器和输出版本齐全。' },
  { title: '可重复', target: '同输入同版本可重放', detail: '确定性差异有说明；原始、校准、派生和重构层不互相覆盖。' },
  { title: '可验证', target: '预测量必须有残差或边界标签', detail: '实验可观测量进入 V&V；不可观测结果明确标为设计推断，不用前端视觉替代证据。' },
  { title: '可降级', target: '控制与诊断故障矩阵通过', detail: '时延、丢包、偏置、执行器饱和和模型超域均有显式状态与安全回退。' },
  { title: '可治理', target: '每道阶段门有 owner 与签字', detail: '科学容差在 G0 / G5 由物理、控制、工程、诊断负责人冻结，页面不擅自定义。' },
] as const;

export const deanDecisions = [
  '批准 EXL‑50U 一期场景族、代表炮 / 留出集，并指定物理、控制、工程、诊断四位验收 owner。',
  '要求各团队共用装置、部件、shot、run、坐标、时间和版本标识；接口变更必须触发影响分析与复验。',
  '批准隔离的 PCS replay / SIL / HIL 与 HPC 证据工厂；展示网站、知识图谱和大模型永不直接获得控机权限。',
] as const;

export const roadmapSources = [
  { label: 'EXL‑50U：EFIT-mini、RZ-Ip 模拟器与千赫兹控制基线', url: 'https://conferences.iaea.org/event/392/papers/35644/files/13873-OV2999-EXL-50UOverview-YJShi.pdf' },
  { label: 'EHL‑2 官方装置与设计参数', url: 'https://en.ennresearch.com/researchfield/Compactfusion/EHL_2/' },
  { label: 'EHL‑2 物理设计综述（0D / 1.5D 设计目标）', url: 'https://pubs-en.cstam.org.cn/article/doi/10.1088/2058-6272/ad981a' },
  { label: 'EHL‑2 加热与电流驱动设计研究', url: 'https://pubs-en.cstam.org.cn/article/doi/10.1088/2058-6272/adae71' },
  { label: 'EHL‑2 MHD 初步评估与适用边界', url: 'https://pubs-en.cstam.org.cn/article/doi/10.1088/2058-6272/ada421?viewType=HTML' },
  { label: 'ITER：IMAS 基础设施与物理模型开源', url: 'https://www.iter.org/node/20687/release-imas-infrastructure-and-physics-models-open-source' },
  { label: 'IMAS‑Python：IDS、校验、重采样与 MDSplus', url: 'https://imas-python.readthedocs.io/en/latest/' },
  { label: 'IMAS Data Dictionary：pulse_schedule IDS', url: 'https://imas-data-dictionary.readthedocs.io/en/latest/generated/ids/pulse_schedule.html' },
  { label: 'EPICS 官方文档', url: 'https://docs.epics-controls.org/en/latest/' },
  { label: 'ITER CODAC Core System：实时框架、接口与隔离', url: 'https://www.iter.org/sites/default/files/media/2024-04/codac_core_system_overview_34sdz5_v7_3.pdf' },
  { label: 'EHL‑2 MHD / JOREK 预测研究', url: 'https://doi.org/10.1088/1741-4326/ae6790' },
  { label: 'EHL‑2 divertor configuration 研究', url: 'https://doi.org/10.1088/2058-6272/adadb8' },
] as const;
