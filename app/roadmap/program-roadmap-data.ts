import { knowledgeModules, type KnowledgeModuleId } from '../data/knowledge-modules';

export type PhaseId = 'phase-1' | 'phase-2';

export type ProgramPillarId = 'physics' | 'engineering' | 'control' | 'diagnostics' | 'data';

export type WorkPackageCommitment = '关键路径' | '条件式交付' | '拓展研究';

export type ProgramPillarRouteStep = {
  id: string;
  status: '现有基线' | '关键路径' | '条件式交付' | '拓展研究';
  phases: readonly PhaseId[];
  title: string;
  selection: string;
  boundary: string;
};

export type ProgramPillar = {
  id: ProgramPillarId;
  no: string;
  title: string;
  english: string;
  mission: string;
  physicsQuestion: string;
  phase1: string;
  phase2: string;
  inputs: readonly string[];
  outputs: readonly string[];
  verification: readonly string[];
  boundary: string;
  modules: readonly KnowledgeModuleId[];
  route: readonly ProgramPillarRouteStep[];
};

export type RoadmapWorkPackage = {
  id: string;
  lane: string;
  title: string;
  start: number;
  end: number;
  owner: string;
  deliverable: string;
  evidence: string;
  commitment: WorkPackageCommitment;
  gateIds: readonly string[];
  modules: readonly KnowledgeModuleId[];
  pillars: readonly ProgramPillarId[];
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

export const programPillars: ProgramPillar[] = [
  {
    id: 'physics',
    no: '01',
    title: '位形与等离子体物理',
    english: 'PLASMA PHYSICS',
    mission: '把实验任务转化为物理可达、可控制、可诊断的放电场景，并给出明确的适用域与不确定度。',
    physicsQuestion: '给定装置、电源和气体条件，真空场、击穿、电流建立、平衡边界及稳定性是否满足实验目标？',
    phase1: 'EXL‑50U：自由边界位形预演、线圈波形、合成磁诊断与 EFIT / PTEFIT as-shot 重构形成预测—实验—残差闭环。',
    phase2: 'EHL‑2：按真空场 / 涡流→实际预电离源的击穿与 burn-through→成形后自由边界控制推进；MHD 与加热按问题分层进入离线证据。',
    inputs: ['as-built 装置描述、PF / CS 与真空室电路', '目标 Iₚ、边界 / X 点与 pulse schedule', '气体、真空、预电离源和诊断几何', '经批准的平衡、剖面及材料 / 壁边界'],
    outputs: ['线圈电流 / 电压波形与可达域', 'ψ、LCFS、X 点、Iₚ / R / Z 及误差预算', '合成磁诊断与状态估计输入', 'MHD / 加热分析所需的受控平衡与剖面快照'],
    verification: ['磁通环 / 磁探针等观测通道残差；pre-shot 预测与 as-shot 重构的 LCFS / X 点差异；有独立诊断时再做边界交叉验证', '线圈—真空室电路与实测响应核对', '跨代码 benchmark、参数扫描与不确定度覆盖', '每个模型分别声明形成前 / 形成后及线性 / 非线性适用域'],
    boundary: 'RZIP 是刚性等离子体控制模型，不是 MHD 稳定性模型；静态平衡不预测破裂时刻；GENRAY+CQL3D 仅用于已形成等离子体后的波吸收 / 电流驱动。',
    modules: ['physics', 'diagnostics', 'energy', 'auxiliary'],
    route: [
      { id: 'PHY-1', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '装置电磁基线', selection: 'Machine Description + PF / CS 电路 + 真空室涡流模型，先完成真空场 / null-field 与线圈响应。', boundary: '装置几何、回路、坐标和电源限值未冻结前，不进入场景优化。' },
      { id: 'PHY-2', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '平衡与位形闭环', selection: '经验证的自由边界工作流承担 pre-shot 位形 / 线圈波形预演；独立冻结的 EFIT / PTEFIT 分支承担 as-shot 逆问题重构；二者仅通过统一 COCOS、时基、线圈定义、合成磁信号与残差比较闭合。', boundary: '预演、逆问题重构和实验观测必须分开标识，不能用视觉相似代替残差。' },
      { id: 'PHY-3', status: '关键路径', phases: ['phase-2'], title: '首等离子体启动链', selection: '真空场 / 涡流→实际投运预电离源的雪崩与 burn-through→成形后自由边界、RZIP / ROM。', boundary: 'EC 仅在实际 commissioning configuration 含 EC 时进入首炮主线。' },
      { id: 'PHY-4', status: '条件式交付', phases: ['phase-2'], title: 'MHD、加热与输运', selection: '批准平衡 / 剖面→问题专用线性响应；已有本地基准时再做精选非线性案例。形成后采用 GENRAY+CQL3D，NBI / 高功率仅作离线包络。', boundary: '不把离线高保真结果包装成实时预测，也不在六个月内承诺从零开发完整非线性链。' },
    ],
  },
  {
    id: 'engineering',
    no: '02',
    title: '电磁、热与结构工程',
    english: 'ENGINEERING SIMULATION',
    mission: '把正常放电和经批准的事故事件包转换为可守恒传递、可收敛验证的部件载荷与响应。',
    physicsQuestion: '给定电流、磁场和能量沉积历史，部件承受的力、力矩、温升、应力和裕量是否在批准包络内？',
    phase1: 'EXL‑50U：正常脉冲电磁力；事故电磁分支把 CQ / VDE / halo / 涡流历史映射至结构动力响应，热分支把 TQ / 表面能量沉积映射至温度场和热应力；统一几何与事件时基后做组合载荷审查。',
    phase2: 'EHL‑2：基于 as-built 几何、电源和调试包络建立首炮低能量工程核查，并为后续高功率离线设计保留接口。',
    inputs: ['版本化 CAD / 组件 ID、材料与边界条件', '线圈 / 等离子体 / 真空室电流和磁场历史', 'CQ、VDE、halo、TQ 与表面能量沉积包络', '冷却、支撑、接触和约束条件'],
    outputs: ['部件级 Lorentz 力、力矩与涡流', '瞬态温度、热流和能量平衡', '位移、应力、应变与工程裕量', '可回投三维工作台的网格场和审查报告'],
    verification: ['力 / 力矩与能量映射守恒', '网格、时间步和载荷映射敏感性', '解析解 / benchmark / 已有工程计算交叉核对', '材料、接触和事故包络不确定度显式报告'],
    boundary: '一期采用可审计的单向耦合，不宣称实时全耦合；事故载荷来自经批准的给定包络，不宣称预测破裂发生时刻或用于安全认证。',
    modules: ['engineering', 'integration', 'auxiliary'],
    route: [
      { id: 'ENG-1', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '几何与网格主线', selection: 'as-built CAD→稳定组件 ID→版本化分析几何 / 网格；所有载荷、传感器与结果回到同一坐标和部件身份。', boundary: '禁止以展示模型替代工程分析几何；每次几何变更触发影响分析。' },
      { id: 'ENG-2', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '电磁载荷', selection: '轴对称电路 / 涡流快速扫描 + 经验证的三维磁准静态有限元参考；正常脉冲与 CQ / VDE / halo 分开建模。', boundary: '具体商业或本地求解器在 G0 按许可、owner 和 benchmark 冻结，接口保持可替换。' },
      { id: 'ENG-3A', status: '关键路径', phases: ['phase-1'], title: '事故瞬态传热', selection: '一期将给定 TQ / 表面能量沉积、稳态损耗和冷却边界送入瞬态热分析；RE 仅在任务书明确纳入时建模。', boundary: '热载荷与电磁载荷是并行来源，不从静态平衡直接派生。' },
      { id: 'ENG-3B', status: '关键路径', phases: ['phase-2'], title: '首炮低能量温升核查', selection: '按实际 commissioning 电流 / 功率历史快速核查线圈、电源、真空室与关键部件的 Joule 损耗、低能量温升和冷却边界。', boundary: '这是 first-plasma 工程 readiness 的快速核查，不等同于高功率 PFC 或破裂热载荷分析。' },
      { id: 'ENG-3C', status: '拓展研究', phases: ['phase-2'], title: '高功率表面热流', selection: '在真实功率源、沉积模型和材料边界具备后，再开展高功率 PFC、TQ / RE 表面热流和详细瞬态热有限元。', boundary: '不属于六个月 first-plasma readiness 必过项。' },
      { id: 'ENG-4', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '结构响应与裕量', selection: '守恒载荷映射→结构 / 热应力有限元→关键部件裕量；保留与传感器应变 / 温度的实验校核接口。', boundary: '只有经独立工程复核、收敛和材料不确定度评审的结果才能进入阶段门。' },
    ],
  },
  {
    id: 'control',
    no: '03',
    title: '集成控制与虚拟调试',
    english: 'INTEGRATED CONTROL',
    mission: '用分层 plant、同源控制代码和故障注入证明控制策略在执行器、实时和安全边界内可运行。',
    physicsQuestion: '控制器面对线圈 / 电源动态、等离子体响应、传感器误差和网络时延时，能否稳定跟踪并按规定降级或终止？',
    phase1: 'EXL‑50U：PCS replay、RZIP / ROM plant、MIL→SIL，具备真实控制硬件时再进入 HIL，覆盖 Ip / R / Z / 位形和故障矩阵。',
    phase2: 'EHL‑2：实时 plant emulator 与 SIL 为关键路径；控制器 HIL、电源 / plant HIL 仅在相应硬件和 I/O 可用时分级交付，随后完成 dry-run、操作员演练和与控制网隔离的只读 shadow。',
    inputs: ['pulse schedule、目标 Iₚ / R / Z 与线圈约束', '电源、回路、涡流与 RZIP / ROM plant', '传感器响应、噪声、标定、丢包与时延', '控制代码、配置、周期和独立保护接口'],
    outputs: ['可审计的控制波形与状态转换', '跟踪误差、稳定裕量和执行器利用率', 'WCET / jitter、故障矩阵和安全终止证据', 'SIL / HIL / dry-run / shadow 运行包'],
    verification: ['控制代码与配置在 replay / SIL / HIL 保持同源', '固定步长实时仿真与 deadline / jitter 统计', '限幅、抗饱和、偏置、掉线与故障升级测试', '独立联锁不依赖网页、云服务、KG 或 LLM'],
    boundary: '浏览器、知识图谱和大模型永远没有控机写通道；HIL 只有在相应控制器、I/O、电源和诊断模拟硬件可用后才成立。',
    modules: ['control', 'hmi', 'integration', 'ai'],
    route: [
      { id: 'CTL-1', status: '关键路径', phases: ['phase-1', 'phase-2'], title: 'PCS 回放与场景接口', selection: '冻结 pulse schedule、控制代码 / 配置和 signal contract；历史炮与合成信号走同一 replay 接口；以内部可运行版本、I/O 合同、历史炮回放记录和责任 owner 作为基线证据。', boundary: '批准配置记录保持只读，不由平台覆盖；基线证据不齐时不得宣称现成能力。' },
      { id: 'CTL-2', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '分层 plant', selection: '电源 / 回路 / 真空室涡流 + 刚性等离子体 RZIP / 状态空间 / ROM + 传感器与执行器模型。', boundary: '降阶 plant 只在校准适用域内承担实时测试，不替代高保真物理。' },
      { id: 'CTL-3', status: '关键路径', phases: ['phase-1', 'phase-2'], title: 'MIL→SIL 与故障矩阵', selection: '同一控制算法逐级进入离线模型、生产代码 replay 和固定步长实时模拟；注入饱和、偏置、掉线、延迟和异常终止。', boundary: '达到限值本身可为测试条件；验收关注限幅、抗饱和和安全态是否正确。' },
      { id: 'CTL-4', status: '条件式交付', phases: ['phase-1', 'phase-2'], title: '条件式 HIL 与 shadow', selection: '一期在控制器硬件可用时做 controller-HIL；二期再将电源 / plant HIL 分开建设，完成 machine-disconnected dry-run 后仅进行在线只读影子评估。', boundary: '任何未来机器执行必须另走经过工程设计与认可的 PCS 授权路径。' },
    ],
  },
  {
    id: 'diagnostics',
    no: '04',
    title: '诊断感知与状态重构',
    english: 'DIAGNOSTICS & SENSING',
    mission: '把仪器响应、校准、时钟和质量状态纳入模型链，使实验观测能够验证预测而不是只作为画面。',
    physicsQuestion: '哪些物理量可由现有诊断在规定时间、空间和不确定度内观测，缺测或漂移时系统如何显式降级？',
    phase1: 'EXL‑50U：精选磁诊断、线圈 / 电源和相关诊断完成原始—校准—重构链，形成 EFIT / PTEFIT 残差与 IMAS 子集。',
    phase2: 'EHL‑2：按控制关键、监测和后续性能诊断分级，先建设磁测、可见光及实际可用密度诊断的合成与实时质量链。',
    inputs: ['原始波形、采样时钟与触发事件', '传感器几何、仪器响应和校准版本', '合成诊断 truth 与噪声 / 饱和 / 缺数模型', '诊断可用性、时延和控制周期预算'],
    outputs: ['带单位、质量和不确定度的校准信号', '磁通、LCFS、X 点、Iₚ / R / Z 等重构量', '控制关键的状态量与显式降级标志', '预测—观测—重构残差和诊断健康报告'],
    verification: ['校准台账、时钟对齐和几何测量证据', 'synthetic→reconstruction 闭环与真值偏差', '留出炮重放、交叉诊断一致性和不确定度覆盖', '逐信号 latency / jitter / availability / fallback 验收'],
    boundary: '合成信号必须独立命名并保留 truth lineage；监测诊断不能因页面实时刷新就被称为控制实时诊断。',
    modules: ['diagnostics', 'physics', 'data', 'control'],
    route: [
      { id: 'DIA-1', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '事实源与校准', selection: 'MDSplus / 权威采集→不可变原始层→版本化校准、时钟和几何；每帧带质量与缺测状态。', boundary: '原始数据不被清洗结果覆盖，校准更新产生新版本。' },
      { id: 'DIA-2', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '重构与残差', selection: '磁诊断 / 线圈信号→认可 EFIT / PTEFIT→平衡、边界和残差；与预演采用同一坐标 / 时基合同。', boundary: '诊断重构是带模型假设的估计，不等同于直接测量。' },
      { id: 'DIA-3', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '合成诊断', selection: '一期先闭合磁诊断几何 / 响应 / 噪声；二期扩展漂移、饱和、时延和首炮仪器链，把物理 truth 转为可供 PCS / 推断链测试的信号。', boundary: '合成数据不得混入实验命名空间，也不能替代真实标定。' },
      { id: 'DIA-4', status: '关键路径', phases: ['phase-2'], title: '首炮最小实时集', selection: '优先磁测、线圈 / 电源、真空、宽视场可见光及实际就绪的密度诊断；逐信号冻结控制关键 / 仅监测等级。', boundary: '未实测 latency、availability 和 fallback 的诊断不升级为控制输入。' },
    ],
  },
  {
    id: 'data',
    no: '05',
    title: '数据、模型与证据基础设施',
    english: 'DATA & MODEL INFRASTRUCTURE',
    mission: '用统一身份、语义、版本和运行清单连接四条专业链，保证每个结论可重放、可比较、可审计。',
    physicsQuestion: '同一 shot / run、装置配置、坐标、时基和模型版本能否贯穿预测、控制测试、实验、重构和工程分析？',
    phase1: 'EXL‑50U：冻结 shot / run / geometry / calibration / model 身份，建立 MDSplus 事实源、IMAS 语义交换、工程资产合同和不可变 run manifest。',
    phase2: 'EHL‑2：维护 as-designed / as-built / as-tested 配置差异，支撑虚拟 campaign、实时数据质量、模型适用域和 shadow twin 证据。',
    inputs: ['原始炮数据、工程时序与批准配置', 'IMAS IDS、工程资产和接口字典', '模型代码、容器、配置、网格和求解日志', '论文、模型卡、V&V 与阶段门审批证据'],
    outputs: ['统一 shot / run / asset / geometry / timebase 标识', '可重放 run manifest 与对象校验和', '跨模型数据契约、版本迁移和 lineage', 'Knowledge Graph 证据关系与只读 API / 可视化'],
    verification: ['schema、单位、坐标和校验和自动门禁', '同输入 / 版本可重放及迁移回归测试', '输入—运行—输出—审批 provenance 覆盖', '权限、审计、保留期和受控计算域边界检查'],
    boundary: 'IMAS 是聚变物理语义交换层，不替代原始档案，也不强迫全部工程信号进入不适配 IDS；KG 保存关系与证据索引，不存大场数据。',
    modules: ['data', 'integration', 'hmi', 'ai'],
    route: [
      { id: 'DAT-1', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '身份与事实层', selection: 'MDSplus / 权威档案保持不可变；统一 shot、run、事件、装置 / 几何、坐标、时间和校准 ID。', boundary: '任何派生结果不得覆盖 L0 原始事实。' },
      { id: 'DAT-2', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '语义与存储层', selection: 'IMAS DD + IMAS‑Python 承载聚变语义；工程资产 / 时序采用独立合同；大对象进入内容寻址存储。', boundary: '冻结 DD 与 machine mapping 版本，并提供显式迁移测试。' },
      { id: 'DAT-3', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '模型执行与 V&V', selection: '容器化 adapter + HPC scheduler + immutable run manifest + 模型卡 / 适用域 / 验证状态。', boundary: '求解器留在受控计算域，网页只读取版本化结果。' },
      { id: 'DAT-4', status: '关键路径', phases: ['phase-1', 'phase-2'], title: '知识与决策界面', selection: '一期交付 shot / run 工作台与证据对比，二期扩展虚拟 campaign / shadow；KG 管实体 / 关系 / 证据，ECharts / 3D 管比较与追溯。', boundary: '前端联动不等于模型科学耦合，LLM 不生成物理或安全判据。' },
    ],
  },
];

export type ProgramSupportNodeId = ProgramPillarId | 'mission' | 'integration' | 'phase-1-goal' | 'phase-2-goal' | 'long-term-goal';

export type ProgramSupportLink = {
  source: ProgramSupportNodeId;
  target: ProgramSupportNodeId;
  payload: string;
  kind: 'input' | 'foundation' | 'coupling' | 'evidence' | 'goal';
};

export const programSupportLinks: ProgramSupportLink[] = [
  ...programPillars.map((pillar): ProgramSupportLink => ({ source: 'mission', target: pillar.id, payload: '装置 / 场景约束', kind: 'input' })),
  { source: 'data', target: 'physics', payload: '统一身份、坐标、时基、版本与运行清单', kind: 'foundation' },
  { source: 'data', target: 'engineering', payload: '统一身份、坐标、时基、版本与运行清单', kind: 'foundation' },
  { source: 'data', target: 'control', payload: '统一身份、坐标、时基、版本与运行清单', kind: 'foundation' },
  { source: 'data', target: 'diagnostics', payload: '统一身份、坐标、时基、版本与运行清单', kind: 'foundation' },
  { source: 'physics', target: 'control', payload: '平衡、响应模型与合成磁诊断', kind: 'coupling' },
  { source: 'physics', target: 'engineering', payload: '几何、电流 / 磁场与给定事件历史', kind: 'coupling' },
  { source: 'diagnostics', target: 'physics', payload: '校准观测、重构约束与残差', kind: 'coupling' },
  { source: 'diagnostics', target: 'control', payload: '状态、质量、staleness 与时延', kind: 'coupling' },
  { source: 'physics', target: 'integration', payload: '平衡、场景、响应与适用域', kind: 'evidence' },
  { source: 'engineering', target: 'integration', payload: '载荷、响应、收敛与裕量', kind: 'evidence' },
  { source: 'control', target: 'integration', payload: '时序、实时预算与故障矩阵', kind: 'evidence' },
  { source: 'diagnostics', target: 'integration', payload: '观测、质量、重构与残差', kind: 'evidence' },
  { source: 'data', target: 'integration', payload: '身份、版本、运行清单与审批证据', kind: 'evidence' },
  { source: 'integration', target: 'phase-1-goal', payload: 'G0–G4 证据门', kind: 'goal' },
  { source: 'integration', target: 'phase-2-goal', payload: 'G5–G9 证据门', kind: 'goal' },
  { source: 'phase-1-goal', target: 'long-term-goal', payload: '闭环复用与 EXL‑50U 数据校准', kind: 'goal' },
  { source: 'phase-2-goal', target: 'long-term-goal', payload: '虚拟调试与 EHL‑2 实验校准', kind: 'goal' },
];

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
      { id: 'P1-0', lane: '总体与 V&V', title: '场景族、坐标、时基与验收基线', start: 1, end: 2, owner: '总体 / 各域负责人', deliverable: 'Machine Description、场景清单、模型卡、接口控制文件与 V&V 矩阵', evidence: '关键输入均有 owner；坐标、单位、时间、版本和权限边界签字冻结', commitment: '关键路径', gateIds: ['G0'], modules: ['data', 'integration'], pillars: ['data'] },
      { id: 'P1-1', lane: '数据与诊断', title: '原始炮数据、工程传感器与 IMAS 子集', start: 1, end: 8, owner: '数据 / 诊断', deliverable: '原始—校准—派生—重构四层数据链；精选 IDS 映射与质量标记', evidence: '关键通道元数据、校准、质量、血缘和校验和完整；无静默单位转换', commitment: '关键路径', gateIds: ['G0', 'G1', 'G4'], modules: ['diagnostics', 'data'], pillars: ['diagnostics', 'data'] },
      { id: 'P1-2', lane: '位形物理', title: '预实验平衡、线圈波形与 as-shot 重构', start: 1, end: 7, owner: '物理 / 诊断', deliverable: '经验证的自由边界工作流完成 pre-shot 位形 / 线圈波形预演；独立 EFIT / PTEFIT 分支完成 as-shot 逆问题重构，并以合成磁诊断和残差报告闭合', evidence: '留出炮自动回放；磁测残差及预测—重构的 LCFS / X 点差异按批准容差评审', commitment: '关键路径', gateIds: ['G1', 'G4'], modules: ['physics', 'diagnostics'], pillars: ['physics', 'diagnostics'] },
      { id: 'P1-3', lane: '控制验证', title: 'PCS 回放、RZIP / ROM、MIL→SIL（HIL 条件式）', start: 3, end: 9, owner: '控制', deliverable: 'Ip / R / Z 与位形控制测试台；饱和、偏置、丢包、时延和异常终止用例', evidence: '批准测试矩阵通过；限幅、抗饱和、故障升级和安全终止符合要求；具备硬件时才声明 HIL', commitment: '关键路径', gateIds: ['G2', 'G4'], modules: ['control', 'hmi'], pillars: ['control', 'physics'] },
      { id: 'P1-4', lane: '工程载荷', title: '正常脉冲与给定事故包络：电磁 / 热并行分支与部件响应', start: 3, end: 10, owner: '工程', deliverable: '正常脉冲电磁力；CQ / VDE / halo / 涡流历史产生电磁力并映射至结构动力响应；TQ / 表面能量沉积产生温度场并映射至热应力（RE 仅在明确纳入时）；统一几何与事件时基后进入组合载荷审查', evidence: '力 / 力矩与能量映射守恒，网格和时间步敏感性通过工程负责人冻结的阈值；一期不宣称全耦合，也不把包络计算表述为破裂时刻预测', commitment: '关键路径', gateIds: ['G3', 'G4'], modules: ['engineering', 'integration'], pillars: ['engineering', 'physics'] },
      { id: 'P1-5', lane: '工作台', title: '模型编排、三维场与证据对比', start: 4, end: 11, owner: '平台 / HMI', deliverable: '位形—控制—工程—诊断同一 shot / run 时间轴与可追溯结果包', evidence: '浏览器只读；每个结果显示来源、保真度、适用域、不确定度和版本', commitment: '关键路径', gateIds: ['G4'], modules: ['hmi', 'integration', 'ai'], pillars: ['data'] },
      { id: 'P1-6', lane: '闭环验收', title: '历史炮回放、留出盲测与模型回写', start: 10, end: 12, owner: '物理 / 控制 / 工程 / 诊断 / 运行', deliverable: '代表性历史炮集、至少一组留出盲测、自动差异报告与新版本候选', evidence: '端到端 provenance 完整；物理、控制、工程、诊断、运行五方评审签字；偏差回写而非覆盖原始证据', commitment: '关键路径', gateIds: ['G4'], modules: ['physics', 'control', 'diagnostics', 'integration'], pillars: ['physics', 'engineering', 'control', 'diagnostics', 'data'] },
    ],
    gates: [
      { id: 'G0', at: 2, title: '范围与契约冻结', go: '装置、场景、数据、模型、坐标、时基、责任人与安全边界全部明确' },
      { id: 'G1', at: 4, title: 'as-shot 基线', go: '同一 shot 身份下完成原始数据、校准、重构与可重复回放' },
      { id: 'G2', at: 9, title: '虚拟控制', go: '批准的 MIL / SIL 测试矩阵通过；HIL 仅在真实硬件接入后成立' },
      { id: 'G3', at: 10, title: '工程载荷链', go: '正常与事故包络的载荷守恒、映射和数值敏感性证据齐备' },
      { id: 'G4', at: 12, title: '盲测发布', go: '留出数据未被人工调参污染；物理、控制、工程、诊断、运行共同评审' },
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
      { id: 'P2-0', lane: '装置与工程基线', title: '实际配置、工程核查与 first-plasma 任务冻结', start: 1, end: 2, owner: '总体 / 工程 / 调试', deliverable: '装置描述（Machine Description）、as-built 线圈 / 电源 / 真空室与被动结构电路—涡流基线、诊断 / 执行器 / 联锁和 pulse schedule；commissioning 电流包络的力 / 温升快速核查', evidence: '实际调试配置与设计终值分离；无等离子体 dry-run 和工程传感器用于线圈—真空室响应校核；变更触发重新验证', commitment: '关键路径', gateIds: ['G5', 'G6'], modules: ['engineering', 'data', 'integration'], pillars: ['engineering', 'data'] },
      { id: 'P2-1', lane: '启动与控制', title: '真空场—击穿 / burn-through—成形等离子体控制', start: 1, end: 4, owner: '启动物理 / 控制', deliverable: '真空场 / null、线圈电路与真空室涡流模型；绑定实际投运预电离源的击穿 / burn-through 模型；成形后才进入自由边界、RZIP / ROM、合成传感器与 PCS replay', evidence: '低能量调试包络内完成 Ip 建立、R / Z 控制、传感器 / 执行器故障和安全终止；SIL 必过，HIL 取决于硬件可用性', commitment: '关键路径', gateIds: ['G6', 'G7', 'G9'], modules: ['physics', 'control'], pillars: ['physics', 'control'] },
      { id: 'P2-2', lane: 'MHD', title: '按物理问题组织：平衡 / 剖面—线性响应—精选非线性', start: 2, end: 5, owner: 'MHD 物理', deliverable: '经批准的平衡 / 剖面基线；CHEASE 等预处理与 MARS‑F 等针对性线性响应；已有基准时才集成精选 JOREK / MHD@Dalian 离线案例', evidence: '每个问题、代码与适用域独立验收；RZIP 只作刚性等离子体控制模型，非线性结果不包装成实时预测', commitment: '条件式交付', gateIds: [], modules: ['physics', 'ai'], pillars: ['physics'] },
      { id: 'P2-3', lane: '加热与电流驱动', title: '成形等离子体后的条件式 EC / NBI 评估', start: 2, end: 5, owner: '加热 / 输运', deliverable: '仅在等离子体形成后，以 GENRAY+CQL3D 评估 EC 吸收 / 电流驱动；NUBEAM+ASTRA 作为高功率离线候选。预电离、击穿与 burn-through 已由 P2-1 关键路径承担', evidence: '不参与 G6 首炮启动基线验收；EC 不是默认假设，NBI 与高功率场景只作离线设计证据', commitment: '条件式交付', gateIds: [], modules: ['energy', 'auxiliary', 'physics'], pillars: ['physics'] },
      { id: 'P2-4', lane: '实时诊断', title: '控制关键 / 监测诊断分级与状态估计', start: 2, end: 5, owner: '诊断 / 数据', deliverable: '磁诊断、可见光及实际可用的密度诊断等首炮最小集；逐信号冻结采样、时延、对时、质量和降级预算，建立合成诊断', evidence: '控制关键与仅监测信号明确分级；缺测、漂移、标定和降级均可观测；原始数据不可变', commitment: '关键路径', gateIds: ['G6', 'G7', 'G9'], modules: ['diagnostics', 'data'], pillars: ['diagnostics', 'data'] },
      { id: 'P2-5', lane: '虚拟调试', title: '实时 plant emulator、SIL 与条件式 HIL', start: 3, end: 5, owner: '控制 / 工程 / 运行', deliverable: 'PCS SIL、故障注入、时序校验、操作员演练；控制器 HIL 与电源 / plant HIL 分开，并仅在相应硬件和 I/O 可用时交付', evidence: '实时系统与展示层隔离；保护链独立；缺少硬件不阻断 SIL / 实时仿真基线验收', commitment: '关键路径', gateIds: ['G7', 'G8'], modules: ['control', 'engineering', 'hmi'], pillars: ['control', 'engineering'] },
      { id: 'P2-6', lane: '首炮战役', title: '虚拟 first-plasma campaign 与 readiness review', start: 5, end: 6, owner: '联合调试组', deliverable: '名义 + 选定故障 campaign、只读 shadow、运行手册与证据包', evidence: '配置、测试、已知偏差、回退与签字齐备；Go / No-Go 仍由正式组织决定', commitment: '关键路径', gateIds: ['G8', 'G9'], modules: ['integration', 'hmi', 'diagnostics'], pillars: ['physics', 'engineering', 'control', 'diagnostics', 'data'] },
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
  control: { phase1: 'PCS replay、MIL / SIL；硬件可用时再做 controller-HIL', phase2: '实时 plant emulator 与 first-plasma 虚拟调试；HIL 条件式交付' },
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

type TechnologyDecision = {
  layer: string;
  choice: string;
  rationale: string;
  modules: readonly KnowledgeModuleId[];
};

export const technologyDecisions: readonly TechnologyDecision[] = [
  { layer: '实验源数据', choice: 'MDSplus / 现有权威档案与配置日志', rationale: '不迁移或覆盖原始炮数据与获批 PCS 配置记录；以只读适配器接入，保留校准、质量与原始时间基准。', modules: ['diagnostics', 'data'] },
  { layer: '语义交换', choice: 'IMAS Data Dictionary + IMAS‑Python', rationale: '冻结 DD 版本与 machine mapping；IMAS 是跨模型语义层，不强迫所有工程信号套入不适配 IDS。', modules: ['physics', 'diagnostics', 'data'] },
  { layer: '工程与实时接入', choice: '边缘适配器 + EPICS PVA / OPC UA 类合同', rationale: '保留现有 PLC / 控制协议；平台侧只读，统一单位、时标、质量、资产 ID 与校准版本。EPICS PVA / OPC UA 仅用于监督、慢控或平台侧只读接入，不假定承担控制关键硬实时回路；硬实时继续使用装置原生 PCS 接口。', modules: ['engineering', 'auxiliary', 'control'] },
  { layer: '模型执行', choice: '容器化 adapter + HPC scheduler + immutable run manifest', rationale: '求解器留在受控计算域；输入、代码、容器、网格、配置与输出校验和形成可重放运行包。', modules: ['physics', 'engineering', 'integration'] },
  { layer: '平衡与控制', choice: 'pre-shot 自由边界场景工作流 + 独立 EFIT / PTEFIT as-shot 逆问题重构 + RZIP / ROM 实时 plant + SIL / 条件式 HIL', rationale: '前向预演、逆问题重构和实时 plant 分工明确；每级各自声明数据来源、适用域和 V&V 证据。', modules: ['physics', 'control', 'diagnostics'] },
  { layer: '工程分析', choice: '给定事故事件包 → EM / 热两分支 → 结构 / 热应力', rationale: '先实现可审计的单向映射；不把静态平衡、破裂热载荷和结构响应误写成简单串联，也不把给定包络写成破裂预测。', modules: ['engineering', 'integration'] },
  { layer: 'EHL‑2 MHD', choice: '批准的平衡 / 剖面 + 问题专用线性响应 + 精选非线性案例', rationale: 'CHEASE 等服务于平衡 / 预处理，MARS‑F 等回答特定线性响应问题；JOREK / 本地非线性代码仅在已有基准时提供离线设计证据。RZIP 属于控制模型，不列作 MHD 层级；具体代码均为候选，须经许可与本地 V&V 冻结。', modules: ['physics', 'ai'] },
  { layer: 'EHL‑2 启动与加热', choice: '实际预电离源 / burn-through 模型；形成后 GENRAY+CQL3D；NUBEAM+ASTRA（候选）', rationale: '先区分击穿和成形后波吸收 / 电流驱动；EC 是否进入首炮主线服从实际投运系统，NBI 与高功率场景服从许可和本地验证。', modules: ['energy', 'auxiliary', 'physics'] },
  { layer: '产品与知识', choice: '对象存储 + 元数据 / 版本库 + Knowledge Graph + ECharts / 3D viewer', rationale: '图谱保存实体、关系和证据；大场数据留在对象存储；前端只编排和展示已版本化结果。', modules: ['data', 'hmi', 'integration', 'ai'] },
];

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
