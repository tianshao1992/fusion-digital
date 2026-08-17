import type { KnowledgeModuleId } from '../data/knowledge-modules';
import type { PhaseId, ProgramPillarId } from './program-roadmap-data';

export type ProgramToolRole =
  | 'fact-archive'
  | 'semantic-exchange'
  | 'pre-shot-forward'
  | 'as-shot-inverse'
  | 'realtime-plant'
  | 'offline-hi-fi'
  | 'synthetic-diagnostic'
  | 'control-test'
  | 'supervisory-readonly'
  | 'engineering-solver'
  | 'vvuq'
  | 'evidence-ui';

export type ProgramToolMaturity = '已验证基线' | '需本地 Benchmark' | '条件式候选' | '拓展研究';
export type ProgramRouteStatus = '现有基线' | '关键路径' | '条件式交付' | '拓展研究';

export type PillarCoverageNode = {
  id: string;
  label: string;
  description: string;
  terms: readonly string[];
  phases: readonly PhaseId[];
  order: number;
};

export type PillarToolNode = {
  id: string;
  label: string;
  fullName: string;
  role: ProgramToolRole;
  maturity: ProgramToolMaturity;
  phases: readonly PhaseId[];
  coverageIds: readonly string[];
  moduleIds: readonly KnowledgeModuleId[];
  inputs: readonly string[];
  outputs: readonly string[];
  evidence: string;
  boundary: string;
  order: number;
};

export type PillarRouteDelivery = {
  phase: PhaseId;
  outcome: string;
  workPackageIds: readonly string[];
  gateIds: readonly string[];
};

export type PillarTechnicalRoute = {
  id: string;
  title: string;
  detail: string;
  status: ProgramRouteStatus;
  phases: readonly PhaseId[];
  coverageIds: readonly string[];
  toolIds: readonly string[];
  deliveries: readonly PillarRouteDelivery[];
  boundary: string;
  order: number;
};

export type ProgramPillarRouteMap = {
  pillarId: ProgramPillarId;
  coverage: readonly PillarCoverageNode[];
  tools: readonly PillarToolNode[];
  routes: readonly PillarTechnicalRoute[];
};

const both = ['phase-1', 'phase-2'] as const;

