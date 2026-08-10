export type ControlTaskId = 'T0' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7' | 'T8' | 'T9';
export type ControlEvidenceLevel = 'E0' | 'E1' | 'E2' | 'E3' | 'E4';
export type ControlDeploymentLevel = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';
export type ControlCodeStatus = 'official-direct' | 'official-enabling' | 'commercial-enabling' | 'community-reproduction' | 'not-public';

export interface ControlPaper { title: string; authors: string; year: number; venue: string; doi: string | null; url: string; sourceType: string }
export interface ControlCode { name: string; url: string | null; status: ControlCodeStatus; relationship: string; artifactType: string; access: string; license: string }
export interface ControlResearchItem {
  id: string; projectId: string; titleZh: string; titleEn: string | null; year: number; organization: string;
  primaryTask: ControlTaskId; relatedTasks: ControlTaskId[]; categoryLabel: string; problem: string; method: string;
  controlArchitecture: string; timescale: string; sensors: string[]; actuators: string[]; devices: string[];
  validation: string; results: string; evidenceLevel: ControlEvidenceLevel; deploymentLevel: ControlDeploymentLevel;
  maturity: string; limitations: string; twinRelevance: string; papers: ControlPaper[]; code: ControlCode[]; tags: string[]; sourceFile: string;
}
export interface ControlDeviceProfile {
  id: string; name: string; country: string; organization: string; status: string; pcsArchitecture: string; timing: string;
  primaryTasks: ControlTaskId[]; sensors: string[]; actuators: string[]; representativeWorks: string[];
  papers: ControlPaper[]; code: ControlCode[]; maturity: string; gaps: string; sources: string[];
}

export const controlTaskMeta = {
  "T0": {
    "label": "状态估计与实时诊断",
    "en": "STATE ESTIMATION & REAL-TIME DIAGNOSTICS",
    "role": "cross-cutting"
  },
  "T1": {
    "label": "启动、电流与磁通控制",
    "en": "START-UP, CURRENT & FLUX CONTROL",
    "role": "control-task"
  },
  "T2": {
    "label": "位置、位形与边界控制",
    "en": "POSITION, SHAPE & BOUNDARY CONTROL",
    "role": "control-task"
  },
  "T3": {
    "label": "剖面与场景控制",
    "en": "PROFILE & SCENARIO CONTROL",
    "role": "control-task"
  },
  "T4": {
    "label": "稳定性与约束模式控制",
    "en": "STABILITY & CONFINEMENT CONTROL",
    "role": "control-task"
  },
  "T5": {
    "label": "排热、粒子与等离子体-壁控制",
    "en": "EXHAUST, PARTICLE & PLASMA-WALL CONTROL",
    "role": "control-task"
  },
  "T6": {
    "label": "性能、功率与燃烧控制",
    "en": "PERFORMANCE, POWER & BURN CONTROL",
    "role": "control-task"
  },
  "T7": {
    "label": "失稳避免、安全终止与保护接口",
    "en": "DISRUPTION AVOIDANCE, TERMINATION & PROTECTION",
    "role": "control-task"
  },
  "T8": {
    "label": "多执行器协调与集成控制",
    "en": "MULTI-ACTUATOR & INTEGRATED CONTROL",
    "role": "control-task"
  },
  "T9": {
    "label": "PCS、脉冲编排与验证基础设施",
    "en": "PCS, PULSE ORCHESTRATION & V&V",
    "role": "cross-cutting"
  }
} as const;
export const controlResearchItems: ControlResearchItem[] = [
  {
    "id": "PCS-039",
    "projectId": "PCS-039",
    "titleZh": "EXL-50/EXL-50U PTEFIT快速平衡重建与反馈探索",
    "titleEn": null,
    "year": 2026,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T2",
      "T9"
    ],
    "categoryLabel": "T0",
    "problem": "适配球形托卡马克与非感应电流驱动场景的快速平衡重建，并为位形反馈提供低延迟状态。",
    "method": "公开预印本描述PTEFIT快速平衡重建及控制接口；未找到可核验的完整PCS软件栈、驱动、调度和安全/保护架构公开文档。",
    "controlArchitecture": "公开预印本描述PTEFIT快速平衡重建及控制接口；未找到可核验的完整PCS软件栈、驱动、调度和安全/保护架构公开文档。 接口与 I/O：磁诊断与装置几何输入，输出平衡和位形量；生产I/O、执行器映射和故障处理未公开。",
    "timescale": "预印本报告约0.268 ms计算时间；该数值不是经同行评议的端到端PCS延迟，也不包含全部I/O。",
    "sensors": [
      "磁探针与磁通环",
      "线圈电流",
      "装置几何与响应矩阵"
    ],
    "actuators": [
      "PF线圈电源（Rmax PID与isoflux反馈；具体通道映射未公开）"
    ],
    "devices": [
      "EXL-50",
      "EXL-50U"
    ],
    "validation": "原始预印本报告EXL数据上的平衡重建、装置反馈执行和时序结果，足以按作者报告记录E4/D4；来源仍标为preprint，且在期刊评议、代码开放与独立复现前不得上调可信度或外推到完整PCS。",
    "results": "EXL研究性验证；完整部署边界未公开。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "EXL研究性验证；完整部署边界未公开。",
    "limitations": "预印本、无公共代码、缺端到端时序与独立复现；不能据此推断EXL完整PCS成熟度。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "A Novel Numerical Algorithms Optimization Method with Machine Learning Frameworks: Application on Real-time Plasmas Equilibrium Reconstruction in EXL-50U Spherical Torus",
        "authors": "G.H. Zheng, S.F. Liu, X. Gu, Y.P. Zhang, J. Li, Y. Liu, X.C. Lun, L. Xing, J.G. Chen, Z.Y. Chen, Y. Yu, D. Guo, Z.Y. Yang, H.S. Xie, X.M. Song, Y.J. Shi and the EXL-50U Team",
        "year": 2026,
        "venue": "arXiv:2601.12378",
        "doi": "10.48550/arXiv.2601.12378",
        "url": "https://arxiv.org/abs/2601.12378",
        "sourceType": "original preprint, not peer-reviewed at audit date"
      },
      {
        "title": "Overview of EXL-50 research progress",
        "authors": "Y. Shi, Y. Wang, B. Liu, X. Song, S. Song, X. Jiang, D. Guo, D. Luo, X. Gu et al. and the EXL-50 Team",
        "year": 2025,
        "venue": "Nuclear Fusion 65, 092004",
        "doi": "10.1088/1741-4326/adf239",
        "url": "https://doi.org/10.1088/1741-4326/adf239",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "PTEFIT",
        "url": null,
        "status": "not-public",
        "relationship": "算法论文可读，未发现作者官方公共代码仓库；论文链接保留在publications而非代码字段。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "EXL-50",
      "EXL-50U",
      "PTEFIT",
      "preprint"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "CPT-031",
    "projectId": "CPT-031",
    "titleZh": "WEST人工智能热事件实时监测",
    "titleEn": "AI real-time thermal-event monitoring on WEST",
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T5",
      "T7",
      "T4"
    ],
    "categoryLabel": "T0",
    "problem": "固定ROI和阈值难以覆盖移动、形态多变的热点和杂散热事件。",
    "method": "对实时IR图像进行AI检测、定位和事件特征化，在WEST C9战役部署；热事件/打击线分析约30 fps，紧凑CNN电弧检测超过100 fps，并与PCS加热指令接口集成。",
    "controlArchitecture": "未完整公开。",
    "timescale": "热事件约33 ms一帧；电弧检测低于10 ms一帧",
    "sensors": [
      "红外相机",
      "图像元数据",
      "壁几何"
    ],
    "actuators": [
      "与加热天线指令接口集成；公开结果不足以确认已完成自动闭环功率调节"
    ],
    "devices": [
      "WEST"
    ],
    "validation": "WEST C9战役实时运行与事件回放。",
    "results": "系统在C9实时处理大量IR视频并接入PCS指令通道；论文表述为向反馈控制铺路，故保守不计作已证明的自动闭环保护。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "实时检测不等于安全认证；分布漂移、相机故障和未知事件需保守回退到独立保护。",
    "twinRelevance": "适合作为感知增强层和影子告警，但不应绕过硬保护链。",
    "papers": [
      {
        "title": "Real-time monitoring system for detection and characterization of thermal events on WEST Tokamak: Implementation and first results",
        "authors": "V. Gorse, E. Grelier, V. Moncada and R. Mitteau",
        "year": 2025,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2025.114960",
        "url": "https://doi.org/10.1016/j.fusengdes.2025.114960",
        "sourceType": "peer-reviewed real-time monitoring"
      }
    ],
    "code": [
      {
        "name": "WEST AI thermal-event detector",
        "url": null,
        "status": "not-public",
        "relationship": "训练集、模型权重和实时应用未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-043",
    "projectId": "CPT-043",
    "titleZh": "DIII-D高带宽边缘涨落约束模式CNN识别",
    "titleEn": "CNN confinement-regime detection from high-bandwidth edge fluctuations on DIII-D",
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [],
    "categoryLabel": "T0",
    "problem": "L/H/ELM状态包含微秒到毫秒的边缘涨落结构，传统低频标量可能丢失前兆。",
    "method": "对1 MHz BES边缘涨落短窗训练CNN，区分约束状态并评估未来FPGA实时化。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约1 ms数据窗；1 MHz原始采样",
    "sensors": [
      "BES高带宽边缘涨落"
    ],
    "actuators": [
      "无；离线分类研究"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "330个放电训练/开发，44个未见放电测试。",
    "results": "未见放电F1约0.94；论文提出FPGA集成路线，但不应描述为已实时闭环。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "BES诊断并非所有装置可用；域漂移、通道失效和FPGA定点误差尚待验证。",
    "twinRelevance": "可作为高带宽感知插件，但需与低带宽状态估计进行时间对齐和证据分层。",
    "papers": [
      {
        "title": "Real-time confinement regime detection in fusion plasmas with convolutional neural networks and high-bandwidth edge fluctuation measurements",
        "authors": "K. Gill, D.R. Smith, S. Joung, B. Geiger, G. McKee, J. Zimmerman, R.N. Coffee, A. Jalalvand and E. Kolemen",
        "year": 2024,
        "venue": "Machine Learning: Science and Technology",
        "doi": "10.1088/2632-2153/ad605e",
        "url": "https://doi.org/10.1088/2632-2153/ad605e",
        "sourceType": "peer-reviewed offline device study"
      }
    ],
    "code": [
      {
        "name": "DIII-D BES regime CNN",
        "url": null,
        "status": "not-public",
        "relationship": "论文未附可核验模型仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "PCS-038",
    "projectId": "PCS-038",
    "titleZh": "MEQ实时平衡重建、前馈与磁控制工具箱",
    "titleEn": null,
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T2"
    ],
    "categoryLabel": "论文直接开源实现",
    "problem": "以统一、可测试代码支持离线/实时平衡、线圈—等离子体响应和磁控制设计，缩短从分析到PCS部署的距离。",
    "method": "MATLAB与C实现；LIUQE用于平衡重建，FGE/FGS等用于响应与场景计算，FBT支持前馈/反馈磁控制；与TCV Simulink/MARTe2链集成。",
    "controlArchitecture": "MATLAB与C实现；LIUQE用于平衡重建，FGE/FGS等用于响应与场景计算，FBT支持前馈/反馈磁控制；与TCV Simulink/MARTe2链集成。 接口与 I/O：磁探针、磁通、线圈电流、几何、参考边界与电路参数；输出平衡、形状描述量和控制矩阵。",
    "timescale": "TCV LIUQE公开综述给出1 ms重建周期；其他MEQ组件应按配置独立测量。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "TCV"
    ],
    "validation": "TCV长期实时重建/控制与开源测试；装置迁移仍需新几何、磁标定和实验对照。",
    "results": "TCV生产控制及公开研究工具。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "TCV生产控制及公开研究工具。",
    "limitations": "MATLAB部分需要商业环境；跨装置不能直接复用TCV标定和控制矩阵；轴对称平衡有物理边界。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Overview of the TCV digital real-time plasma control system and its applications",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2024.114640",
        "url": "https://doi.org/10.1016/j.fusengdes.2024.114640",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "MEQ",
        "url": "https://gitlab.epfl.ch/spc/public/meq/meq",
        "status": "official-direct",
        "relationship": "EPFL/SPC官方公开仓库，Apache-2.0。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "MEQ",
      "LIUQE",
      "FBT",
      "TCV"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "CTL-CORE-024",
    "projectId": "CTL-CORE-024",
    "titleZh": "ASDEX Upgrade/TCV RAPDENS 密度剖面观测与闭环",
    "titleEn": "Model-based real-time electron-density profile estimation and control on ASDEX Upgrade and TCV",
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T3"
    ],
    "categoryLabel": "平衡重建、剖面观测器与状态估计服务",
    "problem": "干涉仪只给线积分且可能跳周，Thomson 低频；长脉冲需要在诊断故障下仍获得核心/边缘密度并控制燃料。",
    "method": "1.5D 粒子输运模型+合成诊断+动态观测器融合干涉仪、Thomson/反射计等；同一模型用于控制器预调并系统处理诊断失效。",
    "controlArchitecture": "未完整公开。",
    "timescale": "观测/燃料控制通常 10–100 ms；粒子输运预测为百毫秒至秒。",
    "sensors": [
      "干涉仪",
      "Thomson 散射",
      "反射计/边缘密度",
      "粒子源和执行器状态"
    ],
    "actuators": [
      "气体阀",
      "颗粒注入",
      "在 TCV 中补偿 ECCD 引起的密度扰动"
    ],
    "devices": [
      "ASDEX Upgrade：高密度颗粒加料；装置闭环实验",
      "TCV：集成压力/q 控制中的密度保持；装置闭环实验"
    ],
    "validation": "跨两装置实时/闭环实验。",
    "results": "AUG 高密度颗粒放电中更可靠地估计核心密度；TCV 中即使 ECCD 功率时变也维持近恒定密度，并向 EC 射线追迹等下游服务提供密度。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "边缘边界条件和粒子源/回收模型决定长期偏差；跳周检测、颗粒沉积和壁库存不确定性仍可能共因失效。",
    "twinRelevance": "提供理想的多率传感融合范例：孪生必须显式处理缺测/跳周，并把壁回收作为可估计慢状态。",
    "papers": [
      {
        "title": "Model-based real-time plasma electron density profile estimation and control on ASDEX Upgrade and TCV",
        "authors": "T. C. Blanken, F. Felici, C. Galperti et al.",
        "year": 2019,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2019.05.030",
        "url": "https://doi.org/10.1016/j.fusengdes.2019.05.030",
        "sourceType": "peer-reviewed journal article"
      },
      {
        "title": "Control-oriented modeling of the plasma particle density in tokamaks and application to real-time density profile reconstruction",
        "authors": "T. C. Blanken et al.",
        "year": 2018,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2017.11.006",
        "url": "https://doi.org/10.1016/j.fusengdes.2017.11.006",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "RAPDENS",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接观测器和模型",
        "artifactType": "software",
        "access": "research/facility code; not publicly released",
        "license": "未标注"
      }
    ],
    "tags": [
      "ASDEX Upgrade",
      "TCV",
      "RAPDENS",
      "density profile",
      "diagnostic failure"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-019",
    "projectId": "CTL-CORE-019",
    "titleZh": "EAST POINT 约束 P-EFIT 的实时电流与 q 剖面重建",
    "titleEn": "Real-time current-profile reconstruction with POINT-constrained P-EFIT on EAST",
    "year": 2018,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T3"
    ],
    "categoryLabel": "平衡重建、剖面观测器与状态估计服务",
    "problem": "仅用外部磁测量难可靠识别内部电流/q 剖面，制约先进场景闭环。",
    "method": "GPU P-EFIT 同化磁诊断和 POINT 偏振干涉仪的 Faraday 旋转/线积分密度信息，在 65×65 网格上实时求解。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约 0.7 ms/时间片。",
    "sensors": [
      "磁诊断",
      "POINT 偏振干涉测量",
      "线圈电流",
      "等离子体电流"
    ],
    "actuators": [
      "无直接执行器；计划向 q/电流剖面控制提供状态"
    ],
    "devices": [
      "EAST：长脉冲内部电流剖面；实验数据时间片与仿真回放；论文时尚未报告由其驱动的 q 闭环"
    ],
    "validation": "实时能力与装置数据离线/实验仿真验证。",
    "results": "磁+POINT 输入在约 0.7 ms 内给出合理电流和 q 剖面，达到实时剖面控制的计算预算。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "Faraday 旋转反演依赖密度、光路和标定；论文验证重点是速度/合理性，而非长脉冲闭环与不确定度覆盖率。",
    "twinRelevance": "可作为磁—内部诊断融合状态服务；孪生应同时发布诊断覆盖、残差和与磁-only 重建的分歧。",
    "papers": [
      {
        "title": "Development of real-time plasma current profile reconstruction with POINT diagnostic for EAST plasma control",
        "authors": "Y. Huang et al.",
        "year": 2018,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2017.05.005",
        "url": "https://doi.org/10.1016/j.fusengdes.2017.05.005",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "P-EFIT/POINT integration",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接实现",
        "artifactType": "software",
        "access": "facility CUDA code; not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "EAST",
      "POINT",
      "P-EFIT",
      "q-profile",
      "Faraday rotation"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-023",
    "projectId": "CTL-CORE-023",
    "titleZh": "TCV RAPTOR 快速 q 剖面预测与观测器",
    "titleEn": "RAPTOR real-time q-profile simulation, estimation and control service",
    "year": 2017,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T3"
    ],
    "categoryLabel": "平衡重建、剖面观测器与状态估计服务",
    "problem": "电流扩散比磁形状慢但状态维度高，需在实时预算内预测 q 演化并融合有限诊断。",
    "method": "1.5D 磁通扩散和简化能量/源模型，解析/自动获得雅可比，用扩展 Kalman 滤波或优化融合 LIUQE、MSE/ECE 等，支持在线预测和 MPC。",
    "controlArchitecture": "未完整公开。",
    "timescale": "典型 1–10 ms 计算周期；预测视野可覆盖 0.1–数秒电流扩散。",
    "sensors": [
      "LIUQE 平衡",
      "等离子体电流",
      "ECE/密度",
      "MSE（若可用）",
      "H&CD 状态"
    ],
    "actuators": [
      "无直接执行器；预测 Ip、ECCD/ECRH 等动作对 q 的影响"
    ],
    "devices": [
      "TCV：q/β 剖面控制与场景规划；实时系统、控制器测试环境与闭环实验",
      "JET/ITER：模型比较和设计研究；离线/仿真"
    ],
    "validation": "TCV 实时部署且进入闭环控制链。",
    "results": "使 TCV 能在缺少连续内部电流诊断时运行模型预测 q 控制；与 LIUQE/密度观测器组成动态剖面状态服务。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "q 估计会受运输/源模型偏差支配；当无内部诊断时，闭环可能精确跟踪模型而不是真实 q。",
    "twinRelevance": "动态状态服务应同时输出测量更新量、纯预测量和协方差，并定期以离线动力学平衡/内部诊断纠偏。",
    "papers": [
      {
        "title": "Real-time simulation of internal profiles in tokamak plasmas using RAPTOR",
        "authors": "F. Felici et al.",
        "year": 2011,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2010.12.001",
        "url": "https://doi.org/10.1016/j.fusengdes.2010.12.001",
        "sourceType": "peer-reviewed journal article"
      },
      {
        "title": "Profile control simulations and experiments on TCV",
        "authors": "B. Maljaars et al.",
        "year": 2017,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/1741-4326/aa8c48",
        "url": "https://doi.org/10.1088/1741-4326/aa8c48",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "RAPTOR",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接动态状态/预测模型",
        "artifactType": "software",
        "access": "research code; no verified public release",
        "license": "未标注"
      },
      {
        "name": "TORAX",
        "url": "https://github.com/google-deepmind/torax",
        "status": "official-enabling",
        "relationship": "开放 JAX 1D 运输框架，可构建独立快速剖面孪生；并非 RAPTOR 等价实现",
        "artifactType": "software",
        "access": "official open source; Apache-2.0",
        "license": "未标注"
      }
    ],
    "tags": [
      "TCV",
      "RAPTOR",
      "q-profile",
      "observer",
      "transport"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "PCS-007",
    "projectId": "PCS-007",
    "titleZh": "RAPTOR实时状态观测器与剖面控制链",
    "titleEn": null,
    "year": 2017,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T3"
    ],
    "categoryLabel": "实时物理模型",
    "problem": "电流密度、电子温度和密度剖面无法由有限诊断直接、稳定地实时获得，而剖面控制需要动态状态估计。",
    "method": "1D控制导向输运模型结合实时平衡和测量，用EKF/状态观测思想更新剖面；可在Simulink/MARTe或装置DCS内运行。",
    "controlArchitecture": "1D控制导向输运模型结合实时平衡和测量，用EKF/状态观测思想更新剖面；可在Simulink/MARTe或装置DCS内运行。 接口与 I/O：平衡、加热/电流驱动、干涉仪、ECE、MSE/Thomson等；输出Te、ne、电流密度、q等状态及预测。",
    "timescale": "以毫秒至几十毫秒剖面时间尺度运行；具体装置和方程集不同，公开资料不支持给出统一最坏周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "TCV",
      "ASDEX Upgrade",
      "RFX-mod"
    ],
    "validation": "TCV有实时观测和MPC闭环实验；AUG和RFX-mod有框架集成与对照，证据强度按装置分别解释。",
    "results": "TCV生产实时；AUG/RFX-mod实时集成。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "TCV生产实时；AUG/RFX-mod实时集成。",
    "limitations": "输运闭合、源项和边界约化；状态估计依赖诊断可用性与模型失配处理；不能替代独立高保真验证。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Distributed digital real-time control system for the TCV tokamak and its applications",
        "authors": "未完整列出",
        "year": 2017,
        "venue": "peer-reviewed",
        "doi": "10.1088/1741-4326/aa6120",
        "url": "https://doi.org/10.1088/1741-4326/aa6120",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Integration of the state observer RAPTOR in the real-time MARTe framework at RFX-mod",
        "authors": "未完整列出",
        "year": 2017,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2017.04.122",
        "url": "https://doi.org/10.1016/j.fusengdes.2017.04.122",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "RAPTOR",
        "url": null,
        "status": "not-public",
        "relationship": "官方页面提供论文和申请协议；截至页面说明，主代码需签CLA获得GitLab访问，不能标作无条件开源。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "RAPTOR",
      "profile control",
      "observer",
      "TCV"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "CTL-CORE-017",
    "projectId": "CTL-CORE-017",
    "titleZh": "TCV LIUQE 实时平衡与通量面状态服务",
    "titleEn": "LIUQE real-time equilibrium reconstruction on TCV",
    "year": 2015,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [],
    "categoryLabel": "平衡重建、剖面观测器与状态估计服务",
    "problem": "形状和剖面控制需要在高伸长、强真空室像电流下实时识别电流密度、边界和通量面平均量。",
    "method": "迭代求解 Poisson/Grad–Shafranov 问题，线性参数化等离子体电流密度，并用实验辨识的真空室模型补偿涡流；实时轮廓算法输出 1.5D 运输所需通量面量。",
    "controlArchitecture": "未完整公开。",
    "timescale": "28×65 网格、133 个测量的完整周期短于 200 μs。",
    "sensors": [
      "133 路磁测量",
      "线圈电流",
      "真空室电流模型",
      "可选内部诊断约束"
    ],
    "actuators": [
      "无直接执行器；作为形状、q 剖面与 RAPTOR 控制的状态服务"
    ],
    "devices": [
      "TCV：全构型实时平衡；长期实时运行并服务闭环"
    ],
    "validation": "实时生产级状态估计，装置闭环间接验证。",
    "results": "在完整空间网格和全部磁测量下低于 200 μs，输出边界、形状及通量面平均量，直接支撑 TCV 形状控制、q 控制和 RAPTOR 耦合。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "磁测量对核心 q/压力约束弱；模型误差和真空室状态可产生系统偏差，且确定性输出没有自动给出校准 UQ。",
    "twinRelevance": "应被实现为带时间戳、输入质量位、求解残差、模型版本和 UQ 的权威状态 API，而非只输出一张平衡图。",
    "papers": [
      {
        "title": "Tokamak equilibrium reconstruction code LIUQE and its real time implementation",
        "authors": "J.-M. Moret et al.",
        "year": 2015,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2014.09.019",
        "url": "https://doi.org/10.1016/j.fusengdes.2014.09.019",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "LIUQE/LIUQE-RT",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接状态估计器",
        "artifactType": "software",
        "access": "facility MATLAB/Simulink code; not publicly released",
        "license": "未标注"
      },
      {
        "name": "FreeGSNKE",
        "url": "https://github.com/FusionComputingLab/freegsnke",
        "status": "official-enabling",
        "relationship": "独立自由边界正向/逆向求解与控制测试；不是 LIUQE 重建替代品",
        "artifactType": "software",
        "access": "open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "TCV",
      "LIUQE",
      "equilibrium reconstruction",
      "200 us",
      "state service"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-022",
    "projectId": "CTL-CORE-022",
    "titleZh": "KSTAR 实时 MSE 电流/q 剖面测量链",
    "titleEn": "Real-time MSE measurements for current-profile control on KSTAR",
    "year": 2012,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T3"
    ],
    "categoryLabel": "平衡重建、剖面观测器与状态估计服务",
    "problem": "仅靠外部磁测量不能约束核心 q，必须把 MSE 偏振角稳定、快速地送入实时平衡/剖面控制。",
    "method": "面向实时的 MSE 标定与快速分析，减少经验参数和外界影响；用多通道磁场俯仰角约束平衡。",
    "controlArchitecture": "未完整公开。",
    "timescale": "诊断处理面向 10–100 ms 级剖面控制。",
    "sensors": [
      "多通道 MSE",
      "NBI 诊断束",
      "磁测量",
      "实时平衡"
    ],
    "actuators": [
      "无直接执行器；计划服务 NBI/ECCD/Ip 的 q 剖面控制"
    ],
    "devices": [
      "KSTAR：高性能场景内部磁场；诊断实时实现与实验数据"
    ],
    "validation": "实时诊断链 E3；论文不宣称完整 q 闭环。",
    "results": "建立了实时 MSE 所需的鲁棒标定和快速算法，为 KSTAR q 剖面闭环补上核心状态观测。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "依赖 NBI、光学标定和 Stark 模型；信号缺失会使核心 q 再次欠约束，需观测器退化模式。",
    "twinRelevance": "孪生的 q 状态必须附带诊断来源和覆盖度；MSE 有/无时应发布不同置信等级，而非无缝填补。",
    "papers": [
      {
        "title": "Real-time MSE measurements for current profile control on KSTAR",
        "authors": "M. F. M. de Bock, D. Aussems, R. Huijgen et al.",
        "year": 2012,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1063/1.4732854",
        "url": "https://doi.org/10.1063/1.4732854",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "KSTAR real-time MSE analysis",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接实现",
        "artifactType": "software",
        "access": "facility code; not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "KSTAR",
      "MSE",
      "q-profile",
      "diagnostics",
      "state estimation"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-021",
    "projectId": "CTL-CORE-021",
    "titleZh": "KSTAR 有限电流元实时边界重建",
    "titleEn": "Finite-current-element real-time boundary reconstruction for KSTAR",
    "year": 2007,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T2"
    ],
    "categoryLabel": "平衡重建、剖面观测器与状态估计服务",
    "problem": "KSTAR 形状控制需在有限磁测量、涡流和测量噪声下快速识别边界，并指导诊断布置。",
    "method": "改进有限电流元 FCE 表示等离子体电流分布，通过磁测量反演边界；扫描噪声与测量组合评估可观测性。",
    "controlArchitecture": "未完整公开。",
    "timescale": "目标为实时毫秒级；论文重点是算法/诊断设计仿真。",
    "sensors": [
      "磁探针",
      "磁通环",
      "PF 线圈电流"
    ],
    "actuators": [
      "无直接执行器；为 KSTAR ISOFLUX 提供候选边界状态"
    ],
    "devices": [
      "KSTAR：设计阶段及早期形状识别；理想/含噪合成测量仿真"
    ],
    "validation": "仿真设计研究，不应标为 KSTAR 运行中的权威重建器。",
    "results": "理想条件下报告约 7 mm 边界精度，并指出 PF 电流测量误差对形状识别影响显著，为磁诊断配置提出指南。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "7 mm 为理想/合成场景结果；真实涡流、铁磁效应、传感器漂移和非轴对称误差会降低精度。",
    "twinRelevance": "状态服务验收应区分合成可辨识度和真实数据误差，并将诊断/线圈电流标定作为模型输入而非常数。",
    "papers": [
      {
        "title": "Real-time plasma boundary reconstruction in the KSTAR tokamak using finite element method",
        "authors": "Y. M. Jeon et al.",
        "year": 2007,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2006.09.003",
        "url": "https://doi.org/10.1016/j.fusengdes.2006.09.003",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "KSTAR FCE boundary code",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接原型",
        "artifactType": "software",
        "access": "not publicly released",
        "license": "未标注"
      }
    ],
    "tags": [
      "KSTAR",
      "FCE",
      "boundary reconstruction",
      "diagnostic design",
      "noise"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-020",
    "projectId": "CTL-CORE-020",
    "titleZh": "JET/托卡马克 EQUINOX 实时平衡与剖面重建",
    "titleEn": "Equinox real-time equilibrium and profile reconstruction",
    "year": 2004,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T3"
    ],
    "categoryLabel": "平衡重建、剖面观测器与状态估计服务",
    "problem": "需用统一物理模型在不同托卡马克上实时识别边界和电流源项，并可逐步加入内部诊断。",
    "method": "固定点求解非线性 Grad–Shafranov 方程，以最小二乘拟合磁场测量和边界通量；解析/数值结构便于在 JET、Tore Supra 和 ITER 几何间迁移。",
    "controlArchitecture": "未完整公开。",
    "timescale": "面向实时控制的毫秒至数十毫秒实现。",
    "sensors": [
      "边界磁通",
      "磁场测量",
      "线圈电流",
      "可扩展内部剖面诊断"
    ],
    "actuators": [
      "无直接执行器；输出给 JET q/剖面和形状控制"
    ],
    "devices": [
      "JET：实时平衡/剖面；装置实时应用",
      "Tore Supra：实时平衡；装置应用",
      "ITER：预测研究；几何/合成数据测试"
    ],
    "validation": "JET/Tore Supra 实时应用；ITER 仅预测。",
    "results": "展示同一求解框架跨机器应用，并成为 JET 高级实时 q/剖面控制状态链的一部分。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "早期论文对实时延迟、异常诊断和跨机 UQ 报告有限；统一方程不代表统一诊断几何或误差模型。",
    "twinRelevance": "跨装置孪生应复用接口、坐标和验证协议，而不是假设同一重建参数可直接搬运。",
    "papers": [
      {
        "title": "New applications of Equinox code for real-time plasma equilibrium and profile reconstruction for tokamaks",
        "authors": "K. Bosak, J. Blum, E. Joffrin",
        "year": 2004,
        "venue": "原始论文 / 官方来源",
        "doi": "10.48550/arXiv.physics/0411181",
        "url": "https://arxiv.org/abs/physics/0411181",
        "sourceType": "author preprint / conference contribution"
      }
    ],
    "code": [
      {
        "name": "EQUINOX",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接实现",
        "artifactType": "software",
        "access": "research/facility code; no verified public canonical repository",
        "license": "未标注"
      }
    ],
    "tags": [
      "JET",
      "Tore Supra",
      "EQUINOX",
      "equilibrium",
      "cross-device"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-018",
    "projectId": "CTL-CORE-018",
    "titleZh": "DIII-D rtEFIT 实时平衡重建服务",
    "titleEn": "Real-time EFIT equilibrium reconstruction for DIII-D PCS",
    "year": 2003,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T0",
    "relatedTasks": [
      "T9"
    ],
    "categoryLabel": "平衡重建、剖面观测器与状态估计服务",
    "problem": "控制器需要毫秒级 LCFS、X 点、q 和内部形状量，而离线 EFIT 计算过慢。",
    "method": "对 EFIT 的 Grad–Shafranov 迭代、网格和约束进行实时化，利用磁测量并可引入 MSE 等内部诊断；结果写入 PCS 供 ISOFLUX、NTM 和剖面控制共享。",
    "controlArchitecture": "未完整公开。",
    "timescale": "典型 1–几 ms，具体取决于网格和诊断集。",
    "sensors": [
      "磁探针",
      "磁通环",
      "线圈/等离子体电流",
      "MSE（可选）",
      "压力约束（可选）"
    ],
    "actuators": [
      "无直接执行器；向多个 PCS 控制器提供状态"
    ],
    "devices": [
      "DIII-D：边界和动力学平衡；长期实时运行",
      "EAST/KSTAR/NSTX/MAST：派生 RT-EFIT 部署；各设施实现"
    ],
    "validation": "生产级实时服务并由多类闭环间接验证。",
    "results": "形成跨装置影响最大的实时平衡范式；DIII-D 中直接支撑 ISOFLUX、实时 MSE 平衡、NTM 镜面定位和剖面控制。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "不同 rtEFIT 分支并非同一版本；核心剖面受诊断覆盖限制，异常测量可污染多个下游控制器，存在共因故障。",
    "twinRelevance": "数字孪生必须对 rtEFIT 做版本和血缘治理，并用独立重建/合成诊断定期挑战，避免共享状态服务成为单点真理故障。",
    "papers": [
      {
        "title": "Advanced tokamak operation using the DIII-D plasma control system",
        "authors": "D. A. Humphreys et al.",
        "year": 2003,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/S0920-3796(03)00322-3",
        "url": "https://doi.org/10.1016/S0920-3796(03)00322-3",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "rtEFIT",
        "url": null,
        "status": "not-public",
        "relationship": "直接状态服务",
        "artifactType": "software",
        "access": "facility code; no complete official public source",
        "license": "未标注"
      },
      {
        "name": "TokSys",
        "url": null,
        "status": "not-public",
        "relationship": "读取/处理 EFIT g-files、构建控制模型和 PCS 在环",
        "artifactType": "software",
        "access": "public documentation/partial tool access",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "rtEFIT",
      "MSE",
      "shared state",
      "PCS"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "PCS-032",
    "projectId": "PCS-032",
    "titleZh": "GSPulse可微Grad–Shafranov脉冲设计与反馈仿真",
    "titleEn": null,
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T1",
    "relatedTasks": [
      "T2"
    ],
    "categoryLabel": "公开控制设计代码",
    "problem": "传统自由边界平衡/电路仿真难以在自动微分与优化中高效求梯度，限制端到端脉冲设计和控制器联合优化。",
    "method": "JAX实现的可微自由边界GS求解器与线圈/被动结构模型；支持轨迹优化、反馈仿真及与实验装置几何对照。",
    "controlArchitecture": "JAX实现的可微自由边界GS求解器与线圈/被动结构模型；支持轨迹优化、反馈仿真及与实验装置几何对照。 接口与 I/O：线圈电流/电压、几何、被动结构与等离子体目标；输出平衡、边界、控制轨迹及梯度。",
    "timescale": "离线设计与仿真为主；公开论文不把它声明为生产PCS的硬实时内核。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "SPARC",
      "NSTX-U",
      "MAST-U"
    ],
    "validation": "作者报告NSTX-U、MAST-U平衡/轨迹对照并用于SPARC场景设计；SPARC部分仍是设计验证。",
    "results": "公开研究代码；SPARC设计工具链。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "公开研究代码；SPARC设计工具链。",
    "limitations": "平衡模型不是完整运输/MHD/执行器/诊断数字孪生；硬实时、软件安全、确定性内存和真机I/O尚非公开目标。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "GSPulse: A differentiable free-boundary Grad-Shafranov solver for tokamak pulse design and control",
        "authors": "未完整列出",
        "year": 2025,
        "venue": "original preprint; peer-review status must be rechecked",
        "doi": null,
        "url": "https://arxiv.org/abs/2506.21760",
        "sourceType": "original preprint; peer-review status must be rechecked"
      }
    ],
    "code": [
      {
        "name": "GSPulse_public",
        "url": "https://github.com/jwai-cfs/GSPulse_public",
        "status": "official-direct",
        "relationship": "论文作者公开的直接实现。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "GSPulse",
      "JAX",
      "differentiable",
      "SPARC"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-037",
    "projectId": "PCS-037",
    "titleZh": "DINA/ DINA-IMAS非线性自由边界放电与控制设计",
    "titleEn": null,
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T1",
    "relatedTasks": [
      "T2",
      "T7"
    ],
    "categoryLabel": "公开控制设计模型",
    "problem": "评估线圈、电源、被动结构和轴对称等离子体强耦合动态，用于脉冲场景、垂直稳定、形状控制和破裂响应设计。",
    "method": "非线性自由边界MHD/电路模型与控制器、执行器和事件耦合；DINA-CH等分支用于闭环仿真，DINA-IMAS以IMAS接口公开。",
    "controlArchitecture": "非线性自由边界MHD/电路模型与控制器、执行器和事件耦合；DINA-CH等分支用于闭环仿真，DINA-IMAS以IMAS接口公开。 接口与 I/O：线圈/电源、被动结构、等离子体电流与边界、控制参考、扰动和破裂场景；IMAS IDS用于交换。",
    "timescale": "主要用于离线或加速控制设计；模型细节和数值设置决定是否能实时，不能统一声称硬实时。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "ITER",
      "JT-60SA",
      "EAST",
      "HL-2M",
      "多装置"
    ],
    "validation": "长期通过多装置场景与控制研究、ITER/JT-60SA设计比较；公开DINA-IMAS使接口和部分实现可审计，但装置专用参数仍需验证。",
    "results": "控制设计与场景验证，不等同于生产PCS。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "控制设计与场景验证，不等同于生产PCS。",
    "limitations": "轴对称模型不覆盖全部3D MHD、湍流、材料和诊断退化；参数辨识与跨装置配置是主要成本。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "DINA-CH: A tokamak plasma control simulation code",
        "authors": "未完整列出",
        "year": 2005,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2005.06.284",
        "url": "https://doi.org/10.1016/j.fusengdes.2005.06.284",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "DINA-IMAS",
        "url": "https://github.com/iterorganization/DINA-IMAS",
        "status": "official-direct",
        "relationship": "ITER组织名下的公开实现；历史DINA分支和装置参数不应据此一概标为开源。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "DINA",
      "DINA-IMAS",
      "free boundary",
      "control simulation"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "CTL-CORE-003",
    "projectId": "CTL-CORE-003",
    "titleZh": "EAST 1056 秒全非感应运行的零环电压与磁控制",
    "titleEn": "Real-time plasma control of fully non-inductive operation in the EAST 1056 s discharge",
    "year": 2023,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T1",
    "relatedTasks": [],
    "categoryLabel": "启动、等离子体电流与磁通管理",
    "problem": "长脉冲中磁积分器漂移、壁状态演化和电流扩散会破坏位置、形状和非感应电流平衡。",
    "method": "实时平衡/形状控制与等离子体电流控制并行，以 LHW 功率闭环调节环电压到零；采用无积分漂移的光纤电流传感器提高长脉冲电流测量可靠性。",
    "controlArchitecture": "未完整公开。",
    "timescale": "磁位置/形状毫秒级；LHW—环电压与电流扩散为百毫秒至秒级；总体运行 1056 s。",
    "sensors": [
      "光纤电流传感器 FOCS",
      "磁诊断/P-EFIT",
      "环电压",
      "位置和形状误差"
    ],
    "actuators": [
      "PF 线圈",
      "快速垂直线圈",
      "低杂波加热/电流驱动功率"
    ],
    "devices": [
      "EAST：全非感应长脉冲；1056 s 装置闭环放电"
    ],
    "validation": "真实超导托卡马克长脉冲闭环。",
    "results": "报告了 1056 s 全非感应放电、超过 1.7 GJ 注入—提取能量，位置/形状维持在毫米量级，并以 LHW 实现零环电压调节。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "会议资料未给出完整误差预算、控制器参数与故障统计；单次纪录放电不能替代跨壁状态和跨年度的可用率验证。",
    "twinRelevance": "是长脉冲孪生的关键范例：状态估计必须解决漂移，电流/形状/加热要跨时间尺度协同，并把壁状态作为慢变量。",
    "papers": [
      {
        "title": "Real-time plasma control of fully non-inductive operation in EAST 1056 s long pulse discharge",
        "authors": "Y. Huang et al.",
        "year": 2022,
        "venue": "原始论文 / 官方来源",
        "doi": null,
        "url": "https://conferences.iaea.org/event/258/contributions/24800/",
        "sourceType": "official IAEA technical-meeting contribution"
      },
      {
        "title": "Realization of Te0 > 10 keV long pulse operation over 100 s on EAST",
        "authors": "X. Gong et al.",
        "year": 2023,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/2058-6272/ac9cc6",
        "url": "https://doi.org/10.1088/2058-6272/ac9cc6",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "EAST PCS / P-EFIT",
        "url": null,
        "status": "not-public",
        "relationship": "直接实时平衡、形状和场景控制",
        "artifactType": "software",
        "access": "facility software; not publicly released as an operational stack",
        "license": "未标注"
      },
      {
        "name": "Py-EFIT",
        "url": null,
        "status": "not-public",
        "relationship": "EAST 平衡研究的相关实现，不等同于运行中的 GPU P-EFIT",
        "artifactType": "software",
        "access": "paper describes readable Python source; public canonical repository not verified",
        "license": "未标注"
      }
    ],
    "tags": [
      "EAST",
      "non-inductive",
      "zero loop voltage",
      "LHW",
      "long pulse"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-002",
    "projectId": "CTL-CORE-002",
    "titleZh": "JT-60SA 击穿与电流爬升运行场景",
    "titleEn": "Operation scenarios for plasma breakdown and current ramp-up in JT-60SA",
    "year": 2015,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T1",
    "relatedTasks": [],
    "categoryLabel": "启动、等离子体电流与磁通管理",
    "problem": "超导装置预磁化、真空室/稳定板涡流和杂散场会限制击穿窗口，需形成可重复且不过载的启动轨迹。",
    "method": "以 TOSCA 三维电磁场计算评估半/全预磁化方案，优化 PF/EF 线圈波形并验证击穿区杂散场、环电压与初始垂直场条件。",
    "controlArchitecture": "未完整公开。",
    "timescale": "击穿前后为毫秒至百毫秒；电流爬升为秒级。",
    "sensors": [
      "PF/CS 电流",
      "环电压",
      "击穿区磁场",
      "初始等离子体电流"
    ],
    "actuators": [
      "CS",
      "EF/PF 线圈",
      "预磁化波形"
    ],
    "devices": [
      "JT-60SA：半预磁化与全预磁化启动方案；TOSCA 电磁仿真"
    ],
    "validation": "工程/等离子体启动设计仿真；论文不等同于装置闭环实验。",
    "results": "计算表明击穿期导体涡流可与约 600 kA 等离子体电流同量级，优化后的两类场景仍能满足启动条件，并给出外侧 EF 线圈补偿涡流垂直场的策略。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "主要验证电磁可行性，未完整耦合烧穿、壁条件不确定性与实时状态估计；首等离子体后的装置实测还需反标模型。",
    "twinRelevance": "说明启动孪生不能只有 0D 电流模型，必须纳入三维涡流、磁体电源和击穿可行域，并在每次放电后更新杂散场模型。",
    "papers": [
      {
        "title": "Development of operation scenarios for plasma breakdown and current ramp-up phases in JT-60SA tokamak",
        "authors": "S. Ide et al.",
        "year": 2015,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2015.06.138",
        "url": "https://doi.org/10.1016/j.fusengdes.2015.06.138",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "TOSCA",
        "url": "https://www.3ds.com/products/simulia/opera",
        "status": "commercial-enabling",
        "relationship": "三维线圈—导体电磁场与涡流验证工具",
        "artifactType": "commercial-software",
        "access": "commercial/closed",
        "license": "未标注"
      }
    ],
    "tags": [
      "JT-60SA",
      "breakdown",
      "TOSCA",
      "eddy current",
      "premagnetization"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-001",
    "projectId": "CTL-CORE-001",
    "titleZh": "ITER 电流爬升阶段的 DINA 分层磁控制",
    "titleEn": "Design and modeling of ITER plasma magnetic control during current ramp-up",
    "year": 2010,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T1",
    "relatedTasks": [],
    "categoryLabel": "启动、等离子体电流与磁通管理",
    "problem": "在强真空室涡流、PF/CS 电压与电流约束以及垂直不稳定并存时，使等离子体电流、形状和位置从击穿后阶段连续过渡到平顶。",
    "method": "内层磁体电流解耦，外层以伪逆分配和 PII 控制跟踪等离子体电流/形状，另设垂直速度 P 控制；控制器直接与非线性 DINA 自由边界模型闭环。",
    "controlArchitecture": "未完整公开。",
    "timescale": "垂直稳定为毫秒至十毫秒；电流爬升与形状轨迹为秒至百秒级（ITER 场景）。",
    "sensors": [
      "磁探针与磁通环的合成测量",
      "PF/CS 线圈电流",
      "等离子体电流",
      "边界间隙/垂直速度估计"
    ],
    "actuators": [
      "中央螺线管",
      "PF 线圈",
      "快速垂直稳定线圈/电压命令"
    ],
    "devices": [
      "ITER：15 MA 基线场景设计；非线性 DINA 闭环仿真"
    ],
    "validation": "控制器—DINA 闭环仿真；尚无 ITER 实验。",
    "results": "展示了从爬升跟踪到准稳态无需改变总体控制结构的可行性，并把线圈电流回路、等离子体形状/电流回路和垂直稳定回路明确分层。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "仿真结果依赖 DINA 场景、涡流和执行器模型；击穿与烧穿等原子过程被简化，尚未覆盖诊断故障、通信抖动和真实电源保护逻辑。",
    "twinRelevance": "可作为 DINA/MEQ 切入数字孪生的首个模板：将场景轨迹、状态估计、线圈约束、闭环结果和版本化模型放入同一可回放服务。",
    "papers": [
      {
        "title": "Design and Modeling of ITER Plasma Magnetic Control System in Plasma Current Ramp-Up Phase on DINA Code",
        "authors": "Y. V. Mitrishkin, N. M. Kartsev et al.",
        "year": 2010,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1109/CDC.2009.5400897",
        "url": "https://doi.org/10.1109/CDC.2009.5400897",
        "sourceType": "peer-reviewed conference paper"
      }
    ],
    "code": [
      {
        "name": "DINA",
        "url": null,
        "status": "not-public",
        "relationship": "直接的非线性自由边界被控对象",
        "artifactType": "software",
        "access": "restricted/not publicly released",
        "license": "未标注"
      },
      {
        "name": "ITER PCSSP",
        "url": "https://github.com/iterorganization/PCSSP",
        "status": "official-enabling",
        "relationship": "可复建控制器—模型闭环与后续 ITER 控制算法测试，但不包含 DINA 本体",
        "artifactType": "software",
        "access": "official open repository; MATLAB",
        "license": "未标注"
      }
    ],
    "tags": [
      "ITER",
      "DINA",
      "current ramp-up",
      "PF/CS",
      "vertical stabilization"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-004",
    "projectId": "CTL-CORE-004",
    "titleZh": "DIII-D 电流爬升期安全因子剖面形成控制",
    "titleEn": "Feedback control of safety-factor-profile evolution during advanced-scenario formation in DIII-D",
    "year": 2006,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T1",
    "relatedTasks": [
      "T0",
      "T3"
    ],
    "categoryLabel": "启动、等离子体电流与磁通管理",
    "problem": "高 qmin 稳态场景需要在电流爬升早期形成弱反剪切/宽电流剖面；纯前馈对密度、温度和电流扩散误差敏感。",
    "method": "实时 MSE 约束的 rtEFIT 提供 q 剖面特征，以等离子体电流斜率和加热/电流驱动功率作反馈执行量，调节 qmin/剖面演化。",
    "controlArchitecture": "未完整公开。",
    "timescale": "电流扩散与场景形成约 0.1–数秒；PCS 内部采样更快。",
    "sensors": [
      "MSE",
      "实时 EFIT",
      "磁诊断",
      "储能/β 信号"
    ],
    "actuators": [
      "等离子体电流目标",
      "NBI",
      "ECCD/ECH"
    ],
    "devices": [
      "DIII-D：高 qmin 先进托卡马克场景形成；装置闭环实验"
    ],
    "validation": "真实装置专项闭环，验证目标是场景形成而非全脉冲自治。",
    "results": "早期实验表明能以反馈改变安全因子演化并提高高 qmin 场景的重复性，为后续 q+能量多变量控制建立了诊断和 PCS 链路。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "MSE 可用率、早期时段平衡不确定度和执行器饱和限制可控性；控制特征不等同于完整 q(r) 的任意整形。",
    "twinRelevance": "提示孪生应将 ramp-up 视为可达性优化问题：目标剖面、执行器轨迹、状态置信度与最终场景成功率必须联结。",
    "papers": [
      {
        "title": "Feedback control of the safety factor profile evolution during formation of an advanced tokamak discharge",
        "authors": "J. R. Ferron et al.",
        "year": 2006,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/0029-5515/46/12/L01",
        "url": "https://doi.org/10.1088/0029-5515/46/12/L01",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "DIII-D PCS/rtEFIT/TokSys",
        "url": null,
        "status": "not-public",
        "relationship": "直接状态重建、控制实现和闭环验证工具链",
        "artifactType": "software",
        "access": "TokSys documentation public; operational PCS/configuration restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "q-profile",
      "ramp-up",
      "MSE",
      "rtEFIT"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-013",
    "projectId": "CTL-CORE-013",
    "titleZh": "TCV 首次实验性模型预测形状控制",
    "titleEn": "First experimental demonstration of plasma shape control through MPC",
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "传统形状控制难显式处理线圈、电源和形状输出约束，也难在大目标转换中优化瞬态。",
    "method": "MEQ/fge 线性化等离子体响应与 TCV 核心磁控制状态空间模型耦合；上层 MPC 每周期求解二次规划，优化内层控制参考并施加输出约束。",
    "controlArchitecture": "未完整公开。",
    "timescale": "内层约 10 kHz；MPC 作为较慢上层参考优化器，毫秒量级。",
    "sensors": [
      "TCV 实时磁状态/LIUQE",
      "内层磁控制状态",
      "形状输出与约束"
    ],
    "actuators": [
      "经内层回路作用的 PF 线圈参考"
    ],
    "devices": [
      "TCV：受约束形状跟踪；仿真与真实装置闭环"
    ],
    "validation": "真实装置专项实验；截至论文为首次 tokamak MPC 形状实证。",
    "results": "在保留成熟内层磁控制的同时，用实时 QP 改善形状目标跟踪并显式满足输出约束，验证了分层 MPC 而非替换全部底层回路的路线。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "线性模型与有限预测域限制大扰动外推；求解器最坏时延、不可行问题处置和电源内部约束仍需装置级验证。",
    "twinRelevance": "非常适合作为 DINA/MEQ 控制服务的下一步：孪生给 MPC 提供预测模型、约束和不确定度，底层 PCS 保留确定性稳定功能。",
    "papers": [
      {
        "title": "First experimental demonstration of plasma shape control in a tokamak through Model Predictive Control",
        "authors": "A. Mele, M. A. Topalova, C. Galperti, S. Coda et al.",
        "year": 2025,
        "venue": "原始论文 / 官方来源",
        "doi": "10.48550/arXiv.2506.20096",
        "url": "https://arxiv.org/abs/2506.20096",
        "sourceType": "conference paper / author preprint"
      }
    ],
    "code": [
      {
        "name": "MEQ/fge",
        "url": null,
        "status": "not-public",
        "relationship": "直接线性化被控对象",
        "artifactType": "software",
        "access": "research toolbox; no verified public canonical repository",
        "license": "未标注"
      },
      {
        "name": "PCSSP",
        "url": "https://github.com/iterorganization/PCSSP",
        "status": "official-enabling",
        "relationship": "可迁移实现相似分层 MPC/控制器在环流程",
        "artifactType": "software",
        "access": "official open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "TCV",
      "MPC",
      "MEQ",
      "QP",
      "hierarchical control"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-012",
    "projectId": "CTL-CORE-012",
    "titleZh": "TCV 深度强化学习统一磁控制",
    "titleEn": "Magnetic control of tokamak plasmas through deep reinforcement learning",
    "year": 2022,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "传统控制器常按形状和阶段分别设计，面对 19 路耦合线圈、构型转换和雪花/负三角度等目标时工程量大。",
    "method": "在自由边界模拟器中用非对称 actor–critic/MPO 训练策略，域随机化覆盖模型偏差；策略以 10 kHz 读取磁/线圈状态并直接输出 19 路电压命令，零样本迁移到 TCV。",
    "controlArchitecture": "未完整公开。",
    "timescale": "10 kHz，即 100 μs 控制周期。",
    "sensors": [
      "磁测量",
      "线圈电流",
      "等离子体电流",
      "目标形状描述"
    ],
    "actuators": [
      "TCV 19 路可控线圈电压"
    ],
    "devices": [
      "TCV：常规、伸长、负三角度、雪花、双等离子体等；多组装置闭环实验"
    ],
    "validation": "真实装置零样本 sim-to-real 闭环。",
    "results": "单一学习框架完成多种传统与先进形状、构型转换及双等离子体控制，策略编译后满足 10 kHz 实时约束。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "未给出形式化稳定/约束保证；有效域由模拟器和随机化决定，策略权重、训练集与装置接口未开放，且实验保护仍由传统系统承担。",
    "twinRelevance": "说明高保真但实时可承受的训练孪生可自动生成控制策略；工程上仍应采用安全投影、传统回退和适用域监测。",
    "papers": [
      {
        "title": "Magnetic control of tokamak plasmas through deep reinforcement learning",
        "authors": "J. Degrave, F. Felici, J. Buchli et al.",
        "year": 2022,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1038/s41586-021-04301-9",
        "url": "https://doi.org/10.1038/s41586-021-04301-9",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "TCV RL simulator, training data and deployed policy",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接资产",
        "artifactType": "software",
        "access": "not publicly released as a reproducible package",
        "license": "未标注"
      },
      {
        "name": "Acme",
        "url": "https://github.com/google-deepmind/acme",
        "status": "official-enabling",
        "relationship": "通用强化学习基础设施；不含 TCV 模型、策略和实验接口",
        "artifactType": "software",
        "access": "official open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "TCV",
      "deep RL",
      "10 kHz",
      "snowflake",
      "negative triangularity"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CPT-012",
    "projectId": "CPT-012",
    "titleZh": "EAST垂直增长率实时反馈",
    "titleEn": "Real-time vertical-growth-rate feedback on EAST",
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [],
    "categoryLabel": "垂直稳定边界控制",
    "problem": "高性能形状接近垂直稳定边界，需要在线量化增长率并微调形状。",
    "method": "利用GPU加速模型/代理和实时平衡信息估计垂直增长率，在EAST PCS中调整边界/形状。",
    "controlArchitecture": "未完整公开。",
    "timescale": "毫秒至数十毫秒",
    "sensors": [
      "磁测量",
      "实时平衡",
      "线圈电流"
    ],
    "actuators": [
      "PF线圈",
      "形状参考值"
    ],
    "devices": [
      "EAST"
    ],
    "validation": "2019年EAST实验验证。",
    "results": "通过较小的形状和边界变化把增长率维持在目标附近，展示性能边界的主动管理。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "对平衡重建、模型覆盖和GPU确定性延迟敏感；稳定裕度目标需与性能目标联合设定。",
    "twinRelevance": "适合建立实时稳定裕度仪表、影子模式与闭环退让策略。",
    "papers": [
      {
        "title": "Design of real-time feedback control of vertical growth rate on EAST",
        "authors": "N.-N. Bao, Y. Huang, B.-J. Xiao, Q.-P. Yuan, Z.-P. Luo, Y.-H. Wang and S.-L. Chen",
        "year": 2021,
        "venue": "Nuclear Science and Techniques",
        "doi": "10.1007/s41365-021-00907-w",
        "url": "https://doi.org/10.1007/s41365-021-00907-w",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "EAST vertical-growth feedback",
        "url": null,
        "status": "not-public",
        "relationship": "装置GPU/PCS实现未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CTL-CORE-008",
    "projectId": "CTL-CORE-008",
    "titleZh": "KSTAR 快—慢分频垂直稳定控制",
    "titleEn": "Improved fast vertical control in KSTAR",
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "超导 PF 线圈不能快速抑制高伸长等离子体垂直不稳定，早期两磁探针估计噪声又限制反馈增益。",
    "method": "使用真空室内常导 IVC 线圈承担高频垂直控制，超导 PF 承担慢位置/形状；相对磁通和上下对称环电压差改善 Z 估计，高通滤波解耦快慢回路。",
    "controlArchitecture": "未完整公开。",
    "timescale": "快垂直回路约毫秒；超导形状回路数十毫秒及以上。",
    "sensors": [
      "相对磁通",
      "上下对称磁通环电压差",
      "磁探针",
      "rtEFIT/ISOFLUX 形状"
    ],
    "actuators": [
      "IVC 快控线圈",
      "超导 PF 线圈"
    ],
    "devices": [
      "KSTAR：高伸长、高三角度平顶；装置实验"
    ],
    "validation": "真实装置闭环并用于接近垂直稳定极限的放电。",
    "results": "提高了 Z 估计信噪比和允许反馈增益，减少 IVC 与慢 PF 控制冲突，使接近垂直稳定极限的形状更可靠。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "估计器仍依赖特定磁几何和标定；高频/低频硬切分在执行器饱和、供电故障和大 VDE 下需更强监督逻辑。",
    "twinRelevance": "为孪生给出明确多速率架构：同一 Z 状态要有快、慢两个估计/控制通道以及带宽和权限边界。",
    "papers": [
      {
        "title": "Improved fast vertical control in KSTAR",
        "authors": "D. Mueller, S. H. Hahn, N. Eidietis et al.",
        "year": 2019,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2019.02.046",
        "url": "https://doi.org/10.1016/j.fusengdes.2019.02.046",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "KSTAR PCS",
        "url": null,
        "status": "not-public",
        "relationship": "直接运行快慢垂直与 ISOFLUX 控制",
        "artifactType": "software",
        "access": "facility adaptation of DIII-D PCS; not public",
        "license": "未标注"
      },
      {
        "name": "TokSys",
        "url": null,
        "status": "not-public",
        "relationship": "同源控制设计与垂直响应建模工具",
        "artifactType": "software",
        "access": "documented/partially accessible",
        "license": "未标注"
      }
    ],
    "tags": [
      "KSTAR",
      "vertical control",
      "IVC",
      "frequency separation",
      "superconducting PF"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-007",
    "projectId": "CTL-CORE-007",
    "titleZh": "EAST GPU P-EFIT 与 ISOFLUX 形状闭环",
    "titleEn": "GPU-parallel equilibrium reconstruction and ISOFLUX control on EAST",
    "year": 2018,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "33×33 简化 RT-EFIT 难兼顾速度和空间分辨率，长脉冲又要求可靠的实时边界/X 点输出。",
    "method": "以 CUDA 并行完整 EFIT 迭代，在 65×65 网格上重建平衡并通过实时共享内存馈入 ISOFLUX 控制。",
    "controlArchitecture": "未完整公开。",
    "timescale": "重建约 0.7–1 ms；形状回路毫秒级。",
    "sensors": [
      "磁探针",
      "磁通环",
      "PF 电流",
      "POINT 偏振干涉测量（剖面扩展）"
    ],
    "actuators": [
      "PF 线圈",
      "快控线圈"
    ],
    "devices": [
      "EAST：常规/先进形状与长脉冲；2014 专项 P-EFIT/ISOFLUX 闭环实验"
    ],
    "validation": "实时 PCS 集成并完成装置闭环。",
    "results": "65×65 P-EFIT 满足控制时限；P-EFIT/ISOFLUX 在 EAST 专项实验中成功建立闭环，后续磁+POINT 版本在约 0.7 ms 提供电流/q 剖面。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "GPU 时延并非唯一风险；长脉冲磁漂移、POINT 标定、单 GPU 故障和版本一致性需要系统级冗余。",
    "twinRelevance": "展示了‘高分辨率状态服务—控制器’协同；孪生应记录每周期输入覆盖、求解残差、运行时和回退到低阶重建的触发条件。",
    "papers": [
      {
        "title": "Implementation of GPU parallel equilibrium reconstruction for plasma control in EAST",
        "authors": "Y. Huang, B. Xiao et al.",
        "year": 2016,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2016.02.048",
        "url": "https://doi.org/10.1016/j.fusengdes.2016.02.048",
        "sourceType": "peer-reviewed journal article"
      },
      {
        "title": "Development of real-time plasma current profile reconstruction with POINT diagnostic for EAST plasma control",
        "authors": "Y. Huang et al.",
        "year": 2018,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2017.05.005",
        "url": "https://doi.org/10.1016/j.fusengdes.2017.05.005",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "P-EFIT",
        "url": null,
        "status": "not-public",
        "relationship": "直接实时平衡服务",
        "artifactType": "software",
        "access": "facility CUDA code; no verified public canonical repository",
        "license": "未标注"
      }
    ],
    "tags": [
      "EAST",
      "P-EFIT",
      "GPU",
      "ISOFLUX",
      "POINT"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-014",
    "projectId": "CTL-CORE-014",
    "titleZh": "DIII-D 雪花偏滤器双零点实时控制",
    "titleEn": "Initial development of the DIII-D snowflake divertor control",
    "year": 2018,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [
      "T5"
    ],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "雪花构型的两个相近一阶零点对等离子体电流和 PF 扰动高度敏感，普通边界控制不能稳定二阶零点几何。",
    "method": "实时在偏滤器局部展开 Grad–Shafranov 方程求两个零点位置，解析推导 PF 电流变化到零点位移的线性关系，并多线圈同步反馈。",
    "controlArchitecture": "未完整公开。",
    "timescale": "磁几何控制为毫秒至十毫秒；热负荷响应为能量约束时间至秒。",
    "sensors": [
      "实时磁平衡",
      "局部磁场导数/零点位置",
      "红外热流作为物理验证"
    ],
    "actuators": [
      "多组 PF 线圈"
    ],
    "devices": [
      "DIII-D：snowflake / snowflake-plus/minus；装置闭环实验"
    ],
    "validation": "真实装置先进偏滤器构型闭环。",
    "results": "同时控制两个零点，在多种 DIII-D 场景中维持雪花；代表性结果报告峰值热流约降低 2.5 倍并保持 2–3 s，未见明显核心性能损失。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "局部线性化在零点拓扑变化和诊断噪声下敏感；磁几何成功不保证脱靶、杂质和材料温度长期安全。",
    "twinRelevance": "应把‘拓扑指标’作为一等状态：零点阶数、距离、通量扩张和热流证据要与 PF 裕度同步展示。",
    "papers": [
      {
        "title": "Initial development of the DIII-D snowflake divertor control",
        "authors": "E. Kolemen, P. J. Vail, M. A. Makowski et al.",
        "year": 2018,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/1741-4326/aab0d3",
        "url": "https://doi.org/10.1088/1741-4326/aab0d3",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "DIII-D snowflake controller / PCS",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接算法",
        "artifactType": "software",
        "access": "facility software; not public",
        "license": "未标注"
      },
      {
        "name": "TokSys",
        "url": null,
        "status": "not-public",
        "relationship": "磁响应和 PCS 在环设计的相关工具",
        "artifactType": "software",
        "access": "documented/partial",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "snowflake",
      "null control",
      "divertor",
      "heat flux"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-011",
    "projectId": "CTL-CORE-011",
    "titleZh": "MAST rtEFIT 实时磁形状控制链",
    "titleEn": "New magnetic real-time shape control for MAST",
    "year": 2014,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [
      "T0"
    ],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "仅凭中平面 Dα 光学相机只能控制外半径，无法为 MAST-U Super-X 等复杂偏滤器构型提供完整边界/X 点控制。",
    "method": "rtEFIT 重建边界，FIESTA 计算静态形状—线圈关系，CREATE-L 生成闭环状态空间模型；实际 PCS 控制代码直接置于仿真回路中调参和调试。",
    "controlArchitecture": "未完整公开。",
    "timescale": "磁重建和形状回路为毫秒级。",
    "sensors": [
      "磁探针/磁通环",
      "PF 电流",
      "rtEFIT 边界",
      "Dα 相机作为原有对照"
    ],
    "actuators": [
      "MAST PF 线圈"
    ],
    "devices": [
      "MAST：常规形状；面向 MAST-U 扩展；2011–2012 装置专项闭环"
    ],
    "validation": "真实装置闭环，且完成控制代码在环预验证。",
    "results": "建立了从 FIESTA/CREATE-L 到 PCS 的完整设计—仿真—实现链，专项实验成功使用 rtEFIT 形状控制，为 MAST-U 偏滤器控制奠定基础。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "静态响应和线性状态空间模型在大构型变化下需重新验证；旧 MAST 成果不能自动代表 MAST-U Super-X 全运行域。",
    "twinRelevance": "是‘相同控制二进制在仿真和装置中运行’的典型，适合作为数字孪生控制服务验收基线。",
    "papers": [
      {
        "title": "New magnetic real time shape control for MAST",
        "authors": "L. Pangione, G. McArdle, J. Storrs",
        "year": 2014,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2013.12.003",
        "url": "https://arxiv.org/abs/1310.8450",
        "sourceType": "peer-reviewed journal article / author preprint"
      }
    ],
    "code": [
      {
        "name": "FreeGSNKE",
        "url": "https://github.com/FusionComputingLab/freegsnke",
        "status": "official-enabling",
        "relationship": "已用 MAST-U EFIT 进行动态验证，可开放复建自由边界/形状控制",
        "artifactType": "software",
        "access": "official UKAEA-linked open source; LGPL-3.0",
        "license": "未标注"
      },
      {
        "name": "FIESTA/CREATE-L/MAST PCS",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接设计和在环工具",
        "artifactType": "software",
        "access": "facility/research codes; not generally public",
        "license": "未标注"
      }
    ],
    "tags": [
      "MAST",
      "MAST-U",
      "rtEFIT",
      "FIESTA",
      "CREATE-L"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-016",
    "projectId": "CTL-CORE-016",
    "titleZh": "ITER 分层电流—位置—形状与垂直稳定控制",
    "titleEn": "Plasma current, shape and position control in ITER",
    "year": 2014,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [
      "T9"
    ],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "燃烧阶段必须避免高温等离子体触壁，同时应对 H–L 转换、β 下降、VDE 与超导 PF/电源饱和。",
    "method": "快速内层 VS 使用在真空室内线圈稳定垂直模；外层 SC 控制等离子体电流、位置及多个壁间隙/打击点，结合抗饱和与线圈电流限制逻辑。",
    "controlArchitecture": "未完整公开。",
    "timescale": "VS 为毫秒级；外层形状/电流为数十毫秒至秒级。",
    "sensors": [
      "磁诊断",
      "PF/VS 线圈电流",
      "边界间隙",
      "等离子体电流",
      "β/内感扰动估计"
    ],
    "actuators": [
      "中央螺线管",
      "6 个 PF 线圈",
      "2 个真空室内 VS 线圈"
    ],
    "devices": [
      "ITER：15 MA 基线与燃烧阶段；线性/非线性模型和 PCSSP/CREATE-NL+/DINA 仿真"
    ],
    "validation": "设计级仿真；ITER 尚无等离子体实证。",
    "results": "经典设计显示可在约 15 cm 间隙扰动和 0.2 级 poloidal-beta 下降后恢复形状；后续研究比较 SOF/LQG VS 并优化 VDE 后恢复。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "所有性能仍为模型预测；真实诊断延迟、辐照退化、超导电源异常和三维误差场会改变闭环裕度。",
    "twinRelevance": "是分层控制孪生的参考架构；必须严格标注‘设计验证’而非‘装置验证’，并保存每个扰动用例和饱和证据。",
    "papers": [
      {
        "title": "Plasma Current, Shape, and Position Control in ITER",
        "authors": "R. Albanese, G. Ambrosino, M. Ariola et al.",
        "year": 1996,
        "venue": "原始论文 / 官方来源",
        "doi": "10.13182/FST96-A30749",
        "url": "https://doi.org/10.13182/FST96-A30749",
        "sourceType": "peer-reviewed journal article"
      },
      {
        "title": "Improving magnetic plasma control for ITER",
        "authors": "S. Gerksic et al.",
        "year": 2014,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2013.12.034",
        "url": "https://doi.org/10.1016/j.fusengdes.2013.12.034",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "ITER PCSSP",
        "url": "https://github.com/iterorganization/PCSSP",
        "status": "official-enabling",
        "relationship": "ITER 控制算法/被控对象组合与测试平台",
        "artifactType": "software",
        "access": "official open source; MATLAB",
        "license": "未标注"
      },
      {
        "name": "CREATE-NL+/DINA",
        "url": null,
        "status": "not-public",
        "relationship": "高保真自由边界验证后端",
        "artifactType": "software",
        "access": "research/restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "ITER",
      "vertical stabilization",
      "shape control",
      "PCSSP",
      "actuator saturation"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CPT-009",
    "projectId": "CPT-009",
    "titleZh": "ITER显式MPC垂直稳定",
    "titleEn": "Explicit MPC vertical stabilization for ITER",
    "year": 2013,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [],
    "categoryLabel": "垂直稳定",
    "problem": "ITER垂直稳定需同时使用快慢执行器并满足电压、电流和热约束。",
    "method": "把有限时域MPC离线求解为分段仿射显式控制律，协调真空室内欧姆执行器和超导PF线圈。",
    "controlArchitecture": "未完整公开。",
    "timescale": "亚毫秒至数毫秒快速回路；慢执行器更长",
    "sensors": [
      "磁测量",
      "垂直位置/速度估计",
      "线圈状态"
    ],
    "actuators": [
      "ITER真空室内垂直稳定执行器",
      "超导PF线圈"
    ],
    "devices": [
      "ITER"
    ],
    "validation": "ITER模型数值仿真；未在ITER等离子体上验证。",
    "results": "显式MPC可把热和电气限制直接写入控制律，为实时约束处理提供设计依据。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "依赖线性化模型与状态估计，组合区数量、模型偏差和故障情景会增加认证难度；非实验结果。",
    "twinRelevance": "是约束可行域、模型版本和控制律认证应进入数字孪生证据链的直接案例。",
    "papers": [
      {
        "title": "Vertical stabilization of ITER plasma using explicit model predictive control",
        "authors": "S. Gerkšič and G. de Tommasi",
        "year": 2013,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2013.02.021",
        "url": "https://doi.org/10.1016/j.fusengdes.2013.02.021",
        "sourceType": "peer-reviewed simulation/design"
      }
    ],
    "code": [
      {
        "name": "ITER eMPC design implementation",
        "url": null,
        "status": "not-public",
        "relationship": "论文未给出公开可运行仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-008",
    "projectId": "CPT-008",
    "titleZh": "JET增强垂直稳定系统首等离子体运行",
    "titleEn": "Enhanced vertical-stabilization system operation on JET",
    "year": 2011,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [
      "T7",
      "T6"
    ],
    "categoryLabel": "垂直稳定",
    "problem": "高伸长等离子体垂直不稳定增长快，升级后需要更强的径向场放大器与可靠保护链。",
    "method": "基于等离子体/电源/导体模型设计增强VS，采用离线验证、逐级通电和等离子体调试，闭环驱动快速线圈。",
    "controlArchitecture": "未完整公开。",
    "timescale": "亚毫秒至数毫秒",
    "sensors": [
      "磁探针",
      "线圈电流",
      "实时垂直位置估计"
    ],
    "actuators": [
      "增强径向场放大器",
      "垂直稳定线圈"
    ],
    "devices": [
      "JET"
    ],
    "validation": "模型、离线测试和JET首等离子体运行。",
    "results": "增强VS完成分阶段投运并进入装置运行，是快速控制工程化和机器保护协同的成熟案例。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "JET特定导体、电源和磁诊断模型不可直接移植；饱和时仍需安全终止层接管。",
    "twinRelevance": "说明快速孪生应覆盖电源饱和、线圈/真空室涡流、延迟和投运证据。",
    "papers": [
      {
        "title": "First plasma operation of the enhanced JET vertical stabilisation system",
        "authors": "F.G. Rimini, F. Crisanti, R. Albanese, G. Ambrosino, M. Ariola, G. Artaserse, T. Bellizio et al.",
        "year": 2011,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2011.03.122",
        "url": "https://doi.org/10.1016/j.fusengdes.2011.03.122",
        "sourceType": "peer-reviewed primary experiment/commissioning"
      }
    ],
    "code": [
      {
        "name": "JET enhanced VS controller",
        "url": null,
        "status": "not-public",
        "relationship": "JET装置控制与电源接口未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CTL-CORE-010",
    "projectId": "CTL-CORE-010",
    "titleZh": "JET 极限形状控制器 XSC",
    "titleEn": "Design, implementation and test of the eXtreme Shape Controller in JET",
    "year": 2005,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "高三角度、高伸长与靠壁场景中，传统少量形状量控制难以充分利用 PF 能力并避免线圈饱和。",
    "method": "基于线性响应模型和奇异值分解选择可控形状方向，XSC 同时调节多个等磁通/间隙目标，并与 JET 现有垂直/电流回路级联。",
    "controlArchitecture": "未完整公开。",
    "timescale": "形状回路约毫秒至十毫秒；垂直内环更快。",
    "sensors": [
      "JET 实时边界重建",
      "磁测量",
      "PF 电流",
      "形状/间隙误差"
    ],
    "actuators": [
      "JET PF 线圈与电源"
    ],
    "devices": [
      "JET：极限形状与多类实验场景；装置闭环实验"
    ],
    "validation": "真实装置闭环并融入实验运行。",
    "results": "实现比传统控制更高维的形状调节，在复杂和极限构型上验证了 SVD 控制方向选择与抗饱和设计。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "线性响应随 β、内感和构型改变；SVD 截断提高鲁棒性但牺牲部分形状自由度，且不能单独保证 PFC 热安全。",
    "twinRelevance": "应在孪生中展示可控/不可控形状子空间、奇异值和线圈裕度，让操作者理解目标为何不可同时达到。",
    "papers": [
      {
        "title": "Design, implementation and test of the XSC extreme shape controller in JET",
        "authors": "R. Albanese, G. Ambrosino, M. Ariola et al.",
        "year": 2005,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2005.06.290",
        "url": "https://doi.org/10.1016/j.fusengdes.2005.06.290",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "JET XSC/real-time boundary code",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接实现",
        "artifactType": "software",
        "access": "facility software; not public",
        "license": "未标注"
      },
      {
        "name": "PCSSP",
        "url": "https://github.com/iterorganization/PCSSP",
        "status": "official-enabling",
        "relationship": "可用于重构同类 SVD/约束形状控制架构，非 JET XSC 源码",
        "artifactType": "software",
        "access": "official open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "JET",
      "XSC",
      "SVD",
      "extreme shape",
      "PF coils"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-006",
    "projectId": "CTL-CORE-006",
    "titleZh": "DIII-D rtEFIT—ISOFLUX 位置与复杂形状控制",
    "titleEn": "Advanced tokamak operation using the DIII-D PCS with rtEFIT/isoflux control",
    "year": 2003,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [
      "T0",
      "T9"
    ],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "需在 β 变化、涡流和多线圈耦合下保持 LCFS、X 点、间隙与高伸长形状，并支持多种拓扑。",
    "method": "rtEFIT 实时求解 Grad–Shafranov 平衡；ISOFLUX 以边界控制点等磁通为误差，经响应矩阵/伪逆把形状需求分配到 PF 线圈。",
    "controlArchitecture": "未完整公开。",
    "timescale": "平衡/形状回路通常 1–10 ms；垂直稳定更快。",
    "sensors": [
      "磁探针",
      "磁通环",
      "线圈电流",
      "等离子体电流",
      "rtEFIT 边界/X 点"
    ],
    "actuators": [
      "PF 线圈",
      "快速垂直线圈",
      "电流电源"
    ],
    "devices": [
      "DIII-D：常规与高形状、多种单/双零拓扑；长期装置运行"
    ],
    "validation": "常规生产控制能力。",
    "results": "支持高凹度、双零、上下单零、高三角度和高方形度等构型，是后续雪花、剖面和稳定性控制的状态/执行基础。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "rtEFIT 继承诊断标定与轴对称假设；边界误差小不保证内部 q/压力、热负荷或三维扰动安全。",
    "twinRelevance": "应被封装为高频‘权威磁状态服务’，并让快模型与离线高保真 EFIT/动力学平衡持续交叉校验。",
    "papers": [
      {
        "title": "Advanced tokamak operation using the DIII-D plasma control system",
        "authors": "D. A. Humphreys et al.",
        "year": 2003,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/S0920-3796(03)00322-3",
        "url": "https://doi.org/10.1016/S0920-3796(03)00322-3",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "TokSys",
        "url": null,
        "status": "not-public",
        "relationship": "DIII-D/PCS 模型、控制设计和控制器在环工具",
        "artifactType": "software",
        "access": "public documentation/partial tool access; facility models restricted",
        "license": "未标注"
      },
      {
        "name": "FreeGSNKE",
        "url": "https://github.com/FusionComputingLab/freegsnke",
        "status": "official-enabling",
        "relationship": "可用于独立复建动态自由边界与形状控制基准，不是 rtEFIT",
        "artifactType": "software",
        "access": "open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "rtEFIT",
      "ISOFLUX",
      "shape control",
      "PCS"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-009",
    "projectId": "CTL-CORE-009",
    "titleZh": "ASDEX Upgrade 多变量位置、形状与打击点控制",
    "titleEn": "Multivariable position, shape and strike-point control on ASDEX Upgrade",
    "year": 2003,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T2",
    "relatedTasks": [
      "T8"
    ],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "PF 线圈位于 TF 线圈外、距等离子体较远，每个线圈对多种形状量都有全局影响，同时还受电流、力和电源饱和约束。",
    "method": "磁测量函数参数化快速给出平衡量；矩阵 PID/PI 动态解耦局部和全局形状，内线圈快位置、外线圈慢形状，并显式处理饱和/负载平衡。",
    "controlArchitecture": "未完整公开。",
    "timescale": "垂直/位置毫秒级；形状和打击点数毫秒至十毫秒；监督约 10 ms。",
    "sensors": [
      "磁诊断",
      "参数化平衡",
      "打击点/间隙",
      "线圈电流与力限值"
    ],
    "actuators": [
      "内部快 PF 线圈",
      "外部 PF 线圈"
    ],
    "devices": [
      "ASDEX Upgrade：限制器、偏滤器与先进场景；长期装置运行"
    ],
    "validation": "装置常规生产控制。",
    "results": "早期即在约 800 kA、伸长约 1.7 的放电中成功；随后扩展到三角度与偏滤器打击点多变量控制，并进入统一 DCS。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "参数化重建的外推性取决于训练/标定域；打击点几何控制不等于脱靶或热负荷控制。",
    "twinRelevance": "证明控制孪生需要同时保存局部几何、全局形状、线圈力/饱和和监督状态，而不能只展示 LCFS。",
    "papers": [
      {
        "title": "Position and shape control on ASDEX-Upgrade",
        "authors": "W. Treutterer et al.",
        "year": 1993,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/B978-0-444-89995-8.50202-2",
        "url": "https://doi.org/10.1016/B978-0-444-89995-8.50202-2",
        "sourceType": "peer-reviewed proceedings paper"
      },
      {
        "title": "Chapter 3: Plasma Control in ASDEX Upgrade",
        "authors": "W. Treutterer et al.",
        "year": 2003,
        "venue": "原始论文 / 官方来源",
        "doi": "10.13182/FST03-A401",
        "url": "https://doi.org/10.13182/FST03-A401",
        "sourceType": "peer-reviewed journal chapter"
      }
    ],
    "code": [
      {
        "name": "ASDEX Upgrade DCS",
        "url": null,
        "status": "not-public",
        "relationship": "直接运行位置、形状、燃料、加热和监督控制",
        "artifactType": "software",
        "access": "facility software; not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "ASDEX Upgrade",
      "shape",
      "strike point",
      "MIMO",
      "DCS"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-034",
    "projectId": "CTL-CORE-034",
    "titleZh": "DIII-D 神经代理增强的实时电子温度剖面控制",
    "titleEn": "Experimental real-time electron-temperature profile control in DIII-D",
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [
      "T0"
    ],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "Thomson 低频且有噪，传统运输/沉积计算过慢，控制器仍需实时估计和预测 Te(r)。",
    "method": "动态观测器融合 Thomson 与含 NubeamNet/MMMnet 的 Te 预测模型；在 PCS 中编译代理并以 LQI/MIMO 控制空间位置上的 Te。",
    "controlArchitecture": "未完整公开。",
    "timescale": "PCS 推理毫秒级；Thomson 多率更新；Te 响应约十至百毫秒。",
    "sensors": [
      "Thomson 散射",
      "实时平衡/密度",
      "H&CD 状态"
    ],
    "actuators": [
      "NBI/ECH 等加热通道"
    ],
    "devices": [
      "DIII-D：多位置 Te 剖面跟踪；装置闭环实验"
    ],
    "validation": "真实装置闭环。",
    "results": "观测器保持与 Thomson 剖面形状一致并滤除大量噪声；控制器在多个径向位置跟踪 Te 目标。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "代理继承训练分布和父模型误差；Thomson 缺测、模型 OOD 和多加热冲突需拒绝服务/回退策略。",
    "twinRelevance": "是可复用的‘模型预测+稀疏测量观测器+闭环’模板，但孪生必须发布模型版本、训练域和创新残差。",
    "papers": [
      {
        "title": "Experimental demonstration of real-time electron temperature profile control in DIII-D",
        "authors": "S. M. Morosohk, K. Erickson, E. Schuster",
        "year": 2025,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/1741-4326/adf456",
        "url": "https://doi.org/10.1088/1741-4326/adf456",
        "sourceType": "peer-reviewed journal article"
      },
      {
        "title": "Optimal control of the electron temperature profile in DIII-D using machine learning surrogate models",
        "authors": "S. M. Morosohk et al.",
        "year": 2024,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2024.114615",
        "url": "https://doi.org/10.1016/j.fusengdes.2024.114615",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "plasma-profile-predictor",
        "url": "https://github.com/PlasmaControl/plasma-profile-predictor",
        "status": "official-enabling",
        "relationship": "DIII-D 剖面数据准备、模型训练与 MPC 相关代码",
        "artifactType": "software",
        "access": "official public research repository",
        "license": "未标注"
      },
      {
        "name": "keras2c",
        "url": "https://github.com/f0uriest/keras2c",
        "status": "official-enabling",
        "relationship": "将 Keras 推理编译到实时 C；论文链的部署使能工具",
        "artifactType": "software",
        "access": "open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "Te profile",
      "observer",
      "surrogate",
      "keras2c"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CPT-039",
    "projectId": "CPT-039",
    "titleZh": "JT-60SA双色CO2干涉仪密度反馈",
    "titleEn": "Two-color CO2 interferometer density feedback on JT-60SA",
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [],
    "categoryLabel": "密度控制",
    "problem": "振动与相位跳变会污染长光程干涉测量，密度反馈必须同时快速和自诊断。",
    "method": "双色CO2激光抵消机械振动，实时处理器在约500 ns内检测超过π/2的条纹跳变并产生异常处置；反馈调节加料。",
    "controlArchitecture": "未完整公开。",
    "timescale": "信号处理亚微秒；密度闭环毫秒至数十毫秒",
    "sensors": [
      "双色CO2干涉仪",
      "相位/条纹质量标志"
    ],
    "actuators": [
      "气体加料",
      "异常时反馈抑制/中止接口"
    ],
    "devices": [
      "JT-60SA"
    ],
    "validation": "JT-60SA首运行阶段实时系统与密度反馈实验。",
    "results": "实现密度反馈；测得密度约比参考值低16.8%±6.6%，并验证快速条纹跳变检测。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "早期运行的控制误差和场景覆盖有限；光学污染、折射和长脉冲漂移仍需运行统计。",
    "twinRelevance": "示范诊断质量标志必须与测量值同等进入控制与孪生数据契约。",
    "papers": [
      {
        "title": "Real-time processing system of a two-color CO2 laser interferometer for density feedback control in JT-60SA",
        "authors": "Y. Ohtani, H. Sasao, T. Nakano, M. Fukumoto, T. Wakatsuki, S. Inoue, S. Kojima, H. Urano and M. Yoshida",
        "year": 2024,
        "venue": "Review of Scientific Instruments",
        "doi": "10.1063/5.0215877",
        "url": "https://doi.org/10.1063/5.0215877",
        "sourceType": "peer-reviewed instrumentation and primary experiment"
      }
    ],
    "code": [
      {
        "name": "JT-60SA interferometer RT processor",
        "url": null,
        "status": "not-public",
        "relationship": "FPGA/实时处理和控制接口未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CTL-CORE-030",
    "projectId": "CTL-CORE-030",
    "titleZh": "DIII-D 低 NBI 转矩下 q0 与 βN 同步调节",
    "titleEn": "Regulation of central safety factor and normalized beta under low NBI torque in DIII-D",
    "year": 2023,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "反应堆低转矩条件下仍需维持 q0 和 βN，同时避免通过共/反向 NBI 引入净转矩。",
    "method": "1D 电流剖面模型耦合 0D 能量平衡；在线协调共向/反向 NBI 和其他 H&CD，在 q0、βN 跟踪与近零总转矩间优化。",
    "controlArchitecture": "未完整公开。",
    "timescale": "能量约 0.1 s；q0/电流扩散约 0.5–数秒。",
    "sensors": [
      "实时 q0/平衡",
      "βN/储能",
      "NBI 功率、能量和转矩估计"
    ],
    "actuators": [
      "共向 NBI",
      "反向 NBI",
      "加热/电流驱动"
    ],
    "devices": [
      "DIII-D：低转矩先进场景；COTSIM 非线性仿真和装置闭环实验"
    ],
    "validation": "真实装置专项闭环。",
    "results": "首次将 q0、βN 与近零 NBI 转矩作为同步目标，在 COTSIM 和 DIII-D 实验中验证。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "q0 是全剖面的低维代理；低转矩 DIII-D 仍不等于 ITER 的低旋转和 alpha 自加热环境。",
    "twinRelevance": "展示目标应包含‘副作用预算’：执行器不仅有功率，还有转矩、沉积和寿命属性，多目标分配必须可审计。",
    "papers": [
      {
        "title": "Regulation of the central safety factor and normalized beta under low NBI torque in DIII-D",
        "authors": "A. Pajares, E. Schuster et al.",
        "year": 2023,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2022.113363",
        "url": "https://doi.org/10.1016/j.fusengdes.2022.113363",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "COTSIM",
        "url": null,
        "status": "not-public",
        "relationship": "直接非线性验证模型",
        "artifactType": "software",
        "access": "research code; not publicly released",
        "license": "未标注"
      },
      {
        "name": "DIII-D PCS",
        "url": null,
        "status": "not-public",
        "relationship": "直接实验实现",
        "artifactType": "software",
        "access": "facility software",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "q0",
      "betaN",
      "low torque",
      "NBI"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-038",
    "projectId": "CTL-CORE-038",
    "titleZh": "DIII-D 数据驱动剖面预测与 MPC",
    "titleEn": "Data-driven profile prediction and model-predictive control for DIII-D",
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "高维多剖面运输求解过慢，操作者难实时探索 NBI/ECH/气体/Ip 对未来状态的组合影响。",
    "method": "以 2013–2018 DIII-D 数据训练循环/卷积网络，输入当前温度、密度、压力、q、旋转及执行器历史，预测约一个能量约束时间后的剖面；实时简化模型进入 MPC。",
    "controlArchitecture": "未完整公开。",
    "timescale": "模型推理毫秒内（简化版可到亚毫秒）；预测视野约 τE。",
    "sensors": [
      "实时剖面和全局量",
      "NBI/ECH/气体/Ip 命令",
      "诊断质量状态"
    ],
    "actuators": [
      "NBI 功率/转矩",
      "ECH",
      "气体",
      "Ip 目标"
    ],
    "devices": [
      "DIII-D：多剖面短时预测与 MPC；历史数据+PCS 实时 MPC 实验"
    ],
    "validation": "离线大数据 E2，加上实时/闭环专项实验 E4。",
    "results": "平均预测准确且压力优于 q；实时版本支撑 DIII-D MPC 实验，证明数据模型可进入 PCS。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "训练数据偏向常见拓扑，仓库 README 明确排除多类非标准/故障样本；q 预测最弱且训练数据并非完整公开。",
    "twinRelevance": "公开代码使其适合作为数据驱动旁路孪生；上线必须做 OOD、诊断掉线、守恒残差和传统模型对照。",
    "papers": [
      {
        "title": "Data-driven profile prediction for DIII-D",
        "authors": "J. Abbate, R. Conlin, E. Kolemen",
        "year": 2021,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/1741-4326/abe08d",
        "url": "https://doi.org/10.1088/1741-4326/abe08d",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "plasma-profile-predictor",
        "url": "https://github.com/PlasmaControl/plasma-profile-predictor",
        "status": "official-direct",
        "relationship": "直接训练/评估代码、shot list 与模型架构",
        "artifactType": "software",
        "access": "official public repository",
        "license": "未标注"
      },
      {
        "name": "keras2c",
        "url": "https://github.com/f0uriest/keras2c",
        "status": "official-enabling",
        "relationship": "实时 C 部署使能",
        "artifactType": "software",
        "access": "open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "profile predictor",
      "MPC",
      "neural network",
      "open code"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-031",
    "projectId": "CTL-CORE-031",
    "titleZh": "DIII-D 电流剖面—βN—NTM 集成控制与权限仲裁",
    "titleEn": "Integrated current-profile, normalized-beta and NTM control in DIII-D",
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [
      "T4",
      "T8"
    ],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "ECCD/NBI 等执行器同时被 q/β 调节和 NTM 抑制需要，独立回路可能冲突并错过稳定性优先级。",
    "method": "PCS 中并行运行 q+βN 控制器和 NTM 检测/抑制器；监督状态机根据模态出现和优先级把 EC 权限在剖面控制与 NTM 控制间切换。",
    "controlArchitecture": "未完整公开。",
    "timescale": "NTM 检测/镜面与功率为毫秒至百毫秒；q 为秒级。",
    "sensors": [
      "Mirnov 模态信号",
      "rtEFIT/MSE q",
      "βN",
      "ECCD 沉积位置"
    ],
    "actuators": [
      "ECCD 功率与可转向镜面",
      "NBI",
      "Ip"
    ],
    "devices": [
      "DIII-D：先进场景与 NTM 抑制；装置集成闭环实验"
    ],
    "validation": "真实装置闭环和执行器权限切换。",
    "results": "展示共享 EC 资源可在剖面/β控制与 NTM 抑制间实时仲裁，是从多回路并存走向集成控制的重要实证。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "优先级切换可能造成慢剖面目标瞬态偏离；ECCD 沉积误差和诊断掉线需独立安全逻辑。",
    "twinRelevance": "孪生必须记录执行器的占用者、优先级、切换原因和未满足请求，不能只记录最终功率命令。",
    "papers": [
      {
        "title": "Integrated Current Profile, Normalized Beta and NTM Control in DIII-D",
        "authors": "A. Pajares, W. P. Wehner, E. Schuster et al.",
        "year": 2019,
        "venue": "原始论文 / 官方来源",
        "doi": null,
        "url": "https://www.osti.gov/servlets/purl/1611479",
        "sourceType": "official DOE manuscript / peer-reviewed conference paper"
      },
      {
        "title": "Real-time mirror steering for improved closed loop NTM suppression by ECCD in DIII-D",
        "authors": "E. Kolemen et al.",
        "year": 2013,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2013.02.168",
        "url": "https://doi.org/10.1016/j.fusengdes.2013.02.168",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "DIII-D PCS integrated profile/NTM modules",
        "url": null,
        "status": "not-public",
        "relationship": "直接实现",
        "artifactType": "software",
        "access": "facility software; not public",
        "license": "未标注"
      },
      {
        "name": "plasma-profile-predictor",
        "url": "https://github.com/PlasmaControl/plasma-profile-predictor",
        "status": "official-enabling",
        "relationship": "DIII-D 剖面预测训练管线；不含完整 NTM 仲裁器",
        "artifactType": "software",
        "access": "official research-team public repository",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "NTM",
      "actuator arbitration",
      "ECCD",
      "integrated control"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-032",
    "projectId": "CTL-CORE-032",
    "titleZh": "EAST q 剖面与储能鲁棒控制设计",
    "titleEn": "Robust control of the current profile and plasma energy in EAST",
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [
      "T6"
    ],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "电子温度、电阻率和非感应电流模型与实验存在显著偏差，直接按名义模型设计 q+能量控制可能失稳。",
    "method": "磁通扩散 PDE+0D 能量平衡；把温度、电阻率和非感应源写成有界不确定参考剖面，降阶/线性化后用混合灵敏度 H∞ 和结构奇异值验证鲁棒稳定。",
    "controlArchitecture": "未完整公开。",
    "timescale": "能量 0.1–1 s；q 扩散秒级。",
    "sensors": [
      "q/电流剖面估计",
      "储能/β",
      "Ip",
      "H&CD 状态"
    ],
    "actuators": [
      "EAST H&CD 功率",
      "总等离子体电流"
    ],
    "devices": [
      "EAST：代表性长脉冲场景；以典型 EAST 放电定界并做非线性仿真"
    ],
    "validation": "历史数据定界+仿真控制；非装置闭环。",
    "results": "控制器在所建模的不确定集合内保持 q 与能量轨迹跟踪，并以结构奇异值检查鲁棒稳定。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "不确定集合是否覆盖未见场景未被实验检验；未包括执行器故障、诊断异常和边缘/稳定性冲突。",
    "twinRelevance": "可把不确定集合转为孪生适用域和在线鲁棒裕度，但授权闭环前必须用装置回放/HIL和实验逐级升级。",
    "papers": [
      {
        "title": "Robust Control of the Current Profile and Plasma Energy in EAST",
        "authors": "H. Wang, E. Schuster",
        "year": 2019,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2019.01.097",
        "url": "https://www.osti.gov/servlets/purl/1611441",
        "sourceType": "peer-reviewed journal manuscript"
      }
    ],
    "code": [
      {
        "name": "control-oriented EAST model",
        "url": null,
        "status": "not-public",
        "relationship": "直接设计模型",
        "artifactType": "software",
        "access": "paper equations available; implementation not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "EAST",
      "q-profile",
      "energy",
      "robust control",
      "H-infinity"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-033",
    "projectId": "CTL-CORE-033",
    "titleZh": "KSTAR 物理模型驱动的电子温度剖面闭环",
    "titleEn": "Physics-based global electron-temperature profile control in KSTAR",
    "year": 2018,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "需验证 NBI/ECH 多执行器能否实时跟踪时变 Te 剖面并抵抗扰动，为后续多剖面控制铺路。",
    "method": "实时 ECE 每约 50 ms 给出 Te 剖面，物理响应矩阵在线将剖面误差映射到 NBI/ECH 功率，并允许实时更新响应模型。",
    "controlArchitecture": "未完整公开。",
    "timescale": "测量/控制约 50 ms；热响应约 0.1–1 s。",
    "sensors": [
      "实时 ECE Te 剖面",
      "NBI/ECH 功率",
      "平衡/密度"
    ],
    "actuators": [
      "NBI",
      "ECH"
    ],
    "devices": [
      "KSTAR：0.6 MA、2 T H-mode 等场景；装置闭环实验"
    ],
    "validation": "真实装置剖面闭环。",
    "results": "在约 3.5 s 控制窗口中完成 Te 剖面目标跟踪；验证时变目标、多执行器、外扰和响应矩阵实时更新。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "早期实验以 Te 为单一主剖面，q/密度/稳定性耦合尚未全面闭环；ECE 在高密度/光学厚度条件受限。",
    "twinRelevance": "适合作为剖面控制最小闭环：实时诊断、响应模型、在线辨识与多执行器命令必须共同版本化。",
    "papers": [
      {
        "title": "Feasibility experiment of physics-based global electron temperature profile control in KSTAR",
        "authors": "H. S. Kim, S. H. Kim, Y. M. Jeon et al.",
        "year": 2018,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2018.06.024",
        "url": "https://doi.org/10.1016/j.fusengdes.2018.06.024",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "KSTAR real-time profile controller",
        "url": null,
        "status": "not-public",
        "relationship": "直接实现",
        "artifactType": "software",
        "access": "facility code; not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "KSTAR",
      "Te profile",
      "ECE",
      "NBI",
      "ECH"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-028",
    "projectId": "CTL-CORE-028",
    "titleZh": "TCV q/β 模型预测剖面控制",
    "titleEn": "Model-predictive q-profile and beta control on TCV",
    "year": 2017,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "需在 ECCD 功率、总电流和时变执行器限值下快速跟踪逆 q 剖面和 β，同时抑制扰动。",
    "method": "RAPTOR 作为控制器测试环境和状态预测器；MPC 直接把时变执行器约束纳入优化，用两组 gyrotron 功率和 Ip 请求调节逆 q 与 β。",
    "controlArchitecture": "未完整公开。",
    "timescale": "预测/控制更新约毫秒至十毫秒；被控剖面为 0.1–数秒。",
    "sensors": [
      "RAPTOR/LIUQE q 估计",
      "β/储能",
      "密度观测器",
      "EC 功率与总电流"
    ],
    "actuators": [
      "两组 ECRH/ECCD gyrotron",
      "等离子体电流请求"
    ],
    "devices": [
      "TCV：L-mode q/β 剖面；仿真和装置闭环"
    ],
    "validation": "真实装置闭环；q 主要为模型预测估计。",
    "results": "在不确定条件和扰动下跟踪逆 q 剖面与 β；显式利用时变功率限值实现快速目标转换且降低过冲。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "无连续内部 q 测量时，闭环主要控制模型状态；L-mode 结果不能直接外推到燃烧 H-mode。",
    "twinRelevance": "需要‘双估计’：实时控制估计和独立事后权威重建；两者长期偏差决定是否继续授权闭环。",
    "papers": [
      {
        "title": "Profile control simulations and experiments on TCV: a controller test environment and results using a model-based predictive controller",
        "authors": "B. Maljaars, F. Felici, T. C. Blanken et al.",
        "year": 2017,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/1741-4326/aa8c48",
        "url": "https://doi.org/10.1088/1741-4326/aa8c48",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "RAPTOR/TCV MPC",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接预测和控制",
        "artifactType": "software",
        "access": "research/facility code; not public",
        "license": "未标注"
      },
      {
        "name": "TORAX",
        "url": "https://github.com/google-deepmind/torax",
        "status": "official-enabling",
        "relationship": "可用于构建可微的独立运输/MPC 原型，非论文复现",
        "artifactType": "software",
        "access": "official open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "TCV",
      "MPC",
      "RAPTOR",
      "beta",
      "ECCD"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-029",
    "projectId": "CTL-CORE-029",
    "titleZh": "DIII-D 旋转变换剖面与归一化 β 的数据驱动鲁棒控制",
    "titleEn": "Data-driven robust control of iota-profile and normalized-beta dynamics in DIII-D",
    "year": 2017,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "高性能稳态场景需同时维持电流剖面和 βN；第一性原理模型复杂且局部控制仍受饱和影响。",
    "method": "专门系统辨识实验建立双时间尺度线性 MIMO 模型；SVD 选通道，混合灵敏度 H∞ 合成控制器并加抗饱和。",
    "controlArchitecture": "未完整公开。",
    "timescale": "β/能量约 0.1 s；iota/q 扩散约 0.5–数秒。",
    "sensors": [
      "MSE/rtEFIT iota 剖面",
      "βN",
      "Ip",
      "NBI/ECH 功率"
    ],
    "actuators": [
      "等离子体电流",
      "NBI",
      "EC H&CD"
    ],
    "devices": [
      "DIII-D：H-mode 平顶附近的先进场景；仿真和少量专项闭环实验"
    ],
    "validation": "真实装置闭环但实验数量有限、仅部分成功。",
    "results": "完成 DIII-D 最早一批数据驱动模型式全剖面+β 控制实证；论文明确记录执行器问题、设计限制和局部模型有效域。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "装置/场景特定线性模型离参考点后失准；可控性受 H&CD 可用性和 MSE 质量强烈限制。",
    "twinRelevance": "优秀的负面证据范例：孪生不仅应保存成功指标，也应记录饱和、失配和未达目标原因以更新可控域。",
    "papers": [
      {
        "title": "Data-driven robust control of the plasma rotational transform profile and normalized beta dynamics for advanced tokamak scenarios in DIII-D",
        "authors": "W. P. Wehner, E. Schuster et al.",
        "year": 2017,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2017.01.003",
        "url": "https://doi.org/10.1016/j.fusengdes.2017.01.003",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "DIII-D PCS/TokSys",
        "url": null,
        "status": "not-public",
        "relationship": "直接控制实现与模型在环",
        "artifactType": "software",
        "access": "documentation/partial tools public; operational stack restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "iota profile",
      "betaN",
      "H-infinity",
      "anti-windup"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-035",
    "projectId": "CTL-CORE-035",
    "titleZh": "JT-60U 离子温度梯度与环向旋转剖面闭环",
    "titleEn": "Real-time ion-temperature and toroidal-rotation profile control in JT-60U",
    "year": 2009,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "高 β/ITB 场景的压力梯度和旋转影响稳定性，需要快速 CXRS 和可调 NBI 转矩。",
    "method": "快速 CXRS 实时计算 Ti 与 Vt 剖面，以共/反向中性束反馈调节 r/a≈0.25–0.5 的 Ti 梯度和环向旋转方向/剖面。",
    "controlArchitecture": "未完整公开。",
    "timescale": "CXRS/反馈约 10–100 ms；剖面响应约 0.1–1 s。",
    "sensors": [
      "快速 CXRS",
      "平衡",
      "NBI 功率/转矩",
      "β/储能"
    ],
    "actuators": [
      "共向 NBI",
      "反向 NBI"
    ],
    "devices": [
      "JT-60U：βN≈1.6–2.8 高 β/ITB；装置闭环实验"
    ],
    "validation": "真实装置闭环。",
    "results": "实现 Ti 梯度/ITB 强度实时调节，并把 Vt 从反向控制到同向；表明压力和旋转可在相近时间尺度协同。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "强依赖诊断束和 NBI 转矩能力；ITER 等大装置本征旋转低，执行器可控性不同。",
    "twinRelevance": "应把执行器的能量与动量沉积同时建模，避免把 NBI 仅视为标量加热功率。",
    "papers": [
      {
        "title": "Real-time measurement and feedback control of ion temperature profile and toroidal rotation using fast CXRS system in JT-60U",
        "authors": "M. Yoshida et al.",
        "year": 2009,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2009.04.006",
        "url": "https://doi.org/10.1016/j.fusengdes.2009.04.006",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "JT-60U fast CXRS/profile controller",
        "url": null,
        "status": "not-public",
        "relationship": "直接实现",
        "artifactType": "software",
        "access": "facility code; not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "JT-60U",
      "Ti profile",
      "rotation",
      "CXRS",
      "NBI"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-036",
    "projectId": "CTL-CORE-036",
    "titleZh": "DIII-D 旋转与储能同步反馈",
    "titleEn": "Simultaneous feedback control of plasma rotation and stored energy on DIII-D",
    "year": 2007,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [
      "T6"
    ],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "NBI 同时注入热量和转矩，独立能量/旋转回路强耦合；需利用共/反向束解耦。",
    "method": "建立共/反向 NBI 对能量和转矩的物理响应模型，在 PCS 中合成 MIMO 控制器同步调节旋转和 β/储能。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约 10–100 ms 更新、0.1–1 s 等离子体响应。",
    "sensors": [
      "CXRS 旋转",
      "抗磁储能/β",
      "NBI 状态"
    ],
    "actuators": [
      "共向 NBI",
      "反向 NBI"
    ],
    "devices": [
      "DIII-D：共/反束混合加热；装置闭环实验"
    ],
    "validation": "真实装置闭环。",
    "results": "首次利用反向束能力部分解耦能量和动量并同步调节旋转与储能，成为多物理执行器模型的经典案例。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "控制主要为全局量而非完整剖面；束故障或粒子沉积变化会破坏解耦。",
    "twinRelevance": "执行器数字模型需为多输出对象，持续校准功率、转矩、粒子源和电流驱动响应。",
    "papers": [
      {
        "title": "Simultaneous feedback control of plasma rotation and stored energy on the DIII-D tokamak",
        "authors": "D. A. Humphreys et al.",
        "year": 2007,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2007.04.031",
        "url": "https://doi.org/10.1016/j.fusengdes.2007.04.031",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "DIII-D PCS rotation/energy controller",
        "url": null,
        "status": "not-public",
        "relationship": "直接实现",
        "artifactType": "software",
        "access": "facility code; not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "rotation",
      "stored energy",
      "MIMO",
      "co-counter NBI"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-027",
    "projectId": "CTL-CORE-027",
    "titleZh": "JET 电流与电子温度剖面集成实时控制",
    "titleEn": "Model-based integrated real-time current and temperature profile control in JET",
    "year": 2005,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "电流、温度和压力剖面通过运输与 H&CD 强耦合，独立 SISO 回路会争夺执行器。",
    "method": "用 Galerkin 基压缩分布剖面；由实验辨识 MIMO 响应算子，SVD 最大化稳态解耦，并允许目标在可达非线性状态附近保持一定模糊度。",
    "controlArchitecture": "未完整公开。",
    "timescale": "温度能量约 0.1–1 s；电流剖面约秒级，采用多时间尺度控制窗口。",
    "sensors": [
      "实时 q/电流密度",
      "ECE 电子温度",
      "密度/压力",
      "H&CD 状态"
    ],
    "actuators": [
      "NBI",
      "ICRH",
      "LHCD"
    ],
    "devices": [
      "JET：ITB/先进场景；装置闭环实验"
    ],
    "validation": "真实装置多剖面闭环。",
    "results": "首次实验表明控制器可在闭环窗口内获得并维持不同电流和电子温度剖面，验证分布参数 MIMO 集成控制。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "实验辨识模型局部有效；剖面投影会隐藏局部尖峰，且执行器沉积随密度/平衡改变。",
    "twinRelevance": "建议孪生同时保存原始剖面、基系数、投影残差和可达目标，避免低维控制成功掩盖局部危险。",
    "papers": [
      {
        "title": "A model-based technique for integrated real-time profile control in the JET tokamak",
        "authors": "L. Laborde, D. Mazon, D. Moreau et al.",
        "year": 2005,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/0741-3335/47/1/010",
        "url": "https://doi.org/10.1088/0741-3335/47/1/010",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "JET integrated profile controller",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接实现",
        "artifactType": "software",
        "access": "facility code; not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "JET",
      "integrated profile",
      "Galerkin",
      "temperature",
      "current"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-026",
    "projectId": "CTL-CORE-026",
    "titleZh": "JET 三执行器 q 剖面 TSVD 控制",
    "titleEn": "Real-time q-profile control in JET for steady-state advanced tokamak operation",
    "year": 2003,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "q(r) 是分布参数，NBI、ICRH、LHCD 对多个半径耦合，执行器数少于剖面自由度。",
    "method": "从实验辨识线性分布响应算子，采用截断 SVD 只控制可达剖面方向，在实时系统中协调三类 H&CD。",
    "controlArchitecture": "未完整公开。",
    "timescale": "与电流重分布时间同阶，约秒级。",
    "sensors": [
      "实时 q 剖面（磁、Faraday/极化与平衡）",
      "H&CD 功率",
      "温度/压力辅助信号"
    ],
    "actuators": [
      "NBI",
      "ICRH",
      "LHCD"
    ],
    "devices": [
      "JET：反剪切/ITB 准稳态场景；装置闭环实验"
    ],
    "validation": "真实装置 q 剖面闭环。",
    "results": "在电流重分布时间尺度上成功维持目标 q 剖面；同时说明可控方向由响应矩阵秩和奇异值决定。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "响应模型只在辨识轨迹附近有效；截断方向外的目标不可达，执行器故障会改变可控子空间。",
    "twinRelevance": "剖面孪生应实时计算可控性和执行器有效性，而非把任意目标曲线当作可实现命令。",
    "papers": [
      {
        "title": "Real-time control of the q-profile in JET for steady state advanced tokamak operation",
        "authors": "D. Moreau, F. Crisanti, X. Litaudon et al.",
        "year": 2003,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/0029-5515/43/9/311",
        "url": "https://doi.org/10.1088/0029-5515/43/9/311",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "JET TSVD profile controller",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接实现",
        "artifactType": "software",
        "access": "facility code; not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "JET",
      "q-profile",
      "TSVD",
      "NBI",
      "ICRH",
      "LHCD"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-037",
    "projectId": "CTL-CORE-037",
    "titleZh": "JT-60U 储能反馈与高性能场景稳定",
    "titleEn": "Plasma stored-energy feedback control for high-performance JT-60U discharges",
    "year": 2003,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [
      "T6"
    ],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "中子率受密度/温度剖面和杂质影响，未必是可靠稳定性代理；需要更直接控制 MHD 相关总储能。",
    "method": "实时抗磁/平衡储能作为反馈量，通过 NBI/ECH 功率调节，接入 JT-60U 平衡、燃料和加热控制计算机。",
    "controlArchitecture": "未完整公开。",
    "timescale": "能量约 0.1–1 s。",
    "sensors": [
      "抗磁储能",
      "平衡/βN",
      "密度和中子率辅助"
    ],
    "actuators": [
      "NBI",
      "ECRH/ECCD"
    ],
    "devices": [
      "JT-60U：高性能/高 β 放电；装置闭环实验"
    ],
    "validation": "真实装置闭环并用于场景运行。",
    "results": "建立储能反馈并应用到高性能放电，为 Ti/旋转和电流剖面等更细粒度控制提供全局性能约束。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "全局储能可能掩盖局部梯度/稳定性边界；控制效果依赖执行器沉积和诊断标定。",
    "twinRelevance": "全局量适合作为监督 KPI，而局部剖面/稳定性服务负责解释相同储能下不同风险。",
    "papers": [
      {
        "title": "Development of plasma stored energy feedback control and its application to high performance discharges on JT-60U",
        "authors": "T. Suzuki et al.",
        "year": 2003,
        "venue": "原始论文 / 官方来源",
        "doi": null,
        "url": "https://www.sciencedirect.com/science/article/abs/pii/S0920379603004721",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "JT-60U plasma control system",
        "url": null,
        "status": "not-public",
        "relationship": "直接实现",
        "artifactType": "software",
        "access": "facility software; not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "JT-60U",
      "stored energy",
      "beta",
      "NBI",
      "performance control"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CTL-CORE-025",
    "projectId": "CTL-CORE-025",
    "titleZh": "JET LHCD 非感应电流与离轴电流分布反馈",
    "titleEn": "Real-time current-profile control at JET using LHCD",
    "year": 1998,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T3",
    "relatedTasks": [
      "T4"
    ],
    "categoryLabel": "电流/安全因子、温度、密度、旋转与压力剖面控制",
    "problem": "预编程 LHCD 波形随等离子体条件变化而失配，难重复获得非感应电流和反剪切剖面。",
    "method": "以一匝环电压反馈调节非感应电流，以归一化电流二阶矩反馈调节离轴电流；采用低阶非线性状态空间/传递函数模型。",
    "controlArchitecture": "未完整公开。",
    "timescale": "电流重分布与 LHCD 响应为百毫秒至秒。",
    "sensors": [
      "一匝环电压",
      "磁重建电流二阶矩",
      "等离子体电流"
    ],
    "actuators": [
      "3.7 GHz LHCD 功率/波形"
    ],
    "devices": [
      "JET：2.5 MA LHCD 与剪切优化场景；装置闭环实验"
    ],
    "validation": "真实装置闭环。",
    "results": "在 2.5 MA 放电中环电压降低约 66%；电流二阶矩控制在电流爬升期使剪切优化放电中子产额提高约 60%。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "二阶矩是低维代理，不唯一确定 q(r)；LHCD 在高密度/反应堆参数下穿透和效率受限。",
    "twinRelevance": "说明剖面控制可从稳健的低维可观测量起步，但孪生要展示这些代理与真实 q/电流密度之间的不唯一性。",
    "papers": [
      {
        "title": "Real time current profile control at JET",
        "authors": "J. A. Romero et al.",
        "year": 1998,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/S0920-3796(98)00261-0",
        "url": "https://doi.org/10.1016/S0920-3796(98)00261-0",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "JET RTPC/RTCC current-profile controller",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接实现",
        "artifactType": "software",
        "access": "facility software; not public",
        "license": "未标注"
      }
    ],
    "tags": [
      "JET",
      "LHCD",
      "loop voltage",
      "current moment",
      "non-inductive"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CPT-006",
    "projectId": "CPT-006",
    "titleZh": "DIII-D与KSTAR自适应RMP无ELM高性能控制",
    "titleEn": "Adaptive RMP control for ELM-free high performance on DIII-D and KSTAR",
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T4",
    "relatedTasks": [
      "T6"
    ],
    "categoryLabel": "ELM控制",
    "problem": "RMP可抑制ELM但常牺牲约束；最优线圈谱随状态变化且试错代价高。",
    "method": "用机器学习代理替代昂贵等离子体响应计算，在线/自适应调整RMP幅值和谱，在ELM抑制约束下提升性能。",
    "controlArchitecture": "未完整公开。",
    "timescale": "状态更新与RMP调节为约10–100 ms至放电阶段尺度",
    "sensors": [
      "Dα",
      "磁测量",
      "平衡与剖面诊断",
      "储能/约束指标"
    ],
    "actuators": [
      "非轴对称RMP线圈"
    ],
    "devices": [
      "DIII-D",
      "KSTAR"
    ],
    "validation": "两台装置实验；在实际放电中自动维持无破坏性边缘爆发状态。",
    "results": "DIII-D中相对初始标准ELM抑制状态的性能指标提升超过90%，并在KSTAR验证跨装置方法。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "训练分布、装置几何、线圈限制和代理不确定度影响迁移；ELM-free不等于所有壁负荷风险均已受控。",
    "twinRelevance": "展示高保真模型到实时代理、再到受约束自适应控制的完整孪生闭环。",
    "papers": [
      {
        "title": "Highest fusion performance without harmful edge energy bursts in tokamak",
        "authors": "S.K. Kim, R. Shousha, S.M. Yang, Q. Hu, S.H. Hahn, A. Jalalvand, J.-K. Park, N.C. Logan et al.",
        "year": 2024,
        "venue": "Nature Communications",
        "doi": "10.1038/s41467-024-48415-w",
        "url": "https://doi.org/10.1038/s41467-024-48415-w",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "Adaptive RMP surrogate/controller",
        "url": null,
        "status": "not-public",
        "relationship": "论文说明源代码可按请求获取，但未发现持续公开的官方仓库。",
        "artifactType": "software",
        "access": "available-on-request",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-017",
    "projectId": "CPT-017",
    "titleZh": "DIII-D深度强化学习撕裂不稳定性规避",
    "titleEn": "Deep-RL avoidance of tearing instability on DIII-D",
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T4",
    "relatedTasks": [
      "T8"
    ],
    "categoryLabel": "不稳定性规避",
    "problem": "与其在大磁岛形成后高成本抑制，不如提前预测风险并调整运行轨迹。",
    "method": "多模态神经网络预测约300 ms内撕裂风险，强化学习策略在模型环境中学习，实验中改变加热/形状等控制以保持风险阈值以下。",
    "controlArchitecture": "未完整公开。",
    "timescale": "风险视野约300 ms；控制更新约数十毫秒",
    "sensors": [
      "实时平衡与剖面特征",
      "磁活动",
      "密度",
      "加热与执行器状态"
    ],
    "actuators": [
      "中性束功率",
      "形状/等离子体参数参考",
      "可用场景执行器"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "模型训练、历史数据测试和DIII-D高约束实验。",
    "results": "在实际H模放电中提前绕开撕裂风险，同时维持高性能，证明预测—规划—控制链可上机。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "策略安全依赖训练环境覆盖、风险预测校准和安全包络；不能把一次装置成功等同于自主保护认证。",
    "twinRelevance": "代表数字孪生从状态估计走向前瞻风险仿真与策略建议，但最终动作仍需独立安全门。",
    "papers": [
      {
        "title": "Avoiding fusion plasma tearing instability with deep reinforcement learning",
        "authors": "J. Seo, S. Kim, A. Jalalvand, R. Conlin, A. Rothstein, J. Abbate, K. Erickson, J. Wai, R. Shousha and E. Kolemen",
        "year": 2024,
        "venue": "Nature",
        "doi": "10.1038/s41586-024-07024-9",
        "url": "https://doi.org/10.1038/s41586-024-07024-9",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "DIII-D tearing-avoidance RL stack",
        "url": null,
        "status": "not-public",
        "relationship": "论文未提供可核验的完整训练与实时部署仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-042",
    "projectId": "CPT-042",
    "titleZh": "KSTAR L-H跃迁与ELM实时分类",
    "titleEn": "Real-time L-H transition and ELM classification on KSTAR",
    "year": 2020,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T4",
    "relatedTasks": [],
    "categoryLabel": "约束模式/ELM状态识别",
    "problem": "控制器需要低延迟识别L-H/H-L与ELM事件，避免只依赖固定时间表。",
    "method": "以Dα和线平均密度时序训练LSTM，并接入KSTAR实时系统做分类。",
    "controlArchitecture": "未完整公开。",
    "timescale": "毫秒级窗口与推理",
    "sensors": [
      "Dα",
      "线平均密度"
    ],
    "actuators": [
      "无；论文验证实时分类，未闭环改变加热/气体"
    ],
    "devices": [
      "KSTAR"
    ],
    "validation": "65个放电训练、58个放电约17.4万样本测试，并进行实时部署评估。",
    "results": "测试准确率约94.45%，证明低维信号可支持约束模式事件识别。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "分类准确率不等于安全可用性；类不平衡、时序标注和装置状态漂移需要置信度与拒识机制。",
    "twinRelevance": "可驱动数字孪生模式切换，但应配合物理一致性检查和滞环状态机。",
    "papers": [
      {
        "title": "Real-time classification of L-H transition and ELM in KSTAR",
        "authors": "G. Shin, J.-W. Juhn, G. Kwon and S. Hahn",
        "year": 2020,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2020.111634",
        "url": "https://doi.org/10.1016/j.fusengdes.2020.111634",
        "sourceType": "peer-reviewed real-time classification"
      }
    ],
    "code": [
      {
        "name": "KSTAR L-H/ELM LSTM",
        "url": null,
        "status": "not-public",
        "relationship": "模型权重和实时应用未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-010",
    "projectId": "CPT-010",
    "titleZh": "DIII-D锁模相位与旋转反馈",
    "titleEn": "Locked-mode phase and rotation control on DIII-D",
    "year": 2018,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T4",
    "relatedTasks": [],
    "categoryLabel": "T4",
    "problem": "锁定磁岛的相位若不可控，调制ECCD难以与O点同步，且静止岛会集中壁热负荷。",
    "method": "PI反馈驱动n=1线圈，使锁模固定在指定相位或以最高约20 Hz旋转，并同步调制ECCD。",
    "controlArchitecture": "未完整公开。",
    "timescale": "毫秒级磁反馈；目标旋转最高约20 Hz",
    "sensors": [
      "磁探针阵列",
      "锁模幅相估计"
    ],
    "actuators": [
      "n=1非轴对称线圈",
      "调制ECCD"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "DIII-D闭环实验。",
    "results": "实现指定相位锁定和受控旋转，为同步ECCD与壁负荷分散提供实验基础。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "仅覆盖可由现有线圈克服的电磁转矩范围；多模耦合、低信噪比和线圈饱和会限制相位可控性。",
    "twinRelevance": "需要融合模态状态、三维电磁执行器与ECCD相位的混合孪生。",
    "papers": [
      {
        "title": "Feedforward and feedback control of locked mode phase and rotation in DIII-D with application to modulated ECCD experiments",
        "authors": "W. Choi, R.J. La Haye, M.J. Lanctot, K.E.J. Olofsson, E.J. Strait, R. Sweeney and F.A. Volpe",
        "year": 2018,
        "venue": "Nuclear Fusion",
        "doi": "10.1088/1741-4326/aaa434",
        "url": "https://doi.org/10.1088/1741-4326/aaa434",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "DIII-D locked-mode controller",
        "url": null,
        "status": "not-public",
        "relationship": "装置实时应用未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-002",
    "projectId": "CPT-002",
    "titleZh": "ASDEX Upgrade基于幅值的NTM稳定控制",
    "titleEn": "Amplitude-based NTM stabilization at ASDEX Upgrade",
    "year": 2014,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T4",
    "relatedTasks": [],
    "categoryLabel": "NTM控制",
    "problem": "沉积位置存在模型与标定误差，需要在不依赖精确磁岛半径的条件下寻找最有效的ECCD位置。",
    "method": "以Mirnov磁岛幅值为目标，采用Sweep-and-Suppress与Incremental Search算法移动ECCD沉积；先在磁岛响应方程全闭环仿真中调试，再上机。",
    "controlArchitecture": "未完整公开。",
    "timescale": "每约100 ms评估一次磁岛增长/衰减趋势",
    "sensors": [
      "Mirnov线圈",
      "实时平衡",
      "EC沉积估计"
    ],
    "actuators": [
      "ECCD",
      "可移动EC镜面"
    ],
    "devices": [
      "ASDEX Upgrade"
    ],
    "validation": "磁岛响应方程闭环仿真与AUG实验。",
    "results": "两种搜索策略均能利用幅值反馈找到稳定区，降低对绝对定位精度的依赖。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "搜索期间仍会消耗EC资源；幅值受其他MHD活动影响，且多磁岛情形需更强的模态分离。",
    "twinRelevance": "适合作为在线极值寻优和模型失配补偿的基准案例。",
    "papers": [
      {
        "title": "Amplitude based feedback control for NTM stabilisation at ASDEX Upgrade",
        "authors": "C. Rapson, L. Giannone, M. Maraschek, M. Reich, J. Stober, W. Treutterer and the ASDEX Upgrade Team",
        "year": 2014,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2014.01.007",
        "url": "https://doi.org/10.1016/j.fusengdes.2014.01.007",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "AUG NTM controller",
        "url": null,
        "status": "not-public",
        "relationship": "实验控制算法未发现公开代码。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-005",
    "projectId": "CPT-005",
    "titleZh": "KSTAR电阻壁模主动控制物理设计",
    "titleEn": "RWM active-control physics design for KSTAR",
    "year": 2014,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T4",
    "relatedTasks": [],
    "categoryLabel": "RWM控制",
    "problem": "确定KSTAR现有及候选传感器/线圈组合对RWM的可控可观性。",
    "method": "用DCON计算稳定边界，以VALEN-3D约8000电路描述导电结构、线圈和传感器，比较反馈拓扑。",
    "controlArchitecture": "未完整公开。",
    "timescale": "壁时间尺度，毫秒至数十毫秒",
    "sensors": [
      "现有RWM传感器",
      "候选模态传感器"
    ],
    "actuators": [
      "KSTAR三维场线圈"
    ],
    "devices": [
      "KSTAR"
    ],
    "validation": "高保真三维电磁与稳定性数值设计；非装置闭环实验。",
    "results": "候选新传感器设计在模型中把可稳定范围推进至有壁β极限的约99%。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "结论依赖模型和假定噪声/延迟；不能视为KSTAR闭环实验结果。",
    "twinRelevance": "是利用工程电磁孪生做传感器布置和控制可达性设计的代表。",
    "papers": [
      {
        "title": "Resistive wall mode active control physics design for KSTAR",
        "authors": "Y.S. Park, S.A. Sabbagh, J.G. Bak, J.M. Bialek, J.W. Berkery, S.G. Lee and Y.K. Oh",
        "year": 2014,
        "venue": "Physics of Plasmas",
        "doi": "10.1063/1.4862140",
        "url": "https://doi.org/10.1063/1.4862140",
        "sourceType": "peer-reviewed simulation/design"
      }
    ],
    "code": [
      {
        "name": "DCON/VALEN-3D workflow",
        "url": null,
        "status": "not-public",
        "relationship": "论文所用稳定性与三维电磁工作流未发现统一公开仓库。",
        "artifactType": "software",
        "access": "restricted-or-not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-001",
    "projectId": "CPT-001",
    "titleZh": "DIII-D可转向ECCD闭环抑制新经典撕裂模",
    "titleEn": "Closed-loop NTM suppression with steerable ECCD on DIII-D",
    "year": 2013,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T4",
    "relatedTasks": [],
    "categoryLabel": "NTM控制",
    "problem": "磁岛位置随平衡变化而漂移，固定沉积会失配，导致ECCD抑制效率下降。",
    "method": "实时Mirnov模检测、MSE约束平衡重建与射线追踪，闭环转动六个EC镜面并控制陀螺管开关/调制，使电流沉积对准磁岛。",
    "controlArchitecture": "未完整公开。",
    "timescale": "磁岛演化约10–100 ms；镜面与功率闭环为毫秒至百毫秒级",
    "sensors": [
      "Mirnov线圈",
      "MSE",
      "磁测量",
      "实时平衡重建"
    ],
    "actuators": [
      "ECCD陀螺管",
      "六个可转向发射镜"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "DIII-D等离子体实验；闭环镜面跟踪并执行ECCD抑制。",
    "results": "展示了比固定瞄准更鲁棒的NTM抑制，并把磁岛定位、沉积预测和执行器纳入同一实时链。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "依赖可靠平衡与磁岛定位；沉积模型、镜面带宽、陀螺管可用性和多任务资源冲突限制性能。",
    "twinRelevance": "是模型在线校正、执行器数字影子和闭环V&V的典型最小数字孪生单元。",
    "papers": [
      {
        "title": "Real-time Mirror Steering for Improved Closed Loop Neoclassical Tearing Mode Suppression by Electron Cyclotron Current Drive in DIII-D",
        "authors": "E. Kolemen, R. Ellis, R.J. La Haye, D.A. Humphreys, J. Lohr, S. Noraky, B.G. Penaflor, A.S. Welander",
        "year": 2013,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2013.02.168",
        "url": "https://doi.org/10.1016/j.fusengdes.2013.02.168",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "DIII-D PCS NTM/ECCD application",
        "url": null,
        "status": "not-public",
        "relationship": "论文描述的装置专用实时控制实现；未发现可核验的公开专用仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-049",
    "projectId": "CPT-049",
    "titleZh": "NSTX快离子相空间工程控制MHD稳定性",
    "titleEn": "Fast-ion phase-space engineering for MHD stability on NSTX",
    "year": 2011,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T4",
    "relatedTasks": [],
    "categoryLabel": "快离子/MHD控制",
    "problem": "高能离子既提供加热和电流驱动，也可驱动Alfvén本征模并导致快离子损失。",
    "method": "通过不同NBI源和几何塑造快离子相空间分布，改变共振驱动并抑制/重排MHD活动。",
    "controlArchitecture": "未完整公开。",
    "timescale": "快离子慢化与MHD为亚毫秒至数十毫秒；束配置为阶段尺度",
    "sensors": [
      "磁扰动",
      "快离子诊断",
      "中子率",
      "NBI状态"
    ],
    "actuators": [
      "不同几何NBI源",
      "束功率与时序"
    ],
    "devices": [
      "NSTX",
      "NSTX-U"
    ],
    "validation": "NSTX实验及理论解释；不是通用自动闭环控制器。",
    "results": "证明主动改变快离子相空间可控制MHD稳定性，为未来NSTX-U快离子任务提供物理依据。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "主要是有意图的实验操纵而非实时反馈；对大型燃烧等离子体的alpha粒子可控性仍未证明。",
    "twinRelevance": "提示燃烧孪生必须纳入快离子分布和MHD耦合，不能只控制总功率或总β。",
    "papers": [
      {
        "title": "Control of magnetohydrodynamic stability by phase space engineering of energetic ions in tokamak plasmas",
        "authors": "E.D. Fredrickson et al.",
        "year": 2011,
        "venue": "Nature Communications",
        "doi": "10.1038/ncomms1622",
        "url": "https://doi.org/10.1038/ncomms1622",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "NSTX fast-ion phase-space workflow",
        "url": null,
        "status": "not-public",
        "relationship": "实验分析与束调度实现未发现公开统一仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-003",
    "projectId": "CPT-003",
    "titleZh": "TCV锯齿周期与剖面闭环控制",
    "titleEn": "Sawtooth-period and profile feedback control on TCV",
    "year": 2009,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T4",
    "relatedTasks": [
      "T3"
    ],
    "categoryLabel": "锯齿控制",
    "problem": "锯齿周期及剖面会影响种子岛和快速粒子稳定性，需要把EC沉积位置和功率转化为可控量。",
    "method": "利用实时ECE/剖面信息调节ECRH/ECCD；分别实现固定锯齿周期控制与极值寻优最大化周期。",
    "controlArchitecture": "未完整公开。",
    "timescale": "数毫秒诊断更新；锯齿周期为十至数百毫秒",
    "sensors": [
      "ECE",
      "磁测量",
      "实时平衡"
    ],
    "actuators": [
      "ECRH/ECCD功率",
      "EC沉积位置"
    ],
    "devices": [
      "TCV"
    ],
    "validation": "TCV闭环实验。",
    "results": "从温度剖面控制扩展到固定周期和极值寻优锯齿控制，证明EC系统可作为多目标快速执行器。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "ECE覆盖、沉积位置误差和EC资源竞争决定可控范围；锯齿延长不总等同于全局性能改善。",
    "twinRelevance": "揭示数字孪生必须表达控制目标之间的因果冲突，而不能只追踪单一设定值。",
    "papers": [
      {
        "title": "From profile to sawtooth control: developing feedback control using ECRH/ECCD systems on the TCV tokamak",
        "authors": "J.I. Paley, F. Felici, S. Coda, T.P. Goodman and the TCV Team",
        "year": 2009,
        "venue": "Plasma Physics and Controlled Fusion",
        "doi": "10.1088/0741-3335/51/12/124041",
        "url": "https://doi.org/10.1088/0741-3335/51/12/124041",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "TCV EC/sawtooth controller",
        "url": null,
        "status": "not-public",
        "relationship": "装置实时应用未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-004",
    "projectId": "CPT-004",
    "titleZh": "DIII-D电阻壁模磁反馈稳定",
    "titleEn": "Resistive-wall-mode magnetic feedback stabilization on DIII-D",
    "year": 2002,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T4",
    "relatedTasks": [
      "T6"
    ],
    "categoryLabel": "RWM控制",
    "problem": "在无壁极限以上，低旋转等离子体可能受n=1电阻壁模限制。",
    "method": "外部磁传感器分离不稳定模，反馈驱动非轴对称线圈，并结合等离子体旋转稳定效应。",
    "controlArchitecture": "未完整公开。",
    "timescale": "壁时间与模增长时间约毫秒至数十毫秒",
    "sensors": [
      "鞍形磁线圈",
      "Mirnov阵列",
      "转动/平衡诊断"
    ],
    "actuators": [
      "非轴对称反馈线圈",
      "中性束旋转驱动"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "DIII-D高β等离子体实验。",
    "results": "实验证明旋转和磁反馈可协同稳定RWM，支撑越过无壁β极限的运行研究。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "传感器易受等离子体响应、误差场和执行器直接耦合污染；高带宽线圈电源及延迟是硬约束。",
    "twinRelevance": "需要含真空室涡流、三维线圈和延迟的实时电磁孪生，而非仅等离子体状态模型。",
    "papers": [
      {
        "title": "Stabilization of the resistive wall mode in DIII-D by plasma rotation and magnetic feedback",
        "authors": "M. Okabayashi et al.",
        "year": 2002,
        "venue": "Plasma Physics and Controlled Fusion",
        "doi": "10.1088/0741-3335/44/12B/324",
        "url": "https://doi.org/10.1088/0741-3335/44/12B/324",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "DIII-D RWM feedback application",
        "url": null,
        "status": "not-public",
        "relationship": "线圈/传感器几何和实时滤波均为装置专用。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-033",
    "projectId": "CPT-033",
    "titleZh": "KSTAR钨偏滤器脱靶与DivControlNN控制",
    "titleEn": "Tungsten-divertor detachment control with DivControlNN on KSTAR",
    "year": 2026,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [],
    "categoryLabel": "脱靶控制",
    "problem": "全物理边缘模型无法实时运行，钨偏滤器又要求快速预测杂质注入后的脱靶响应。",
    "method": "用约7万组UEDGE模拟训练DivControlNN代理，结合Langmuir探针附着分数和实时控制调节杂质气体。",
    "controlArchitecture": "未完整公开。",
    "timescale": "代理推理约0.2 ms；闭环约毫秒至数十毫秒",
    "sensors": [
      "Langmuir探针",
      "辐射/靶板状态",
      "核心与平衡量"
    ],
    "actuators": [
      "杂质气体注入"
    ],
    "devices": [
      "KSTAR"
    ],
    "validation": "UEDGE测试集和KSTAR钨偏滤器闭环实验。",
    "results": "代理相对误差通常低于20%、相对UEDGE加速超过10^8，并在首次控制尝试中实现目标响应。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "部分训练来自早期碳壁/模型参数，跨钨壁状态迁移和平台区响应存在脆弱性；最新结果仍需更多战役复现。",
    "twinRelevance": "是高保真边缘模拟—代理—实时闭环的标准模板，也暴露训练分布治理问题。",
    "papers": [
      {
        "title": "Divertor detachment and heat exhaust mitigation control in KSTAR with tungsten divertor",
        "authors": "A. Gupta, D. Eldon, E. Bang, K. Kwon, H. Lee, A. Leonard, J. Hwang, X. Xu, M. Zhao and B. Zhu",
        "year": 2026,
        "venue": "Plasma Physics and Controlled Fusion",
        "doi": "10.1088/1361-6587/ae67a2",
        "url": "https://doi.org/10.1088/1361-6587/ae67a2",
        "sourceType": "peer-reviewed model and primary experiment"
      }
    ],
    "code": [
      {
        "name": "DivControlNN",
        "url": null,
        "status": "not-public",
        "relationship": "网络权重、训练数据与实时部署代码未发现公开仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CTL-CORE-015",
    "projectId": "mast-u-super-x-exhaust-control",
    "titleZh": "MAST-U Super-X 偏滤器瞬态排热闭环控制",
    "titleEn": "Demonstration of Super-X divertor exhaust control for transient heat-load management",
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [
      "T2"
    ],
    "categoryLabel": "垂直稳定、位置、边界与先进偏滤器位形",
    "problem": "先进偏滤器不仅要形成磁构型，还要在密度、辐射和壁相互作用扰动下维持冷却/脱靶前沿，限制靶板瞬态热负荷。",
    "method": "利用实时光谱/成像或辐射前沿诊断表征排热状态，通过气体注入反馈调节 Super-X 偏滤器冷却前沿，并与磁形状控制协同。",
    "controlArchitecture": "未完整公开。",
    "timescale": "排热前沿和燃料回路约毫秒至百毫秒；脉冲内持续闭环。",
    "sensors": [
      "可见光/光谱排热前沿",
      "靶板热流/红外诊断",
      "密度与磁构型",
      "快速成像",
      "Fulcher发射前沿",
      "平衡与偏滤器几何"
    ],
    "actuators": [
      "偏滤器/主腔气体注入",
      "Super-X 磁构型（由形状回路维持）",
      "偏滤器燃料/气体注入"
    ],
    "devices": [
      "MAST-U：Super-X 先进偏滤器；装置闭环实验",
      "MAST-U"
    ],
    "validation": "真实装置排热闭环；磁构型控制是外部前提。",
    "results": "首次在先进偏滤器构型上展示排热状态反馈控制，并用于抑制瞬态热负荷，说明磁几何与热状态必须形成两层协同控制。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "前沿诊断与热流间存在模型依赖；装置脉冲和功率仍低于电厂，跨材料/中性压力/杂质的可扩展性未证实。",
    "twinRelevance": "迫使孪生跨越磁学和边缘热流：磁形状服务只能给几何，排热控制还需光谱、SOL/中性粒子和材料温度状态。",
    "papers": [
      {
        "title": "Demonstration of Super-X divertor exhaust control for transient heat load management in compact fusion reactors",
        "authors": "B. Kool, K.H.A. Verhaegh, G.L. Derks, T.A. Wijkamp, J.T.W. Koenders, N. Lonigro, G. McArdle et al.",
        "year": 2025,
        "venue": "Nature Energy",
        "doi": "10.1038/s41560-025-01824-7",
        "url": "https://doi.org/10.1038/s41560-025-01824-7",
        "sourceType": "peer-reviewed primary experiment"
      },
      {
        "title": "First demonstration of Super-X divertor exhaust control for transient heat load management in compact fusion reactors",
        "authors": "J. Harrison et al.",
        "year": 2024,
        "venue": "原始论文 / 官方来源",
        "doi": "10.48550/arXiv.2407.07784",
        "url": "https://arxiv.org/abs/2407.07784",
        "sourceType": "author preprint reporting device experiment"
      }
    ],
    "code": [
      {
        "name": "MAST-U PCS / exhaust controller",
        "url": null,
        "status": "not-public",
        "relationship": "直接闭环实现",
        "artifactType": "software",
        "access": "facility software; not public",
        "license": "未标注"
      },
      {
        "name": "FreeGSNKE",
        "url": "https://github.com/FusionComputingLab/freegsnke",
        "status": "official-enabling",
        "relationship": "可复建磁构型层，不包含边缘辐射/中性粒子控制模型",
        "artifactType": "software",
        "access": "open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "MAST-U",
      "Super-X",
      "exhaust control",
      "detachment",
      "heat load"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CPT-041",
    "projectId": "CPT-041",
    "titleZh": "ITER面向控制的芯部—SOL—偏滤器集成模型",
    "titleEn": "Control-oriented integrated core-SOL-divertor model for ITER",
    "year": 2023,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [],
    "categoryLabel": "燃烧与偏滤器集成控制",
    "problem": "只控制燃烧或只控制脱靶会把风险转移到另一子系统，需要低阶但保留核心—边缘因果的模型。",
    "method": "耦合核心粒子/能量室、两点SOL和偏滤器中性粒子库存，显式表示加热、弹丸、Ne注入与抽气。",
    "controlArchitecture": "未完整公开。",
    "timescale": "毫秒边缘响应至数十秒燃烧/库存",
    "sensors": [
      "聚变功率",
      "核心密度/温度",
      "辐射",
      "靶板温度/热流",
      "中性压力"
    ],
    "actuators": [
      "外加热",
      "弹丸",
      "Ne注入",
      "抽气"
    ],
    "devices": [
      "ITER"
    ],
    "validation": "控制导向模型的数值响应与物理约束分析；非装置实验。",
    "results": "模型可同时表达燃烧目标、靶板热流低于10 MW/m²和靶温低于约7 eV等控制约束。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "高度降阶，不能替代SOLPS/输运和三维杂质模拟；参数需由装置/高保真模型持续校正。",
    "twinRelevance": "是电厂数字孪生在线预测内核的合理形态：可实时、可约束、但由高保真模型校准。",
    "papers": [
      {
        "title": "Control-oriented core-SOL-divertor model to address integrated burn and divertor control challenges in ITER",
        "authors": "V. Graber and E. Schuster",
        "year": 2023,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2023.113635",
        "url": "https://doi.org/10.1016/j.fusengdes.2023.113635",
        "sourceType": "peer-reviewed model/design"
      }
    ],
    "code": [
      {
        "name": "Integrated burn-divertor control model",
        "url": null,
        "status": "not-public",
        "relationship": "论文未附公开模型仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-025",
    "projectId": "CPT-025",
    "titleZh": "TCV MANTIS杂质辐射前沿实时控制",
    "titleEn": "MANTIS real-time impurity-radiation-front control on TCV",
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [],
    "categoryLabel": "脱靶/辐射前沿控制",
    "problem": "偏滤器脱靶需把低温辐射区维持在合适位置，过低会伤靶板，过高会污染核心。",
    "method": "MANTIS多光谱相机实时估计C III发射前沿，利用多正弦辨识阀—等离子体动态，反馈调节D2/N2流量。",
    "controlArchitecture": "未完整公开。",
    "timescale": "相机与控制约毫秒至数十毫秒；阀有效带宽低于约50 Hz",
    "sensors": [
      "MANTIS多光谱相机",
      "C III发射前沿",
      "平衡/磁构型"
    ],
    "actuators": [
      "D2气阀",
      "N2杂质气阀"
    ],
    "devices": [
      "TCV"
    ],
    "validation": "系统辨识与TCV L模、H模闭环实验。",
    "results": "首次以杂质发射前沿作为闭环变量，在不同约束模式下稳定跟踪目标位置。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "发射前沿是温度/电离状态的代理，不等同于热流本身；光路污染、杂质种类和磁构型改变需重标定。",
    "twinRelevance": "是诊断数字孪生、图像状态估计和控制导向降阶模型协同的标杆。",
    "papers": [
      {
        "title": "Real-time feedback control of the impurity emission front in tokamak divertor plasmas",
        "authors": "T. Ravensbergen, M. van Berkel, A. Perek, C. Galperti, B.P. Duval, O. Février, R.J.R. van Kampen et al.",
        "year": 2021,
        "venue": "Nature Communications",
        "doi": "10.1038/s41467-021-21268-3",
        "url": "https://doi.org/10.1038/s41467-021-21268-3",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "MANTIS real-time front controller",
        "url": null,
        "status": "not-public",
        "relationship": "成像处理与TCV实时控制实现未发现完整公开仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-026",
    "projectId": "CPT-026",
    "titleZh": "DIII-D与EAST多杂质脱靶反馈比较",
    "titleEn": "Controlled detachment with multiple impurity species on DIII-D and EAST",
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [],
    "categoryLabel": "脱靶控制",
    "problem": "不同杂质和诊断指标对脱靶起始、深度及核心污染的灵敏度不同。",
    "method": "在高性能场景中比较N2、Ne、Ar等注入，以靶板电子温度和离子饱和电流等指标反馈控制脱靶程度。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约10–100 ms诊断与气阀响应",
    "sensors": [
      "Langmuir探针Te与Jsat",
      "辐射",
      "核心性能与杂质诊断"
    ],
    "actuators": [
      "N2/Ne/Ar杂质气阀",
      "燃料气体"
    ],
    "devices": [
      "DIII-D",
      "EAST"
    ],
    "validation": "两台装置的高性能脱靶实验和闭环控制。",
    "results": "靶板Te对脱靶起始最敏感；多种杂质均可建立受控脱靶并与较高约束协同。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "Langmuir探针在堆级稳态环境下可靠性有限；杂质滞留、壁条件和核心稀释会造成显著记忆与漂移。",
    "twinRelevance": "为跨装置变量标准化、诊断替代量和不确定度校准提供案例。",
    "papers": [
      {
        "title": "An analysis of controlled detachment by seeding various impurity species in high performance scenarios on DIII-D and EAST",
        "authors": "D. Eldon, H.Q. Wang, L. Wang, J. Barr, S. Ding, A. Garofalo, X.Z. Gong, H.Y. Guo et al.",
        "year": 2021,
        "venue": "Nuclear Materials and Energy",
        "doi": "10.1016/j.nme.2021.100963",
        "url": "https://doi.org/10.1016/j.nme.2021.100963",
        "sourceType": "peer-reviewed multi-device primary experiment"
      }
    ],
    "code": [
      {
        "name": "DIII-D/EAST detachment feedback applications",
        "url": null,
        "status": "not-public",
        "relationship": "装置专用诊断处理与控制代码未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-027",
    "projectId": "CPT-027",
    "titleZh": "DIII-D偏滤器表面热流实时估计与控制",
    "titleEn": "Real-time divertor surface-heat-flux estimation and control on DIII-D",
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [
      "T9",
      "T0"
    ],
    "categoryLabel": "热负荷控制",
    "problem": "红外热流反演通常为后处理，难以直接用于实时保护和反馈。",
    "method": "建立实时表面热响应/热流估计器，以离线IR反演验证；在GSevolve闭环仿真中整定并在DIII-D用气体调节热负荷。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约毫秒至数十毫秒估计；热扩散与气体响应数十毫秒以上",
    "sensors": [
      "实时表面温度/红外量",
      "功率与平衡",
      "离线IR基准"
    ],
    "actuators": [
      "气体注入",
      "可用加热功率"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "离线IR交叉验证、GSevolve闭环仿真和DIII-D实验初步控制。",
    "results": "实时估计与离线IR热流具有良好一致性，并展示基于模型的热流反馈可行性。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "表面属性、沉积层和相机标定漂移影响精度；空间峰值可能被降阶估计平滑。",
    "twinRelevance": "连接热诊断、材料热模型、控制和V&V，是工程—物理孪生交界的核心。",
    "papers": [
      {
        "title": "Real-time estimation and control of divertor surface heat flux on the DIII-D tokamak",
        "authors": "H. Anand, D. Eldon, D. Humphreys, A. Hyatt, B. Sammuli, A. Welander, J. Barr, F. Scotti and J. Boedo",
        "year": 2021,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2021.112560",
        "url": "https://doi.org/10.1016/j.fusengdes.2021.112560",
        "sourceType": "peer-reviewed model and primary experiment"
      }
    ],
    "code": [
      {
        "name": "DIII-D real-time heat-flux estimator",
        "url": null,
        "status": "not-public",
        "relationship": "实时估计与PCS实现未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-034",
    "projectId": "CPT-034",
    "titleZh": "DIII-D辐射功率闭环控制",
    "titleEn": "Radiated-power feedback control on DIII-D",
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [
      "T4",
      "T6"
    ],
    "categoryLabel": "辐射功率控制",
    "problem": "高辐射分数可降低靶板热负荷，但过强核心辐射和ELM扰动会破坏闭环。",
    "method": "实时12通道bolometer估计辐射功率，以N2注入反馈跟踪辐射或辐射分数目标。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约10–100 ms",
    "sensors": [
      "12通道bolometer",
      "输入功率",
      "密度与核心性能"
    ],
    "actuators": [
      "N2气阀"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "实时估计与放电后分析比对并开展DIII-D闭环实验。",
    "results": "实时传感量与后处理在约20%内一致；辐射可增加约150%、辐射分数达约80%，较稳态案例约55%。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "高辐射时ELM扰动可使回路不稳；单一总辐射量无法定位核心/边缘辐射分布。",
    "twinRelevance": "需要把辐射层析、核心稀释和边缘热流纳入多目标观测器，而非仅总功率PI。",
    "papers": [
      {
        "title": "Advances in radiated power control at DIII-D",
        "authors": "D. Eldon, E. Kolemen, D.A. Humphreys, A.W. Hyatt, A.E. Järvinen, A.W. Leonard, A.G. McLean et al.",
        "year": 2019,
        "venue": "Nuclear Materials and Energy",
        "doi": "10.1016/j.nme.2019.01.010",
        "url": "https://doi.org/10.1016/j.nme.2019.01.010",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "DIII-D radiated-power controller",
        "url": null,
        "status": "not-public",
        "relationship": "实时bolometer与PCS实现未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-038",
    "projectId": "CPT-038",
    "titleZh": "ASDEX Upgrade弹丸反馈高密度高约束场景",
    "titleEn": "Pellet-feedback high-density high-confinement scenarios on ASDEX Upgrade",
    "year": 2018,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [
      "T3"
    ],
    "categoryLabel": "T5",
    "problem": "反应堆相关高密度需把粒子送入核心，同时避免边缘密度和辐射破坏约束。",
    "method": "弹丸反馈控制核心密度，配合氮注入和加热，使核心密度超过Greenwald相关水平而控制边缘条件。",
    "controlArchitecture": "未完整公开。",
    "timescale": "弹丸离散事件约数十毫秒至秒；输运响应更慢",
    "sensors": [
      "干涉仪/密度剖面",
      "边缘与核心辐射",
      "约束/储能"
    ],
    "actuators": [
      "弹丸注入器",
      "N2气阀",
      "加热功率"
    ],
    "devices": [
      "ASDEX Upgrade"
    ],
    "validation": "AUG全钨壁高密度高约束实验。",
    "results": "实现反馈控制的反应堆相关高密度场景；进一步增密时收益因密度峰向边缘移动而下降。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "弹丸重复率、穿透、芯部粒子源和壁库存放大到燃烧等离子体仍不确定；高密度不必然提升聚变性能。",
    "twinRelevance": "要求把离散弹丸、粒子库存、输运和边缘约束统一到混合状态孪生。",
    "papers": [
      {
        "title": "Feedback controlled, reactor relevant, high-density, high-confinement scenarios at ASDEX Upgrade",
        "authors": "P.T. Lang et al.",
        "year": 2018,
        "venue": "Nuclear Fusion",
        "doi": "10.1088/1741-4326/aaa339",
        "url": "https://doi.org/10.1088/1741-4326/aaa339",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "AUG pellet density controller",
        "url": null,
        "status": "not-public",
        "relationship": "弹丸调度和装置反馈代码未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-029",
    "projectId": "CPT-029",
    "titleZh": "JET ITER-like wall基于Langmuir探针的脱靶反馈",
    "titleEn": "Langmuir-probe detachment feedback on JET with ITER-like wall",
    "year": 2017,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [],
    "categoryLabel": "脱靶控制",
    "problem": "需要在金属壁H模中以直接靶板指标控制脱靶，同时适应打击点扫掠。",
    "method": "使用外靶8个Langmuir探针的离子饱和电流roll-over定义附着分数，反馈调节N注入。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约10–100 ms",
    "sensors": [
      "外靶Langmuir探针阵列",
      "平衡/打击点位置",
      "辐射"
    ],
    "actuators": [
      "氮气注入"
    ],
    "devices": [
      "JET"
    ],
    "validation": "JET ITER-like wall H模闭环实验，含固定与扫掠打击点。",
    "results": "从附着态过渡到设定脱靶程度并稳定跟踪，证明探针阵列可用于实时控制。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "探针在高热流、沉积和长脉冲中会老化；roll-over定义受打击点位置和探针状态影响。",
    "twinRelevance": "要求诊断健康状态和几何映射成为控制变量置信度的一部分。",
    "papers": [
      {
        "title": "Real-time control of divertor detachment in H-mode with impurity seeding using Langmuir probe feedback in JET-ITER-like wall",
        "authors": "C. Guillemaut, M. Lennholm, J. Harrison, I. Carvalho, D. Valcarcel, R. Felton, S. Griph et al.",
        "year": 2017,
        "venue": "Plasma Physics and Controlled Fusion",
        "doi": "10.1088/1361-6587/aa5951",
        "url": "https://doi.org/10.1088/1361-6587/aa5951",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "JET LP detachment controller",
        "url": null,
        "status": "not-public",
        "relationship": "装置探针处理与气阀控制未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-035",
    "projectId": "CPT-035",
    "titleZh": "NSTX-U实时辐射偏滤器反馈开发",
    "titleEn": "Real-time radiative-divertor feedback development for NSTX-U",
    "year": 2016,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [
      "T9"
    ],
    "categoryLabel": "辐射偏滤器控制",
    "problem": "NSTX-U高功率密度要求实时辨识偏滤器辐射区并规划反馈接口。",
    "method": "开发快速VUV/辐射测量、实时处理和控制接口，评估辐射偏滤器闭环架构。",
    "controlArchitecture": "未完整公开。",
    "timescale": "目标为毫秒至数十毫秒",
    "sensors": [
      "VUV阵列",
      "bolometer",
      "边缘/偏滤器诊断"
    ],
    "actuators": [
      "计划中的杂质注入",
      "加热/场景协调"
    ],
    "devices": [
      "NSTX-U"
    ],
    "validation": "诊断、实时处理和控制概念开发；论文未证明NSTX-U等离子体闭环。",
    "results": "给出NSTX-U辐射偏滤器实时反馈所需诊断与系统方案，属于部署前使能工作。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "属于开发/设计证据，不能写成闭环实验；装置恢复后的实际覆盖需新论文确认。",
    "twinRelevance": "强调先建设可观测性和实时诊断数字线程，再谈闭环排热。",
    "papers": [
      {
        "title": "Developing real-time radiative divertor feedback control for NSTX-U",
        "authors": "V.A. Soukhanovskii et al.",
        "year": 2016,
        "venue": "Review of Scientific Instruments",
        "doi": "10.1063/1.4960058",
        "url": "https://doi.org/10.1063/1.4960058",
        "sourceType": "peer-reviewed instrumentation/design"
      }
    ],
    "code": [
      {
        "name": "NSTX-U radiative-divertor RT processing",
        "url": null,
        "status": "not-public",
        "relationship": "实时诊断/控制接口未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-028",
    "projectId": "CPT-028",
    "titleZh": "ASDEX Upgrade氮注入偏滤器功率负荷反馈",
    "titleEn": "Nitrogen-seeding divertor-power-load feedback at ASDEX Upgrade",
    "year": 2010,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [
      "T6"
    ],
    "categoryLabel": "辐射/热负荷控制",
    "problem": "钨偏滤器在高加热功率下需要常规化降低靶板功率，同时维持核心性能。",
    "method": "以偏滤器/辐射反馈调节N2注入，并与密度和加热控制协调。",
    "controlArchitecture": "未完整公开。",
    "timescale": "数十毫秒至秒；壁中氮存储具有更长记忆",
    "sensors": [
      "辐射功率",
      "偏滤器热流/温度",
      "核心性能",
      "密度"
    ],
    "actuators": [
      "N2气阀",
      "燃料气体",
      "加热功率"
    ],
    "devices": [
      "ASDEX Upgrade"
    ],
    "validation": "AUG全钨环境的常规高功率实验运行。",
    "results": "在硼化钨壁中约12 MW以上加热时成为关键运行工具，建立常规辐射排热反馈经验。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "氮在壁中的存储/释放产生迟滞；杂质积累和核心稀释使单回路控制可能失稳。",
    "twinRelevance": "说明排热孪生必须有壁库存状态和跨放电影响，而非无记忆黑箱。",
    "papers": [
      {
        "title": "Divertor power load feedback with nitrogen seeding in ASDEX Upgrade",
        "authors": "A. Kallenbach, R. Dux, J.C. Fuchs, R. Fischer, B. Geiger, L. Giannone, A. Herrmann et al.",
        "year": 2010,
        "venue": "Plasma Physics and Controlled Fusion",
        "doi": "10.1088/0741-3335/52/5/055002",
        "url": "https://doi.org/10.1088/0741-3335/52/5/055002",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "AUG nitrogen-seeding feedback",
        "url": null,
        "status": "not-public",
        "relationship": "运行级装置控制未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-007",
    "projectId": "CPT-007",
    "titleZh": "ASDEX Upgrade杂质排热反馈与弹丸ELM节拍集成",
    "titleEn": "Integrated exhaust feedback and pellet ELM pacing at ASDEX Upgrade",
    "year": 2005,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T5",
    "relatedTasks": [
      "T3",
      "T4"
    ],
    "categoryLabel": "ELM与排热协同控制",
    "problem": "稳态热负荷和ELM瞬态负荷需要同时降低，而杂质注入、燃料补给与弹丸节拍相互耦合。",
    "method": "偏滤器参数/辐射反馈调节杂质气体，同时用弹丸进行ELM节拍，形成集成排气控制。",
    "controlArchitecture": "未完整公开。",
    "timescale": "辐射/偏滤器反馈约10–100 ms；弹丸节拍数十毫秒至秒",
    "sensors": [
      "辐射测量",
      "偏滤器诊断",
      "Dα",
      "密度"
    ],
    "actuators": [
      "杂质气阀",
      "燃料气阀",
      "弹丸注入器"
    ],
    "devices": [
      "ASDEX Upgrade"
    ],
    "validation": "AUG实验。",
    "results": "证明稳态排热反馈与ELM节拍可在同一运行场景中协同，而非各自孤立优化。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "弹丸可用频率、粒子盘存、杂质滞留和核聚变堆高通量弹丸工程仍有显著差距。",
    "twinRelevance": "要求孪生同时表示离散事件执行器、连续气体系统及壁存储记忆。",
    "papers": [
      {
        "title": "Integrated exhaust control with divertor parameter feedback and pellet ELM pacemaking in ASDEX Upgrade",
        "authors": "A. Kallenbach, P.T. Lang, R. Dux, C. Fuchs, A. Herrmann, H. Meister, V. Mertens, R. Neu, T. Pütterich, T. Zehetbauer and the ASDEX Upgrade Team",
        "year": 2005,
        "venue": "Journal of Nuclear Materials",
        "doi": "10.1016/j.jnucmat.2004.10.027",
        "url": "https://doi.org/10.1016/j.jnucmat.2004.10.027",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "AUG integrated exhaust controller",
        "url": null,
        "status": "not-public",
        "relationship": "装置集成控制实现未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-040",
    "projectId": "CPT-040",
    "titleZh": "ITER非线性燃烧控制一维仿真",
    "titleEn": "One-dimensional nonlinear burn-control simulations for ITER",
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T6",
    "relatedTasks": [
      "T8"
    ],
    "categoryLabel": "燃烧/聚变功率控制",
    "problem": "自加热D-T等离子体存在热失控、氦灰积累和燃料/加热强耦合，零维控制器需在更高维模型上验证。",
    "method": "从非线性零维燃烧模型构造Lyapunov型控制器，在一维输运模拟中联合调节外加热、加料和抽气等。",
    "controlArchitecture": "未完整公开。",
    "timescale": "能量约秒级，粒子/氦灰约秒至数十秒",
    "sensors": [
      "聚变功率/中子率",
      "电子/离子温度",
      "D-T密度",
      "氦灰与辐射估计"
    ],
    "actuators": [
      "NBI",
      "ICRH/ECRH",
      "弹丸/气体加料",
      "抽气"
    ],
    "devices": [
      "ITER"
    ],
    "validation": "一维物理模型数值仿真；无ITER等离子体实验。",
    "results": "展示非线性燃烧控制律可在更具空间分辨率的模型中稳定目标，但仍是控制设计证据。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "聚变功率和氦灰的实时可观测性、alpha加热模型误差、执行器迟滞与故障尚未被装置验证。",
    "twinRelevance": "定义电厂级孪生需要的燃烧状态、粒子库存和慢时间尺度预测层。",
    "papers": [
      {
        "title": "One-dimensional simulations of nonlinear burn control in ITER",
        "authors": "V. Graber and E. Schuster",
        "year": 2025,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2025.115362",
        "url": "https://doi.org/10.1016/j.fusengdes.2025.115362",
        "sourceType": "peer-reviewed simulation/design"
      }
    ],
    "code": [
      {
        "name": "ITER nonlinear burn-control simulation",
        "url": null,
        "status": "not-public",
        "relationship": "论文模型与控制代码未发现公开仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CTL-CORE-040",
    "projectId": "CTL-CORE-040",
    "titleZh": "ITER 非线性燃烧控制与自适应执行器分配",
    "titleEn": "Nonlinear burn control in ITER with adaptive actuator allocation",
    "year": 2022,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T6",
    "relatedTasks": [
      "T8"
    ],
    "categoryLabel": "燃烧、非感应场景与多执行器协调",
    "problem": "alpha 自加热使温度—密度动力学强非线性，燃料和加热执行器有延迟/饱和且模型不确定。",
    "method": "0D/1D 温度—密度—氦灰动力学上设计非线性鲁棒控制器；将虚拟的电子/离子加热与 D/T 加料请求通过在线优化分配给 NBI、EC/IC、气体和颗粒。",
    "controlArchitecture": "未完整公开。",
    "timescale": "燃烧与粒子/能量约束为 0.1–数十秒；执行器管理为毫秒至百毫秒。",
    "sensors": [
      "电子/离子温度",
      "D/T 密度",
      "氦灰/杂质",
      "融合功率/中子率",
      "执行器健康"
    ],
    "actuators": [
      "D/T 气体和颗粒",
      "NBI",
      "ECH/ECCD",
      "ICRH"
    ],
    "devices": [
      "ITER：D-T 燃烧等离子体设计；非线性仿真"
    ],
    "validation": "设计仿真；尚无 ITER 燃烧实验。",
    "results": "仿真表明在执行器动力学不确定和可用性变化下仍可调节燃烧状态；把燃烧控制与执行器分配从一开始统一建模。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "燃烧模型、氦灰输运、D/T 比测量和执行器有效性尚未由 ITER 数据验证；安全/机器保护不在控制器证明范围内。",
    "twinRelevance": "反应堆孪生必须闭合 alpha 加热、燃料循环、氦灰和执行器约束，且明确输出只是预测建议而非经实证权威控制。",
    "papers": [
      {
        "title": "Nonlinear burn control in ITER using adaptive allocation of actuators with uncertain dynamics",
        "authors": "A. Pajares, E. Schuster et al.",
        "year": 2022,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/1741-4326/ac6a69",
        "url": "https://www6.lehigh.edu/~eus204/publications/journals/nf22_burnctrlallocation.pdf",
        "sourceType": "peer-reviewed journal article / author manuscript"
      }
    ],
    "code": [
      {
        "name": "ITER PCSSP",
        "url": "https://github.com/iterorganization/PCSSP",
        "status": "official-enabling",
        "relationship": "可集成燃烧控制/执行器模型和控制器在环",
        "artifactType": "software",
        "access": "official open source",
        "license": "未标注"
      },
      {
        "name": "TORAX",
        "url": "https://github.com/google-deepmind/torax",
        "status": "official-enabling",
        "relationship": "可用于开放 1D 运输与控制优化研究；当前不是完整 alpha/氦灰燃烧控制平台",
        "artifactType": "software",
        "access": "official open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "ITER",
      "burn control",
      "D-T fueling",
      "adaptive allocation",
      "alpha heating"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CPT-036",
    "projectId": "CPT-036",
    "titleZh": "DIII-D可变束能量下的储能与旋转反馈",
    "titleEn": "Stored-energy and rotation feedback with variable beam energy on DIII-D",
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T6",
    "relatedTasks": [
      "T8"
    ],
    "categoryLabel": "功率与旋转控制",
    "problem": "束能量和perveance改变加热、扭矩与快离子损失，多束执行器需要在约束下分配。",
    "method": "实时模型估计束功率/扭矩和损失，以多变量反馈协调8束中性束的能量、perveance与开关。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约10–100 ms至秒",
    "sensors": [
      "储能",
      "旋转诊断",
      "束状态",
      "平衡/密度"
    ],
    "actuators": [
      "8路NBI束能量",
      "perveance",
      "束开关"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "DIII-D闭环实验，包含功率/扭矩损失补偿和幅值/变化率限制。",
    "results": "实现储能和旋转的独立/联合跟踪，展示多执行器分配器可显式处理工程约束。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "依赖实时束损失与响应模型；NBI故障、快离子MHD和离散开关会破坏线性分配假设。",
    "twinRelevance": "是执行器数字孪生、约束分配和多目标控制的直接基准。",
    "papers": [
      {
        "title": "Feedback control of stored energy and rotation with variable beam energy and perveance on DIII-D",
        "authors": "M.D. Boyer, K.G. Erickson, B.A. Grierson, D.C. Pace, J.T. Scoville, J. Rauch, B.J. Crowley et al.",
        "year": 2019,
        "venue": "Nuclear Fusion",
        "doi": "10.1088/1741-4326/ab17f5",
        "url": "https://doi.org/10.1088/1741-4326/ab17f5",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "DIII-D variable-NBI energy/rotation controller",
        "url": null,
        "status": "not-public",
        "relationship": "实时束模型和PCS应用未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CTL-CORE-039",
    "projectId": "CTL-CORE-039",
    "titleZh": "NSTX-U 非感应维持场景的模型式反馈设计",
    "titleEn": "Feedback-control design for non-inductively sustained NSTX-U scenarios using TRANSP",
    "year": 2017,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T6",
    "relatedTasks": [],
    "categoryLabel": "燃烧、非感应场景与多执行器协调",
    "problem": "NSTX-U 稳态目标需在高自举电流、NBI 电流驱动与 β/稳定性约束下维持电流和压力状态。",
    "method": "从 TRANSP 预测场景提取低阶动态响应，设计对 Ip/β/电流剖面特征的反馈并在预测模型中评估执行器可控性。",
    "controlArchitecture": "未完整公开。",
    "timescale": "能量约 0.1 s；电流扩散约 0.1–数秒。",
    "sensors": [
      "rtEFIT/MSE q 与电流剖面",
      "β/储能",
      "NBI 源和密度"
    ],
    "actuators": [
      "NBI 功率/能量/束源组合",
      "Ip/CS-PF（场景阶段）"
    ],
    "devices": [
      "NSTX-U：非感应维持预测场景；TRANSP 预测与控制仿真"
    ],
    "validation": "装置相关高保真仿真；论文非 NSTX-U 闭环实证。",
    "results": "给出非感应 NSTX-U 场景的反馈可行性和执行器/诊断需求，明确稳态控制不仅是固定 NBI 波形。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "依赖 TRANSP 运输/快离子模型和未完全实证的 NSTX-U 运行域；尚无文中闭环放电。",
    "twinRelevance": "可把 TRANSP 作为慢速权威场景层，向快控制孪生提供响应模型和周期性校正，而非直接进入每个实时周期。",
    "papers": [
      {
        "title": "Feedback control design for non-inductively sustained scenarios in NSTX-U using TRANSP",
        "authors": "M. D. Boyer, R. G. Andre, D. A. Gates et al.",
        "year": 2017,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1088/1741-4326/aa68e9",
        "url": "https://doi.org/10.1088/1741-4326/aa68e9",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "TRANSP",
        "url": "https://github.com/PrincetonUniversity/TRANSP",
        "status": "official-enabling",
        "relationship": "论文场景/响应模型后端",
        "artifactType": "software",
        "access": "official open source repository",
        "license": "未标注"
      },
      {
        "name": "NSTX-U PCS/rtEFIT",
        "url": null,
        "status": "not-public",
        "relationship": "计划部署接口",
        "artifactType": "software",
        "access": "facility software",
        "license": "未标注"
      }
    ],
    "tags": [
      "NSTX-U",
      "TRANSP",
      "non-inductive",
      "NBI",
      "scenario control"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CPT-037",
    "projectId": "CPT-037",
    "titleZh": "KSTAR极向β实时控制",
    "titleEn": "Real-time poloidal-beta control on KSTAR",
    "year": 2015,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T6",
    "relatedTasks": [],
    "categoryLabel": "β控制",
    "problem": "极向β是压力与电流分布的重要综合指标，需要用有限的NBI资源实时跟踪。",
    "method": "以抗磁环/平衡估计βp，PI/PID控制NBI-1脉宽/功率。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约10–100 ms",
    "sensors": [
      "抗磁环",
      "实时平衡",
      "NBI状态"
    ],
    "actuators": [
      "NBI-1功率/脉宽调制"
    ],
    "devices": [
      "KSTAR"
    ],
    "validation": "KSTAR等离子体闭环实验。",
    "results": "演示βp设定值跟踪和NBI闭环调节，为高性能场景监督提供基础。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "βp是全局量，不能替代局域压力梯度或MHD裕度；NBI离散性与延迟会限制带宽。",
    "twinRelevance": "适合作为功率—状态响应辨识和稳态设定值管理的入门闭环。",
    "papers": [
      {
        "title": "Demonstration of real-time control for poloidal beta in KSTAR",
        "authors": "S.-H. Hahn et al.",
        "year": 2015,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2015.04.004",
        "url": "https://doi.org/10.1016/j.fusengdes.2015.04.004",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "KSTAR beta-p controller",
        "url": null,
        "status": "not-public",
        "relationship": "KSTAR实时控制实现未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-024",
    "projectId": "CPT-024",
    "titleZh": "KSTAR基于DECAF实时稳定性评估的VDE方向控制与风险降低",
    "titleEn": "DECAF-based real-time VDE risk intervention on KSTAR",
    "year": 2026,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [],
    "categoryLabel": "VDE风险干预",
    "problem": "VDE前兆跨多个事件链，单阈值无法区分可恢复异常与不可避免破裂。",
    "method": "DECAF组织磁、平衡和控制事件，实时评估垂直稳定风险；实验在检测后把控制电压置零，以改变VDE方向并降低装置风险。",
    "controlArchitecture": "未完整公开。",
    "timescale": "毫秒至数十毫秒",
    "sensors": [
      "磁测量",
      "实时平衡",
      "垂直位置/速度",
      "执行器状态"
    ],
    "actuators": [
      "PF/垂直稳定控制电压",
      "异常处置逻辑"
    ],
    "devices": [
      "KSTAR",
      "NSTX-U",
      "MAST"
    ],
    "validation": "DECAF跨装置历史事件研究；KSTAR进一步开展实时VDE避免实验。",
    "results": "KSTAR实验实时检测VDE，并通过将控制电压置零把VDE引导至预期方向、降低未缓解双向VDE风险；原文同时指出完全避免VDE仍是未来目标。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "标题使用avoidance但公开正文强调本次主要是VDE方向控制而非完全避免；2026结果较新，覆盖、误触发和常规化仍需复现。",
    "twinRelevance": "DECAF式事件图谱非常适合数字孪生的异常语义层与因果回放。",
    "papers": [
      {
        "title": "Disruption Event Characterization and Forecasting in Tokamaks",
        "authors": "S.A. Sabbagh et al.",
        "year": 2023,
        "venue": "Physics of Plasmas",
        "doi": "10.1063/5.0133825",
        "url": "https://doi.org/10.1063/5.0133825",
        "sourceType": "peer-reviewed multi-device study"
      },
      {
        "title": "Avoidance of disruptions on KSTAR due to vertical displacement events via novel real-time stability assessment",
        "authors": "S.A. Sabbagh et al.",
        "year": 2026,
        "venue": "Physics of Plasmas",
        "doi": "10.1063/5.0320639",
        "url": "https://doi.org/10.1063/5.0320639",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "DECAF",
        "url": null,
        "status": "not-public",
        "relationship": "论文与会议材料描述框架，但未找到公开官方执行仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CTL-CORE-005",
    "projectId": "TCV-PREDICT-FIRST-RAMPDOWN",
    "titleZh": "TCV 预测优先的安全降流轨迹学习",
    "titleEn": "Learning plasma dynamics and robust rampdown trajectories with predict-first experiments at TCV",
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [
      "T1"
    ],
    "categoryLabel": "T7",
    "problem": "受控终止需在垂直稳定、形状跟踪、线圈/电源和电流剖面约束间折中，经验波形难以覆盖模型误差。",
    "method": "用311个低性能和少量高性能rampdown训练神经状态空间模型，以GPU高速筛选约万条轨迹/秒并用RL优化，再以前馈方式上机。",
    "controlArchitecture": "未完整公开。",
    "timescale": "降流为数十毫秒至数百毫秒；磁控制内环约 10 kHz。",
    "sensors": [
      "等离子体电流",
      "磁形状/位置",
      "线圈电流",
      "动理学/约束信号",
      "TCV状态时序",
      "电流",
      "密度",
      "形状",
      "辐射/MHD指标"
    ],
    "actuators": [
      "TCV 19 路线圈",
      "电流目标",
      "加热/燃料的场景波形",
      "电流、加热、密度和形状轨迹"
    ],
    "devices": [
      "TCV：受控 ramp-down/termination；2024 年实验迭代与外推测试",
      "TCV"
    ],
    "validation": "离线模型检验与TCV实验；从140 kA向170 kA外推并成功执行。",
    "results": "证明模型可通过少量前瞻实验快速修正并生成更稳健终止轨迹；负面结果也揭示只优化低维电流轨迹会忽略径向/形状可控性。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "模型、训练数据和实验工作流未形成完全开放的一键复现包；安全性仍依赖 TCV 原有保护和磁控制内环。",
    "twinRelevance": "代表孪生从‘一次性模型’转向‘预测—实验—残差—更新’的持续校准闭环，尤其适合软着陆和异常终止服务。",
    "papers": [
      {
        "title": "Learning plasma dynamics and robust rampdown trajectories with predict-first experiments at TCV",
        "authors": "A. Agnello et al.",
        "year": 2025,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1038/s41467-025-63917-x",
        "url": "https://doi.org/10.1038/s41467-025-63917-x",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "FreeGSNKE",
        "url": "https://github.com/FusionComputingLab/freegsnke",
        "status": "official-enabling",
        "relationship": "同类动态自由边界/轨迹验证的开放基础，但不是论文中 TCV 学习模型的完整复现",
        "artifactType": "software",
        "access": "official open source; LGPL-3.0",
        "license": "未标注"
      }
    ],
    "tags": [
      "TCV",
      "ramp-down",
      "predict-first",
      "system identification",
      "safe termination"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "CPT-018",
    "projectId": "CPT-018",
    "titleZh": "DIII-D贝叶斯安全降电流轨迹自动实验设计",
    "titleEn": "Bayesian automated design of safe rampdowns on DIII-D",
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [],
    "categoryLabel": "安全终止",
    "problem": "安全降电流轨迹具有高维约束，人工试错慢且靠近破裂边界。",
    "method": "概率机器学习/贝叶斯优化在放电之间更新安全与性能模型，选择下一条前馈rampdown轨迹。",
    "controlArchitecture": "未完整公开。",
    "timescale": "秒级降电流阶段；学习更新发生在放电之间",
    "sensors": [
      "放电终态与破裂标签",
      "等离子体电流",
      "密度",
      "形状和执行器记录"
    ],
    "actuators": [
      "电流参考",
      "加热",
      "密度/形状前馈轨迹"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "2022年DIII-D自动实验设计战役。",
    "results": "找到更安全的降电流方案；实验破裂时平均电流降至DIII-D历史平均破裂电流的约1/2.5。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "是放电间前馈轨迹学习，不是毫秒级在线反馈；安全模型只覆盖已探索范围。",
    "twinRelevance": "适合数字线程中的实验设计、风险台账和轨迹版本管理。",
    "papers": [
      {
        "title": "Automated experimental design of safe rampdowns via probabilistic machine learning",
        "authors": "V. Mehta, J. Barr, J. Abbate, M.D. Boyer, I. Char, W. Neiswanger, E. Kolemen and J. Schneider",
        "year": 2024,
        "venue": "Nuclear Fusion",
        "doi": "10.1088/1741-4326/ad22f5",
        "url": "https://doi.org/10.1088/1741-4326/ad22f5",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "Safe-rampdown Bayesian optimizer",
        "url": null,
        "status": "not-public",
        "relationship": "论文未给出与装置实验完整对应的公开仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-022",
    "projectId": "CPT-022",
    "titleZh": "ITER碎裂弹丸注入破裂缓解系统",
    "titleEn": "ITER shattered-pellet-injection disruption mitigation system",
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [],
    "categoryLabel": "破裂缓解",
    "problem": "ITER储能和电流使未缓解破裂不可接受，需要在检测后极短时间向等离子体注入足够材料。",
    "method": "高速发射低温H/Ne等弹丸，在弯管撞碎后形成碎片云注入；系统设计包含多炮口、触发、诊断与冗余。",
    "controlArchitecture": "未完整公开。",
    "timescale": "检测—触发—到达为毫秒级",
    "sensors": [
      "破裂预测/事件触发",
      "弹丸位置与速度",
      "阀和低温系统状态"
    ],
    "actuators": [
      "碎裂弹丸注入器",
      "推进气体与低温制备系统"
    ],
    "devices": [
      "ITER"
    ],
    "validation": "实验室注入器/碎裂特性试验、设计评审和装置级集成；ITER尚无等离子体闭环结果。",
    "results": "形成ITER基线破裂缓解技术并完成关键设计评审；官方资料给出弹丸速度可超过1800 km/h。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "目前证据主要来自部件与模型而非ITER等离子体；预测触发、误触发、碎片沉积和逃逸电子场景仍需全链V&V。",
    "twinRelevance": "数字孪生应覆盖从风险判定到弹丸到达、沉积、热电磁载荷的端到端时限预算。",
    "papers": [
      {
        "title": "Shattered pellet injection technology design and characterization for disruption mitigation experiments",
        "authors": "L.R. Baylor, S.J. Meitner, T.E. Gebhart, J.B.O. Caughman, J.L. Herfindal, D. Shiraki and D.L. Youchison",
        "year": 2019,
        "venue": "Nuclear Fusion",
        "doi": "10.1088/1741-4326/ab136c",
        "url": "https://doi.org/10.1088/1741-4326/ab136c",
        "sourceType": "peer-reviewed technology characterization"
      },
      {
        "title": "ITER Disruption Mitigation System",
        "authors": "ITER Organization",
        "year": 2024,
        "venue": "ITER official machine documentation",
        "doi": null,
        "url": "https://www.iter.org/machine/supporting-systems/disruption-mitigation",
        "sourceType": "official documentation"
      }
    ],
    "code": [
      {
        "name": "ITER DMS plant/protection software",
        "url": null,
        "status": "not-public",
        "relationship": "安全相关装置软件未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-048",
    "projectId": "CPT-048",
    "titleZh": "JT-60SA磁体电源监督与保护控制",
    "titleEn": "Supervisory control for JT-60SA magnet power supplies",
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [
      "T8"
    ],
    "categoryLabel": "电源监督与机器保护接口",
    "problem": "超导/快速磁体电源数量多、能量大，需统一放电序列、电流控制、数据和人员/机器保护。",
    "method": "建立磁体电源监督控制，利用实时网络与约4 kHz数据/控制接口管理参考、状态、故障和保护。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约250微秒数据周期至秒级放电序列",
    "sensors": [
      "电源电流/电压",
      "断路器与冷却状态",
      "联锁",
      "磁体状态"
    ],
    "actuators": [
      "电源参考",
      "断路/停机",
      "放电序列控制"
    ],
    "devices": [
      "JT-60SA"
    ],
    "validation": "电源系统集成与调试；论文发表时主要为工程投运阶段。",
    "results": "完成多电源统一监督、实时通信和保护接口，为JT-60SA等离子体控制提供工程底座。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "电源监督调试不等同于完整等离子体闭环证据；共因网络/时钟故障和超导磁体保护需独立分析。",
    "twinRelevance": "说明等离子体孪生必须接入真实电源健康、限幅、保护和序列，而不能把线圈视为理想输入。",
    "papers": [
      {
        "title": "Development of supervisory control system for magnet power supplies in JT-60SA",
        "authors": "T. Shimada et al.",
        "year": 2019,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2019.03.009",
        "url": "https://doi.org/10.1016/j.fusengdes.2019.03.009",
        "sourceType": "peer-reviewed engineering commissioning"
      },
      {
        "title": "JT-60SA control system",
        "authors": "JT-60SA project",
        "year": 2024,
        "venue": "JT-60SA official website",
        "doi": null,
        "url": "https://www.jt60sa.org/wp/control-system/",
        "sourceType": "official project documentation"
      }
    ],
    "code": [
      {
        "name": "JT-60SA magnet power-supply supervisory software",
        "url": null,
        "status": "not-public",
        "relationship": "装置电源与保护软件未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-011",
    "projectId": "CPT-011",
    "titleZh": "DIII-D神经网络垂直增长率估计与VDE避免",
    "titleEn": "Neural-network vertical-growth-rate estimation and VDE avoidance on DIII-D",
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [
      "T2",
      "T0"
    ],
    "categoryLabel": "VDE避免",
    "problem": "高伸长场景的垂直增长率难以在实时控制周期内由完整模型计算。",
    "method": "用大量历史放电和稳定性计算训练神经网络代理，在线估计增长率及不确定度；控制器通过降低伸长率、增加内壁间隙等动作退回安全区。",
    "controlArchitecture": "未完整公开。",
    "timescale": "毫秒至数十毫秒状态估计和形状调整",
    "sensors": [
      "实时平衡输入",
      "磁测量",
      "线圈/形状状态"
    ],
    "actuators": [
      "PF线圈",
      "形状与位置设定值"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "历史数据/模型验证并接入DIII-D PCS开展闭环实验。",
    "results": "在实验中识别接近垂直不稳定边界并通过形状退让避免VDE。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "代理仅在训练包络内可信；平衡输入漂移与诊断故障需独立监测，且退让动作可能损失性能。",
    "twinRelevance": "体现不确定度感知代理、实时安全边界与恢复策略的组合。",
    "papers": [
      {
        "title": "Avoidance of vertical displacement events in DIII-D using a neural network growth rate estimator",
        "authors": "B. Sammuli et al.",
        "year": 2021,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2021.112492",
        "url": "https://doi.org/10.1016/j.fusengdes.2021.112492",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "DIII-D neural VDE estimator",
        "url": null,
        "status": "not-public",
        "relationship": "训练数据、代理权重和PCS适配层未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-016",
    "projectId": "CPT-016",
    "titleZh": "EAST深度学习破裂预测",
    "titleEn": "Deep-learning disruption prediction on EAST",
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [],
    "categoryLabel": "破裂预测",
    "problem": "EAST长脉冲、高密度和多运行场景下的破裂前兆非线性且类别不平衡。",
    "method": "以多通道时序信号训练深度网络，评估不同预警时间和阈值下的召回与误报。",
    "controlArchitecture": "未完整公开。",
    "timescale": "毫秒采样；目标预警几十至数百毫秒",
    "sensors": [
      "密度",
      "辐射",
      "磁活动",
      "等离子体电流",
      "控制与平衡量"
    ],
    "actuators": [
      "无；离线预测研究"
    ],
    "devices": [
      "EAST"
    ],
    "validation": "EAST历史放电数据库离线训练/测试。",
    "results": "验证深度时序特征对EAST破裂预测有效，但论文不构成实时闭环或自动终止证据。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "离线随机划分可能高估对时间漂移的鲁棒性；需要战役外测试、实时数据质量门控和动作验证。",
    "twinRelevance": "可作为EAST长脉冲孪生的风险通道，但必须与保护逻辑严格隔离并经过影子运行。",
    "papers": [
      {
        "title": "Disruption prediction on EAST tokamak using a deep learning algorithm",
        "authors": "B.H. Guo et al.",
        "year": 2021,
        "venue": "Plasma Physics and Controlled Fusion",
        "doi": "10.1088/1361-6587/ac228b",
        "url": "https://doi.org/10.1088/1361-6587/ac228b",
        "sourceType": "peer-reviewed offline device study"
      }
    ],
    "code": [
      {
        "name": "EAST deep disruption predictor",
        "url": null,
        "status": "not-public",
        "relationship": "训练代码与数据未发现公开官方仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-023",
    "projectId": "CPT-023",
    "titleZh": "DREAM破裂与逃逸电子流体-动理学框架",
    "titleEn": "DREAM fluid-kinetic disruption and runaway-electron framework",
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [
      "T9"
    ],
    "categoryLabel": "破裂/逃逸电子模拟",
    "problem": "破裂期间热、电流和逃逸电子演化跨越碰撞、输运与电路时间尺度，简单零维模型难以覆盖。",
    "method": "耦合流体和动理学方程、原子过程、壁电路与径向输运，模拟热猝灭、电流猝灭及逃逸电子产生/损失。",
    "controlArchitecture": "未完整公开。",
    "timescale": "微秒至秒的离线多尺度模拟",
    "sensors": [
      "不适用；输入来自场景、平衡和实验后处理"
    ],
    "actuators": [
      "模拟中的杂质注入、壁与电场参数"
    ],
    "devices": [
      "ITER",
      "JET",
      "DIII-D",
      "通用tokamak"
    ],
    "validation": "与CODE等参考计算、解析极限和实验情景进行验证/比对。",
    "results": "形成可公开复现的破裂/逃逸电子研究框架，可用于DMS设计与代理数据生成；不是实时控制器。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "离线高保真模拟成本高，输运/材料混合参数不确定；控制使用需降阶并保持物理守恒与误差界。",
    "twinRelevance": "是安全数字孪生的高保真参考层和合成数据源，而非在线状态估计本身。",
    "papers": [
      {
        "title": "DREAM: A fluid-kinetic framework for tokamak disruption runaway electron simulations",
        "authors": "M. Hoppe et al.",
        "year": 2021,
        "venue": "Computer Physics Communications",
        "doi": "10.1016/j.cpc.2021.108098",
        "url": "https://doi.org/10.1016/j.cpc.2021.108098",
        "sourceType": "peer-reviewed code paper"
      }
    ],
    "code": [
      {
        "name": "DREAM",
        "url": "https://github.com/chalmersplasmatheory/DREAM",
        "status": "official-direct",
        "relationship": "论文直接对应的官方源代码仓库。",
        "artifactType": "software",
        "access": "public",
        "license": "MIT"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-030",
    "projectId": "CPT-030",
    "titleZh": "WEST基于壁部件温度的实时功率保护",
    "titleEn": "WEST wall-temperature feedback for machine protection",
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [
      "T6"
    ],
    "categoryLabel": "壁温机器保护",
    "problem": "稳态钨环境中局部热点可迅速超出部件温度包络，需要直接削减多套加热系统。",
    "method": "六个IR视场实时计算部件温度，保护控制器按阈值协调5套LH/ICRH天线的注入功率。",
    "controlArchitecture": "未完整公开。",
    "timescale": "毫秒至数十毫秒检测与功率降额",
    "sensors": [
      "6个红外视场",
      "部件温度ROI",
      "加热系统状态"
    ],
    "actuators": [
      "LH功率",
      "ICRH功率",
      "功率降额/切断"
    ],
    "devices": [
      "WEST"
    ],
    "validation": "WEST稳态钨运行中的常规保护使用。",
    "results": "63次触发约占放电14%，其中97%保持在温度包络内，报告误报约0.2%。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "视场遮挡、表面发射率和ROI配置可能引起漏检；保护阈值必须独立于性能控制并可审计。",
    "twinRelevance": "是壁温感知、阈值配置和加热降额进入装置运行的D4强证据；公开论文未给出安全关键治理、独立批准或安全资格证据，因此不标为D5。",
    "papers": [
      {
        "title": "WEST operation with real time feed back control based on wall component temperature toward machine protection in a steady state tungsten environment",
        "authors": "R. Mitteau, C. Belaldil, C. Balorin, X. Courtois, V. Moncada, R. Nouailletas and B. Santraine",
        "year": 2021,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2020.112223",
        "url": "https://doi.org/10.1016/j.fusengdes.2020.112223",
        "sourceType": "peer-reviewed operational protection"
      }
    ],
    "code": [
      {
        "name": "WEST wall-monitoring protection",
        "url": null,
        "status": "not-public",
        "relationship": "装置机器保护代码和温度标定库未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-013",
    "projectId": "CPT-013",
    "titleZh": "FRNN跨装置深度学习破裂预测",
    "titleEn": "FRNN cross-machine deep-learning disruption prediction",
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [],
    "categoryLabel": "破裂预测",
    "problem": "破裂样本稀少且装置分布不同，传统阈值难以同时获得高召回、低误报和足够预警时间。",
    "method": "融合多通道时序信号的循环/卷积深度网络，在DIII-D和JET历史放电上训练、跨装置测试。",
    "controlArchitecture": "未完整公开。",
    "timescale": "输入采样毫秒级；预警窗口约几十毫秒至数百毫秒",
    "sensors": [
      "磁测量",
      "密度",
      "辐射",
      "输入功率",
      "剖面与平衡标量"
    ],
    "actuators": [
      "无；论文为预测器离线验证"
    ],
    "devices": [
      "DIII-D",
      "JET"
    ],
    "validation": "两装置历史数据库离线验证与跨装置迁移测试。",
    "results": "证明大规模深度时序模型可提取跨装置破裂前兆，但未在论文中闭环触发缓解。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "历史标签、训练/测试划分、装置漂移和误报成本决定可用性；离线AUC不能替代实时延迟和缓解成功率。",
    "twinRelevance": "可作为影子预测服务，但数字孪生还必须给出数据质量、置信度、剩余处置时间和安全动作接口。",
    "papers": [
      {
        "title": "Predicting disruptive instabilities in controlled fusion plasmas through deep learning",
        "authors": "J. Kates-Harbeck, A. Svyatkovskiy and W. Tang",
        "year": 2019,
        "venue": "Nature",
        "doi": "10.1038/s41586-019-1116-4",
        "url": "https://doi.org/10.1038/s41586-019-1116-4",
        "sourceType": "peer-reviewed offline multi-device study"
      }
    ],
    "code": [
      {
        "name": "plasma-python / FRNN",
        "url": "https://github.com/PPPLDeepLearning/plasma-python",
        "status": "official-direct",
        "relationship": "作者团队公开的FRNN训练与数据流水线，直接对应论文方法。",
        "artifactType": "software",
        "access": "public",
        "license": "repository terms; verify before reuse"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-014",
    "projectId": "CPT-014",
    "titleZh": "DIII-D实时随机森林破裂预测器",
    "titleEn": "Real-time random-forest disruption predictor on DIII-D",
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [
      "T9"
    ],
    "categoryLabel": "破裂预测",
    "problem": "把离线预测器压缩为确定性实时服务，并在装置计算预算内保持可解释特征链。",
    "method": "基于随机森林的DPRF，使用实时可得标量，在DIII-D PCS中以约150–250微秒推理运行。",
    "controlArchitecture": "未完整公开。",
    "timescale": "推理亚毫秒；典型预警为几十至数百毫秒",
    "sensors": [
      "实时平衡标量",
      "辐射/密度",
      "磁活动",
      "控制输入"
    ],
    "actuators": [
      "无；影子/实时预测验证"
    ],
    "devices": [
      "DIII-D"
    ],
    "validation": "900余个放电数据训练/测试，并在DIII-D实时PCS中运行。",
    "results": "证明随机森林可满足实时计算预算并提供数百毫秒量级预警；性能仍未达到ITER式高召回低误报要求。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "实时运行不等于闭环缓解；阈值需按误报代价和可用处置时间标定，诊断缺失需独立容错。",
    "twinRelevance": "适合定义预测服务的实时契约、漂移监测与影子到闭环的晋级门槛。",
    "papers": [
      {
        "title": "A real-time machine learning-based disruption predictor on DIII-D",
        "authors": "C. Rea, K.J. Montes, K.G. Erickson, R.S. Granetz and R.A. Tinguely",
        "year": 2019,
        "venue": "Nuclear Fusion",
        "doi": "10.1088/1741-4326/ab28bf",
        "url": "https://doi.org/10.1088/1741-4326/ab28bf",
        "sourceType": "peer-reviewed real-time validation"
      }
    ],
    "code": [
      {
        "name": "DisruptionPy",
        "url": "https://github.com/MIT-PSFC/disruption-py",
        "status": "official-enabling",
        "relationship": "公开的破裂数据处理/特征基础设施；不是论文中DPRF装置部署代码，属于使能工具。",
        "artifactType": "software",
        "access": "public",
        "license": "MIT"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-045",
    "projectId": "CPT-045",
    "titleZh": "JET实时保护序列器RTPS",
    "titleEn": "JET Real-Time Protection Sequencer",
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [],
    "categoryLabel": "机器保护/安全终止",
    "problem": "ITER-like wall对等离子体接触、加热和异常形状敏感，需要高于单回路的集中保护协调。",
    "method": "RTPS接收VTM/WALLS等报警，以约500 Hz状态机覆盖形状、电流、密度和加热参考，执行降额或受控终止。",
    "controlArchitecture": "未完整公开。",
    "timescale": "约2 ms监督周期；下层垂直稳定更快",
    "sensors": [
      "VTM垂直事件",
      "WALLS壁接触报警",
      "平衡/电流/密度",
      "加热与系统状态"
    ],
    "actuators": [
      "形状/电流参考覆盖",
      "密度目标",
      "NBI/ICRH等加热降额",
      "终止序列"
    ],
    "devices": [
      "JET"
    ],
    "validation": "JET ITER-like wall多战役运行；正式论文明确说明RTPS纳入JET集成运行与保护系统的投运流程，运行前必须完成正式质量保证，且单元/低层集成测试由核心开发者定义、集成/行为测试由JET Plasma Operations Group定义。",
    "results": "形成集中、可配置的机器保护序列，能在异常时协调多控制器和加热系统；其配置所有权、职责、生命周期和运行前正式质量保证构成可审计的安全关键治理证据，故标为D5。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D5",
    "maturity": "D5；需结合条目证据说明理解。",
    "limitations": "保护逻辑和阈值高度装置专用；公开MARTe2不能复现JET RTPS安全案例。",
    "twinRelevance": "为安全门、状态机、配置管理、报警因果回放和独立保护边界提供成熟范式。",
    "papers": [
      {
        "title": "Robust configuration of the JET Real-Time Protection Sequencer",
        "authors": "J.S. Edwards, I.S. Carvalho, R. Felton, C. Hogben, D. Karkinsky, P.J. Lomas, P.A. McCullen, F.G. Rimini and A.V. Stephen",
        "year": 2019,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2018.12.045",
        "url": "https://doi.org/10.1016/j.fusengdes.2018.12.045",
        "sourceType": "peer-reviewed operational machine-protection paper"
      },
      {
        "title": "Centralised Coordinated Control to Protect the JET ITER-like Wall",
        "authors": "JET control and protection team",
        "year": 2011,
        "venue": "ICALEPCS / EUROfusion JET archive",
        "doi": null,
        "url": "https://scipub.euro-fusion.org/archives/jet-archive/centralised-coordinated-control-to-protect-the-jet-iter-like-wall",
        "sourceType": "official programme archive"
      }
    ],
    "code": [
      {
        "name": "MARTe2",
        "url": "https://github.com/aneto0/MARTe2",
        "status": "official-enabling",
        "relationship": "与JET/聚变实时控制相关的公开使能框架；不是历史RTPS专用配置与保护逻辑代码。",
        "artifactType": "software",
        "access": "public",
        "license": "open-source repository terms"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-047",
    "projectId": "CPT-047",
    "titleZh": "ITER等离子体控制系统异常处理分层架构",
    "titleEn": "Hierarchical exception handling for the ITER plasma control system",
    "year": 2017,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [
      "T9"
    ],
    "categoryLabel": "T7",
    "problem": "异常可来自诊断、执行器、等离子体和工厂系统，需要明确本地控制、监督控制、联锁/保护的权限边界。",
    "method": "定义异常类别、检测—评估—响应层次和跨系统接口，区分可恢复、需降级和需终止事件。",
    "controlArchitecture": "未完整公开。",
    "timescale": "微秒级联锁至秒级监督决策",
    "sensors": [
      "诊断健康",
      "执行器健康",
      "等离子体事件",
      "工厂报警"
    ],
    "actuators": [
      "任务降级",
      "参考值覆盖",
      "加热切断",
      "缓解/终止触发"
    ],
    "devices": [
      "ITER"
    ],
    "validation": "需求与架构分析、场景评审；非装置实验。",
    "results": "形成ITER PCS异常处理的初步分类与职责边界，为详细需求和验证场景提供基础。",
    "evidenceLevel": "E0",
    "deploymentLevel": "D1",
    "maturity": "D1；需结合条目证据说明理解。",
    "limitations": "初步架构不代表最终实现或认证；权限、仲裁和共因失效需在更高层安全分析中闭合。",
    "twinRelevance": "数字孪生必须遵守这类权限边界，AI建议层不能直接越权到机器保护。",
    "papers": [
      {
        "title": "Preliminary exception handling analysis for the ITER plasma control system",
        "authors": "G. Raupp, G. Pautasso, C. Rapson, W. Treutterer, J. Snipes, P. de Vries, A. Winter et al.",
        "year": 2017,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2017.05.013",
        "url": "https://doi.org/10.1016/j.fusengdes.2017.05.013",
        "sourceType": "peer-reviewed architecture analysis"
      }
    ],
    "code": [
      {
        "name": "ITER PCS exception-handling implementation",
        "url": null,
        "status": "not-public",
        "relationship": "论文为架构分析，不对应公开可执行代码。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "PCS-012",
    "projectId": "PCS-012",
    "titleZh": "JET WALLS—VTM—RTPS：等离子体壁负荷监测与协调终止",
    "titleEn": null,
    "year": 2014,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [],
    "categoryLabel": "保护与PCS协同",
    "problem": "ITER-like Be/W壁在高功率及DT工况中可能过热，红外相机又可能受中子影响，需要模型和测量冗余及协调脉冲终止。",
    "method": "WALLS实时计算功率沉积、表面/体温和几何间隙；VTM处理IR温度；RTPS收集报警并覆盖形状、电流、密度和加热控制器，执行可配置软/硬终止。",
    "controlArchitecture": "WALLS实时计算功率沉积、表面/体温和几何间隙；VTM处理IR温度；RTPS收集报警并覆盖形状、电流、密度和加热控制器，执行可配置软/硬终止。 接口与 I/O：实时平衡、功率、壁几何、IR温度和系统报警；输出告警、加热限制及受控终止覆盖命令。",
    "timescale": "WALLS计算模块总执行时间低于1 ms；该数字不等于完整保护链端到端响应时间。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "JET"
    ],
    "validation": "2011—2012运行数据和后续JET-ILW运行给出在线保护证据；论文展示时序与实际报警结果。",
    "results": "JET ITER-like wall。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "JET ITER-like wall。",
    "limitations": "壁模型、视线、材料限值和保护阈值高度配置相关；报警覆盖策略必须独立于科研优化并受严格变更控制。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "The JET real-time plasma-wall load monitoring system",
        "authors": "未完整列出",
        "year": 2014,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2013.10.010",
        "url": "https://doi.org/10.1016/j.fusengdes.2013.10.010",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "The software and hardware architecture of the real-time protection of in-vessel components in JET-ILW",
        "authors": "未完整列出",
        "year": 2019,
        "venue": "peer-reviewed",
        "doi": "10.1088/1741-4326/ab1a79",
        "url": "https://doi.org/10.1088/1741-4326/ab1a79",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "MARTe/MARTe2",
        "url": "https://vcis-gitlab.f4e.europa.eu/aneto/MARTe2",
        "status": "official-enabling",
        "relationship": "RTPS/WALLS所用实时框架家族；JET保护逻辑和模型不在公共仓库。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "JET WALLS/RTPS models",
        "url": null,
        "status": "not-public",
        "relationship": "链接为论文；未发现可直接复现JET配置的公开包。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "JET",
      "WALLS",
      "RTPS",
      "VTM",
      "thermal protection"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "CPT-015",
    "projectId": "CPT-015",
    "titleZh": "JET APODIS实时破裂预测",
    "titleEn": "JET APODIS real-time disruption prediction",
    "year": 2013,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [],
    "categoryLabel": "破裂预测",
    "problem": "在ITER-like wall运行中以少量可靠实时信号提供稳定、低延迟的破裂预警。",
    "method": "APODIS每1 ms处理7个实时信号并分类破裂风险，输出用于记录和运行评估。",
    "controlArchitecture": "未完整公开。",
    "timescale": "1 ms输入周期；平均预警约426 ms",
    "sensors": [
      "7个JET实时信号，包括磁、电流、密度/辐射相关量"
    ],
    "actuators": [
      "无；所述战役中输出记录而非自动缓解"
    ],
    "devices": [
      "JET"
    ],
    "validation": "ITER-like wall战役991个放电的实时运行评估。",
    "results": "报告成功率98.36%、误报0.92%、漏报1.64%和平均426 ms预警；应注意数据集定义与运行基率。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "所述结果未自动触发机器保护；跨战役、跨壁材料和异常类型的校准需重新验证。",
    "twinRelevance": "是把预警时间分布、误报和数据可用性纳入运行数字线程的基准。",
    "papers": [
      {
        "title": "Results of the JET real-time disruption predictor in the ITER-like wall campaigns",
        "authors": "J. Vega et al.",
        "year": 2013,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2013.03.003",
        "url": "https://doi.org/10.1016/j.fusengdes.2013.03.003",
        "sourceType": "peer-reviewed real-time validation"
      }
    ],
    "code": [
      {
        "name": "JET APODIS implementation",
        "url": null,
        "status": "not-public",
        "relationship": "实时分类器与JET接口未发现公开仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-021",
    "projectId": "CPT-021",
    "titleZh": "JET大剂量气体注入破裂缓解",
    "titleEn": "Massive-gas-injection disruption mitigation on JET",
    "year": 2011,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T7",
    "relatedTasks": [],
    "categoryLabel": "破裂缓解",
    "problem": "不可避免破裂会产生集中热负荷、电磁载荷和逃逸电子，需要在毫秒尺度均匀辐射能量。",
    "method": "快速阀注入不同气体和数量，系统比较热/电流猝灭、halo电流、辐射和逃逸电子响应。",
    "controlArchitecture": "未完整公开。",
    "timescale": "触发后毫秒至几十毫秒",
    "sensors": [
      "破裂触发",
      "辐射阵列",
      "磁测量",
      "电流/halo电流",
      "硬X射线"
    ],
    "actuators": [
      "大剂量气体注入阀"
    ],
    "devices": [
      "JET"
    ],
    "validation": "JET多气体、多参数破裂缓解实验。",
    "results": "量化MGI对辐射分数、电流猝灭、halo力和逃逸电子的影响，为ITER缓解需求提供实验依据。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "MGI材料穿透、混合和辐射对大型装置存在尺度效应；不能保证同时最小化所有热、电磁和逃逸风险。",
    "twinRelevance": "需要把触发延迟、阀动力学、碎裂/混合不确定度和结构载荷证据串联。",
    "papers": [
      {
        "title": "Disruption mitigation by massive gas injection in JET",
        "authors": "M. Lehnen et al.",
        "year": 2011,
        "venue": "Nuclear Fusion",
        "doi": "10.1088/0029-5515/51/12/123010",
        "url": "https://doi.org/10.1088/0029-5515/51/12/123010",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "JET MGI trigger and valve control",
        "url": null,
        "status": "not-public",
        "relationship": "装置触发、阀和保护接口未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CTL-CORE-042",
    "projectId": "CTL-CORE-042",
    "titleZh": "ITER 研究运行初期的加热与燃料执行器管理",
    "titleEn": "Actuator management for the first ITER plasma operation campaign",
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T8",
    "relatedTasks": [],
    "categoryLabel": "燃烧、非感应场景与多执行器协调",
    "problem": "ITER SRO 同时有能量、q>1/锯齿、NTM、密度和脱靶任务；48 个 gyrotron、9 个镜面、60 个气阀和 4 个颗粒器不能静态绑定。",
    "method": "建立控制任务—虚拟请求—能力匹配—实际设备命令的 Actuator Management 层，支持组合/替代、故障重分配和优先级。",
    "controlArchitecture": "未完整公开。",
    "timescale": "管理循环毫秒至百毫秒；控制任务从快 MHD 到慢燃料/能量。",
    "sensors": [
      "任务请求",
      "执行器状态",
      "q/能量/密度/模态状态",
      "镜面和路由配置"
    ],
    "actuators": [
      "48 gyrotrons/9 steerable mirrors",
      "ICRH",
      "60 gas valves",
      "4 pellet injectors/6 flight tubes"
    ],
    "devices": [
      "ITER：Start of Research Operation；架构与控制仿真"
    ],
    "validation": "官方设计/仿真，尚无 ITER 等离子体实证。",
    "results": "给出 SRO 可实施的执行器管理架构和代表性多任务用例，使设备路由、组合和冲突处理成为显式 PCS 服务。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "SRO 硬件和控制需求仍演进；路由/优先级正确不等于物理目标可同时满足，需闭环可达性验证。",
    "twinRelevance": "这是数字孪生控制编排的直接蓝图：每个控制任务只请求物理效果，管理层结合设备健康与预测模型生成可追溯命令。",
    "papers": [
      {
        "title": "Actuator management for the first ITER plasma operation campaign",
        "authors": "F. Felici et al.",
        "year": 2025,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2025.115071",
        "url": "https://doi.org/10.1016/j.fusengdes.2025.115071",
        "sourceType": "peer-reviewed open-access journal article"
      }
    ],
    "code": [
      {
        "name": "ITER PCSSP",
        "url": "https://github.com/iterorganization/PCSSP",
        "status": "official-enabling",
        "relationship": "官方控制系统仿真平台",
        "artifactType": "software",
        "access": "official open source",
        "license": "未标注"
      },
      {
        "name": "ITER IMAS Data Dictionary",
        "url": "https://github.com/iterorganization/IMAS-Data-Dictionary",
        "status": "official-enabling",
        "relationship": "执行器/等离子体数据接口和数字线程使能",
        "artifactType": "software",
        "access": "official open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "ITER",
      "SRO",
      "actuator management",
      "gyrotrons",
      "pellets",
      "gas valves"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "PCS-028",
    "projectId": "PCS-028",
    "titleZh": "JT-60SA中央控制、实时等离子体控制与保护分层",
    "titleEn": null,
    "year": 2023,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T8",
    "relatedTasks": [
      "T2"
    ],
    "categoryLabel": "装置级集成控制",
    "problem": "在日欧共同建设的大型超导装置中统一脉冲编排、磁/动理学控制、设备联锁与机器保护，同时允许分阶段commissioning。",
    "method": "中央控制系统负责状态机、时序、HMI和数据协调；实时等离子体控制系统执行快速闭环；设备保护/联锁具有独立边界；DINA及专用仿真工具用于控制设计。",
    "controlArchitecture": "中央控制系统负责状态机、时序、HMI和数据协调；实时等离子体控制系统执行快速闭环；设备保护/联锁具有独立边界；DINA及专用仿真工具用于控制设计。 接口与 I/O：磁诊断、线圈/电源、真空、加热、气体、设备状态、时钟与联锁；输出为脉冲阶段、参考轨迹、执行器命令和保护动作请求。",
    "timescale": "磁控制与保护为多速率，公开官方概览没有给出可审计的统一端到端周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "JT-60SA"
    ],
    "validation": "控制工具经历离线DINA/电路仿真、系统集成与设备commissioning；公开资料不能支持其全部高性能控制任务均已闭环验收。",
    "results": "JT-60SA集成与commissioning；成熟度按公开论文逐项判断。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "JT-60SA集成与commissioning；成熟度按公开论文逐项判断。",
    "limitations": "commissioning状态随时间变化；论文中的仿真场景不等同于装置上全部执行器、故障和延迟已验证。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "A simulation tool to design and test control laws for JT60-SA scenarios",
        "authors": "未完整列出",
        "year": 2023,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2023.113631",
        "url": "https://doi.org/10.1016/j.fusengdes.2023.113631",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "JT-60SA control system",
        "authors": "未完整列出",
        "year": 2026,
        "venue": "device official",
        "doi": null,
        "url": "https://www.jt60sa.org/wp/control-system/",
        "sourceType": "device official"
      }
    ],
    "code": [
      {
        "name": "JT-60SA control and DINA configuration",
        "url": null,
        "status": "not-public",
        "relationship": "官方说明系统职责；未发现装置生产配置公开仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "JT-60SA",
      "central control",
      "DINA",
      "interlock"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "CPT-020",
    "projectId": "samone-supervisory-control",
    "titleZh": "TCV SAMONE 实时异常监督与执行器管理",
    "titleEn": "SAMONE real-time off-normal supervision and actuator management on TCV",
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T8",
    "relatedTasks": [
      "T7",
      "T9"
    ],
    "categoryLabel": "T8",
    "problem": "高级控制器会争用ECH、气体和磁执行器；诊断或执行器异常时需要按等离子体状态安全切换目标、限制和终止策略。",
    "method": "分层监督器、状态/事件监视、执行器管理器和控制模式切换；与底层反馈控制器解耦，面向异常处理和任务协调。",
    "controlArchitecture": "分层监督器、状态/事件监视、执行器管理器和控制模式切换；与底层反馈控制器解耦，面向异常处理和任务协调。 接口与 I/O：等离子体状态、诊断健康、执行器可用性、控制器请求与约束；输出模式选择、参考修正、执行器分配和受控终止命令。",
    "timescale": "约10–100 ms监督决策；下层回路更快",
    "sensors": [
      "密度",
      "辐射",
      "MHD/平衡指标",
      "控制器健康状态"
    ],
    "actuators": [
      "气体/加热",
      "形状与电流参考",
      "任务使能/禁用"
    ],
    "devices": [
      "TCV"
    ],
    "validation": "TCV实时系统中的实验应用和故障/事件场景形成装置证据。",
    "results": "证明异常检测、控制重构和执行器协调可在一个监督框架内闭环运行。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "状态机和仲裁策略需要装置级危害分析；研究装置的灵活切换不能直接等价于电厂安全系统。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Integrated real-time supervisory management for off-normal-event handling and feedback control of tokamak plasmas",
        "authors": "N.M.T. Vu et al.",
        "year": 2021,
        "venue": "IEEE Transactions on Nuclear Science",
        "doi": "10.1109/TNS.2021.3084410",
        "url": "https://doi.org/10.1109/TNS.2021.3084410",
        "sourceType": "peer-reviewed primary experiment"
      }
    ],
    "code": [
      {
        "name": "SAMONE",
        "url": null,
        "status": "not-public",
        "relationship": "框架论文公开，但TCV装置实现未发现官方公开仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "SAMONE",
      "supervisory control",
      "actuator management"
    ],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CPT-044",
    "projectId": "CPT-044",
    "titleZh": "TCV/ITER装置无关多任务执行器管理",
    "titleEn": "Tokamak-agnostic multi-task actuator management for TCV and ITER",
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T8",
    "relatedTasks": [],
    "categoryLabel": "执行器管理",
    "problem": "β、NTM、剖面和模式任务同时争抢EC、NBI、气体等有限资源，独立控制器会给出冲突命令。",
    "method": "用装置无关任务—执行器映射、优先级和可用性约束分配资源；在TCV多任务实验和ITER场景仿真中评估。",
    "controlArchitecture": "未完整公开。",
    "timescale": "监督/分配约10–100 ms；下层执行器回路更快",
    "sensors": [
      "任务误差与置信度",
      "执行器可用性/限幅",
      "等离子体状态"
    ],
    "actuators": [
      "ECRH/ECCD",
      "加热与电流驱动",
      "气体",
      "任务参考值"
    ],
    "devices": [
      "TCV",
      "ITER"
    ],
    "validation": "TCV同时β、NTM、中央共向驱动/H模相关任务实验；ITER为模拟。",
    "results": "在TCV证明多任务资源协调可上机；ITER部分仅为设计证据。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "D4；需结合条目证据说明理解。",
    "limitations": "任务效用和优先级仍需治理；执行器失效、动态耦合和安全认证不能只靠静态分配矩阵。",
    "twinRelevance": "是数字孪生从多个模型服务升级为统一可执行控制服务的关键中间层。",
    "papers": [
      {
        "title": "Tokamak-agnostic actuator management for multi-task integrated control with application to TCV and ITER",
        "authors": "N.M.T. Vu, T.C. Blanken, F. Felici, C. Galperti, M. Kong, E. Maljaars and O. Sauter",
        "year": 2019,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2019.111260",
        "url": "https://doi.org/10.1016/j.fusengdes.2019.111260",
        "sourceType": "peer-reviewed experiment and design"
      }
    ],
    "code": [
      {
        "name": "TCV actuator manager",
        "url": null,
        "status": "not-public",
        "relationship": "框架概念公开，装置实时实现未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "CTL-CORE-041",
    "projectId": "CTL-CORE-041",
    "titleZh": "ITER H&CD 混合整数实时执行器分配",
    "titleEn": "Actuator allocation for integrated tokamak control using mixed-integer programming",
    "year": 2017,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T8",
    "relatedTasks": [],
    "categoryLabel": "燃烧、非感应场景与多执行器协调",
    "problem": "有限的 EC/IC/NBI 被加热、q、锯齿和 NTM 等任务共享，优先级和可用性会在放电中改变。",
    "method": "把控制任务请求、执行器能力/组合和优先级写成混合整数二次规划，实时求取最优分配，避免枚举所有组合。",
    "controlArchitecture": "未完整公开。",
    "timescale": "分配器目标为 PCS 实时周期，毫秒至百毫秒；物理任务跨毫秒至秒。",
    "sensors": [
      "各控制任务虚拟请求",
      "执行器健康/可用性",
      "优先级和约束",
      "沉积位置/功率能力"
    ],
    "actuators": [
      "ITER EC gyrotrons/镜面",
      "ICRH",
      "NBI"
    ],
    "devices": [
      "ITER：完整规划 H&CD 系统；全系统规模数值示例与实时性测试"
    ],
    "validation": "算法仿真/实时计算能力，非装置实验。",
    "results": "MIQP 在完整 ITER H&CD 规模示例中实时求解并实现期望优先行为，为控制任务与执行器解耦提供通用架构。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D3",
    "maturity": "D3；需结合条目证据说明理解。",
    "limitations": "能力矩阵和任务代价随等离子体状态变化；MIQP 可解不等于分配后的闭环稳定，最坏时延/不可行处理仍需认证。",
    "twinRelevance": "数字孪生应维护实时执行器能力图谱和请求账本，并用预测模型评估分配后的物理后果。",
    "papers": [
      {
        "title": "Actuator allocation for integrated control in tokamaks: architectural design and a mixed-integer programming algorithm",
        "authors": "J. A. Snipes, F. Felici et al.",
        "year": 2017,
        "venue": "原始论文 / 官方来源",
        "doi": "10.1016/j.fusengdes.2017.09.004",
        "url": "https://doi.org/10.1016/j.fusengdes.2017.09.004",
        "sourceType": "peer-reviewed open-access journal article"
      }
    ],
    "code": [
      {
        "name": "allocation prototype",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接原型",
        "artifactType": "software",
        "access": "algorithm published; implementation not verified public",
        "license": "未标注"
      },
      {
        "name": "ITER PCSSP",
        "url": "https://github.com/iterorganization/PCSSP",
        "status": "official-enabling",
        "relationship": "集成分配器、控制任务和被控对象的官方平台",
        "artifactType": "software",
        "access": "official open source",
        "license": "未标注"
      }
    ],
    "tags": [
      "ITER",
      "actuator allocation",
      "MIQP",
      "H&CD",
      "priorities"
    ],
    "sourceFile": "core_tasks.json"
  },
  {
    "id": "PCS-015",
    "projectId": "PCS-015",
    "titleZh": "EAST稳态高级运行升级：打击点、漂移补偿与诊断自检",
    "titleEn": null,
    "year": 2013,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T8",
    "relatedTasks": [
      "T2"
    ],
    "categoryLabel": "长脉冲控制",
    "problem": "长脉冲放大磁积分漂移和传感器故障影响，并要求稳定打击点、位形、密度和辐射边界。",
    "method": "在PCS中加入实时积分漂移补偿、放电前磁诊断校验、打击点/形状控制以及长脉冲友好接口。",
    "controlArchitecture": "在PCS中加入实时积分漂移补偿、放电前磁诊断校验、打击点/形状控制以及长脉冲友好接口。 接口与 I/O：磁积分信号、PF电流、平衡/打击点、密度；输出线圈和气阀命令以及放电禁止/保护信号。",
    "timescale": "漂移和形状环在PCS周期内运行；论文未给出可泛化的统一周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "EAST"
    ],
    "validation": "仿真和EAST实际放电；论文明确区分已实验功能与在研辐射/脱靶控制。",
    "results": "EAST长脉冲运行。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "EAST长脉冲运行。",
    "limitations": "漂移线性补偿只适用于满足先验漂移模型的积分器；长脉冲还需在线标定、冗余和不确定度。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Recent plasma control progress on EAST",
        "authors": "未完整列出",
        "year": 2012,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2012.06.013",
        "url": "https://doi.org/10.1016/j.fusengdes.2012.06.013",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Upgrade of EAST plasma control system for steady-state advanced operation",
        "authors": "未完整列出",
        "year": 2018,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2018.02.079",
        "url": "https://doi.org/10.1016/j.fusengdes.2018.02.079",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "EAST steady-state PCS modules",
        "url": null,
        "status": "not-public",
        "relationship": "链接为论文；未发现装置专用实现公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "EAST",
      "long pulse",
      "strike point",
      "drift compensation"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-002",
    "projectId": "PCS-002",
    "titleZh": "DIII-D Integrated Plasma Control：模型驱动设计—验证—部署方法",
    "titleEn": null,
    "year": 2005,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T8",
    "relatedTasks": [
      "T9"
    ],
    "categoryLabel": "控制集成方法",
    "problem": "单个控制器在多执行器、多约束和异常事件下可能相互冲突，且稀缺机时不允许靠反复试错调参。",
    "method": "把装置/执行器响应模型、控制器设计、监督协调、仿真、PCS实码测试和实验迭代组成闭环工程流程；强调模型不确定性、非理想动态与离线确认。",
    "controlArchitecture": "把装置/执行器响应模型、控制器设计、监督协调、仿真、PCS实码测试和实验迭代组成闭环工程流程；强调模型不确定性、非理想动态与离线确认。 接口与 I/O：模型输入来自实验辨识、平衡和执行器特性；输出是可部署控制律、参考轨迹、限制器及验证证据。",
    "timescale": "方法本身跨越离线设计到微秒/毫秒实时环，不规定统一周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "DIII-D",
      "ITER设计研究"
    ],
    "validation": "DIII-D多类控制应用和PCS硬件闭环仿真形成方法验证；后续GA官方页面继续以IPC描述其可靠控制设计流程。",
    "results": "DIII-D；作为ITER和下一代装置控制设计参考。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "DIII-D；作为ITER和下一代装置控制设计参考。",
    "limitations": "强依赖高质量装置模型和实验辨识；流程可迁移，但控制参数、故障模型和验收阈值不可直接跨装置复用。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Integrated Plasma Control in DIII-D",
        "authors": "未完整列出",
        "year": 2005,
        "venue": "peer-reviewed",
        "doi": "10.13182/FST05-A1075",
        "url": "https://doi.org/10.13182/FST05-A1075",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "DIII-D integrated control design suite",
        "url": null,
        "status": "not-public",
        "relationship": "方法和部分工具有论文描述，完整生产工具链非公共仓库。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "IPC",
      "model-based design",
      "V&V",
      "DIII-D"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-023",
    "projectId": "PCS-023",
    "titleZh": "ITER CODAC Core System：装置I&C标准底座",
    "titleEn": null,
    "year": 2026,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "装置控制基础设施",
    "problem": "220个plant I&C系统和分布式供应商需要统一开发、接口、监控、归档和生命周期标准。",
    "method": "RHEL x86-64；EPICS 7、PVAccess/Channel Access、SNL、日志/Autosave、Control System Studio；Plant System Host、Fast Controller、PLC和第三方控制器分层。机器保护和人员/核安全与CODAC显式解耦。",
    "controlArchitecture": "RHEL x86-64；EPICS 7、PVAccess/Channel Access、SNL、日志/Autosave、Control System Studio；Plant System Host、Fast Controller、PLC和第三方控制器分层。机器保护和人员/核安全与CODAC显式解耦。 接口与 I/O：EPICS PV、PVA/CA网络、PLC、fast controller、plant operation network、报警与归档。",
    "timescale": "慢控、事件与fast controller多速率；需要实时的fast controller可用MRG-Realtime。CODAC不是快速等离子体环的单一周期声明。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "ITER",
      "多家ITER成员测试设施"
    ],
    "validation": "ITER官方持续版本发布和成员/供应商测试；截至2026官方页面为7.4.0。ITER尚未整机等离子体运行。",
    "results": "ITER plant I&C开发和测试；CODAC用户分布于成员机构。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "ITER plant I&C开发和测试；CODAC用户分布于成员机构。",
    "limitations": "EPICS/CODAC擅长plant I&C与集成，不自动满足垂直稳定等微秒级闭环；完整分发和支持受ITER用户资格约束。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "CODAC Core System",
        "authors": "未完整列出",
        "year": 2026,
        "venue": "ITER official",
        "doi": null,
        "url": "https://www.iter.org/machine/supporting-systems/codac/codac-core-system",
        "sourceType": "ITER official"
      },
      {
        "title": "ITER CODAC Architecture",
        "authors": "未完整列出",
        "year": 2026,
        "venue": "ITER official",
        "doi": null,
        "url": "https://www.iter.org/machine/supporting-systems/codac/architecture",
        "sourceType": "ITER official"
      }
    ],
    "code": [
      {
        "name": "EPICS Base",
        "url": "https://github.com/epics-base/epics-base",
        "status": "official-enabling",
        "relationship": "CODAC底层开源框架。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "CODAC Core System distribution",
        "url": null,
        "status": "not-public",
        "relationship": "面向ITER贡献者注册分发，包含开源与ITER专用组件。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "ITER",
      "CODAC",
      "EPICS",
      "plant I&C"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-034",
    "projectId": "PCS-034",
    "titleZh": "EPICS作为聚变装置I&C与慢控制生态",
    "titleEn": null,
    "year": 2026,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "官方开源使能框架",
    "problem": "统一分布式设备I/O、过程变量、状态机、报警、HMI和归档，使多供应商子系统可互操作。",
    "method": "IOC/record数据库、Channel Access与PVAccess、SNL状态机、客户端/HMI与归档生态；ITER CODAC在EPICS 7上叠加工程标准和打包。",
    "controlArchitecture": "IOC/record数据库、Channel Access与PVAccess、SNL状态机、客户端/HMI与归档生态；ITER CODAC在EPICS 7上叠加工程标准和打包。 接口与 I/O：PLC、串口、现场总线、工业网络、DAQ与自定义驱动；以PV语义暴露状态和命令。",
    "timescale": "适合设备层、监控、事件和部分软实时；网络PV不是垂直稳定等硬实时闭环的当然实现。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "ITER",
      "J-TEXT",
      "EAST",
      "KSTAR",
      "JT-60SA",
      "多装置"
    ],
    "validation": "EPICS官方仓库与全球装置长期部署；具体聚变站点的性能、冗余和安全性需单独验证。",
    "results": "多个聚变装置及ITER CODAC基础。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D4",
    "maturity": "多个聚变装置及ITER CODAC基础。",
    "limitations": "装置数据库、record命名、驱动、网络隔离和安全策略高度站点化；不能仅凭使用EPICS推断PCS快速环或机器保护架构。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "EPICS Documentation",
        "authors": "未完整列出",
        "year": 2026,
        "venue": "official documentation",
        "doi": null,
        "url": "https://docs.epics-controls.org/",
        "sourceType": "official documentation"
      }
    ],
    "code": [
      {
        "name": "EPICS Base",
        "url": "https://github.com/epics-base/epics-base",
        "status": "official-enabling",
        "relationship": "官方开源基础库。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "EPICS",
      "IOC",
      "PVAccess",
      "CODAC"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-036",
    "projectId": "PCS-036",
    "titleZh": "IMAS/OMAS作为控制—模拟—实验的语义交换层",
    "titleEn": null,
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "语义互操作",
    "problem": "不同代码和装置以异构命名、坐标、单位和文件组织交换平衡、剖面、执行器和放电数据，导致集成脆弱且不可追溯。",
    "method": "IMAS以数据字典和IDS定义标准结构；IMAS-Python提供API；OMAS以Python数据结构和映射适配多种后端。二者通常位于离线/近线数据层，不是硬实时调度器。",
    "controlArchitecture": "IMAS以数据字典和IDS定义标准结构；IMAS-Python提供API；OMAS以Python数据结构和映射适配多种后端。二者通常位于离线/近线数据层，不是硬实时调度器。 接口与 I/O：equilibrium、core_profiles、pulse_schedule、pf_active、controllers等IDS/ODS对象及元数据。",
    "timescale": "以数据交换、工作流和归档为主；公开仓库不宣称满足快速PCS环的确定性端到端周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "ITER",
      "DIII-D",
      "多装置与模拟链"
    ],
    "validation": "ITER官方开放发布、持续schema/API测试及多代码应用；每个装置映射仍需对照源数据验证。",
    "results": "ITER集成模拟生态和多机构研究工作流。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "ITER集成模拟生态和多机构研究工作流。",
    "limitations": "标准结构不能消除缺失量测、标定差异、坐标映射误差或版本漂移；硬实时使用仍需专用序列化和延迟验证。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Release of IMAS infrastructure and physics models as open source",
        "authors": "未完整列出",
        "year": 2025,
        "venue": "ITER official",
        "doi": null,
        "url": "https://www.iter.org/node/20687/release-imas-infrastructure-and-physics-models-open-source",
        "sourceType": "ITER official"
      }
    ],
    "code": [
      {
        "name": "IMAS Data Dictionary",
        "url": "https://github.com/iterorganization/IMAS-Data-Dictionary",
        "status": "official-enabling",
        "relationship": "ITER官方开放schema。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "IMAS-Python",
        "url": "https://github.com/iterorganization/IMAS-Python",
        "status": "official-enabling",
        "relationship": "ITER官方Python API。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "OMAS",
        "url": "https://github.com/gafusion/omas",
        "status": "official-enabling",
        "relationship": "GA Fusion官方公共适配层；并非某个PCS控制律。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "IMAS",
      "OMAS",
      "IDS",
      "interoperability"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-040",
    "projectId": "PCS-040",
    "titleZh": "EHL-2控制需求与公开证据缺口",
    "titleEn": null,
    "year": 2025,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T2",
      "T7"
    ],
    "categoryLabel": "概念/建设阶段需求",
    "problem": "为高场高性能球形托卡马克规划磁、加热、密度、MHD、壁负荷和异常处置的一体化控制，但公开技术基线仍有限。",
    "method": "公开路线图与FEC海报描述装置物理/工程目标；截至审计日期未找到同行评议的完整PCS架构、实时OS、周期/I/O清单、HIL验收或公共控制仓库。",
    "controlArchitecture": "公开路线图与FEC海报描述装置物理/工程目标；截至审计日期未找到同行评议的完整PCS架构、实时OS、周期/I/O清单、HIL验收或公共控制仓库。 接口与 I/O：预计需要磁、动理学、壁与设备量测及线圈/加热/加料执行器；这是需求推导，不是已部署接口事实。",
    "timescale": "未公开。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "EHL-2"
    ],
    "validation": "暂无足以支持装置闭环成熟度判断的公开原始证据。",
    "results": "规划/建设信息；PCS状态未公开核实。",
    "evidenceLevel": "E0",
    "deploymentLevel": "D1",
    "maturity": "规划/建设信息；PCS状态未公开核实。",
    "limitations": "公开材料以路线图/项目介绍为主，状态可能变化；任何架构细节都需与新奥团队直接核验。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "ENN's Roadmap for Proton-Boron Fusion Based on Spherical Torus",
        "authors": "M. Liu, H. Xie, Y. Wang, J. Dong, K. Feng, X. Gu, X. Huang, X. Jiang et al. and the ENN Fusion Team",
        "year": 2024,
        "venue": "Physics of Plasmas 31, 062507",
        "doi": "10.1063/5.0199112",
        "url": "https://doi.org/10.1063/5.0199112",
        "sourceType": "peer-reviewed roadmap"
      },
      {
        "title": "Overview of the Physics Design of the EHL-2 Spherical Torus for Proton-Boron Fusion",
        "authors": "H. Xie, Y. Liang, Y. Shi, X. Gu, X. Jiang, L. Dong, W. Liu, X. Wang et al. and the EHL-2 Team",
        "year": 2025,
        "venue": "30th IAEA Fusion Energy Conference, IAC-2989",
        "doi": null,
        "url": "https://conferences.iaea.org/event/392/contributions/35908/attachments/19881/36142/FEC2025_EHL2_poster-Xie-V4.pdf",
        "sourceType": "IAEA FEC original conference poster"
      }
    ],
    "code": [
      {
        "name": "EHL-2 PCS",
        "url": null,
        "status": "not-public",
        "relationship": "项目海报保留在publications；未发现可核验公共仓库或完整生产软件说明。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "EHL-2",
      "evidence gap",
      "roadmap"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-005",
    "projectId": "PCS-005",
    "titleZh": "TCV数字实时控制系统：Simulink自动代码生成与MARTe2全机运行",
    "titleEn": null,
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T4"
    ],
    "categoryLabel": "生产级PCS",
    "problem": "支持高度灵活的位形、16个PF线圈、多套EC执行器、动理学观测器和研究算法，同时保持可测试和确定性运行。",
    "method": "控制算法在MATLAB/Simulink中开发和测试，经代码生成后由MARTe2装载；MDSplus保存配置与放电数据；双实时节点接收同步ADC流，PREEMPT_RT Linux多核执行。",
    "controlArchitecture": "控制算法在MATLAB/Simulink中开发和测试，经代码生成后由MARTe2装载；MDSplus保存配置与放电数据；双实时节点接收同步ADC流，PREEMPT_RT Linux多核执行。 接口与 I/O：192通道、最高1 MS/s ADC前端，以高速光纤送双节点；EtherCAT连接设备；反射内存/新DDS网络交换诊断；输出至线圈、气阀、ECH/ECCD等。",
    "timescale": "主控制节点现按10 kHz采样/执行；硬件测试显示可达50 kHz；LIUQE平衡重建为1 ms周期。各模块仍可多速率。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "TCV"
    ],
    "validation": "2024综述记录全机运行和多项闭环实验；软件迁移保留Simulink仿真—生成—部署链，论文给出硬件与时序细节。",
    "results": "TCV日常放电。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "TCV日常放电。",
    "limitations": "Simulink/代码生成许可证、站点数据库和硬件配置仍是复现门槛；MARTe2公开不代表TCV完整PCS公开。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Overview of the TCV digital real-time plasma control system and its applications",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "peer-reviewed open access",
        "doi": "10.1016/j.fusengdes.2024.114640",
        "url": "https://doi.org/10.1016/j.fusengdes.2024.114640",
        "sourceType": "peer-reviewed open access"
      }
    ],
    "code": [
      {
        "name": "MARTe2",
        "url": "https://vcis-gitlab.f4e.europa.eu/aneto/MARTe2",
        "status": "official-enabling",
        "relationship": "TCV运行时核心；不含全部TCV装置算法与配置。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "MEQ",
        "url": "https://gitlab.epfl.ch/spc/public/meq/meq",
        "status": "official-enabling",
        "relationship": "TCV平衡重建与磁控制栈的官方公开使能代码；不是PCS-005所述整套TCV PCS论文的直接实现。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "TCV",
      "MARTe2",
      "Simulink",
      "10 kHz",
      "MDSplus"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-022",
    "projectId": "PCS-022",
    "titleZh": "ITER PCS系统工程与模型驱动设计/部署策略",
    "titleEn": null,
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "控制生命周期工程",
    "problem": "数百个相互耦合的控制功能需要跨多年版本设计、实现、验证、集成和运维，传统逐控制器交付难以保持一致性。",
    "method": "灵活实现架构 + PCSSP需求对照仿真 + 系统工程数据库；把需求、功能、模型、控制器、测试和部署版本建立可追溯关系。",
    "controlArchitecture": "灵活实现架构 + PCSSP需求对照仿真 + 系统工程数据库；把需求、功能、模型、控制器、测试和部署版本建立可追溯关系。 接口与 I/O：系统工程工件、需求、接口、模型、测试证据、软件版本和部署配置。",
    "timescale": "生命周期方法，不规定实时周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "ITER"
    ],
    "validation": "论文提出并用于ITER PCS工程过程；真正装置验收仍待ITER运行。",
    "results": "ITER PCS项目过程。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "ITER PCS项目过程。",
    "limitations": "过程成熟度不能替代未知燃烧等离子体的模型/实验验证；数据库治理和长期工具可持续性是主要风险。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Strategy to systematically design and deploy the ITER plasma control system: A system engineering and model-based design approach",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2024.114464",
        "url": "https://doi.org/10.1016/j.fusengdes.2024.114464",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "PCSSP",
        "url": "https://github.com/iterorganization/PCSSP",
        "status": "official-enabling",
        "relationship": "策略中的公开仿真底座；系统工程数据库和全部PCS工件未公开。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "ITER",
      "MBSE",
      "traceability",
      "deployment"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-031",
    "projectId": "PCS-031",
    "titleZh": "SPARC实时控制框架neutrino与COMET闭环开发环境",
    "titleEn": null,
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T0",
      "T2",
      "T6",
      "T7"
    ],
    "categoryLabel": "在建装置PCS原型",
    "problem": "在首等离子体前开发并测试平衡重建、形状/垂直控制、功率平衡、PFC监视和异常处置，且让同一控制代码进入仿真与未来真机。",
    "method": "自研neutrino实时框架采用无锁进程内/节点间通信；控制组件可接COMET装置模型进行hardware-out-of-loop和hardware-in-the-loop测试。",
    "controlArchitecture": "自研neutrino实时框架采用无锁进程内/节点间通信；控制组件可接COMET装置模型进行hardware-out-of-loop和hardware-in-the-loop测试。 接口与 I/O：计划接入磁、平衡、辐射、PFC监视、执行器和机器状态；当前公开证据主要来自仿真/HIL开发链。",
    "timescale": "会议摘要强调确定性实时和低延迟，但未公开足以审计的各回路最坏执行时间及抖动表。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "SPARC"
    ],
    "validation": "APS-DPP会议原文报告软件组件与COMET的HOOTL/HITL测试；SPARC尚不能提供等离子体闭环证据。",
    "results": "SPARC在建项目的PCS开发环境。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "SPARC在建项目的PCS开发环境。",
    "limitations": "硬件/模型在环只能验证被建模边界；燃烧等离子体、诊断退化和首机接口仍需commissioning。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "The SPARC plasma control system",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "APS-DPP original conference abstract",
        "doi": null,
        "url": "https://meetings-archive.aps.org/dpp/2024/np12/105/",
        "sourceType": "APS-DPP original conference abstract"
      }
    ],
    "code": [
      {
        "name": "neutrino / COMET PCS environment",
        "url": null,
        "status": "not-public",
        "relationship": "原始会议材料描述内部框架；未发现公共源码。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "SPARC",
      "neutrino",
      "COMET",
      "HIL"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-033",
    "projectId": "PCS-033",
    "titleZh": "MARTe2通用确定性实时执行框架",
    "titleEn": null,
    "year": 2024,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "官方开源使能框架",
    "problem": "让实时算法、I/O、调度、网络和状态机以可配置组件组合，避免每个诊断/控制项目重复开发执行内核。",
    "method": "C++核心；GAM封装算法，DataSource封装I/O，Broker搬运数据，Scheduler保证执行序列，RealTimeState/Thread定义状态与线程；配置驱动。",
    "controlArchitecture": "C++核心；GAM封装算法，DataSource封装I/O，Broker搬运数据，Scheduler保证执行序列，RealTimeState/Thread定义状态与线程；配置驱动。 接口与 I/O：可插拔ADC/DAC、共享内存、网络、MDSplus、EPICS及站点驱动；框架与装置适配层分离。",
    "timescale": "由调度、GAM最坏执行时间和I/O决定；TCV在10 kHz全机运行，框架本身不承诺所有硬件或配置均达到该周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "TCV",
      "JET",
      "RFX-mod2",
      "多个实验设施"
    ],
    "validation": "官方仓库单元/集成测试与多装置论文；TCV 2024论文提供全机生产运行证据，JET论文主要是RTCC/升级项目证据。",
    "results": "TCV全机；JET部分实时系统和升级工作；RFX-mod2等。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "TCV全机；JET部分实时系统和升级工作；RFX-mod2等。",
    "limitations": "确定性取决于OS、CPU隔离、驱动、内存、配置和算法；安全认证、装置标定和控制逻辑需项目独立完成。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Overview of the TCV digital real-time plasma control system and its applications",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2024.114640",
        "url": "https://doi.org/10.1016/j.fusengdes.2024.114640",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "MARTe2",
        "url": "https://vcis-gitlab.f4e.europa.eu/aneto/MARTe2",
        "status": "official-enabling",
        "relationship": "F4E/ANETO官方公共仓库；不是任一装置完整控制算法包。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "MARTe2",
      "C++",
      "GAM",
      "real-time framework"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-016",
    "projectId": "PCS-016",
    "titleZh": "‘灵枢’自主等离子体控制系统",
    "titleEn": null,
    "year": 2023,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "生产级PCS现代化",
    "problem": "面向聚变堆安全稳态运行，降低外部软硬件依赖并提高实时性、冗余、可维护和可检查性。",
    "method": "官方页面描述双冗余集群、定制实时Linux、共享内存与实时网络、模块化多进程、状态机、安全检查、版本与日志治理。",
    "controlArchitecture": "官方页面描述双冗余集群、定制实时Linux、共享内存与实时网络、模块化多进程、状态机、安全检查、版本与日志治理。 接口与 I/O：面向EAST诊断、装置状态与执行器的分布式实时数据服务；公开页面未给完整通道表。",
    "timescale": "官方页面称系统抖动控制在5 μs以内；这是调度抖动指标，不是闭环周期或端到端延迟。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "EAST"
    ],
    "validation": "中科院等离子体所官方页面称已在EAST完成连续、稳定、可靠的放电控制；尚需同行评议论文公开更完整量化数据。",
    "results": "EAST。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "EAST。",
    "limitations": "公开证据缺少最坏端到端时延、冗余故障注入、控制模块清单、软件质量等级和独立评测。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "具有完全知识产权的面向聚变堆的自主等离子体控制系统‘灵枢’研制成功",
        "authors": "未完整列出",
        "year": 2023,
        "venue": "institution official",
        "doi": null,
        "url": "https://ipp.cas.cn/xwdt/kydt/202308/t20230827_374112.html",
        "sourceType": "institution official"
      }
    ],
    "code": [
      {
        "name": "灵枢PCS",
        "url": null,
        "status": "not-public",
        "relationship": "仅有机构官方技术说明，未找到公共源码或公开API规范。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "EAST",
      "LingShu",
      "redundancy",
      "real-time Linux"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-029",
    "projectId": "PCS-029",
    "titleZh": "HL-2M新型等离子体控制系统",
    "titleEn": null,
    "year": 2023,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T2"
    ],
    "categoryLabel": "PCS开发与初步验证",
    "problem": "为HL-2M建立可扩展的磁控制平台，兼顾毫秒级一般控制与快速垂直稳定，并复用成熟PCS工程组织。",
    "method": "基于DIII-D PCS框架的三节点实时Linux集群；D-TACQ2106采集、反射内存网络交换、装置专用磁诊断和电源接口。",
    "controlArchitecture": "基于DIII-D PCS框架的三节点实时Linux集群；D-TACQ2106采集、反射内存网络交换、装置专用磁诊断和电源接口。 接口与 I/O：磁探针、磁通环、线圈与电源状态；反射内存跨节点交换，输出到PF/垂直稳定电源。",
    "timescale": "论文给出慢控制1 ms、快速垂直控制200 μs的设计周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "HL-2M"
    ],
    "validation": "论文报告平台搭建和初步仿真；其发表时仍需在真实等离子体实验中进一步验证，故不标为生产级闭环。",
    "results": "HL-2M平台开发/初步验证。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "HL-2M平台开发/初步验证。",
    "limitations": "装置专用I/O、电源模型、磁标定与安全逻辑未公开；初步仿真不能替代真机闭环和异常工况验证。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "A new scheme of plasma control system based on real-time Linux cluster for HL-2M",
        "authors": "未完整列出",
        "year": 2023,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2023.113763",
        "url": "https://doi.org/10.1016/j.fusengdes.2023.113763",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "HL-2M PCS branch",
        "url": null,
        "status": "not-public",
        "relationship": "论文描述GA PCS血缘和硬件，未给出公共源码仓库。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "HL-2M",
      "GA PCS",
      "RFM",
      "vertical control"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-013",
    "projectId": "PCS-013",
    "titleZh": "JET RTCC的MARTe2增强原型",
    "titleEn": null,
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "PCS现代化",
    "problem": "RTCC长期扩展后容量与可维护性受限，需要在不破坏实验灵活性的前提下增加实时算力和组件化能力。",
    "method": "以MARTe2构建新的实时功能层/原型，通过标准信号和配置与既有RTCC协同。",
    "controlArchitecture": "以MARTe2构建新的实时功能层/原型，通过标准信号和配置与既有RTCC协同。 接口与 I/O：沿用JET实时数据驱动模式，接收诊断并向控制/执行器逻辑输出。",
    "timescale": "会议资料证明原型和设计；未给出可用于整链资格声明的统一最坏时延。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "JET"
    ],
    "validation": "IAEA技术会议原文称已设计和原型化；2024会议继续报告升级。没有足够公开证据证明完全替换所有RTCC功能。",
    "results": "JET升级验证；装置已结束运行。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "JET升级验证；装置已结束运行。",
    "limitations": "原型证据不能替代全系统迁移、回归、失效模式和长期运维证明。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Use of MARTe2 to enhance the JET Real-Time Central Controller",
        "authors": "未完整列出",
        "year": 2021,
        "venue": "IAEA conference original",
        "doi": null,
        "url": "https://conferences.iaea.org/event/244/contributions/19897/",
        "sourceType": "IAEA conference original"
      },
      {
        "title": "JET Plasma Control System Upgrade using MARTe2",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "IAEA conference original",
        "doi": null,
        "url": "https://conferences.iaea.org/event/377/contributions/31680/",
        "sourceType": "IAEA conference original"
      }
    ],
    "code": [
      {
        "name": "MARTe2",
        "url": "https://vcis-gitlab.f4e.europa.eu/aneto/MARTe2",
        "status": "official-enabling",
        "relationship": "官方开源执行框架；JET适配、配置和控制算法未公开。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "JET",
      "MARTe2",
      "modernization"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-017",
    "projectId": "PCS-017",
    "titleZh": "PCS-SDP：CFETR/EAST可视化控制算法开发平台",
    "titleEn": null,
    "year": 2021,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "控制开发工具",
    "problem": "PCS算法接入需要手工处理数据结构、波形、接口、编译和链接，难以规模化管理多团队贡献。",
    "method": "可视化拖拽组件定义算法I/O与参数；预生成主框架，开发者填入算法逻辑后自动编译、链接并接入PCS。",
    "controlArchitecture": "可视化拖拽组件定义算法I/O与参数；预生成主框架，开发者填入算法逻辑后自动编译、链接并接入PCS。 接口与 I/O：配置化数据结构、波形和PCS算法接口。",
    "timescale": "开发平台不定义控制周期；生成代码须在目标PCS上单独做WCET和抖动验证。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "EAST",
      "CFETR设计"
    ],
    "validation": "在EAST定制应用中成功加入算法，验证开发流程有效；这不是CFETR全PCS运行证明。",
    "results": "EAST验证；CFETR设计支撑。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "EAST验证；CFETR设计支撑。",
    "limitations": "可视化生成不能替代算法审查、实时资格、测试覆盖和配置治理；平台锁定与生成代码可追溯性需验证。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Custom application of PCS software development platform on EAST",
        "authors": "未完整列出",
        "year": 2021,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2021.112314",
        "url": "https://doi.org/10.1016/j.fusengdes.2021.112314",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "PCS-SDP",
        "url": null,
        "status": "not-public",
        "relationship": "链接为论文；论文描述原型，未找到公共仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "PCS-SDP",
      "CFETR",
      "EAST",
      "code generation"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-001",
    "projectId": "PCS-001",
    "titleZh": "DIII-D Plasma Control System：可扩展多处理器实时控制平台",
    "titleEn": null,
    "year": 2020,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T2",
      "T0",
      "T7"
    ],
    "categoryLabel": "生产级PCS",
    "problem": "在同一放电中协调磁位形、垂直稳定、密度、加热、辐射、偏滤器及核心性能等多类反馈，并允许研究算法频繁迭代。",
    "method": "装置专用 C/C++ 实时框架；算法按 category/phase 组织，多个实时节点并行执行，波形服务器、放电状态协调进程与实时节点分离；rtEFIT、isoflux、监督和执行器接口均可挂接。",
    "controlArchitecture": "装置专用 C/C++ 实时框架；算法按 category/phase 组织，多个实时节点并行执行，波形服务器、放电状态协调进程与实时节点分离；rtEFIT、isoflux、监督和执行器接口均可挂接。 接口与 I/O：高速ADC/DAC、数字触发、节点间专用网络；磁诊断、MSE、ECE、干涉仪、辐射、束源和RF状态；输出到PF线圈、电源、NBI、ECH、气阀与保护逻辑。",
    "timescale": "不同环路多速率；早期采集基准为每 60 μs 一组样本，RWM 专用链路曾由约 50 μs 优化至约 11 μs；剖面/AI功能常工作在毫秒至20 ms量级，不能把单一数字视为全PCS统一周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "DIII-D"
    ],
    "validation": "以装置日常放电为最高层证据；新算法通常经历模型验证、离线回放、PCS实码闭环仿真、硬件测试和受限实验。2020综述与2024升级论文记录了长期生产运行。",
    "results": "DIII-D日常运行；核心软件还形成多个装置分支。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "DIII-D日常运行；核心软件还形成多个装置分支。",
    "limitations": "装置配置、诊断映射、实时驱动和安全逻辑高度专用；历史分支与商业实时OS/硬件依赖提高移植和持续维护成本。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Current State of DIII-D Plasma Control System",
        "authors": "未完整列出",
        "year": 2020,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2019.111368",
        "url": "https://doi.org/10.1016/j.fusengdes.2019.111368",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Recent Advancements in the DIII-D Plasma Control System",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "peer-reviewed",
        "doi": "10.1109/TPS.2024.3415768",
        "url": "https://doi.org/10.1109/TPS.2024.3415768",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "DIII-D PCS core",
        "url": null,
        "status": "not-public",
        "relationship": "GA维护的生产源码；官方页面证明多装置使用，但未提供公共克隆入口。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "DIII-D",
      "PCS",
      "rtEFIT",
      "isoflux",
      "real-time"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-019",
    "projectId": "PCS-019",
    "titleZh": "KSTAR PCS升级与长脉冲高级集成控制",
    "titleEn": null,
    "year": 2020,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T8"
    ],
    "categoryLabel": "长脉冲PCS现代化",
    "problem": "长脉冲高性能实验需要更多诊断、更强算力、现代DAQ、磁体/气体/加热集成及异常处理。",
    "method": "更新实时硬件、实时OS、数据采集和算法集成；保持确定性网络和PCS分层组织。",
    "controlArchitecture": "更新实时硬件、实时OS、数据采集和算法集成；保持确定性网络和PCS分层组织。 接口与 I/O：磁、密度、加热、气体、异常事件和装置状态；输出磁体、加料、加热与响应策略。",
    "timescale": "控制任务多速率，论文强调高频采集和严格实时，但不应捏造单一周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "KSTAR"
    ],
    "validation": "2016后运行经验与升级论文；2026 ITER官方进一步报告iPCS在KSTAR真机部署并操作。",
    "results": "KSTAR。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "KSTAR。",
    "limitations": "2026官方消息缺少同行评议的时序、功能覆盖和试验清单；iPCS接管范围必须等待技术论文细化。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Achievements and lessons learned from the operation of KSTAR plasma control system upgrade",
        "authors": "未完整列出",
        "year": 2018,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2018.02.066",
        "url": "https://doi.org/10.1016/j.fusengdes.2018.02.066",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Advances and challenges in KSTAR plasma control toward long-pulse, high-performance experiments",
        "authors": "未完整列出",
        "year": 2020,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2020.111622",
        "url": "https://doi.org/10.1016/j.fusengdes.2020.111622",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "On KSTAR, ITER’s plasma control system successfully takes charge",
        "authors": "未完整列出",
        "year": 2026,
        "venue": "ITER official",
        "doi": null,
        "url": "https://www.iter.org/node/20687/kstar-iters-plasma-control-system-successfully-takes-charge",
        "sourceType": "ITER official"
      }
    ],
    "code": [
      {
        "name": "KSTAR PCS / ITER iPCS deployment",
        "url": null,
        "status": "not-public",
        "relationship": "真机部署由ITER官方确认；生产代码未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "KSTAR",
      "long pulse",
      "iPCS",
      "upgrade"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-026",
    "projectId": "PCS-026",
    "titleZh": "MAST Upgrade Plasma Control System",
    "titleEn": null,
    "year": 2020,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T2"
    ],
    "categoryLabel": "生产级PCS",
    "problem": "MAST-U多PF线圈和11组气阀使形状参数与执行器强耦合，还需支持Super-X、脱靶和壁负荷实验。",
    "method": "继续采用GA PCS的通用框架+平台/装置专用层；category/phase组织控制函数；采用装置特定虚拟电路、FIESTA/模型设计和新I/O。",
    "controlArchitecture": "继续采用GA PCS的通用框架+平台/装置专用层；category/phase组织控制函数；采用装置特定虚拟电路、FIESTA/模型设计和新I/O。 接口与 I/O：磁诊断、PF线圈、11组气阀、加热和边界/偏滤器信号；与MAST-U数据系统连接。",
    "timescale": "多速率；论文重点为系统架构和调试，不能给出一个全局周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "MAST-U"
    ],
    "validation": "系统集成、commissioning和早期MAST-U运行；历史MAST形状控制提供前序证据。",
    "results": "MAST-U。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "MAST-U。",
    "limitations": "形状—线圈耦合和气阀数量使操作配置复杂；受控软件、FIESTA配置和实验数据权限限制复现。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "The MAST Upgrade plasma control system",
        "authors": "未完整列出",
        "year": 2020,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2020.111764",
        "url": "https://doi.org/10.1016/j.fusengdes.2020.111764",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "MAST-U GA PCS branch",
        "url": null,
        "status": "not-public",
        "relationship": "链接为GA合作入口；生产分支未公开，论文明确其GA PCS血缘。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "MAST-U",
      "GA PCS",
      "Super-X",
      "gas control"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-035",
    "projectId": "PCS-035",
    "titleZh": "MDSplus与MARTe2的配置、实时数据和放电证据链集成",
    "titleEn": null,
    "year": 2020,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "数据与实时集成",
    "problem": "实时系统需要从版本化配置启动、在线交换数据，并在放电后保存带时基、单位和树结构的证据。",
    "method": "MDSplus tree/pulse模型管理配置与shot数据；MARTe2 DataSource将实时信号接到算法图，放电前后由非实时服务完成配置与归档。",
    "controlArchitecture": "MDSplus tree/pulse模型管理配置与shot数据；MARTe2 DataSource将实时信号接到算法图，放电前后由非实时服务完成配置与归档。 接口与 I/O：信号、节点、segment、event、配置和元数据；与站点DAQ、共享内存及网络桥接。",
    "timescale": "实时流通道可按站点周期运行；树写入和远程访问通常不放在最紧的硬实时路径。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "TCV",
      "JET",
      "DIII-D",
      "NSTX-U",
      "RFX-mod",
      "多装置"
    ],
    "validation": "同行评议集成论文和TCV等生产部署；数据完整性仍依赖时钟、单位、标定和写入策略。",
    "results": "多个装置的数据/配置基础设施。",
    "evidenceLevel": "E3",
    "deploymentLevel": "D4",
    "maturity": "多个装置的数据/配置基础设施。",
    "limitations": "树结构可容纳数据但不自动建立跨装置语义；实时数据库不能取代时间同步、数据质量和可追溯治理。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "MARTe2 and MDSplus integration for a comprehensive fast control and data acquisition system",
        "authors": "未完整列出",
        "year": 2020,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2020.111892",
        "url": "https://doi.org/10.1016/j.fusengdes.2020.111892",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "MDSplus yesterday, today and tomorrow",
        "authors": "未完整列出",
        "year": 2018,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2017.12.010",
        "url": "https://doi.org/10.1016/j.fusengdes.2017.12.010",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "MDSplus",
        "url": "https://github.com/MDSplus/mdsplus",
        "status": "official-enabling",
        "relationship": "官方公共仓库。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "MARTe2",
        "url": "https://vcis-gitlab.f4e.europa.eu/aneto/MARTe2",
        "status": "official-enabling",
        "relationship": "实时执行与DataSource框架。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "MDSplus",
      "MARTe2",
      "data provenance",
      "shot"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-027",
    "projectId": "PCS-027",
    "titleZh": "WEST等离子体控制系统集成与首轮运行",
    "titleEn": null,
    "year": 2019,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T2",
      "T6"
    ],
    "categoryLabel": "生产级PCS",
    "problem": "把Tore Supra的分散式控制迁移为适配长脉冲钨环境的统一PCS，并协调磁控制、密度、RF、壁保护和脉冲时序。",
    "method": "中央放电控制/PCS协调多个实时诊断和执行器；实时数据库/共享内存交换量测，壁监视与保护链保留独立职责；装置专用控制软件未公开。",
    "controlArchitecture": "中央放电控制/PCS协调多个实时诊断和执行器；实时数据库/共享内存交换量测，壁监视与保护链保留独立职责；装置专用控制软件未公开。 接口与 I/O：磁诊断、干涉仪、红外WMS、RF功率与天线状态、气体和线圈；输出到PF、电流、密度、五套RF天线及保护请求。",
    "timescale": "任务多速率；壁温闭环论文报告红外事件检测和RF命令链，但不支持把图像帧率或单模块耗时写成全PCS周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "WEST"
    ],
    "validation": "PCS集成在WEST首轮实验commissioning；红外壁温反馈论文报告C4阶段63次触发、97%成功率和0.2%误报率，指标仅适用于该数据集与阈值。",
    "results": "WEST实验运行。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "WEST实验运行。",
    "limitations": "壁温反馈阈值和图像处理依赖相机标定、视场与PFC材料；首轮运行不能代表稳态高功率场景的全部异常覆盖。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "The WEST plasma control system: Integration, commissioning and operation on first experimental campaigns",
        "authors": "未完整列出",
        "year": 2019,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2019.01.139",
        "url": "https://doi.org/10.1016/j.fusengdes.2019.01.139",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "First real-time detection and feedback control of plasma-wall interaction in WEST",
        "authors": "未完整列出",
        "year": 2021,
        "venue": "original preprint",
        "doi": null,
        "url": "https://arxiv.org/abs/2101.01914",
        "sourceType": "original preprint"
      }
    ],
    "code": [
      {
        "name": "WEST PCS and wall-monitoring branch",
        "url": null,
        "status": "not-public",
        "relationship": "装置与成果有机构页面，未发现生产PCS或WMS控制分支的公开仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "WEST",
      "wall temperature",
      "RF",
      "long pulse"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-004",
    "projectId": "PCS-004",
    "titleZh": "PCS—Plant闭环共仿真：在真实控制代码外接GSevolve等装置模型",
    "titleEn": null,
    "year": 2018,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "控制验证平台",
    "problem": "控制器只有在包含电源、线圈、被动结构、等离子体与时延的闭环中运行实际生产代码，才能发现接口和实现级错误。",
    "method": "生产PCS与独立Plant模型通过定义良好的I/O接口共仿真；可替换平衡/电路模型，支持离线、软件在环和硬件在环。",
    "controlArchitecture": "生产PCS与独立Plant模型通过定义良好的I/O接口共仿真；可替换平衡/电路模型，支持离线、软件在环和硬件在环。 接口与 I/O：PCS读取合成磁信号和诊断量、发出线圈/执行器命令；Plant回传等离子体与设备响应。",
    "timescale": "与目标PCS周期同步；具体模型决定是否实时。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "DIII-D及PCS衍生装置"
    ],
    "validation": "论文称该模式在DIII-D长期例行使用，并在其他PCS实验室使用约十年；验证目标是控制集成而非高保真物理本身。",
    "results": "DIII-D控制开发基础设施。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "DIII-D控制开发基础设施。",
    "limitations": "实时可运行模型通常是约化模型；若配置、时延、量化、饱和和故障分布不真实，会产生虚假置信。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Enabling co-simulation of tokamak plant models and plasma control systems",
        "authors": "未完整列出",
        "year": 2018,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2017.12.021",
        "url": "https://doi.org/10.1016/j.fusengdes.2017.12.021",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "DIII-D PCS simulation environment",
        "url": null,
        "status": "not-public",
        "relationship": "装置控制开发基础设施；未公开完整环境。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "co-simulation",
      "SIL",
      "HIL",
      "GSevolve"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-030",
    "projectId": "PCS-030",
    "titleZh": "J-TEXT实时框架（JRTF）与中央控制集成",
    "titleEn": null,
    "year": 2018,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T8"
    ],
    "categoryLabel": "实时数据与控制框架",
    "problem": "把多源诊断、实时算法、控制输出、放电时序和数据归档连接起来，降低新增反馈实验的集成成本。",
    "method": "JRTF将实时采集、计算、共享和输出模块化；中央控制与定时系统协调shot；EPICS用于设备层监控，装置数据系统保存放电数据。",
    "controlArchitecture": "JRTF将实时采集、计算、共享和输出模块化；中央控制与定时系统协调shot；EPICS用于设备层监控，装置数据系统保存放电数据。 接口与 I/O：磁、密度、辐射、MHD等实时信号；输出到线圈、电源、气体或实验专用执行器。",
    "timescale": "依任务配置；论文验证实时数据处理延迟，但不支持为中央控制、EPICS与快速反馈写一个统一周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "J-TEXT"
    ],
    "validation": "论文通过J-TEXT在线数据处理和反馈实验验证JRTF；具体控制律需看独立物理论文。",
    "results": "J-TEXT实验。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "J-TEXT实验。",
    "limitations": "框架公开描述不足以重建驱动、同步、标定和控制插件；EPICS监控层不能替代微秒/毫秒反馈内核。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "A new implementation of data process in J-TEXT real-time framework",
        "authors": "未完整列出",
        "year": 2018,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2018.02.060",
        "url": "https://doi.org/10.1016/j.fusengdes.2018.02.060",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "JRTF/J-TEXT control code",
        "url": null,
        "status": "not-public",
        "relationship": "论文直接系统实现，未发现公开仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      },
      {
        "name": "EPICS Base",
        "url": "https://github.com/epics-base/epics-base",
        "status": "official-enabling",
        "relationship": "设备控制使能框架，不包含J-TEXT装置配置或反馈算法。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "J-TEXT",
      "JRTF",
      "EPICS",
      "real-time data"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-021",
    "projectId": "PCS-021",
    "titleZh": "ITER Plasma Control System Simulation Platform（PCSSP）",
    "titleEn": null,
    "year": 2015,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "控制验证平台",
    "problem": "ITER放电昂贵且数量有限，控制功能、架构、异常策略和脉冲计划必须在执行前系统仿真。",
    "method": "基于MATLAB/Simulink模型引用的模块—Wrapper—Top Model三级层次；模块化Plant、诊断、执行器、控制器和异常；程序化配置、批量仿真与结果归档。",
    "controlArchitecture": "基于MATLAB/Simulink模型引用的模块—Wrapper—Top Model三级层次；模块化Plant、诊断、执行器、控制器和异常；程序化配置、批量仿真与结果归档。 接口与 I/O：标准化模块端口和参数，覆盖轴对称MHD、基础动理学、撕裂模、执行器/诊断与控制策略。",
    "timescale": "离线/实时用例并存；平台不保证所有高保真模型实时。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "ITER",
      "可复用装置模型"
    ],
    "validation": "2013原型在ITER组织演示；2015论文记录设计与alpha计划；2025官方GitHub公开后可审计代码。",
    "results": "ITER PCS开发环境。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "ITER PCS开发环境。",
    "limitations": "依赖商业MATLAB/Simulink；公开平台不等于所有ITER Plant模型、参数和受限配置均公开；模型可信度需逐模块建立。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "The ITER Plasma Control System Simulation Platform",
        "authors": "未完整列出",
        "year": 2015,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2015.01.009",
        "url": "https://doi.org/10.1016/j.fusengdes.2015.01.009",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "PCSSP",
        "url": "https://github.com/iterorganization/PCSSP",
        "status": "official-direct",
        "relationship": "ITER官方开源MATLAB平台。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "ITER",
      "PCSSP",
      "Simulink",
      "exception simulation"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "CPT-046",
    "projectId": "CPT-046",
    "titleZh": "ITER PCSSP异常处理事件生成与仿真",
    "titleEn": "ITER PCSSP event generation and exception-handling simulation",
    "year": 2014,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T7"
    ],
    "categoryLabel": "T9",
    "problem": "ITER异常组合数量大，必须在上机前验证诊断、控制、联锁和执行器的时序交互。",
    "method": "在Plasma Control System Simulation Platform中建立事件生成器，耦合等离子体、执行器、诊断、联锁和PCS模型，注入异常并检查响应。",
    "controlArchitecture": "未完整公开。",
    "timescale": "从亚毫秒控制到秒级异常序列",
    "sensors": [
      "仿真诊断",
      "控制/联锁事件",
      "模型状态"
    ],
    "actuators": [
      "仿真中的PF、加热、加料和保护动作"
    ],
    "devices": [
      "ITER"
    ],
    "validation": "PCSSP软件在环/系统仿真原型；无ITER等离子体。",
    "results": "证明可系统生成异常并验证PCS响应，为需求追踪和故障注入测试建立框架。",
    "evidenceLevel": "E1",
    "deploymentLevel": "D2",
    "maturity": "D2；需结合条目证据说明理解。",
    "limitations": "仿真结果取决于故障模型覆盖；平台验证不等同于控制逻辑已通过核安全认证。",
    "twinRelevance": "本质上是面向控制与异常演练的工程数字孪生雏形，应扩展证据追踪和持续集成。",
    "papers": [
      {
        "title": "Event generation and simulation of exception handling with the ITER PCSSP",
        "authors": "G. Raupp, M.L. Walker, G. Ambrosino, G. de Tommasi, D.A. Humphreys, M. Mattei, G. Neu, W. Treutterer and A. Winter",
        "year": 2014,
        "venue": "Fusion Engineering and Design",
        "doi": "10.1016/j.fusengdes.2014.04.068",
        "url": "https://doi.org/10.1016/j.fusengdes.2014.04.068",
        "sourceType": "peer-reviewed simulation platform"
      }
    ],
    "code": [
      {
        "name": "ITER PCSSP",
        "url": null,
        "status": "not-public",
        "relationship": "平台与ITER模型未发现公开发行仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [],
    "sourceFile": "protection_power_tasks.json"
  },
  {
    "id": "PCS-009",
    "projectId": "PCS-009",
    "titleZh": "ASDEX Upgrade Discharge Control System",
    "titleEn": null,
    "year": 2014,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T6",
      "T8"
    ],
    "categoryLabel": "生产级DCS/PCS",
    "problem": "研究装置需要频繁改变控制配置，同时必须协调实时诊断、反馈、执行器负荷分配、脉冲监督和异常处理。",
    "method": "分布式模块化实时软件；配置驱动部署；数据驱动进程同步；共享内存和多种实时网络；段式放电计划、中央/局部异常处理；Linux、VxWorks、Solaris混合平台。",
    "controlArchitecture": "分布式模块化实时软件；配置驱动部署；数据驱动进程同步；共享内存和多种实时网络；段式放电计划、中央/局部异常处理；Linux、VxWorks、Solaris混合平台。 接口与 I/O：实时诊断卫星、磁/动理学信号、参考波形、执行器状态；输出PF、加热、气体及放电模式指令。",
    "timescale": "多速率；论文给出专用实时计算机部署，但不同功能周期不同，不能以单值概括。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "ASDEX Upgrade"
    ],
    "validation": "2014论文基于多年AUG生产运行，包含部署和实际控制/诊断集成实例。",
    "results": "ASDEX Upgrade日常运行。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "ASDEX Upgrade日常运行。",
    "limitations": "长期演进形成多OS和站点专用组件；移植需要重建实时通信、segment语义和责任边界。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "ASDEX Upgrade Discharge Control System—A real-time plasma control framework",
        "authors": "未完整列出",
        "year": 2014,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2014.01.001",
        "url": "https://doi.org/10.1016/j.fusengdes.2014.01.001",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "AUG DCS",
        "url": null,
        "status": "not-public",
        "relationship": "论文全文公开；生产框架未发现公共源码仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "ASDEX Upgrade",
      "DCS",
      "segment schedule",
      "exception handling"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-020",
    "projectId": "PCS-020",
    "titleZh": "ITER Plasma Control System功能架构",
    "titleEn": null,
    "year": 2014,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T4",
      "T6",
      "T8"
    ],
    "categoryLabel": "下一代PCS设计",
    "problem": "燃烧等离子体控制功能高度耦合，执行器冲突、异常处理和多年分阶段开发要求系统化功能架构。",
    "method": "分层级联控制；compact controller把争用同一命令信号的控制功能集合起来，由mode selector互斥选择；功能、通信和软件架构分开定义。",
    "controlArchitecture": "分层级联控制；compact controller把争用同一命令信号的控制功能集合起来，由mode selector互斥选择；功能、通信和软件架构分开定义。 接口与 I/O：多诊断、加热/加料、PF和稳定线圈、异常事件与脉冲计划；输出执行器请求和控制模式。",
    "timescale": "架构跨越快速垂直稳定、毫秒磁/动理学环和慢速监督；公开论文不定义一个总周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "ITER"
    ],
    "validation": "基于全球装置需求和系统工程用例；2014为概念架构，不能视为ITER装置闭环验证。",
    "results": "ITER设计基线；2026在KSTAR的iPCS活动提供早期真机经验但不是ITER运行。",
    "evidenceLevel": "E0",
    "deploymentLevel": "D1",
    "maturity": "ITER设计基线；2026在KSTAR的iPCS活动提供早期真机经验但不是ITER运行。",
    "limitations": "ITER尚未等离子体运行；传感器受辐照、执行器饱和、alpha自加热和低机时条件仍需逐级验证。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Architectural concept for the ITER Plasma Control System",
        "authors": "未完整列出",
        "year": 2014,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2014.02.079",
        "url": "https://doi.org/10.1016/j.fusengdes.2014.02.079",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "ITER iPCS implementation",
        "url": null,
        "status": "not-public",
        "relationship": "官方报道部署，完整源码与配置未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "ITER",
      "iPCS",
      "functional architecture",
      "mode selector"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-025",
    "projectId": "PCS-025",
    "titleZh": "NSTX-U控制系统升级：64位实时Linux与现代I/O",
    "titleEn": null,
    "year": 2014,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T2"
    ],
    "categoryLabel": "PCS现代化",
    "problem": "延长脉冲和新硬件要求替换老化并行I/O、32位OS和手工维护代码，同时保留GA PCS功能。",
    "method": "GA PCS迁移至64位Concurrent RedHawk Linux；Fibre Channel/FPDP串行I/O；代码生成、C99/C11和驱动更新；MDSplus/PPPL基础设施协同。",
    "controlArchitecture": "GA PCS迁移至64位Concurrent RedHawk Linux；Fibre Channel/FPDP串行I/O；代码生成、C99/C11和驱动更新；MDSplus/PPPL基础设施协同。 接口与 I/O：光纤串行高速I/O、磁与电源接口、实时Linux驱动。",
    "timescale": "实时性能按目标控制环验证；公开摘要未给统一周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "NSTX-U"
    ],
    "validation": "升级论文和NSTX-U首轮运行；2018边界控制论文、2025 GSevolve复现与控制改进继续验证。",
    "results": "NSTX-U；装置恢复/重启阶段需结合最新官方状态解释。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "NSTX-U；装置恢复/重启阶段需结合最新官方状态解释。",
    "limitations": "商业实时OS依赖；复现需要PPPL/GA受控配置和装置数据；恢复后配置变化需重新验证。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "NSTX-U Control System Upgrades",
        "authors": "未完整列出",
        "year": 2014,
        "venue": "peer-reviewed",
        "doi": null,
        "url": "https://bp-pub.pppl.gov/pub_report/2014/PPPL-5045-abs.html",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Plasma boundary shape control and real-time equilibrium reconstruction on NSTX-U",
        "authors": "未完整列出",
        "year": 2018,
        "venue": "peer-reviewed",
        "doi": "10.1088/1741-4326/aaa4d0",
        "url": "https://doi.org/10.1088/1741-4326/aaa4d0",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Plasma shape and position control development for NSTX-U using the GSEvolve plasma simulator",
        "authors": "未完整列出",
        "year": 2025,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2025.115302",
        "url": "https://doi.org/10.1016/j.fusengdes.2025.115302",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "NSTX-U PCS/GSevolve environment",
        "url": null,
        "status": "not-public",
        "relationship": "论文和报告公开，生产PCS/GSevolve配置未公共发布。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "NSTX-U",
      "RedHawk",
      "GSEvolve",
      "PCS upgrade"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-010",
    "projectId": "PCS-010",
    "titleZh": "Fenix飞行模拟器：AUG控制开发的闭环Plant模型",
    "titleEn": null,
    "year": 2011,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "控制验证平台",
    "problem": "在不占用机时、不危及装置的情况下测试放电计划、磁/性能控制和异常处理。",
    "method": "ASTRA一维输运、二维平衡求解器SPIDER与MATLAB/Simulink耦合，连接DCS控制逻辑构成闭环飞行模拟。",
    "controlArchitecture": "ASTRA一维输运、二维平衡求解器SPIDER与MATLAB/Simulink耦合，连接DCS控制逻辑构成闭环飞行模拟。 接口与 I/O：DCS执行器请求进入Plant；合成平衡、诊断和等离子体状态返回控制系统。",
    "timescale": "目标是控制导向闭环；模型保真与运行速度按用例权衡，公开摘要未给统一实时保证。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "ASDEX Upgrade",
      "ITER PCSSP模型移植"
    ],
    "validation": "对AUG场景和控制行为进行仿真/回放；相关模型还进入ITER PCSSP研究。",
    "results": "AUG离线控制开发。",
    "evidenceLevel": "E2",
    "deploymentLevel": "D2",
    "maturity": "AUG离线控制开发。",
    "limitations": "约化输运和平衡模型的适用域决定预测可信度；依赖商业Simulink和装置配置。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Development of a generic multipurpose tokamak plasma discharge flight simulator",
        "authors": "未完整列出",
        "year": 2011,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2011.01.013",
        "url": "https://doi.org/10.1016/j.fusengdes.2011.01.013",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "MATLAB/Simulink",
        "url": "https://www.mathworks.com/products/simulink.html",
        "status": "commercial-enabling",
        "relationship": "Fenix编排和控制建模环境。",
        "artifactType": "commercial-software",
        "access": "proprietary",
        "license": "未标注"
      },
      {
        "name": "Fenix/AUG models",
        "url": null,
        "status": "not-public",
        "relationship": "链接为论文记录；未发现完整公开模型包。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "Fenix",
      "ASTRA",
      "SPIDER",
      "Simulink"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-003",
    "projectId": "PCS-003",
    "titleZh": "DIII-D PCS多装置移植：NSTX、MAST、EAST、KSTAR等分支",
    "titleEn": null,
    "year": 2010,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "多装置软件复用",
    "problem": "不同装置希望复用成熟实时框架，同时必须适配线圈、电源、诊断、实时网络、脉冲流程和本地团队。",
    "method": "通用PCS基础设施与平台/装置专用层分离；每个站点保留独立硬件、驱动和算法扩展。",
    "controlArchitecture": "通用PCS基础设施与平台/装置专用层分离；每个站点保留独立硬件、驱动和算法扩展。 接口与 I/O：装置专用ADC/DAC、反射内存或本地网络；通用算法接口外接站点磁诊断、执行器和档案系统。",
    "timescale": "随装置与控制任务变化；论文不支持给出跨装置统一周期。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "DIII-D",
      "NSTX",
      "MAST",
      "EAST",
      "KSTAR",
      "Pegasus",
      "MST"
    ],
    "validation": "论文总结各站点实施经验；DIII-D、NSTX/MAST、EAST、KSTAR分别有独立装置论文佐证。",
    "results": "多个装置生产使用，但版本和功能并不相同。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "多个装置生产使用，但版本和功能并不相同。",
    "limitations": "共享框架不自动解决装置模型、实时驱动、安全责任和配置分叉；跨站点回合并可能困难。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Accumulated experiences from implementations of the DIII-D plasma control system worldwide",
        "authors": "未完整列出",
        "year": 2010,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2010.04.040",
        "url": "https://doi.org/10.1016/j.fusengdes.2010.04.040",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "DIII-D integrated plasma control tools applied to next generation tokamaks",
        "authors": "未完整列出",
        "year": 2005,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2005.06.256",
        "url": "https://doi.org/10.1016/j.fusengdes.2005.06.256",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "GA PCS family",
        "url": null,
        "status": "not-public",
        "relationship": "源码按合作关系提供；未发现统一公开许可证仓库。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "software product line",
      "PCS portability",
      "GA"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-006",
    "projectId": "PCS-006",
    "titleZh": "TCV分布式反馈控制系统的架构与投运",
    "titleEn": null,
    "year": 2010,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "PCS演进基线",
    "problem": "旧系统I/O和计算容量不足以承载多诊断、多执行器以及EC加热/电流驱动的高级控制。",
    "method": "模块化、数字化、分布式反馈系统；多个控制节点共享实时信号并接入TCV放电基础设施。",
    "controlArchitecture": "模块化、数字化、分布式反馈系统；多个控制节点共享实时信号并接入TCV放电基础设施。 接口与 I/O：扩展诊断输入、PF与EC执行器输出，接入装置同步、配置和数据系统。",
    "timescale": "会议论文证明实时投运，但当前公开摘要未给出足以审计的统一周期，故标为未披露。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "TCV"
    ],
    "validation": "论文报告在TCV放电成功投运；后续2017、2024论文形成持续演进证据。",
    "results": "TCV，后续由MARTe2架构升级。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "TCV，后续由MARTe2架构升级。",
    "limitations": "反射内存部件老化、带宽和可扩展性受限，是2025年DDS迁移研究的直接动因。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Architecture and commissioning of the TCV distributed feedback control system",
        "authors": "未完整列出",
        "year": 2010,
        "venue": "peer-reviewed conference",
        "doi": "10.1109/RTC.2010.5750487",
        "url": "https://doi.org/10.1109/RTC.2010.5750487",
        "sourceType": "peer-reviewed conference"
      }
    ],
    "code": [
      {
        "name": "TCV legacy SCD control code",
        "url": null,
        "status": "not-public",
        "relationship": "装置页面描述能力；未发现完整旧版源码仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "TCV",
      "distributed control",
      "commissioning"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-018",
    "projectId": "PCS-018",
    "titleZh": "KSTAR Day-One PCS：RFM集群与DIII-D PCS软件",
    "titleEn": null,
    "year": 2009,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [],
    "categoryLabel": "生产级PCS",
    "problem": "为超导KSTAR首等离子体提供可靠实时电流、位置、线圈和放电控制，并建立可扩展基础。",
    "method": "Linux x86实时节点、反射内存集群、DIII-D PCS软件分支；与KSTAR中央/机器/诊断/定时/联锁系统协同。",
    "controlArchitecture": "Linux x86实时节点、反射内存集群、DIII-D PCS软件分支；与KSTAR中央/机器/诊断/定时/联锁系统协同。 接口与 I/O：磁诊断、PF线圈/电源、气体和时序；RFM连接控制节点。",
    "timescale": "公开摘要不支持一个统一周期；硬实时采集和RFM用于确定性交换。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "KSTAR"
    ],
    "validation": "2008线圈调试和首等离子体期间成功实时控制。",
    "results": "KSTAR首日并持续演进。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "KSTAR首日并持续演进。",
    "limitations": "早期架构与硬件已多次升级；不能用Day-One配置代表当前KSTAR长脉冲能力。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Plasma control system for ‘Day-One’ operation of KSTAR tokamak",
        "authors": "未完整列出",
        "year": 2009,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2008.12.082",
        "url": "https://doi.org/10.1016/j.fusengdes.2008.12.082",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Design concepts for KSTAR plasma control system",
        "authors": "未完整列出",
        "year": 2005,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2004.12.004",
        "url": "https://doi.org/10.1016/j.fusengdes.2004.12.004",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "KSTAR PCS",
        "url": null,
        "status": "not-public",
        "relationship": "链接为论文；源自GA PCS并含KSTAR专用层，未发现公共仓库。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "tags": [
      "KSTAR",
      "PCS",
      "RFM",
      "Day-One"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-014",
    "projectId": "PCS-014",
    "titleZh": "EAST Plasma Control System：DIII-D PCS架构的超导长脉冲适配",
    "titleEn": null,
    "year": 2008,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T2",
      "T0"
    ],
    "categoryLabel": "生产级PCS",
    "problem": "为全超导、强成形EAST完成首等离子体、分流位形、电流/位置/形状和安全保护，并为长脉冲扩展。",
    "method": "继承DIII-D PCS的多节点软件/硬件基础，适配12套独立PF电源、EAST磁诊断和反射内存I/O；早期采用RZIP、isoflux及rtEFIT演进路线。",
    "controlArchitecture": "继承DIII-D PCS的多节点软件/硬件基础，适配12套独立PF电源、EAST磁诊断和反射内存I/O；早期采用RZIP、isoflux及rtEFIT演进路线。 接口与 I/O：磁探针、积分器、线圈电流、密度等；RFM向电源、气阀和外围系统传送数字命令。",
    "timescale": "多速率；早期论文不支持一个全系统周期。后续通信原型以10 kHz DAQ测试，不能倒推所有生产环路均为10 kHz。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "EAST"
    ],
    "validation": "2006首等离子体与2007首分流等离子体运行；论文报告线圈/RZIP/保护验证，isoflux当时尚未充分实验，后续工作再补强。",
    "results": "EAST日常运行的历史PCS分支。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "EAST日常运行的历史PCS分支。",
    "limitations": "DIII-D源代码分支和EAST本地扩展的版本谱系、驱动和装置配置不公开；长脉冲漂移与冗余需专门处理。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "EAST plasma control system",
        "authors": "未完整列出",
        "year": 2008,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2007.12.028",
        "url": "https://doi.org/10.1016/j.fusengdes.2007.12.028",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "EAST PCS",
        "url": null,
        "status": "not-public",
        "relationship": "生产代码未发现公共仓库；后续已发展自主‘灵枢’系统。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "EAST",
      "PCS",
      "RFM",
      "superconducting tokamak"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-024",
    "projectId": "PCS-024",
    "titleZh": "NSTX实时控制：GA PCS、PSRTC、rtEFIT与MDSplus",
    "titleEn": null,
    "year": 2004,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T0",
      "T2"
    ],
    "categoryLabel": "生产级PCS",
    "problem": "球形托卡马克需要高速电源控制、等离子体电流/位置/形状反馈和紧凑装置上的强耦合磁控制。",
    "method": "GA PCS负责采集、气体、电流和形状；PSRTC执行电源控制；rtEFIT和isoflux用于实时平衡/边界；放电后参数和数据写入MDSplus。",
    "controlArchitecture": "GA PCS负责采集、气体、电流和形状；PSRTC执行电源控制；rtEFIT和isoflux用于实时平衡/边界；放电后参数和数据写入MDSplus。 接口与 I/O：磁信号、线圈/电源、气阀；MDSplus归档；PCS—PSRTC实时电压命令。",
    "timescale": "早期系统有160路快速采集和8个实时处理器；后续论文报告352路、5 kHz采集。周期随模块变化。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "NSTX"
    ],
    "validation": "NSTX实际放电中的边界控制、实时平衡和长期运行。",
    "results": "NSTX，后升级为NSTX-U。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "NSTX，后升级为NSTX-U。",
    "limitations": "历史硬件和NSTX配置已被NSTX-U升级替代；档案系统开放不等于实验数据无需权限。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Real-time control software on NSTX",
        "authors": "未完整列出",
        "year": 2004,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2004.04.012",
        "url": "https://doi.org/10.1016/j.fusengdes.2004.04.012",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Plasma shape control on NSTX using real-time equilibrium reconstruction",
        "authors": "未完整列出",
        "year": 2006,
        "venue": "peer-reviewed",
        "doi": "10.1088/0029-5515/46/1/002",
        "url": "https://doi.org/10.1088/0029-5515/46/1/002",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "GA PCS NSTX branch",
        "url": null,
        "status": "not-public",
        "relationship": "链接为GA合作入口；装置专用生产分支未公开。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      },
      {
        "name": "MDSplus",
        "url": "https://github.com/MDSplus/mdsplus",
        "status": "official-enabling",
        "relationship": "数据和配置归档使能框架，不是PCS算法。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "tags": [
      "NSTX",
      "PCS",
      "PSRTC",
      "rtEFIT"
    ],
    "sourceFile": "pcs_frameworks.json"
  },
  {
    "id": "PCS-011",
    "projectId": "PCS-011",
    "titleZh": "JET Real-Time Central Controller与实时数据网络",
    "titleEn": null,
    "year": 2000,
    "organization": "论文作者与装置团队（见原始来源）",
    "primaryTask": "T9",
    "relatedTasks": [
      "T6",
      "T0"
    ],
    "categoryLabel": "生产级PCS",
    "problem": "把多种实时诊断与NBI、ICRH、LHCD、加料和颗粒注入连接起来，完成β、剖面、辐射、约束和MHD等实验反馈。",
    "method": "RTCC作为灵活中央实验控制器；PPCC负责电流/位置/形状，密度控制器独立；实时数据网络连接诊断、控制器和执行器，后续由大量可编程算法扩展。",
    "controlArchitecture": "RTCC作为灵活中央实验控制器；PPCC负责电流/位置/形状，密度控制器独立；实时数据网络连接诊断、控制器和执行器，后续由大量可编程算法扩展。 接口与 I/O：磁、干涉、ECE、MSE、辐射、中子和MHD等实时信号；输出加热功率、气体/颗粒、部分控制目标与协同指令。",
    "timescale": "模块多速率；历史ATM网络和各本地管理器具有不同周期，论文不支持统一数值。",
    "sensors": [],
    "actuators": [],
    "devices": [
      "JET"
    ],
    "validation": "JET多类高级场景反馈实验和多年运行；2000综述与后续RTCC升级资料互证。",
    "results": "JET（装置已结束实验运行，数据与方法仍是证据资产）。",
    "evidenceLevel": "E4",
    "deploymentLevel": "D4",
    "maturity": "JET（装置已结束实验运行，数据与方法仍是证据资产）。",
    "limitations": "长期扩展造成容量、可维护性和旧硬件约束，促成MARTe2增强原型；JET终止运行后需重视环境可复现和数据保全。",
    "twinRelevance": "可作为模型、状态、控制策略或验证证据接入控制数字孪生，但需版本、配置与适用域治理。",
    "papers": [
      {
        "title": "Plasma control at JET",
        "authors": "未完整列出",
        "year": 2000,
        "venue": "peer-reviewed",
        "doi": "10.1016/S0920-3796(00)00125-3",
        "url": "https://doi.org/10.1016/S0920-3796(00)00125-3",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "JET RTCC",
        "url": null,
        "status": "not-public",
        "relationship": "EUROfusion官方档案描述系统；完整RTCC源码未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "tags": [
      "JET",
      "RTCC",
      "RTDN",
      "PPCC"
    ],
    "sourceFile": "pcs_frameworks.json"
  }
];
export const controlDeviceProfiles: ControlDeviceProfile[] = [
  {
    "id": "dev-013",
    "name": "ARC",
    "country": "美国",
    "organization": "Commonwealth Fusion Systems概念/电厂项目",
    "status": "概念与设计阶段",
    "pcsArchitecture": "公开物理基础与概念设计；尚无可核验生产PCS；可继承SPARC模型/控制经验但需电厂级再设计",
    "timing": "未公开生产基线；需求从快速等离子体控制跨越秒—年尺度的电厂控制和资产管理。",
    "primaryTasks": [
      "T3",
      "T5",
      "T6",
      "T9"
    ],
    "sensors": [],
    "actuators": [],
    "representativeWorks": [
      "Overview of the physics basis for the ARC fusion power plant"
    ],
    "papers": [
      {
        "title": "Overview of the physics basis for the ARC fusion power plant",
        "authors": "J. C. Hillesheim, A. J. Creely, T. H. Eich, N. T. Howard, N. Leuthold et al.",
        "year": 2026,
        "venue": "Journal of Plasma Physics 92, E69",
        "doi": "10.1017/S0022377826101706",
        "url": "https://www.cambridge.org/core/services/aop-cambridge-core/content/view/B472B3A64EF71DA1899B9EFB65D7C390/S0022377826101706a.pdf/overview_of_the_physics_basis_for_the_arc_fusion_power_plant.pdf",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "ARC PCS",
        "url": null,
        "status": "not-public",
        "relationship": "项目尚处概念/设计；未发现生产PCS架构或代码。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "maturity": "电厂概念/物理设计，非装置闭环。",
    "gaps": "PCS与plant DCS总体架构；安全等级和独立保护；可用率/可维护性；氚与能量转换耦合；真实燃烧等离子体数据",
    "sources": []
  },
  {
    "id": "dev-003",
    "name": "ASDEX Upgrade",
    "country": "德国",
    "organization": "Max Planck Institute for Plasma Physics",
    "status": "运行中的研究装置",
    "pcsArchitecture": "Discharge Control System；配置驱动函数链；Linux/VxWorks/Solaris节点；实时诊断；Fenix flight simulator；ASTRA/SPIDER/Simulink；RAPTOR集成",
    "timing": "功能和节点多速率；DCS论文强调确定性任务图与分布式执行，不给全局单周期。I/O覆盖磁、动理学诊断、加热、气体、线圈和设备状态。",
    "primaryTasks": [
      "T0",
      "T2",
      "T3",
      "T4",
      "T5",
      "T6",
      "T7",
      "T8",
      "T9"
    ],
    "sensors": [
      "干涉仪",
      "Thomson 散射",
      "反射计/边缘密度",
      "粒子源和执行器状态",
      "磁诊断",
      "参数化平衡",
      "打击点/间隙",
      "线圈电流与力限值",
      "Mirnov线圈",
      "实时平衡",
      "EC沉积估计",
      "干涉仪/密度剖面",
      "边缘与核心辐射",
      "约束/储能",
      "辐射功率",
      "偏滤器热流/温度",
      "核心性能",
      "密度",
      "辐射测量",
      "偏滤器诊断",
      "Dα"
    ],
    "actuators": [
      "气体阀",
      "颗粒注入",
      "在 TCV 中补偿 ECCD 引起的密度扰动",
      "内部快 PF 线圈",
      "外部 PF 线圈",
      "ECCD",
      "可移动EC镜面",
      "弹丸注入器",
      "N2气阀",
      "加热功率",
      "燃料气体",
      "杂质气阀",
      "燃料气阀"
    ],
    "representativeWorks": [
      "ASDEX Upgrade Discharge Control System",
      "ASDEX Upgrade Discharge Control System—A real-time plasma control framework",
      "Fenix—ASDEX Upgrade's flight simulator"
    ],
    "papers": [
      {
        "title": "ASDEX Upgrade Discharge Control System—A real-time plasma control framework",
        "authors": "未完整列出",
        "year": 2014,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2014.01.001",
        "url": "https://doi.org/10.1016/j.fusengdes.2014.01.001",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Fenix—ASDEX Upgrade's flight simulator",
        "authors": "W. Treutterer, E. Fable, A. Gräter, F. Janky, O. Kudlacek et al.",
        "year": 2019,
        "venue": "Fusion Engineering and Design 146, 1073–1076",
        "doi": "10.1016/j.fusengdes.2019.02.008",
        "url": "https://pure.mpg.de/pubman/faces/ViewItemOverviewPage.jsp?itemId=item_2132788",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "AUG DCS/Fenix",
        "url": null,
        "status": "not-public",
        "relationship": "论文公开，完整生产分支/模型未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "maturity": "DCS为装置长期生产控制，Fenix用于开发/验证。",
    "gaps": "生产软件和装置模型受限；多OS/历史组件维护；模型在环覆盖度需显式量化；机器保护职责需与PCS区分",
    "sources": []
  },
  {
    "id": "dev-019",
    "name": "CFETR",
    "country": "中国",
    "organization": "中国聚变工程试验堆研究团队",
    "status": "工程设计/研发阶段",
    "pcsArchitecture": "DINA/集成模拟和控制概念研究；ITER/CODAC/PCS经验参考；尚无运行装置生产PCS",
    "timing": "设计需求跨微秒垂直环到电厂慢过程；具体基线随工程设计演进。",
    "primaryTasks": [
      "T3",
      "T5",
      "T6",
      "T7",
      "T8",
      "T9"
    ],
    "sensors": [],
    "actuators": [],
    "representativeWorks": [
      "Preliminary design of real-time plasma control system for CFETR"
    ],
    "papers": [
      {
        "title": "Preliminary design of real-time plasma control system for CFETR",
        "authors": "Q. Yuan, H. Guo, L. Yan, Z. Huang, J. Huang, B. Xiao, Y. Zheng, R. Zhang and Z. Luo",
        "year": 2021,
        "venue": "Fusion Engineering and Design 173, 112876",
        "doi": "10.1016/j.fusengdes.2021.112876",
        "url": "https://doi.org/10.1016/j.fusengdes.2021.112876",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "CFETR PCS",
        "url": null,
        "status": "not-public",
        "relationship": "链接为概念设计论文而非代码；项目无运行装置，未发现完整公开生产实现。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      },
      {
        "name": "DINA-IMAS",
        "url": "https://github.com/iterorganization/DINA-IMAS",
        "status": "official-direct",
        "relationship": "官方公开的使能代码，可用于方法研究；不是CFETR装置配置。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "maturity": "控制/模拟设计研究，尚无CFETR真机。",
    "gaps": "需求与架构冻结；燃烧等离子体数据；工程/安全分级；高可用与维护；完整数字线程",
    "sources": []
  },
  {
    "id": "dev-001",
    "name": "DIII-D",
    "country": "美国",
    "organization": "General Atomics / DOE Office of Science",
    "status": "运行中的研究装置",
    "pcsArchitecture": "GA PCS C/C++；category/phase；rtEFIT/isoflux；多处理器实时节点；专用ADC/DAC和实时网络；MDSplus；PCS闭环仿真",
    "timing": "多速率；历史采样基准约60 μs，RWM专用链路曾由约50 μs优化到约11 μs；不能将专环数字外推为全PCS周期。I/O覆盖磁、MSE/ECE/干涉仪、加热/束/RF、线圈、气阀和装置状态。",
    "primaryTasks": [
      "T0",
      "T1",
      "T2",
      "T3",
      "T4",
      "T5",
      "T6",
      "T7",
      "T8",
      "T9"
    ],
    "sensors": [
      "BES高带宽边缘涨落",
      "磁探针",
      "磁通环",
      "线圈/等离子体电流",
      "MSE（可选）",
      "压力约束（可选）",
      "MSE",
      "实时 EFIT",
      "磁诊断",
      "储能/β 信号",
      "实时磁平衡",
      "局部磁场导数/零点位置",
      "红外热流作为物理验证",
      "线圈电流",
      "等离子体电流",
      "rtEFIT 边界/X 点",
      "Thomson 散射",
      "实时平衡/密度",
      "H&CD 状态",
      "实时 q0/平衡",
      "βN/储能",
      "NBI 功率、能量和转矩估计",
      "实时剖面和全局量",
      "NBI/ECH/气体/Ip 命令"
    ],
    "actuators": [
      "无；离线分类研究",
      "无直接执行器；向多个 PCS 控制器提供状态",
      "等离子体电流目标",
      "NBI",
      "ECCD/ECH",
      "多组 PF 线圈",
      "PF 线圈",
      "快速垂直线圈",
      "电流电源",
      "NBI/ECH 等加热通道",
      "共向 NBI",
      "反向 NBI",
      "加热/电流驱动",
      "NBI 功率/转矩",
      "ECH",
      "气体",
      "Ip 目标",
      "ECCD 功率与可转向镜面",
      "Ip",
      "等离子体电流",
      "EC H&CD",
      "非轴对称RMP线圈",
      "中性束功率",
      "形状/等离子体参数参考"
    ],
    "representativeWorks": [
      "DIII-D Plasma Control System：可扩展多处理器实时控制平台",
      "DIII-D Integrated Plasma Control：模型驱动设计—验证—部署方法",
      "Current State of DIII-D Plasma Control System",
      "Recent Advancements in the DIII-D Plasma Control System",
      "Integrated Plasma Control in DIII-D"
    ],
    "papers": [
      {
        "title": "Current State of DIII-D Plasma Control System",
        "authors": "未完整列出",
        "year": 2020,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2019.111368",
        "url": "https://doi.org/10.1016/j.fusengdes.2019.111368",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Recent Advancements in the DIII-D Plasma Control System",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "peer-reviewed",
        "doi": "10.1109/TPS.2024.3415768",
        "url": "https://doi.org/10.1109/TPS.2024.3415768",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Integrated Plasma Control in DIII-D",
        "authors": "未完整列出",
        "year": 2005,
        "venue": "peer-reviewed",
        "doi": "10.13182/FST05-A1075",
        "url": "https://doi.org/10.13182/FST05-A1075",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "GA plasma-control page",
        "url": null,
        "status": "not-public",
        "relationship": "官方能力/合作入口，不是公共源码。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      },
      {
        "name": "OMAS",
        "url": "https://github.com/gafusion/omas",
        "status": "official-enabling",
        "relationship": "数据适配层，不是PCS。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "maturity": "同行评议论文记录长期装置闭环和日常实验。",
    "gaps": "核心PCS与装置配置受控；商业实时OS/硬件依赖；跨装置分支一致性难审计；安全资格与电厂级可用率不是研究PCS证据",
    "sources": []
  },
  {
    "id": "dev-005",
    "name": "EAST",
    "country": "中国",
    "organization": "中国科学院合肥物质科学研究院等离子体物理研究所",
    "status": "运行中的超导托卡马克",
    "pcsArchitecture": "早期GA PCS血缘；现代LingShu双冗余集群；定制实时Linux；共享内存/网络；模块化多进程；状态机；PCS-SDP",
    "timing": "官方机构报道定制实时Linux抖动低于5 μs并称双冗余可靠性99.99%；均应标为机构测试/声明，而非第三方认证。PCS各环多速率。",
    "primaryTasks": [
      "T0",
      "T1",
      "T2",
      "T3",
      "T5",
      "T6",
      "T7",
      "T8",
      "T9"
    ],
    "sensors": [
      "磁诊断",
      "POINT 偏振干涉测量",
      "线圈电流",
      "等离子体电流",
      "磁探针",
      "磁通环",
      "线圈/等离子体电流",
      "MSE（可选）",
      "压力约束（可选）",
      "光纤电流传感器 FOCS",
      "磁诊断/P-EFIT",
      "环电压",
      "位置和形状误差",
      "磁测量",
      "实时平衡",
      "PF 电流",
      "POINT 偏振干涉测量（剖面扩展）",
      "q/电流剖面估计",
      "储能/β",
      "Ip",
      "H&CD 状态",
      "Langmuir探针Te与Jsat",
      "辐射",
      "核心性能与杂质诊断"
    ],
    "actuators": [
      "无直接执行器；计划向 q/电流剖面控制提供状态",
      "无直接执行器；向多个 PCS 控制器提供状态",
      "PF 线圈",
      "快速垂直线圈",
      "低杂波加热/电流驱动功率",
      "PF线圈",
      "形状参考值",
      "快控线圈",
      "EAST H&CD 功率",
      "总等离子体电流",
      "N2/Ne/Ar杂质气阀",
      "燃料气体",
      "无；离线预测研究"
    ],
    "representativeWorks": [
      "EAST Plasma Control System：DIII-D PCS架构的超导长脉冲适配",
      "EAST稳态高级运行升级：打击点、漂移补偿与诊断自检",
      "PCS-SDP：CFETR/EAST可视化控制算法开发平台",
      "EAST plasma control system",
      "Upgrade of EAST plasma control system for steady-state advanced operation",
      "Custom application of PCS software development platform on EAST"
    ],
    "papers": [
      {
        "title": "EAST plasma control system",
        "authors": "未完整列出",
        "year": 2008,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2007.12.028",
        "url": "https://doi.org/10.1016/j.fusengdes.2007.12.028",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Upgrade of EAST plasma control system for steady-state advanced operation",
        "authors": "未完整列出",
        "year": 2018,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2018.02.079",
        "url": "https://doi.org/10.1016/j.fusengdes.2018.02.079",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Custom application of PCS software development platform on EAST",
        "authors": "未完整列出",
        "year": 2021,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2021.112314",
        "url": "https://doi.org/10.1016/j.fusengdes.2021.112314",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "LingShu PCS",
        "url": null,
        "status": "not-public",
        "relationship": "机构官方技术报道，无公共生产仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "maturity": "EAST长期实验及多代PCS论文；LingShu细节主要来自官方报道。",
    "gaps": "LingShu源码/接口/测试集未公开；可靠性数字缺第三方审计语境；长脉冲全链路数据漂移与热约束；GA旧分支到新平台迁移证据需版本化",
    "sources": []
  },
  {
    "id": "dev-018",
    "name": "EHL-2",
    "country": "中国",
    "organization": "新奥集团",
    "status": "规划/建设信息，以项目最新官方状态为准",
    "pcsArchitecture": "公开路线图/会议海报；未找到完整PCS技术基线；未来可复用EXL数据与控制资产但须独立验证",
    "timing": "未公开；任何具体接口均应在与装置团队的接口控制文件中确认。",
    "primaryTasks": [
      "T2",
      "T5",
      "T6",
      "T7",
      "T9"
    ],
    "sensors": [],
    "actuators": [],
    "representativeWorks": [
      "EHL-2控制需求与公开证据缺口",
      "ENN's Roadmap for Proton-Boron Fusion Based on Spherical Torus",
      "Overview of the Physics Design of the EHL-2 Spherical Torus for Proton-Boron Fusion"
    ],
    "papers": [
      {
        "title": "ENN's Roadmap for Proton-Boron Fusion Based on Spherical Torus",
        "authors": "M. Liu, H. Xie, Y. Wang, J. Dong, K. Feng, X. Gu, X. Huang, X. Jiang et al. and the ENN Fusion Team",
        "year": 2024,
        "venue": "Physics of Plasmas 31, 062507",
        "doi": "10.1063/5.0199112",
        "url": "https://doi.org/10.1063/5.0199112",
        "sourceType": "peer-reviewed roadmap"
      },
      {
        "title": "Overview of the Physics Design of the EHL-2 Spherical Torus for Proton-Boron Fusion",
        "authors": "H. Xie, Y. Liang, Y. Shi, X. Gu, X. Jiang, L. Dong, W. Liu, X. Wang et al. and the EHL-2 Team",
        "year": 2025,
        "venue": "30th IAEA Fusion Energy Conference, IAC-2989",
        "doi": null,
        "url": "https://conferences.iaea.org/event/392/contributions/35908/attachments/19881/36142/FEC2025_EHL2_poster-Xie-V4.pdf",
        "sourceType": "IAEA FEC original conference poster"
      }
    ],
    "code": [
      {
        "name": "EHL-2 PCS",
        "url": null,
        "status": "not-public",
        "relationship": "链接为项目海报而非代码；公开证据不足，未发现公开代码或可审计架构。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "maturity": "公开材料不足以证明PCS仿真、HIL或真机闭环。",
    "gaps": "控制需求基线；PCS/机器保护/安全职责；实时网络与I/O；模型在环/HIL；数据语义与版本治理；公开论文/代码",
    "sources": []
  },
  {
    "id": "dev-017",
    "name": "EXL-50 / EXL-50U",
    "country": "中国",
    "organization": "新奥集团",
    "status": "EXL系列实验与升级推进",
    "pcsArchitecture": "公开物理论文中的装置控制接口；PTEFIT预印本；完整PCS运行内核/OS/网络/保护未公开",
    "timing": "PTEFIT预印本报告约0.268 ms计算，不含完整I/O端到端；生产PCS周期与通道清单未找到公开证据。",
    "primaryTasks": [
      "T0",
      "T1",
      "T2",
      "T9"
    ],
    "sensors": [
      "磁探针与磁通环",
      "线圈电流",
      "装置几何与响应矩阵"
    ],
    "actuators": [
      "PF线圈电源（Rmax PID与isoflux反馈；具体通道映射未公开）"
    ],
    "representativeWorks": [
      "EXL-50/EXL-50U PTEFIT快速平衡重建与反馈探索",
      "Overview of EXL-50 research progress",
      "A Novel Numerical Algorithms Optimization Method with Machine Learning Frameworks: Application on Real-time Plasmas Equilibrium Reconstruction in EXL-50U Spherical Torus",
      "Strategy and experimental progress of the EXL-50U spherical torus in support of the EHL-2 project"
    ],
    "papers": [
      {
        "title": "Overview of EXL-50 research progress",
        "authors": "Y. Shi, Y. Wang, B. Liu, X. Song, S. Song, X. Jiang, D. Guo, D. Luo, X. Gu et al. and the EXL-50 Team",
        "year": 2025,
        "venue": "Nuclear Fusion 65, 092004",
        "doi": "10.1088/1741-4326/adf239",
        "url": "https://doi.org/10.1088/1741-4326/adf239",
        "sourceType": "peer-reviewed journal article"
      },
      {
        "title": "A Novel Numerical Algorithms Optimization Method with Machine Learning Frameworks: Application on Real-time Plasmas Equilibrium Reconstruction in EXL-50U Spherical Torus",
        "authors": "G.H. Zheng, S.F. Liu, X. Gu, Y.P. Zhang, J. Li, Y. Liu, X.C. Lun, L. Xing, J.G. Chen, Z.Y. Chen, Y. Yu, D. Guo, Z.Y. Yang, H.S. Xie, X.M. Song, Y.J. Shi and the EXL-50U Team",
        "year": 2026,
        "venue": "arXiv:2601.12378",
        "doi": "10.48550/arXiv.2601.12378",
        "url": "https://arxiv.org/abs/2601.12378",
        "sourceType": "original preprint, not peer-reviewed at audit date"
      },
      {
        "title": "Strategy and experimental progress of the EXL-50U spherical torus in support of the EHL-2 project",
        "authors": "Y. Shi, X. Song, D. Guo, X. Jiang, X. Gu et al. and the EXL-50U Team",
        "year": 2025,
        "venue": "Plasma Science and Technology 27, 024003",
        "doi": "10.1088/2058-6272/ad9e8f",
        "url": "https://pst.hfcas.ac.cn/article/cstr/32219.14.2058-6272/ad9e8f",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "PTEFIT",
        "url": null,
        "status": "not-public",
        "relationship": "无可核验官方公共代码仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "maturity": "EXL实验数据和预印本算法证据；完整PCS成熟度不可由公开资料判定。",
    "gaps": "完整PCS架构/时序/I-O；生产代码与数据接口；PTEFIT同行评议与独立复现；保护和HIL证据",
    "sources": []
  },
  {
    "id": "dev-014",
    "name": "HL-2A",
    "country": "中国",
    "organization": "核工业西南物理研究院",
    "status": "研究装置",
    "pcsArchitecture": "装置专用控制与DAQ；实时诊断；机器学习破裂预测器；MGI/SMBI接口",
    "timing": "公开破裂预测论文报告在线处理382炮并触发MGI/SMBI；完整PCS周期和I/O拓扑未公开。",
    "primaryTasks": [
      "T2",
      "T4",
      "T7",
      "T9"
    ],
    "sensors": [
      "实时破裂预测特征（磁、密度与辐射等；完整通道清单未公开）"
    ],
    "actuators": [
      "MGI/SMBI缓解触发"
    ],
    "representativeWorks": [
      "Real-time disruption prediction and mitigation on HL-2A"
    ],
    "papers": [
      {
        "title": "Real-time disruption prediction and mitigation on HL-2A",
        "authors": "Z. Yang, F. Xia, X. Song, Z. Gao, Y. Li, X. Gong, Y. Dong, Y. Zhang, C. Chen et al.",
        "year": 2022,
        "venue": "Fusion Engineering and Design 182, 113223",
        "doi": "10.1016/j.fusengdes.2022.113223",
        "url": "https://doi.org/10.1016/j.fusengdes.2022.113223",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "HL-2A PCS/predictor",
        "url": null,
        "status": "not-public",
        "relationship": "论文公开，训练数据/代码/生产配置未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "maturity": "特定预测—缓解链有在线真机证据；全PCS成熟度资料不完整。",
    "gaps": "完整PCS公开资料；训练分布漂移；误触发成本；代码/数据复现；HL-2M迁移证据",
    "sources": []
  },
  {
    "id": "dev-015",
    "name": "HL-2M",
    "country": "中国",
    "organization": "核工业西南物理研究院",
    "status": "实验与控制系统持续建设",
    "pcsArchitecture": "DIII-D PCS框架；三节点实时Linux；D-TACQ2106；反射内存；磁/电源接口",
    "timing": "设计慢环1 ms、快速垂直环200 μs；磁探针/磁通环输入，经RFM跨节点，输出PF/垂直电源。",
    "primaryTasks": [
      "T1",
      "T2",
      "T7",
      "T9"
    ],
    "sensors": [
      "磁探针与磁通环",
      "线圈与电源状态"
    ],
    "actuators": [
      "PF线圈电源",
      "快速垂直稳定电源"
    ],
    "representativeWorks": [
      "HL-2M新型等离子体控制系统",
      "A new scheme of plasma control system based on real-time Linux cluster for HL-2M"
    ],
    "papers": [
      {
        "title": "A new scheme of plasma control system based on real-time Linux cluster for HL-2M",
        "authors": "未完整列出",
        "year": 2023,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2023.113763",
        "url": "https://doi.org/10.1016/j.fusengdes.2023.113763",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "HL-2M PCS",
        "url": null,
        "status": "not-public",
        "relationship": "生产分支未公开。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "maturity": "2023论文以平台和初步仿真为主要证据；后续真机证据需新增论文核验。",
    "gaps": "真机闭环验收；完整磁标定/电源模型；异常工况和故障注入；生产源码/配置",
    "sources": []
  },
  {
    "id": "dev-009",
    "name": "ITER",
    "country": "国际",
    "organization": "ITER Organization",
    "status": "建设与系统集成，尚无等离子体运行",
    "pcsArchitecture": "iPCS功能架构；PCSSP；MBSE/需求追踪；CODAC Core System；EPICS 7；RHEL；Fast Controllers；IMAS；DINA-IMAS",
    "timing": "从快速垂直环到慢监控多速率；CODAC连接约220个plant I&C。机器保护和人员/核安全与CODAC/PCS显式解耦。",
    "primaryTasks": [
      "T0",
      "T1",
      "T2",
      "T3",
      "T4",
      "T5",
      "T6",
      "T7",
      "T8",
      "T9"
    ],
    "sensors": [
      "LIUQE 平衡",
      "等离子体电流",
      "ECE/密度",
      "MSE（若可用）",
      "H&CD 状态",
      "边界磁通",
      "磁场测量",
      "线圈电流",
      "可扩展内部剖面诊断",
      "磁探针与磁通环的合成测量",
      "PF/CS 线圈电流",
      "边界间隙/垂直速度估计",
      "磁诊断",
      "PF/VS 线圈电流",
      "边界间隙",
      "β/内感扰动估计",
      "磁测量",
      "垂直位置/速度估计",
      "线圈状态",
      "聚变功率",
      "核心密度/温度",
      "辐射",
      "靶板温度/热流",
      "中性压力"
    ],
    "actuators": [
      "无直接执行器；预测 Ip、ECCD/ECRH 等动作对 q 的影响",
      "无直接执行器；输出给 JET q/剖面和形状控制",
      "中央螺线管",
      "PF 线圈",
      "快速垂直稳定线圈/电压命令",
      "6 个 PF 线圈",
      "2 个真空室内 VS 线圈",
      "ITER真空室内垂直稳定执行器",
      "超导PF线圈",
      "外加热",
      "弹丸",
      "Ne注入",
      "抽气",
      "NBI",
      "ICRH/ECRH",
      "弹丸/气体加料",
      "D/T 气体和颗粒",
      "ECH/ECCD",
      "ICRH",
      "碎裂弹丸注入器",
      "推进气体与低温制备系统",
      "模拟中的杂质注入、壁与电场参数",
      "任务降级",
      "参考值覆盖"
    ],
    "representativeWorks": [
      "ITER Plasma Control System功能架构",
      "ITER Plasma Control System Simulation Platform（PCSSP）",
      "ITER PCS系统工程与模型驱动设计/部署策略",
      "Architectural concept for the ITER Plasma Control System",
      "The ITER Plasma Control System Simulation Platform",
      "Strategy to systematically design and deploy the ITER plasma control system: A system engineering and model-based design approach"
    ],
    "papers": [
      {
        "title": "Architectural concept for the ITER Plasma Control System",
        "authors": "未完整列出",
        "year": 2014,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2014.02.079",
        "url": "https://doi.org/10.1016/j.fusengdes.2014.02.079",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "The ITER Plasma Control System Simulation Platform",
        "authors": "未完整列出",
        "year": 2015,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2015.01.009",
        "url": "https://doi.org/10.1016/j.fusengdes.2015.01.009",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Strategy to systematically design and deploy the ITER plasma control system: A system engineering and model-based design approach",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2024.114464",
        "url": "https://doi.org/10.1016/j.fusengdes.2024.114464",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "PCSSP",
        "url": "https://github.com/iterorganization/PCSSP",
        "status": "official-direct",
        "relationship": "MATLAB/Simulink开源平台，不含全部模型。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "DINA-IMAS",
        "url": "https://github.com/iterorganization/DINA-IMAS",
        "status": "official-direct",
        "relationship": "公开接口化实现。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "IMAS",
        "url": "https://github.com/iterorganization/IMAS-Python",
        "status": "official-enabling",
        "relationship": "开放API/数据字典。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "CODAC distribution",
        "url": null,
        "status": "not-public",
        "relationship": "面向注册贡献者分发。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "maturity": "架构、仿真平台、系统集成和KSTAR先行部署；ITER真机闭环尚不存在。",
    "gaps": "燃烧等离子体不确定性；辐照下诊断退化；执行器饱和与低机时；安全/保护独立资格；全配置和plant模型并非都公开",
    "sources": []
  },
  {
    "id": "dev-016",
    "name": "J-TEXT",
    "country": "中国",
    "organization": "华中科技大学",
    "status": "运行中的研究装置",
    "pcsArchitecture": "JRTF；中央控制/定时；EPICS设备层；装置DAQ/归档；实验专用执行器接口",
    "timing": "任务多速率；JRTF处理磁、密度、辐射和MHD等信号，输出到线圈/电源/气体等；EPICS不作为快速环周期证明。",
    "primaryTasks": [
      "T4",
      "T8",
      "T9"
    ],
    "sensors": [
      "磁、密度、辐射与MHD实时信号"
    ],
    "actuators": [
      "线圈与电源",
      "气体及实验专用执行器接口"
    ],
    "representativeWorks": [
      "J-TEXT实时框架（JRTF）与中央控制集成",
      "A new implementation of data process in J-TEXT real-time framework",
      "JRTF: A flexible software framework for real-time control in magnetic confinement nuclear fusion experiments"
    ],
    "papers": [
      {
        "title": "A new implementation of data process in J-TEXT real-time framework",
        "authors": "未完整列出",
        "year": 2018,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2018.02.060",
        "url": "https://doi.org/10.1016/j.fusengdes.2018.02.060",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "JRTF: A flexible software framework for real-time control in magnetic confinement nuclear fusion experiments",
        "authors": "M. Zhang, G. Z. Zheng, W. Zheng, Z. Chen, T. Yuan and C. Yang",
        "year": 2016,
        "venue": "IEEE Transactions on Nuclear Science 63, 1070–1075",
        "doi": "10.1109/TNS.2016.2518709",
        "url": "https://doi.org/10.1109/TNS.2016.2518709",
        "sourceType": "peer-reviewed journal article"
      }
    ],
    "code": [
      {
        "name": "JRTF",
        "url": null,
        "status": "not-public",
        "relationship": "论文实现，无公共仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      },
      {
        "name": "EPICS Base",
        "url": "https://github.com/epics-base/epics-base",
        "status": "official-enabling",
        "relationship": "通用设备层。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "maturity": "JRTF有J-TEXT在线应用；具体闭环按独立控制论文判断。",
    "gaps": "生产框架开源性；驱动/配置/标定；控制任务目录和版本基线；跨装置语义",
    "sources": []
  },
  {
    "id": "dev-004",
    "name": "JET",
    "country": "欧洲/英国",
    "organization": "UKAEA for EUROfusion（历史运行）",
    "status": "实验运行已结束，数据/方法继续研究",
    "pcsArchitecture": "PPCC；RTPS/RTDN；RTCC；WALLS；VTM；多层保护；MARTe/MARTe2部分系统及升级原型；MDSplus",
    "timing": "多速率；WALLS论文称所有模块执行低于1 ms，此数不是传感器—执行器总响应。I/O覆盖磁、动理学/辐射/壁诊断、加热、气体与保护。",
    "primaryTasks": [
      "T0",
      "T2",
      "T3",
      "T4",
      "T5",
      "T6",
      "T7",
      "T9"
    ],
    "sensors": [
      "LIUQE 平衡",
      "等离子体电流",
      "ECE/密度",
      "MSE（若可用）",
      "H&CD 状态",
      "边界磁通",
      "磁场测量",
      "线圈电流",
      "可扩展内部剖面诊断",
      "磁探针",
      "实时垂直位置估计",
      "JET 实时边界重建",
      "磁测量",
      "PF 电流",
      "形状/间隙误差",
      "实时 q/电流密度",
      "ECE 电子温度",
      "密度/压力",
      "实时 q 剖面（磁、Faraday/极化与平衡）",
      "H&CD 功率",
      "温度/压力辅助信号",
      "一匝环电压",
      "磁重建电流二阶矩",
      "外靶Langmuir探针阵列"
    ],
    "actuators": [
      "无直接执行器；预测 Ip、ECCD/ECRH 等动作对 q 的影响",
      "无直接执行器；输出给 JET q/剖面和形状控制",
      "增强径向场放大器",
      "垂直稳定线圈",
      "JET PF 线圈与电源",
      "NBI",
      "ICRH",
      "LHCD",
      "3.7 GHz LHCD 功率/波形",
      "氮气注入",
      "模拟中的杂质注入、壁与电场参数",
      "无；论文为预测器离线验证",
      "形状/电流参考覆盖",
      "密度目标",
      "NBI/ICRH等加热降额",
      "终止序列",
      "无；所述战役中输出记录而非自动缓解",
      "大剂量气体注入阀"
    ],
    "representativeWorks": [
      "JET Real-Time Central Controller与实时数据网络",
      "JET WALLS—VTM—RTPS：等离子体壁负荷监测与协调终止",
      "Plasma control at JET",
      "The software and hardware architecture of the real-time protection of in-vessel components in JET-ILW",
      "The JET real-time plasma-wall load monitoring system"
    ],
    "papers": [
      {
        "title": "Plasma control at JET",
        "authors": "未完整列出",
        "year": 2000,
        "venue": "peer-reviewed",
        "doi": "10.1016/S0920-3796(00)00125-3",
        "url": "https://doi.org/10.1016/S0920-3796(00)00125-3",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "The software and hardware architecture of the real-time protection of in-vessel components in JET-ILW",
        "authors": "未完整列出",
        "year": 2019,
        "venue": "peer-reviewed",
        "doi": "10.1088/1741-4326/ab1a79",
        "url": "https://doi.org/10.1088/1741-4326/ab1a79",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "The JET real-time plasma-wall load monitoring system",
        "authors": "未完整列出",
        "year": 2014,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2013.10.010",
        "url": "https://doi.org/10.1016/j.fusengdes.2013.10.010",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "MARTe2",
        "url": "https://vcis-gitlab.f4e.europa.eu/aneto/MARTe2",
        "status": "official-enabling",
        "relationship": "使能框架；JET RTCC/RTPS/WALLS/VTM装置代码不公开。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "JET data",
        "url": null,
        "status": "not-public",
        "relationship": "按EUROfusion规则访问。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "maturity": "生产系统在JET长期闭环/保护运行。",
    "gaps": "生产代码与配置未公开；历史硬件可维护性；MARTe2论文多为局部/升级原型，不能写成全站迁移；保护结果不直接转移到新装置",
    "sources": []
  },
  {
    "id": "dev-008",
    "name": "JT-60SA",
    "country": "日本/欧盟",
    "organization": "QST / Fusion for Energy",
    "status": "commissioning与分阶段实验",
    "pcsArchitecture": "Central Control System；Real-Time Plasma Control；设备/子系统控制；时钟与事件；DINA/控制仿真工具；分层interlock",
    "timing": "多速率；公开官方页未给全系统端到端周期。接口覆盖磁/电源/线圈、加热、气体、真空、设备状态与时序。",
    "primaryTasks": [
      "T1",
      "T2",
      "T3",
      "T7",
      "T8",
      "T9"
    ],
    "sensors": [
      "电源电流/电压",
      "断路器与冷却状态",
      "联锁",
      "磁体状态",
      "PF/CS 电流",
      "环电压",
      "击穿区磁场",
      "初始等离子体电流",
      "双色CO2干涉仪",
      "相位/条纹质量标志"
    ],
    "actuators": [
      "电源参考",
      "断路/停机",
      "放电序列控制",
      "CS",
      "EF/PF 线圈",
      "预磁化波形",
      "气体加料",
      "异常时反馈抑制/中止接口"
    ],
    "representativeWorks": [
      "JT-60SA中央控制、实时等离子体控制与保护分层",
      "JT-60SA磁体电源监督与保护控制",
      "A simulation tool to design and test control laws for JT60-SA scenarios",
      "JT-60SA control system"
    ],
    "papers": [
      {
        "title": "A simulation tool to design and test control laws for JT60-SA scenarios",
        "authors": "未完整列出",
        "year": 2023,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2023.113631",
        "url": "https://doi.org/10.1016/j.fusengdes.2023.113631",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "JT-60SA control system",
        "authors": "JT-60SA project",
        "year": 2024,
        "venue": "JT-60SA official website",
        "doi": null,
        "url": "https://www.jt60sa.org/wp/control-system/",
        "sourceType": "official project documentation"
      }
    ],
    "code": [
      {
        "name": "JT-60SA PCS/configuration",
        "url": null,
        "status": "not-public",
        "relationship": "官方职责描述，无公共生产仓库。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "maturity": "设备commissioning和仿真证据；高性能全任务闭环需逐论文确认。",
    "gaps": "装置状态快速演进；PCS代码与参数受限；仿真到真机覆盖矩阵未公开；保护/PCS职责需保持分离",
    "sources": []
  },
  {
    "id": "dev-006",
    "name": "KSTAR",
    "country": "韩国",
    "organization": "Korea Institute of Fusion Energy",
    "status": "运行中的超导托卡马克",
    "pcsArchitecture": "GA PCS血缘/本地升级；实时Linux与DAQ；反射内存/确定性网络；装置专用算法；2026 ITER iPCS真机部署活动",
    "timing": "多速率，公开论文不足以给统一周期；I/O覆盖磁、密度、加热、气体、异常事件和设备状态。",
    "primaryTasks": [
      "T0",
      "T2",
      "T3",
      "T4",
      "T5",
      "T6",
      "T7",
      "T8",
      "T9"
    ],
    "sensors": [
      "多通道 MSE",
      "NBI 诊断束",
      "磁测量",
      "实时平衡",
      "磁探针",
      "磁通环",
      "PF 线圈电流",
      "线圈/等离子体电流",
      "MSE（可选）",
      "压力约束（可选）",
      "相对磁通",
      "上下对称磁通环电压差",
      "rtEFIT/ISOFLUX 形状",
      "实时 ECE Te 剖面",
      "NBI/ECH 功率",
      "平衡/密度",
      "Dα",
      "平衡与剖面诊断",
      "储能/约束指标",
      "线平均密度",
      "现有RWM传感器",
      "候选模态传感器",
      "Langmuir探针",
      "辐射/靶板状态"
    ],
    "actuators": [
      "无直接执行器；计划服务 NBI/ECCD/Ip 的 q 剖面控制",
      "无直接执行器；为 KSTAR ISOFLUX 提供候选边界状态",
      "无直接执行器；向多个 PCS 控制器提供状态",
      "IVC 快控线圈",
      "超导 PF 线圈",
      "NBI",
      "ECH",
      "非轴对称RMP线圈",
      "无；论文验证实时分类，未闭环改变加热/气体",
      "KSTAR三维场线圈",
      "杂质气体注入",
      "NBI-1功率/脉宽调制",
      "PF/垂直稳定控制电压",
      "异常处置逻辑"
    ],
    "representativeWorks": [
      "KSTAR PCS升级与长脉冲高级集成控制",
      "Achievements and lessons learned from the operation of KSTAR plasma control system upgrade",
      "Advances and challenges in KSTAR plasma control toward long-pulse, high-performance experiments",
      "On KSTAR, ITER’s plasma control system successfully takes charge"
    ],
    "papers": [
      {
        "title": "Achievements and lessons learned from the operation of KSTAR plasma control system upgrade",
        "authors": "未完整列出",
        "year": 2018,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2018.02.066",
        "url": "https://doi.org/10.1016/j.fusengdes.2018.02.066",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Advances and challenges in KSTAR plasma control toward long-pulse, high-performance experiments",
        "authors": "未完整列出",
        "year": 2020,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2020.111622",
        "url": "https://doi.org/10.1016/j.fusengdes.2020.111622",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "On KSTAR, ITER’s plasma control system successfully takes charge",
        "authors": "未完整列出",
        "year": 2026,
        "venue": "ITER official",
        "doi": null,
        "url": "https://www.iter.org/node/20687/kstar-iters-plasma-control-system-successfully-takes-charge",
        "sourceType": "ITER official"
      }
    ],
    "code": [
      {
        "name": "KSTAR PCS/iPCS branch",
        "url": null,
        "status": "not-public",
        "relationship": "部署由ITER官方确认，源码未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "maturity": "KSTAR本地PCS长期真机；2026 iPCS活动属于新增部署证据。",
    "gaps": "iPCS技术论文尚需补足时序/覆盖/验收清单；生产源码受限；长脉冲诊断漂移和执行器老化；KSTAR结果不能等同ITER条件",
    "sources": []
  },
  {
    "id": "dev-011",
    "name": "MAST-U",
    "country": "英国",
    "organization": "UK Atomic Energy Authority",
    "status": "运行中的球形托卡马克",
    "pcsArchitecture": "GA PCS；category/phase；装置专用虚拟电路；FIESTA模型；磁与气阀I/O；站点数据系统",
    "timing": "多速率；大PF线圈组与11组气阀构成强耦合执行器接口。论文未给可外推的统一周期。",
    "primaryTasks": [
      "T1",
      "T2",
      "T5",
      "T9"
    ],
    "sensors": [
      "可见光/光谱排热前沿",
      "靶板热流/红外诊断",
      "密度与磁构型",
      "快速成像",
      "Fulcher发射前沿",
      "平衡与偏滤器几何"
    ],
    "actuators": [
      "偏滤器/主腔气体注入",
      "Super-X 磁构型（由形状回路维持）",
      "偏滤器燃料/气体注入"
    ],
    "representativeWorks": [
      "MAST Upgrade Plasma Control System",
      "The MAST Upgrade plasma control system"
    ],
    "papers": [
      {
        "title": "The MAST Upgrade plasma control system",
        "authors": "未完整列出",
        "year": 2020,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2020.111764",
        "url": "https://doi.org/10.1016/j.fusengdes.2020.111764",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "MAST-U GA PCS branch",
        "url": null,
        "status": "not-public",
        "relationship": "论文公开，代码受控。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "maturity": "commissioning及MAST-U真机运行。",
    "gaps": "强耦合磁执行器；Super-X多目标权衡；FIESTA/PCS配置受控；跨装置复现",
    "sources": []
  },
  {
    "id": "dev-010",
    "name": "NSTX-U",
    "country": "美国",
    "organization": "Princeton Plasma Physics Laboratory",
    "status": "升级/恢复与实验准备（具体状态需查当期官方页）",
    "pcsArchitecture": "GA PCS；64-bit Concurrent RedHawk Linux；PSRTC；rtEFIT/isoflux；Fibre Channel/FPDP；MDSplus；GSevolve开发",
    "timing": "历史NSTX论文报告252路、5 kHz采集；NSTX-U升级采用现代串行I/O，模块多速率。应避免用旧系统数字描述恢复后的当前配置。",
    "primaryTasks": [
      "T1",
      "T2",
      "T4",
      "T5",
      "T6",
      "T7",
      "T9"
    ],
    "sensors": [
      "磁扰动",
      "快离子诊断",
      "中子率",
      "NBI状态",
      "VUV阵列",
      "bolometer",
      "边缘/偏滤器诊断",
      "rtEFIT/MSE q 与电流剖面",
      "β/储能",
      "NBI 源和密度",
      "磁测量",
      "实时平衡",
      "垂直位置/速度",
      "执行器状态"
    ],
    "actuators": [
      "不同几何NBI源",
      "束功率与时序",
      "计划中的杂质注入",
      "加热/场景协调",
      "NBI 功率/能量/束源组合",
      "Ip/CS-PF（场景阶段）",
      "PF/垂直稳定控制电压",
      "异常处置逻辑"
    ],
    "representativeWorks": [
      "NSTX-U控制系统升级：64位实时Linux与现代I/O",
      "NSTX-U Control System Upgrades",
      "Plasma boundary shape control and real-time equilibrium reconstruction on NSTX-U",
      "Plasma shape and position control development for NSTX-U using the GSEvolve plasma simulator"
    ],
    "papers": [
      {
        "title": "NSTX-U Control System Upgrades",
        "authors": "未完整列出",
        "year": 2014,
        "venue": "peer-reviewed",
        "doi": null,
        "url": "https://bp-pub.pppl.gov/pub_report/2014/PPPL-5045-abs.html",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Plasma boundary shape control and real-time equilibrium reconstruction on NSTX-U",
        "authors": "未完整列出",
        "year": 2018,
        "venue": "peer-reviewed",
        "doi": "10.1088/1741-4326/aaa4d0",
        "url": "https://doi.org/10.1088/1741-4326/aaa4d0",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Plasma shape and position control development for NSTX-U using the GSEvolve plasma simulator",
        "authors": "未完整列出",
        "year": 2025,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2025.115302",
        "url": "https://doi.org/10.1016/j.fusengdes.2025.115302",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "NSTX-U GA PCS/GSevolve configuration",
        "url": null,
        "status": "not-public",
        "relationship": "论文公开，生产环境未公开。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      },
      {
        "name": "MDSplus",
        "url": "https://github.com/MDSplus/mdsplus",
        "status": "official-enabling",
        "relationship": "数据系统。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      }
    ],
    "maturity": "历史NSTX/NSTX-U闭环运行；恢复后具体配置需重新验证。",
    "gaps": "商业实时OS；恢复后配置差异；生产代码/模型受限；实验数据访问和标定",
    "sources": []
  },
  {
    "id": "dev-020",
    "name": "RFX-mod / RFX-mod2",
    "country": "意大利",
    "organization": "Consorzio RFX / EUROfusion",
    "status": "RFX-mod2升级与集成",
    "pcsArchitecture": "MARTe/MARTe2；高速磁I/O；RAPTOR集成；MDSplus；装置专用控制矩阵",
    "timing": "快速磁控制与较慢状态观测多速率；公开论文需逐模块看周期，不能合并为单一全机频率。",
    "primaryTasks": [
      "T0",
      "T2",
      "T3",
      "T4",
      "T9"
    ],
    "sensors": [
      "高速磁I/O",
      "RAPTOR状态与剖面观测量"
    ],
    "actuators": [
      "多输入多输出磁控制线圈（装置专用控制矩阵）"
    ],
    "representativeWorks": [
      "RAPTOR实时状态观测器与剖面控制链",
      "Integration of the state observer RAPTOR in the real-time MARTe framework at RFX-mod"
    ],
    "papers": [
      {
        "title": "Integration of the state observer RAPTOR in the real-time MARTe framework at RFX-mod",
        "authors": "未完整列出",
        "year": 2017,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2017.04.122",
        "url": "https://doi.org/10.1016/j.fusengdes.2017.04.122",
        "sourceType": "peer-reviewed"
      }
    ],
    "code": [
      {
        "name": "MARTe2",
        "url": "https://vcis-gitlab.f4e.europa.eu/aneto/MARTe2",
        "status": "official-enabling",
        "relationship": "开源执行框架。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "RAPTOR",
        "url": null,
        "status": "not-public",
        "relationship": "需授权。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "maturity": "RFX-mod有在线集成证据；RFX-mod2升级后的完整闭环基线需新论文确认。",
    "gaps": "升级后配置验证；装置专用磁矩阵/驱动受限；RAPTOR访问限制；全链路HIL/回放公开度",
    "sources": []
  },
  {
    "id": "dev-012",
    "name": "SPARC",
    "country": "美国",
    "organization": "Commonwealth Fusion Systems / MIT collaboration",
    "status": "在建装置",
    "pcsArchitecture": "neutrino实时框架；无锁进程/节点通信；COMET plant模型；HOOTL/HITL；GSPulse设计工具",
    "timing": "公开会议材料未给完整WCET/抖动表；计划I/O涵盖磁、辐射、PFC、执行器和机器状态。当前主要为仿真/HIL。",
    "primaryTasks": [
      "T0",
      "T1",
      "T2",
      "T6",
      "T7",
      "T9"
    ],
    "sensors": [
      "规划中的磁、平衡、辐射、PFC与机器状态量"
    ],
    "actuators": [
      "规划中的线圈、加热/加料与终止接口（待投运验证）"
    ],
    "representativeWorks": [
      "SPARC实时控制框架neutrino与COMET闭环开发环境",
      "GSPulse可微Grad–Shafranov脉冲设计与反馈仿真",
      "The SPARC plasma control system",
      "GSPulse: A differentiable free-boundary Grad-Shafranov solver for tokamak pulse design and control"
    ],
    "papers": [
      {
        "title": "The SPARC plasma control system",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "APS-DPP original conference abstract",
        "doi": null,
        "url": "https://meetings-archive.aps.org/dpp/2024/np12/105/",
        "sourceType": "APS-DPP original conference abstract"
      },
      {
        "title": "GSPulse: A differentiable free-boundary Grad-Shafranov solver for tokamak pulse design and control",
        "authors": "未完整列出",
        "year": 2025,
        "venue": "original preprint; peer-review status must be rechecked",
        "doi": null,
        "url": "https://arxiv.org/abs/2506.21760",
        "sourceType": "original preprint; peer-review status must be rechecked"
      }
    ],
    "code": [
      {
        "name": "GSPulse_public",
        "url": "https://github.com/jwai-cfs/GSPulse_public",
        "status": "official-direct",
        "relationship": "公开设计代码。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "neutrino/COMET",
        "url": null,
        "status": "not-public",
        "relationship": "生产框架/模型未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "maturity": "HOOTL/HITL和跨装置模型对照；无SPARC等离子体闭环。",
    "gaps": "首机I/O与commissioning；燃烧等离子体模型失配；生产代码公开性；安全/保护资格；最坏时序公开证据",
    "sources": []
  },
  {
    "id": "dev-002",
    "name": "TCV",
    "country": "瑞士",
    "organization": "EPFL Swiss Plasma Center",
    "status": "运行中的研究装置",
    "pcsArchitecture": "Simulink设计与代码生成；MARTe2；PREEMPT_RT Linux；双主节点；MDSplus；EtherCAT/DDS迁移；LIUQE/MEQ；RAPTOR/RAPDENS；SAMONE",
    "timing": "全机主控制10 kHz；硬件测试显示50 kHz潜力；LIUQE约1 ms。192路前端最高1 MS/s，经光纤送双节点，另接共享内存/网络和EtherCAT。",
    "primaryTasks": [
      "T0",
      "T1",
      "T2",
      "T3",
      "T4",
      "T5",
      "T7",
      "T8",
      "T9"
    ],
    "sensors": [
      "干涉仪",
      "Thomson 散射",
      "反射计/边缘密度",
      "粒子源和执行器状态",
      "LIUQE 平衡",
      "等离子体电流",
      "ECE/密度",
      "MSE（若可用）",
      "H&CD 状态",
      "133 路磁测量",
      "线圈电流",
      "真空室电流模型",
      "可选内部诊断约束",
      "TCV 实时磁状态/LIUQE",
      "内层磁控制状态",
      "形状输出与约束",
      "磁测量",
      "目标形状描述",
      "RAPTOR/LIUQE q 估计",
      "β/储能",
      "密度观测器",
      "EC 功率与总电流",
      "ECE",
      "实时平衡"
    ],
    "actuators": [
      "气体阀",
      "颗粒注入",
      "在 TCV 中补偿 ECCD 引起的密度扰动",
      "无直接执行器；预测 Ip、ECCD/ECRH 等动作对 q 的影响",
      "无直接执行器；作为形状、q 剖面与 RAPTOR 控制的状态服务",
      "经内层回路作用的 PF 线圈参考",
      "TCV 19 路可控线圈电压",
      "两组 ECRH/ECCD gyrotron",
      "等离子体电流请求",
      "ECRH/ECCD功率",
      "EC沉积位置",
      "D2气阀",
      "N2杂质气阀",
      "TCV 19 路线圈",
      "电流目标",
      "加热/燃料的场景波形",
      "电流、加热、密度和形状轨迹",
      "气体/加热",
      "形状与电流参考",
      "任务使能/禁用",
      "ECRH/ECCD",
      "加热与电流驱动",
      "气体",
      "任务参考值"
    ],
    "representativeWorks": [
      "MEQ实时平衡重建、前馈与磁控制工具箱",
      "TCV数字实时控制系统：Simulink自动代码生成与MARTe2全机运行",
      "MARTe2通用确定性实时执行框架",
      "RAPTOR实时状态观测器与剖面控制链",
      "TCV分布式反馈控制系统的架构与投运",
      "Overview of the TCV digital real-time plasma control system and its applications",
      "Distributed digital real-time control system for the TCV tokamak and its applications",
      "Architecture and commissioning of the TCV distributed feedback control system"
    ],
    "papers": [
      {
        "title": "Overview of the TCV digital real-time plasma control system and its applications",
        "authors": "未完整列出",
        "year": 2024,
        "venue": "peer-reviewed open access",
        "doi": "10.1016/j.fusengdes.2024.114640",
        "url": "https://doi.org/10.1016/j.fusengdes.2024.114640",
        "sourceType": "peer-reviewed open access"
      },
      {
        "title": "Distributed digital real-time control system for the TCV tokamak and its applications",
        "authors": "未完整列出",
        "year": 2017,
        "venue": "peer-reviewed",
        "doi": "10.1088/1741-4326/aa6120",
        "url": "https://doi.org/10.1088/1741-4326/aa6120",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "Architecture and commissioning of the TCV distributed feedback control system",
        "authors": "未完整列出",
        "year": 2010,
        "venue": "peer-reviewed conference",
        "doi": "10.1109/RTC.2010.5750487",
        "url": "https://doi.org/10.1109/RTC.2010.5750487",
        "sourceType": "peer-reviewed conference"
      }
    ],
    "code": [
      {
        "name": "MEQ",
        "url": "https://gitlab.epfl.ch/spc/public/meq/meq",
        "status": "official-direct",
        "relationship": "Apache-2.0，含LIUQE/FBT/FGE等。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "MARTe2",
        "url": "https://vcis-gitlab.f4e.europa.eu/aneto/MARTe2",
        "status": "official-enabling",
        "relationship": "实时运行框架。",
        "artifactType": "software",
        "access": "public",
        "license": "未标注"
      },
      {
        "name": "RAPTOR",
        "url": null,
        "status": "not-public",
        "relationship": "主代码需签署CLA/获授权。",
        "artifactType": "software",
        "access": "restricted",
        "license": "未标注"
      }
    ],
    "maturity": "2024综述证明MARTe2全机运行及多项真机闭环。",
    "gaps": "Simulink/代码生成商业依赖；完整TCV配置和驱动未全开；DDS新网络仍需持续验证；从灵活研究装置到电厂可靠性需工程化",
    "sources": []
  },
  {
    "id": "dev-007",
    "name": "WEST",
    "country": "法国",
    "organization": "CEA-IRFM / EUROfusion",
    "status": "运行中的长脉冲钨装置",
    "pcsArchitecture": "Tore Supra控制遗产；中央PCS；实时诊断/共享内存；红外Wall Monitoring System；RF执行器接口",
    "timing": "多速率；红外WMS→共享内存→PCS→五套RF天线。论文统计C4阶段63次触发、97%成功、0.2%误报，仅适用特定样本。",
    "primaryTasks": [
      "T0",
      "T2",
      "T4",
      "T5",
      "T6",
      "T7",
      "T9"
    ],
    "sensors": [
      "红外相机",
      "图像元数据",
      "壁几何",
      "6个红外视场",
      "部件温度ROI",
      "加热系统状态"
    ],
    "actuators": [
      "与加热天线指令接口集成；公开结果不足以确认已完成自动闭环功率调节",
      "LH功率",
      "ICRH功率",
      "功率降额/切断"
    ],
    "representativeWorks": [
      "WEST等离子体控制系统集成与首轮运行",
      "The WEST plasma control system: Integration, commissioning and operation on first experimental campaigns",
      "First real-time detection and feedback control of plasma-wall interaction in WEST"
    ],
    "papers": [
      {
        "title": "The WEST plasma control system: Integration, commissioning and operation on first experimental campaigns",
        "authors": "未完整列出",
        "year": 2019,
        "venue": "peer-reviewed",
        "doi": "10.1016/j.fusengdes.2019.01.139",
        "url": "https://doi.org/10.1016/j.fusengdes.2019.01.139",
        "sourceType": "peer-reviewed"
      },
      {
        "title": "First real-time detection and feedback control of plasma-wall interaction in WEST",
        "authors": "未完整列出",
        "year": 2021,
        "venue": "original preprint",
        "doi": null,
        "url": "https://arxiv.org/abs/2101.01914",
        "sourceType": "original preprint"
      }
    ],
    "code": [
      {
        "name": "WEST PCS/WMS",
        "url": null,
        "status": "not-public",
        "relationship": "装置页面公开，生产代码未公开。",
        "artifactType": "software",
        "access": "not-public",
        "license": "未标注"
      }
    ],
    "maturity": "PCS与壁温反馈有真机闭环证据。",
    "gaps": "完整架构/源码受限；红外标定与遮挡；反馈统计需跨场景复核；保护与优化控制边界需形式化",
    "sources": []
  }
];