export const programPillarRouteMaps: Record<ProgramPillarId, ProgramPillarRouteMap> = {
  physics: {
    pillarId: 'physics',
    coverage: [
      { id: 'PHY-O1', label: '装置电磁与自由边界', description: '以 as-built PF/CS、真空室、回路方向和电源限值求真空场、null-field、涡流响应与自由边界可达域。', terms: ['Grad–Shafranov', 'free boundary', 'PF/CS', 'passive structure', 'COCOS'], phases: both, order: 1 },
      { id: 'PHY-O2', label: 'as-shot 平衡重构', description: '把磁探针、磁通环、Rogowski 与线圈电流作为逆问题约束，重构 ψ、LCFS、X 点及观测残差。', terms: ['inverse equilibrium', 'LCFS', 'X-point', 'magnetic residual'], phases: both, order: 2 },
      { id: 'PHY-O3', label: '击穿与电流建立', description: '按实际 commissioning configuration 串联 null-field、预电离、雪崩、辐射势垒、burn-through 与 Iₚ 建立。', terms: ['Townsend avalanche', 'burn-through', 'loop voltage', 'radiation barrier'], phases: ['phase-2'], order: 3 },
      { id: 'PHY-O4', label: 'MHD、H&CD 与输运', description: '从批准平衡与剖面出发，按问题选择线性响应、精选非线性 MHD，以及成形后的 EC/NBI/输运离线研究。', terms: ['RWM/RMP', 'VDE/NTM', 'nonlinear MHD', 'ECCD', 'fast ion'], phases: ['phase-2'], order: 4 },
    ],
    tools: [
      { id: 'PHY-T1', label: '自由边界工作流', fullName: 'FreeGSNKE / FIESTA / TokaMaker（候选）', role: 'pre-shot-forward', maturity: '需本地 Benchmark', phases: both, coverageIds: ['PHY-O1'], moduleIds: ['physics', 'control'], inputs: ['Machine Description', 'PF/CS 与被动结构电路', '目标边界与电源约束'], outputs: ['pre-shot 平衡', '线圈波形', '位形可达域'], evidence: '真空场、线圈—真空室响应、跨代码与历史炮基准。', boundary: '这是实验前正问题，不是观测，也不预测三维 MHD 或破裂时刻。', order: 1 },
      { id: 'PHY-T2', label: 'EFIT / PTEFIT', fullName: 'EFIT / PTEFIT as-shot inverse reconstruction', role: 'as-shot-inverse', maturity: '已验证基线', phases: both, coverageIds: ['PHY-O2'], moduleIds: ['physics', 'diagnostics'], inputs: ['校准磁测', '线圈电流', '诊断几何与响应矩阵'], outputs: ['ψ / LCFS / X 点', 'Iₚ / R / Z', '逐通道残差'], evidence: 'EXL‑50U 历史炮回放、留出炮及观测残差。', boundary: '快速推理不自动等同端到端 PCS 实时性；内部 q/压力剖面仍受先验和诊断约束。', order: 2 },
      { id: 'PHY-T3', label: '启动与控制 plant', fullName: 'DINA / MEQ + RZIP / ROM（分层候选）', role: 'realtime-plant', maturity: '需本地 Benchmark', phases: both, coverageIds: ['PHY-O1', 'PHY-O3'], moduleIds: ['physics', 'control'], inputs: ['回路与涡流', '气体/预电离条件', '工作点平衡'], outputs: ['轴对称启动场景', '刚性位置响应', '控制工作点'], evidence: '回路 dry-run、历史炮响应与固定步长闭环测试。', boundary: 'RZIP 是刚性等离子体控制模型，不是 MHD；击穿模型必须绑定真实预电离源。', order: 3 },
      { id: 'PHY-T4', label: '稳定性分层链', fullName: 'CHEASE / HELENA → MARS-F → JOREK / M3D-C1', role: 'offline-hi-fi', maturity: '条件式候选', phases: ['phase-2'], coverageIds: ['PHY-O4'], moduleIds: ['physics', 'ai'], inputs: ['批准平衡/剖面', '壁与旋转', '扰动谱与工况'], outputs: ['问题专用线性响应', '精选非线性演化', '适用域/UQ'], evidence: '问题级 benchmark、跨代码比较与本地 owner 评审。', boundary: 'CHEASE/HELENA 是平衡预处理；MARS-F/JOREK 不代表全部 MHD，且不进入首炮实时门链。', order: 4 },
      { id: 'PHY-T5', label: '成形后 H&CD', fullName: 'GENRAY+CQL3D；NUBEAM+ASTRA / TRANSP（候选）', role: 'offline-hi-fi', maturity: '拓展研究', phases: ['phase-2'], coverageIds: ['PHY-O4'], moduleIds: ['physics', 'energy', 'auxiliary'], inputs: ['已形成等离子体平衡', 'nₑ/Tₑ 剖面', '波束/天线与功率'], outputs: ['吸收与沉积', '电流驱动', '快离子源与输运响应'], evidence: '功率账本、跨代码与形成后实验诊断比较。', boundary: 'GENRAY+CQL3D 不替代击穿/burn-through；NBI 与高功率不是 first-plasma 必过项。', order: 5 },
    ],
    routes: [
      { id: 'PHY-R1', title: '装置—回路—自由边界预演', detail: '冻结 COCOS、几何、PF/CS/真空室电路与电源边界，完成真空场、涡流响应、pre-shot 平衡与线圈波形。', status: '关键路径', phases: both, coverageIds: ['PHY-O1'], toolIds: ['PHY-T1', 'PHY-T3'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U 位形和线圈波形预实验包', workPackageIds: ['P1-0', 'P1-2'], gateIds: ['G0', 'G1', 'G4'] }, { phase: 'phase-2', outcome: 'EHL‑2 as-built 真空场与启动前电磁基线', workPackageIds: ['P2-0', 'P2-1'], gateIds: ['G5', 'G6'] }], boundary: '装置/坐标/电路未冻结时不进入优化。', order: 1 },
      { id: 'PHY-R2', title: '合成磁测—逆重构—残差闭环', detail: '从前向平衡生成带几何/响应/噪声的合成磁信号；EFIT/PTEFIT 独立逆重构，并以观测残差和预测—重构差异闭合。', status: '关键路径', phases: both, coverageIds: ['PHY-O1', 'PHY-O2'], toolIds: ['PHY-T1', 'PHY-T2'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U 留出炮 as-shot 重构与残差报告', workPackageIds: ['P1-2', 'P1-6'], gateIds: ['G1', 'G4'] }, { phase: 'phase-2', outcome: '首炮磁测状态重构与质量接口', workPackageIds: ['P2-1', 'P2-4'], gateIds: ['G6', 'G7', 'G9'] }], boundary: '前向预测、逆重构和实验观测必须分开标识。', order: 2 },
      { id: 'PHY-R3', title: '首等离子体形成链', detail: '真空场/涡流 → 实际预电离源 → 雪崩/burn-through → Iₚ 建立 → 成形后自由边界与 RZIP/ROM 控制。', status: '关键路径', phases: ['phase-2'], coverageIds: ['PHY-O1', 'PHY-O3'], toolIds: ['PHY-T1', 'PHY-T3'], deliveries: [{ phase: 'phase-2', outcome: 'EHL‑2 低能量形成、R/Z 控制与安全终止场景', workPackageIds: ['P2-1', 'P2-6'], gateIds: ['G6', 'G7', 'G9'] }], boundary: 'EC 是否进入主线服从实际投运配置。', order: 3 },
      { id: 'PHY-R4', title: '问题专用 MHD 证据支线', detail: '批准平衡/剖面 → 问题专用线性响应 → 仅在已有基准时集成精选非线性案例。', status: '条件式交付', phases: ['phase-2'], coverageIds: ['PHY-O4'], toolIds: ['PHY-T4'], deliveries: [{ phase: 'phase-2', outcome: '有适用域和 UQ 的离线 MHD 设计证据', workPackageIds: ['P2-2'], gateIds: [] }], boundary: '非 first-plasma gate，不包装成实时预测。', order: 4 },
      { id: 'PHY-R5', title: '形成后加热与输运支线', detail: '在已形成等离子体快照上评估 EC 吸收/ECCD，并把 NBI/高功率输运保留为离线设计包络。', status: '拓展研究', phases: ['phase-2'], coverageIds: ['PHY-O4'], toolIds: ['PHY-T5'], deliveries: [{ phase: 'phase-2', outcome: '成形后 H&CD / 输运候选证据包', workPackageIds: ['P2-3'], gateIds: [] }], boundary: '不参与首炮击穿与形成基线验收。', order: 5 },
    ],
  },
  engineering: {
    pillarId: 'engineering',
    coverage: [
      { id: 'ENG-O1', label: '几何、材料与网格主线', description: '以稳定组件 ID 贯通 CAD、材料、支撑/接触、冷却、分析几何、网格与测点。', terms: ['as-built CAD', 'mesh lineage', 'material card', 'contact/support'], phases: both, order: 1 },
      { id: 'ENG-O2', label: '正常/事故电磁载荷', description: '区分正常脉冲与给定 CQ/VDE/halo 事件，求涡流、J×B、合力、力矩和支撑反力。', terms: ['CQ', 'VDE', 'halo current', 'eddy current', 'Lorentz force'], phases: both, order: 2 },
      { id: 'ENG-O3', label: '瞬态热与能量沉积', description: '将 TQ/表面能量沉积、Joule 损耗及冷却边界转化为温度、梯度、热流和能量账本。', terms: ['TQ', 'surface deposition', 'Joule heating', 'PFC', 'conjugate heat transfer'], phases: both, order: 3 },
      { id: 'ENG-O4', label: '结构动力、热应力与 VVUQ', description: '把守恒映射后的体力/面力和温度场送入结构/热应力求解，并与应变、位移、温度测点比较。', terms: ['structural dynamics', 'thermal stress', 'contact', 'load mapping', 'VVUQ'], phases: both, order: 4 },
    ],
    tools: [
      { id: 'ENG-T1', label: '几何与配置主线', fullName: 'CATIA/ENOVIA 或 SALOME/Paramak + 版本化网格适配器', role: 'engineering-solver', maturity: '需本地 Benchmark', phases: both, coverageIds: ['ENG-O1'], moduleIds: ['engineering', 'data'], inputs: ['权威 CAD/PLM', '材料与连接', '组件/测点身份'], outputs: ['分析几何', '网格/映射表', 'geometry manifest'], evidence: '几何差异、网格质量、材料和边界条件审计。', boundary: '展示用 glTF/压缩模型不能作为工程分析几何。', order: 1 },
      { id: 'ENG-T2', label: 'EM 事件与涡流链', fullName: 'DINA/MEQ 事件包 + ThinCurr/CARIDDI + Maxwell/COMSOL（候选）', role: 'engineering-solver', maturity: '需本地 Benchmark', phases: both, coverageIds: ['ENG-O2'], moduleIds: ['engineering', 'physics'], inputs: ['线圈/等离子体电流', 'CQ/VDE/halo 历史', '三维导体'], outputs: ['涡流/损耗', 'J×B', '合力/力矩'], evidence: '电流、力、力矩守恒及轴对称—三维交叉核对。', boundary: '事件包是给定载荷源，不是破裂时刻预测；薄壁模型不替代厚导体热点解析。', order: 2 },
      { id: 'ENG-T3', label: '热流与冷却链', fullName: 'HEAT + OpenFOAM/CFX / 瞬态热 FEM（候选）', role: 'engineering-solver', maturity: '条件式候选', phases: both, coverageIds: ['ENG-O3'], moduleIds: ['engineering', 'energy'], inputs: ['表面沉积/Joule 损耗', '材料热物性', '冷却/接触热阻'], outputs: ['温度/热流', '能量账本', '冷却裕量'], evidence: '能量守恒、网格/时间步收敛及温度测点比较。', boundary: 'first-plasma 仅做低能量温升核查；完整高功率 PFC/RE 链属于拓展。', order: 3 },
      { id: 'ENG-T4', label: '结构/热应力与复核', fullName: 'Ansys Mechanical/Abaqus + Code_Aster/CalculiX（复核候选）', role: 'vvuq', maturity: '需本地 Benchmark', phases: both, coverageIds: ['ENG-O4'], moduleIds: ['engineering', 'diagnostics'], inputs: ['守恒载荷', '温度场', '支撑/接触/材料'], outputs: ['位移/应变/应力', '模态响应', '工程裕量'], evidence: '映射守恒、网格/时间步/接触敏感性、独立求解器或试验复核。', boundary: '求解收敛不等于载荷正确，也不自动形成安全认证。', order: 4 },
    ],
    routes: [
      { id: 'ENG-R1', title: '几何—材料—测点数字主线', detail: '冻结 as-built CAD、组件身份、材料/接触/冷却与测点；派生可重放的分析几何、网格和映射。', status: '关键路径', phases: both, coverageIds: ['ENG-O1'], toolIds: ['ENG-T1'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U 工程分析基线', workPackageIds: ['P1-0', 'P1-4'], gateIds: ['G0', 'G3', 'G4'] }, { phase: 'phase-2', outcome: 'EHL‑2 as-built 工程配置基线', workPackageIds: ['P2-0'], gateIds: ['G5', 'G6'] }], boundary: '几何变化触发影响分析和复验。', order: 1 },
      { id: 'ENG-R2', title: 'CQ/VDE/halo 电磁—结构分支', detail: '统一事件时基 → 轴对称筛选 → 三维涡流/J×B → 守恒映射 → 结构动力与支撑裕量。', status: '关键路径', phases: both, coverageIds: ['ENG-O2', 'ENG-O4'], toolIds: ['ENG-T2', 'ENG-T4'], deliveries: [{ phase: 'phase-1', outcome: '正常与给定事故 EM/结构响应报告', workPackageIds: ['P1-4', 'P1-6'], gateIds: ['G3', 'G4'] }, { phase: 'phase-2', outcome: 'commissioning 电流包络力学核查', workPackageIds: ['P2-0'], gateIds: ['G5', 'G6'] }], boundary: '给定事件历史不等于预测破裂。', order: 2 },
      { id: 'ENG-R3', title: 'TQ/沉积热—热应力分支', detail: '表面能量沉积/Joule 损耗 → 瞬态传热/冷却 → 温度场 → 热应力；与 EM 分支在统一几何/时基下组合审查。', status: '关键路径', phases: both, coverageIds: ['ENG-O3', 'ENG-O4'], toolIds: ['ENG-T3', 'ENG-T4'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U 给定 TQ/表面沉积热响应证据', workPackageIds: ['P1-4'], gateIds: ['G3', 'G4'] }, { phase: 'phase-2', outcome: '首炮低能量 Joule 温升核查', workPackageIds: ['P2-0'], gateIds: ['G5', 'G6'] }], boundary: 'RE 仅在任务书明确纳入时建模；EM 与热是并行载荷来源。', order: 3 },
      { id: 'ENG-R4', title: '合成传感器与 VVUQ 过门', detail: '把场结果经过测点体积/方向、仪器动态和采样响应转换为可比较信号，完成守恒、收敛、UQ 和独立工程复核。', status: '关键路径', phases: both, coverageIds: ['ENG-O1', 'ENG-O4'], toolIds: ['ENG-T1', 'ENG-T4'], deliveries: [{ phase: 'phase-1', outcome: '应变/温度/位移可观测的工程 V&V 包', workPackageIds: ['P1-4', 'P1-6'], gateIds: ['G3', 'G4'] }, { phase: 'phase-2', outcome: '调试包络工程 readiness 证据', workPackageIds: ['P2-0', 'P2-6'], gateIds: ['G6', 'G9'] }], boundary: '节点值不能直接冒充仪器读数。', order: 4 },
    ],
  },
  control: {
    pillarId: 'control',
    coverage: [
      { id: 'CTL-O1', label: 'pulse schedule 与状态机', description: '把实验阶段、参考、执行器/诊断可用性和异常终止编成受版本控制的状态转换。', terms: ['pulse schedule', 'state machine', 'scenario event', 'safe termination'], phases: both, order: 1 },
      { id: 'CTL-O2', label: '状态估计与质量门', description: '同时发布 Iₚ/R/Z/边界估计、时间戳、quality、staleness、置信等级和降级状态。', terms: ['state observer', 'quality gate', 'staleness', 'latency'], phases: both, order: 2 },
      { id: 'CTL-O3', label: '分层 plant 与闭环控制', description: '用电源/回路/涡流、RZIP/ROM、传感器和执行器动态构成可实时闭环的虚拟装置。', terms: ['RZIP', 'ROM', 'state-space', 'anti-windup', 'constraint control'], phases: both, order: 3 },
      { id: 'CTL-O4', label: 'SIL/HIL/dry-run/shadow', description: '区分生产代码 SIL、controller-HIL、power/plant-HIL、断机 dry-run 和在线只读 shadow。', terms: ['WCET', 'jitter', 'fault injection', 'controller-HIL', 'shadow twin'], phases: both, order: 4 },
    ],
    tools: [
      { id: 'CTL-T1', label: '状态服务', fullName: 'PTEFIT / rtEFIT / P-EFIT（候选）', role: 'as-shot-inverse', maturity: '已验证基线', phases: both, coverageIds: ['CTL-O2'], moduleIds: ['control', 'diagnostics'], inputs: ['校准磁测', '线圈/电源', 'quality/timebase'], outputs: ['Iₚ/R/Z/边界', '残差', '质量/时效'], evidence: '历史炮、留出炮、端到端时延和故障降级。', boundary: '重构器不是 plant，也不是独立保护。', order: 1 },
      { id: 'CTL-T2', label: '实时 plant 层', fullName: 'RZIP/状态空间/ROM + MEQ/GSevolve/TokaMaker（候选层级）', role: 'realtime-plant', maturity: '需本地 Benchmark', phases: both, coverageIds: ['CTL-O3'], moduleIds: ['control', 'physics', 'engineering'], inputs: ['电源/回路/涡流', '工作点平衡', '传感器/执行器动态'], outputs: ['刚性位置/垂直响应', '实时虚拟 I/O', '适用域'], evidence: '历史炮响应、跨保真比较和固定步长性能。', boundary: 'RZIP 不覆盖拓扑变化、输运或非线性 MHD。', order: 2 },
      { id: 'CTL-T3', label: '实时执行与回放', fullName: '本地生产 PCS + MARTe2 + MDSplus replay（候选组合）', role: 'control-test', maturity: '需本地 Benchmark', phases: both, coverageIds: ['CTL-O1', 'CTL-O4'], moduleIds: ['control', 'data'], inputs: ['生产控制代码/配置', '历史/合成信号', '周期/I-O 合同'], outputs: ['状态转换', 'WCET/jitter', '故障矩阵'], evidence: '同源代码 replay/SIL、周期 soak 与 deadline 统计。', boundary: 'MDSplus 是数据/回放基础，不是硬实时控制总线；框架不证明控制律稳定。', order: 3 },
      { id: 'CTL-T4', label: 'MIL/HIL 工具链', fullName: 'Simulink Coder / Simulink Real-Time 或本地等价平台', role: 'control-test', maturity: '条件式候选', phases: both, coverageIds: ['CTL-O3', 'CTL-O4'], moduleIds: ['control', 'integration'], inputs: ['控制模型/生产代码', 'plant emulator', '真实控制器/I-O'], outputs: ['MIL/SIL/HIL 证据', '等价性报告', '操作员场景'], evidence: '模型—代码等价、实时预算、硬件故障注入和独立保护验证。', boundary: 'controller-HIL 与 power/plant-HIL 分开；缺硬件不阻断 SIL。', order: 4 },
    ],
    routes: [
      { id: 'CTL-R1', title: '场景、信号与权限合同', detail: '冻结 pulse schedule、状态机、signal/actuator contract、周期、配置和独立保护接口；历史炮与合成信号走同一 replay。', status: '关键路径', phases: both, coverageIds: ['CTL-O1', 'CTL-O2'], toolIds: ['CTL-T1', 'CTL-T3'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U PCS replay 与场景状态机', workPackageIds: ['P1-0', 'P1-3'], gateIds: ['G0', 'G2', 'G4'] }, { phase: 'phase-2', outcome: 'EHL‑2 首炮 pulse schedule 与 I/O 基线', workPackageIds: ['P2-1'], gateIds: ['G6', 'G7'] }], boundary: '获批配置保持只读。', order: 1 },
      { id: 'CTL-R2', title: '分层 plant—MIL 闭环', detail: '电源/回路/涡流 + RZIP/ROM + 传感器/执行器模型，验证 Iₚ/R/Z/位形跟踪、约束、限幅、抗饱和和安全终止。', status: '关键路径', phases: both, coverageIds: ['CTL-O2', 'CTL-O3'], toolIds: ['CTL-T1', 'CTL-T2', 'CTL-T4'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U 控制 plant 与 MIL 测试矩阵', workPackageIds: ['P1-3'], gateIds: ['G2', 'G4'] }, { phase: 'phase-2', outcome: '首炮低能量形成与位置控制 plant', workPackageIds: ['P2-1', 'P2-5'], gateIds: ['G6', 'G7'] }], boundary: '降阶 plant 只在校准适用域内承担实时测试。', order: 2 },
      { id: 'CTL-R3', title: '生产代码 SIL 与故障矩阵', detail: '同源算法进入固定步长实时模拟，注入饱和、偏置、丢包、时延、网络抖动和异常终止，验证 deadline 与安全态。', status: '关键路径', phases: both, coverageIds: ['CTL-O1', 'CTL-O3', 'CTL-O4'], toolIds: ['CTL-T3', 'CTL-T4'], deliveries: [{ phase: 'phase-1', outcome: '生产代码 SIL/WCET/故障证据', workPackageIds: ['P1-3', 'P1-6'], gateIds: ['G2', 'G4'] }, { phase: 'phase-2', outcome: '实时 plant emulator 与首炮异常演练', workPackageIds: ['P2-5', 'P2-6'], gateIds: ['G7', 'G8', 'G9'] }], boundary: '达到限值可为测试条件，验收的是受控限幅、升级和终止。', order: 3 },
      { id: 'CTL-R4', title: '条件式 HIL—dry-run—只读 shadow', detail: '硬件可用时先 controller-HIL，再单独评审 power/plant-HIL；完成 machine-disconnected dry-run，真机阶段只读 shadow。', status: '条件式交付', phases: both, coverageIds: ['CTL-O4'], toolIds: ['CTL-T3', 'CTL-T4'], deliveries: [{ phase: 'phase-1', outcome: '硬件可用时的 controller-HIL 补充证据', workPackageIds: ['P1-3'], gateIds: ['G2', 'G4'] }, { phase: 'phase-2', outcome: '操作员演练、断机 dry-run 与只读影子评估', workPackageIds: ['P2-5', 'P2-6'], gateIds: ['G7', 'G8', 'G9'] }], boundary: '浏览器、KG、LLM、云服务和 shadow 永远无 PCS 写权限。', order: 4 },
    ],
  },
  diagnostics: {
    pillarId: 'diagnostics',
    coverage: [
      { id: 'DIA-O1', label: '诊断资产、几何与计量', description: '版本化通道、视线/位置、响应函数、采样时钟、校准证书、维修事件与责任人。', terms: ['measurement asset', 'calibration', 'instrument response', 'time sync'], phases: both, order: 1 },
      { id: 'DIA-O2', label: '原始采集、校准与质量', description: '从不可变 raw 层生成带单位、不确定度、quality、缺测/饱和/漂移状态的校准信号。', terms: ['raw waveform', 'quality flag', 'uncertainty', 'clock alignment'], phases: both, order: 2 },
      { id: 'DIA-O3', label: '磁平衡与状态重构', description: '用磁测、Rogowski、PF/CS、电路与几何重构 ψ、LCFS、X 点、Iₚ/R/Z 和约束残差。', terms: ['magnetics', 'equilibrium reconstruction', 'observer', 'residual'], phases: both, order: 3 },
      { id: 'DIA-O4', label: '合成诊断与实时降级', description: '把 truth 经过仪器几何/传递函数/噪声/时延生成独立 synthetic 信号，并冻结控制关键等级与 fallback。', terms: ['synthetic diagnostic', 'observability', 'latency', 'availability', 'fallback'], phases: both, order: 4 },
    ],
    tools: [
      { id: 'DIA-T1', label: 'MDSplus 事实档案', fullName: 'MDSplus pulse trees / replay', role: 'fact-archive', maturity: '已验证基线', phases: both, coverageIds: ['DIA-O1', 'DIA-O2'], moduleIds: ['diagnostics', 'data'], inputs: ['ADC/原始帧', '触发/时钟', '配置/事件'], outputs: ['不可变 raw', '炮次/通道身份', '历史回放'], evidence: '源文件校验和、采集配置和通道完整性。', boundary: 'MDSplus 不是校准算法、IMAS 语义层或硬实时控制总线。', order: 1 },
      { id: 'DIA-T2', label: 'IMAS / OMAS 映射', fullName: 'IMAS DD + IMAS-Python / OMAS 站点映射', role: 'semantic-exchange', maturity: '需本地 Benchmark', phases: both, coverageIds: ['DIA-O1', 'DIA-O2', 'DIA-O3'], moduleIds: ['diagnostics', 'data'], inputs: ['校准波形/几何', 'DD/machine mapping 版本'], outputs: ['精选 IDS', 'schema/单位校验', '重采样/lineage'], evidence: 'IDS schema、machine mapping 和迁移回归测试。', boundary: '不覆盖全部工程资产，也不自动保证实时性。', order: 2 },
      { id: 'DIA-T3', label: 'EFIT / PTEFIT 重构', fullName: 'EFIT / PTEFIT magnetic reconstruction', role: 'as-shot-inverse', maturity: '已验证基线', phases: both, coverageIds: ['DIA-O3'], moduleIds: ['diagnostics', 'physics'], inputs: ['校准磁测', '线圈电流', '几何/响应矩阵'], outputs: ['ψ/LCFS/X点', 'Iₚ/R/Z', '观测残差'], evidence: '历史炮、留出炮、约束残差和独立诊断交叉核对。', boundary: '重构状态是带模型/先验的估计，不是直接测量。', order: 3 },
      { id: 'DIA-T4', label: '合成诊断/实时处理', fullName: 'CHERAB/Raysect/Tomotok + MARTe2（按诊断候选）', role: 'synthetic-diagnostic', maturity: '条件式候选', phases: both, coverageIds: ['DIA-O4'], moduleIds: ['diagnostics', 'control', 'ai'], inputs: ['物理/工程 truth', '仪器几何/响应', '噪声/漂移/时延'], outputs: ['独立 synthetic 信号', '可观测性', 'quality/staleness/fallback'], evidence: 'synthetic→reconstruction 真值偏差、台架/回放与最坏时延。', boundary: '合成诊断不能替代真实标定，MARTe2 不定义物理反演正确性。', order: 4 },
    ],
    routes: [
      { id: 'DIA-R1', title: '资产—raw—校准事实链', detail: '盘点诊断/工程传感器资产、几何、响应、校准、时钟和 owner；冻结不可变 raw 与 shot/event/channel/timebase 身份。', status: '关键路径', phases: both, coverageIds: ['DIA-O1', 'DIA-O2'], toolIds: ['DIA-T1', 'DIA-T2'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U 原始—校准数据与精选 IMAS 子集', workPackageIds: ['P1-1'], gateIds: ['G0', 'G1', 'G4'] }, { phase: 'phase-2', outcome: 'EHL‑2 最小诊断资产与时间/质量基线', workPackageIds: ['P2-4'], gateIds: ['G6', 'G7', 'G9'] }], boundary: '原始层不可覆盖，校准更新产生新版本。', order: 1 },
      { id: 'DIA-R2', title: '磁测—重构—残差', detail: '校准磁测/线圈信号进入 EFIT/PTEFIT，发布 ψ、LCFS、X 点、Iₚ/R/Z 与全部观测残差和约束来源。', status: '关键路径', phases: both, coverageIds: ['DIA-O2', 'DIA-O3'], toolIds: ['DIA-T2', 'DIA-T3'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U 留出炮平衡重构与质量报告', workPackageIds: ['P1-2', 'P1-6'], gateIds: ['G1', 'G4'] }, { phase: 'phase-2', outcome: '首炮磁状态与降级标志', workPackageIds: ['P2-4'], gateIds: ['G6', 'G7', 'G9'] }], boundary: '内部 q/压力需要额外诊断或明确先验。', order: 2 },
      { id: 'DIA-R3', title: 'truth—仪器响应—合成闭环', detail: '物理/工程 truth 经过几何、传递函数、噪声、漂移、饱和和时延，生成独立 synthetic namespace 并回测推断链。', status: '关键路径', phases: both, coverageIds: ['DIA-O1', 'DIA-O4'], toolIds: ['DIA-T2', 'DIA-T4'], deliveries: [{ phase: 'phase-1', outcome: '合成磁诊断—重构闭环', workPackageIds: ['P1-2'], gateIds: ['G1', 'G4'] }, { phase: 'phase-2', outcome: '首炮仪器链与故障注入信号', workPackageIds: ['P2-4', 'P2-5'], gateIds: ['G6', 'G7'] }], boundary: 'synthetic 与 experiment 使用不同命名空间和 provenance。', order: 3 },
      { id: 'DIA-R4', title: '控制关键/监测分级与 V&V', detail: '逐通道冻结采样、最坏时延、availability、quality、staleness 和 fallback；留出炮、交叉诊断及合成—真实残差进入 V&V。', status: '关键路径', phases: both, coverageIds: ['DIA-O2', 'DIA-O3', 'DIA-O4'], toolIds: ['DIA-T1', 'DIA-T3', 'DIA-T4'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U 诊断健康与残差过门证据', workPackageIds: ['P1-1', 'P1-6'], gateIds: ['G1', 'G4'] }, { phase: 'phase-2', outcome: '首炮最小实时诊断集和安全降级接口', workPackageIds: ['P2-4', 'P2-6'], gateIds: ['G6', 'G7', 'G9'] }], boundary: '页面刷新率不是控制实时性的证据。', order: 4 },
    ],
  },
  data: {
    pillarId: 'data',
    coverage: [
      { id: 'DAT-O1', label: 'shot/run/asset 身份与事实层', description: '统一 shot、run、event、asset、geometry、coordinate、timebase、calibration 身份，同时保留权威原始档案。', terms: ['persistent identity', 'immutable raw', 'timebase', 'configuration baseline'], phases: both, order: 1 },
      { id: 'DAT-O2', label: '语义交换与大对象存储', description: 'IMAS 承载聚变物理公共语义，工程资产/时序保持独立合同，大场数据进入内容寻址对象存储。', terms: ['IMAS IDS', 'machine mapping', 'object store', 'schema migration'], phases: both, order: 2 },
      { id: 'DAT-O3', label: '模型执行、谱系与 V&V', description: '记录输入/输出、代码、容器、配置、几何、网格、求解器、随机种子、owner、许可和适用域。', terms: ['run manifest', 'provenance', 'model card', 'VVUQ', 'reproducibility'], phases: both, order: 3 },
      { id: 'DAT-O4', label: '证据图谱与决策界面', description: '知识图谱只索引权威实体/关系/证据，ECharts/3D 展示同一 shot/run 的差异、残差和审批状态。', terms: ['knowledge graph', 'evidence link', '3D field', 'decision trace'], phases: both, order: 4 },
    ],
    tools: [
      { id: 'DAT-T1', label: '权威档案适配', fullName: 'MDSplus / NAS / PLM / 工程时序只读适配器', role: 'fact-archive', maturity: '已验证基线', phases: both, coverageIds: ['DAT-O1'], moduleIds: ['data', 'diagnostics', 'engineering'], inputs: ['原始炮数据', '批准配置/CAD', '工程传感器时序'], outputs: ['不可变事实引用', '统一身份', 'source checksum'], evidence: '源端权限、校验和、采集/配置记录。', boundary: '平台不覆盖事实源，PCS/PLM 保持各自权威。', order: 1 },
      { id: 'DAT-T2', label: '聚变语义交换', fullName: 'IMAS DD + IMAS-Python / OMAS mapping', role: 'semantic-exchange', maturity: '需本地 Benchmark', phases: both, coverageIds: ['DAT-O2'], moduleIds: ['data', 'physics', 'diagnostics'], inputs: ['精选物理数据', 'DD/machine mapping 版本'], outputs: ['版本化 IDS', 'schema/单位/坐标校验', '迁移记录'], evidence: 'schema、machine mapping 与版本迁移测试。', boundary: 'IMAS 不替代原始档案，也不强迫全部工程信号进入不适配 IDS。', order: 2 },
      { id: 'DAT-T3', label: '受控证据工厂', fullName: '容器化 adapter + HPC scheduler + content-addressed store', role: 'vvuq', maturity: '需本地 Benchmark', phases: both, coverageIds: ['DAT-O2', 'DAT-O3'], moduleIds: ['data', 'integration', 'ai'], inputs: ['模型/容器/配置', '输入 manifest', '算力/许可'], outputs: ['不可变 run manifest', '输出 hash', '模型卡/V&V 状态'], evidence: '同输入/版本重放、CI 契约和审批记录。', boundary: '求解器留在受控计算域；网页不执行高保真计算。', order: 3 },
      { id: 'DAT-T4', label: '知识与只读工作台', fullName: 'Knowledge Graph + ECharts + Three.js + 只读 API', role: 'evidence-ui', maturity: '已验证基线', phases: both, coverageIds: ['DAT-O4'], moduleIds: ['hmi', 'integration', 'ai'], inputs: ['权威 ID/关系', '版本化结果', 'V&V/审批证据'], outputs: ['跨域对比', '3D/时序联动', '证据导航'], evidence: '页面来源、保真度、适用域、版本和审批状态完整。', boundary: '前端联动不等于科学耦合；KG/LLM 不生成物理或安全判据。', order: 4 },
    ],
    routes: [
      { id: 'DAT-R1', title: '事实源—统一身份—配置基线', detail: '只读接入 MDSplus/权威档案、工程时序和 PLM，建立 shot/run/event/asset/geometry/timebase/calibration 身份。', status: '关键路径', phases: both, coverageIds: ['DAT-O1'], toolIds: ['DAT-T1'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U 不可变事实层和接口控制文件', workPackageIds: ['P1-0', 'P1-1'], gateIds: ['G0', 'G1', 'G4'] }, { phase: 'phase-2', outcome: 'EHL‑2 as-designed/as-built/as-tested 差异登记', workPackageIds: ['P2-0'], gateIds: ['G5', 'G6'] }], boundary: '派生结果永不覆盖 L0。', order: 1 },
      { id: 'DAT-R2', title: 'IMAS—工程合同—对象存储', detail: '精选物理量进入冻结版本 IDS；工程资产/时序保留独立 schema；大对象按内容 hash 存储并由 manifest 引用。', status: '关键路径', phases: both, coverageIds: ['DAT-O2'], toolIds: ['DAT-T1', 'DAT-T2', 'DAT-T3'], deliveries: [{ phase: 'phase-1', outcome: 'EXL‑50U IMAS 子集、工程合同和资产清单', workPackageIds: ['P1-1'], gateIds: ['G0', 'G1', 'G4'] }, { phase: 'phase-2', outcome: 'EHL‑2 首炮数据与模型交换基线', workPackageIds: ['P2-0', 'P2-4'], gateIds: ['G5', 'G6', 'G7'] }], boundary: 'schema/DD/machine mapping 均需显式版本与迁移。', order: 2 },
      { id: 'DAT-R3', title: '模型执行—V&V—阶段门', detail: '容器化 adapter 在受控计算域运行，固化输入/代码/容器/配置/网格/求解器/输出 hash，连接模型卡、适用域与审批。', status: '关键路径', phases: both, coverageIds: ['DAT-O3'], toolIds: ['DAT-T3'], deliveries: [{ phase: 'phase-1', outcome: '可重放 run manifest 与留出盲测证据', workPackageIds: ['P1-5', 'P1-6'], gateIds: ['G4'] }, { phase: 'phase-2', outcome: '虚拟 campaign 的模型/结果/已知偏差证据包', workPackageIds: ['P2-6'], gateIds: ['G8', 'G9'] }], boundary: '不可观测结果明确标为设计推断。', order: 3 },
      { id: 'DAT-R4', title: '知识图谱—ECharts/3D—决策追溯', detail: 'KG 连接实体、运行、证据和审批；ECharts/3D 在同一 shot/run/时基上比较位形、控制、工程和诊断结果。', status: '关键路径', phases: both, coverageIds: ['DAT-O4'], toolIds: ['DAT-T4'], deliveries: [{ phase: 'phase-1', outcome: '跨域 shot/run 工作台与证据对比', workPackageIds: ['P1-5', 'P1-6'], gateIds: ['G4'] }, { phase: 'phase-2', outcome: '虚拟 campaign/readiness 看板与只读 shadow 证据', workPackageIds: ['P2-6'], gateIds: ['G8', 'G9'] }], boundary: '浏览器、知识图谱和大模型永远没有控机写通道。', order: 4 },
    ],
  },
};
