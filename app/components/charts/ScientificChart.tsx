'use client';

import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useI18n, type AppLocale } from '../../i18n';
import { applyScientificChartTheme, useChartTheme } from './chart-theme';
import './scientific-chart.css';

type ChartClickHandler = (params: unknown) => void;

type ScientificChartProps = {
  id: string;
  option: EChartsCoreOption;
  ariaLabel: string;
  fallbackSrc: string;
  fallbackAlt: string;
  className?: string;
  height?: number;
  eager?: boolean;
  dark?: boolean;
  onChartClick?: ChartClickHandler;
  fallback?: ReactNode;
};

/*
 * Chart copy deliberately lives beside the rendering boundary.  Most chart
 * datasets are editorial, locale-neutral TypeScript constants; translating
 * the complete option tree here also covers ECharts-generated legend, axis,
 * tooltip, visualMap, graphic and ARIA text without duplicating every dataset.
 * Longer roadmap prose should still provide authored English where available;
 * the final fallback is intentionally explicit rather than leaking Chinese.
 */
const exactEnglish: Record<string, string> = {
  '交互图加载中…': 'Loading interactive chart…',
  '交互组件未加载，当前显示可读静态图。': 'The interactive component could not be loaded. An accessible static view is shown instead.',
  '导出当前图表为 SVG': 'Export this chart as SVG',
  '无': 'None',
  '低': 'Low',
  '中': 'Medium',
  '高': 'High',
  '未确认': 'Not yet confirmed',
  '有关联证据': 'Evidence linked',
  '本版未确认': 'Not confirmed in this release',
  '关键路径': 'Critical path',
  '条件式交付': 'Conditional delivery',
  '拓展研究': 'Extended research',
  '现有基线': 'Existing baseline',
  '一期': 'Phase I',
  '二期': 'Phase II',
  '专业覆盖': 'Disciplinary scope',
  '候选工具链': 'Candidate toolchain',
  '技术子路线': 'Technical sub-route',
  '阶段交付': 'Phase deliverable',
  '任务输入': 'Mission input',
  '专业环节': 'Disciplinary workstream',
  '集成与验证': 'Integration and V&V',
  '阶段目标': 'Phase objective',
  '工作包': 'Work package',
  '阶段门': 'Evidence gate',
  '当前': 'Current',
  '目标': 'Target',
  '差距': 'Gap',
  '能力': 'Capability',
  '模型': 'Model',
  '框架': 'Framework',
  '类别': 'Category',
  '阶段': 'Phase',
  '名称': 'Name',
  '期间': 'Period',
  '内容': 'Scope',
  '任务': 'Task',
  '起点': 'Start',
  '终点': 'End',
  '来源到去向': 'Source → target',
  '装置': 'Device',
  '论文': 'Paper',
  '代码': 'Code',
  '工具': 'Tool',
  '机构': 'Organization',
  '研究工作': 'Research activity',
  '物理模拟': 'Physics modelling',
  '工程仿真': 'Engineering simulation',
  '集成控制': 'Integrated control',
  '诊断感知': 'Diagnostics and sensing',
  '智能原生': 'AI-native methods',
  '数据基座': 'Data foundation',
  '总体集成': 'System integration',
  '能源转化': 'Energy conversion',
  '辅机模拟': 'Balance-of-plant simulation',
  '人机交互': 'Human–machine interaction',
  '磁位形控制': 'Magnetic-configuration control',
  '破裂预警/缓解': 'Disruption prediction / mitigation',
  '放电场景设计': 'Discharge-scenario design',
  '自由边界': 'Free-boundary equilibrium',
  '实验解释': 'Experiment interpretation',
  '部件设计与安全': 'Component design and safety',
  '维护与寿命': 'Maintenance and lifetime',
  '整厂优化': 'Plant-level optimisation',
  '在线模型': 'Online model',
  '场景模型': 'Scenario model',
  '系统模型': 'System model',
  '工程证据': 'Engineering evidence',
  '高保真证据': 'High-fidelity evidence',
  '多保真模型': 'Multi-fidelity models',
  '在线控制 / 估计': 'Online control / estimation',
  '场景 / 工程折中': 'Scenario / engineering trade space',
  '离线参考 / 证据': 'Offline reference / evidence',
  '平衡/控制': 'Equilibrium / control',
  '核心输运': 'Core transport',
  '湍流': 'Turbulence',
  '加热/快离子': 'Heating / fast ions',
  'MHD/破裂': 'MHD / disruptions',
  '边界/SOL': 'Edge / SOL',
  '壁/杂质': 'Wall / impurities',
  '中子学': 'Neutronics',
  '氚/材料': 'Tritium / materials',
  '热流体': 'Thermal fluids',
  '结构': 'Structures',
  '整厂/RAMI': 'Plant / RAMI',
  '同域': 'Within-domain',
  '强反馈': 'Strong feedback',
  '单向载荷': 'One-way load transfer',
  '无直接耦合': 'No direct coupling',
  '基础工具': 'Foundation tool',
  '工作流框架': 'Workflow framework',
  '集成框架': 'Integrated framework',
  '系统设计': 'System design',
  '控制服务化': 'Control services',
  '装置孪生': 'Device twin',
  '电厂孪生': 'Power-plant twin',
  '瞬态电磁': 'Transient electromagnetics',
  '结构动力学': 'Structural dynamics',
  '磁体失超': 'Magnet quench',
  'PFC 热机械': 'PFC thermomechanics',
  '冷却 CFD': 'Coolant CFD',
  '中子输运': 'Neutron transport',
  '活化/剂量': 'Activation / dose',
  '包层 MHD': 'Blanket MHD',
  '氚迁移': 'Tritium transport',
  '真空/低温': 'Vacuum / cryogenics',
  '安全瞬态': 'Safety transients',
  '远程维护': 'Remote maintenance',
  '控制/平衡': 'Control / equilibrium',
  '磁体/低温': 'Magnets / cryogenics',
  '中子/活化': 'Neutronics / activation',
  '包层/氚': 'Blanket / tritium',
  '安全系统': 'Safety systems',
  '维护/RAMI': 'Maintenance / RAMI',
  '脉冲–年': 'Pulse–years',
  '主要决策尺度': 'Primary decision timescale',
  '相关尺度': 'Relevant timescale',
  '非主要窗口': 'Not a primary window',
  '典型工具': 'Representative tools',
  '载荷接口基线': 'Load-interface baseline',
  '破裂电磁窄孪生': 'Disruption electromagnetic narrow-scope twin',
  '热与磁体状态': 'Thermal and magnet state',
  '核—包层—氚': 'Nuclear–blanket–tritium chain',
  '整厂运行与 RAMI': 'Plant operation and RAMI',
  'E3 / E4 并行窗': 'E3 / E4 parallel window',
  '工程域时间尺度': 'Engineering-domain timescales',
  '工具类别': 'Tool category',
  '工具数量级': 'Tool order of magnitude',
  '建议窗口': 'Recommended window',
  '建议时间窗口（月）': 'Recommended time window (months)',
  '部署等级': 'Deployment level',
  '证据等级': 'Evidence level',
  '部署责任 D': 'Deployment responsibility D',
  '科学证据 E': 'Scientific evidence E',
  '工作数量': 'Number of records',
  '收录工作数': 'Indexed records',
  '多': 'More',
  '少': 'Fewer',
  '概念 / 需求': 'Concept / requirements',
  '需求 / 概念': 'Requirements / concept',
  '数值闭环': 'Numerical closed loop',
  '数值 / 合成': 'Numerical / synthetic',
  '实验室 / 标定': 'Laboratory / calibration',
  '装置数据 / 交叉验证': 'Machine data / cross-validation',
  '装置离线': 'Offline machine analysis',
  '实时 / HIL / 影子': 'Real-time / HIL / shadow',
  '装置闭环': 'Machine closed loop',
  '研究原型': 'Research prototype',
  '离线工作流': 'Offline workflow',
  '实时 / HIL 试点': 'Real-time / HIL pilot',
  '正式在线 / 闭环': 'Production online / closed loop',
  '安全关键批准': 'Safety-critical approval',
  '软件 / 实验室原型': 'Software / laboratory prototype',
  '安装 / 联调 / 影子 / HIL': 'Installation / integration / shadow / HIL',
  '常规装置工作流': 'Routine machine workflow',
  '经批准的安全关键用途': 'Approved safety-critical use',
  '真实装置': 'Physical machine',
  '诊断仪器': 'Diagnostic instruments',
  '采集与校准': 'Acquisition and calibration',
  '反演与同化': 'Inversion and data assimilation',
  '数字孪生模型': 'Digital-twin model',
  '合成诊断': 'Synthetic diagnostics',
  '观测残差': 'Observation residuals',
  '质量与证据门': 'Quality and evidence gate',
  '实时决策 / 工程健康': 'Real-time decisions / engineering health',
  '真实响应': 'Physical response',
  '原始信号': 'Raw signal',
  '计量数据': 'Metrology data',
  '后验状态 + UQ': 'Posterior state + UQ',
  '预测 + 适用域': 'Prediction + applicability domain',
  '已授权产品': 'Authorized product',
  '经验证动作': 'Validated action',
  '模拟状态': 'Simulated state',
  '虚拟通道': 'Synthetic channel',
  '真实通道': 'Physical channel',
  '模型校准': 'Model calibration',
  '仪器 / 几何诊断': 'Instrument / geometry diagnostics',
  '物理实体': 'Physical entity',
  '测量链': 'Measurement chain',
  '状态': 'State',
  '数字模型': 'Digital model',
  '证据治理': 'Evidence governance',
  '决策': 'Decision',
  '主任务（唯一计数）': 'Primary task (unique count)',
  '含关联任务': 'Including related tasks',
  '主任务': 'Primary task',
  '含关联': 'Including related',
  '聚变诊断典型时间尺度': 'Representative fusion-diagnostics timescales',
  '装置与诊断任务公开证据索引': 'Public evidence index for devices and diagnostic tasks',
  '聚变诊断建议路线': 'Recommended FusionDigital diagnostics roadmap',
  '全部阶段': 'All phases',
  '一期 · EXL‑50U': 'Phase I · EXL-50U',
  '二期 · EHL‑2': 'Phase II · EHL-2',
  '第一条子路线': 'first technical sub-route',
  '非阶段门': 'No mandatory gate',
  '无必过阶段门': 'No mandatory evidence gate',
  '权威事实档案': 'Authoritative fact archive',
  '跨模型语义交换': 'Cross-model semantic exchange',
  '实验前正问题预演': 'Pre-shot forward simulation',
  '实验后逆问题重构': 'Post-shot inverse reconstruction',
  '实时控制 plant': 'Real-time control plant',
  '离线高保真分析': 'Offline high-fidelity analysis',
  '合成诊断前向模型': 'Synthetic-diagnostic forward model',
  '控制验证与故障注入': 'Control verification and fault injection',
  '监督层只读接入': 'Read-only supervisory integration',
  '工程多物理场求解': 'Engineering multiphysics solution',
  '验证、确认与不确定度': 'Verification, validation and uncertainty quantification',
  '证据导航与决策界面': 'Evidence navigation and decision interface',
  '几何与配置主线': 'Geometry and configuration backbone',
  '装置电磁与自由边界': 'Machine electromagnetics and free boundary',
  '首等离子体形成链': 'First-plasma formation chain',
  '问题专用 MHD 证据支线': 'Problem-specific MHD evidence branch',
  '正常/事故电磁载荷': 'Normal / accident electromagnetic loads',
  '瞬态热与能量沉积': 'Transient heat and energy deposition',
  '结构/热应力与复核': 'Structural / thermal stress and review',
  'PCS 回放与场景接口': 'PCS replay and scenario interface',
  '分层 plant': 'Layered plant model',
  'MIL→SIL 与故障矩阵': 'MIL → SIL and fault matrix',
  '条件式 HIL 与 shadow': 'Conditional HIL and shadow operation',
  '事实源与校准': 'Source of truth and calibration',
  '重构与残差': 'Reconstruction and residuals',
  '首炮最小实时集': 'Minimum real-time set for first plasma',
  '身份与事实层': 'Identity and fact layer',
  '语义与存储层': 'Semantics and storage layer',
  '模型执行与 V&V': 'Model execution and V&V',
  '知识与决策界面': 'Knowledge and decision interface',
  '实验分析': 'Experimental analysis',
  '放电场景': 'Discharge scenarios',
  '全装置物理': 'Whole-device physics',
  '聚变堆工程': 'Fusion-reactor engineering',
  '电厂/生命周期': 'Plant / lifecycle',
  '文件/数据接口': 'File / data interface',
  '可复现工作流': 'Reproducible workflow',
  '迭代自洽': 'Iterative self-consistency',
  '同步多物理': 'Synchronous multiphysics',
  '在线状态闭环': 'Online state closed loop',
  '数据/分析平台': 'Data / analysis platform',
  '工作流编排': 'Workflow orchestration',
  '脉冲集成': 'Integrated pulse modelling',
  '快速场景': 'Fast scenario modelling',
  '高保真多物理': 'High-fidelity multiphysics',
  '整厂系统设计': 'Plant systems design',
  '整厂集成设计': 'Integrated plant design',
  '工业孪生平台': 'Industrial twin platform',
  '控制服务': 'Control service',
  '统一数据': 'Unified data',
  '模型编排': 'Model orchestration',
  '自洽闭合推进': 'Self-consistent coupled evolution',
  '高保真耦合': 'High-fidelity coupling',
  '工程/整厂': 'Engineering / plant',
  '实验后验': 'Post-shot analysis',
  'UQ/优化': 'UQ / optimisation',
  '在线部署': 'Online deployment',
  '配置/证据': 'Configuration / evidence',
  '物理覆盖': 'Physics coverage',
  '数据语义': 'Data semantics',
  '数值耦合': 'Numerical coupling',
  '实验确认': 'Experimental validation',
  'UQ/适用域': 'UQ / applicability domain',
  '在线状态同步': 'Online state synchronization',
  '实时确定性': 'Real-time determinism',
  '闭环安全': 'Closed-loop safety',
  '生命周期配置': 'Lifecycle configuration',
  '软件/网络治理': 'Software / network governance',
  '运行支持门 3.0': 'Operational-support gate 3.0',
  '等离子体孪生': 'Plasma twin',
  '聚变堆孪生': 'Fusion-reactor twin',
  '路线规划区间': 'Roadmap interval',
  'as-shot 平衡重构': 'As-shot equilibrium reconstruction',
  '击穿与电流建立': 'Breakdown and current ramp-up',
  'MHD、H&CD 与输运': 'MHD, heating/current drive and transport',
  'EM 事件与涡流链': 'EM event and eddy-current chain',
  '热流与冷却链': 'Heat-flux and cooling chain',
  'CQ/VDE/halo 电磁—结构分支': 'CQ/VDE/halo electromagnetic–structural branch',
  'TQ/沉积热—热应力分支': 'TQ/deposition-to-thermal-stress branch',
  '合成传感器与 VVUQ 过门': 'Synthetic-sensor and VVUQ gate',
  'pulse schedule 与状态机': 'Pulse schedule and state machine',
  '状态估计与质量门': 'State estimation and quality gate',
  '分层 plant 与闭环控制': 'Layered plant and closed-loop control',
  '状态服务': 'State service',
  '实时 plant 层': 'Real-time plant layer',
  '实时执行与回放': 'Real-time execution and replay',
  'MIL/HIL 工具链': 'MIL/HIL toolchain',
  '场景、信号与权限合同': 'Scenario, signal and authorization contract',
  '分层 plant—MIL 闭环': 'Layered plant–MIL closed loop',
  '生产代码 SIL 与故障矩阵': 'Production-code SIL and fault matrix',
  '条件式 HIL—dry-run—只读 shadow': 'Conditional HIL–dry run–read-only shadow',
  '资产—raw—校准事实链': 'Asset–raw–calibration fact chain',
  'IMAS—工程合同—对象存储': 'IMAS–engineering contract–object storage',
  '模型执行—V&V—阶段门': 'Model execution–V&V–evidence gates',
  '知识图谱—ECharts/3D—决策追溯': 'Knowledge graph–ECharts/3D–decision traceability',
  '几何—材料—测点数字主线': 'Geometry–materials–measurement-point digital thread',
  '真空场—击穿 / burn-through—成形等离子体控制': 'Vacuum field–breakdown/burn-through–formed-plasma control',
  '按物理问题组织：平衡 / 剖面—线性响应—精选非线性': 'Problem-led equilibrium/profile–linear response–selected nonlinear analysis',
  '首炮最小实时诊断集和安全降级接口': 'Minimum first-plasma real-time diagnostic set and safe-degradation interface',
  '实际配置、工程核查与 first-plasma 任务冻结': 'As-built configuration, engineering checks and first-plasma mission freeze',
  '实时 plant emulator、SIL 与条件式 HIL': 'Real-time plant emulator, SIL and conditional HIL',
  '虚拟 first-plasma campaign 与 readiness review': 'Virtual first-plasma campaign and readiness review',
  '范围与契约冻结': 'Scope and contract freeze',
  '配置与模型基线': 'Configuration and model baseline',
  '虚拟控制': 'Virtual control',
  '工程载荷链': 'Engineering load chain',
  '盲测发布': 'Blind-test release',
  '动员与入口条件': 'Mobilization and entry criteria',
  '集成演练': 'Integrated rehearsal',
  '实验源数据': 'Experimental source data',
  '语义交换': 'Semantic exchange',
  '工程与实时接入': 'Engineering and real-time integration',
  '模型执行': 'Model execution',
  '平衡与控制': 'Equilibrium and control',
  '工程分析': 'Engineering analysis',
  'EHL‑2 MHD': 'EHL-2 MHD',
  'EHL‑2 启动与加热': 'EHL-2 start-up and heating',
  '产品与知识': 'Products and knowledge',
  '可追溯': 'Traceable',
  '可重复': 'Repeatable',
  '可验证': 'Verifiable',
  '可降级': 'Gracefully degradable',
  '可治理': 'Governable',
  '设计': 'Design',
  '建造': 'Construction',
  '调试': 'Commissioning',
  '运行': 'Operation',
  '维护 / 升级': 'Maintenance / upgrade',
  '退役': 'Decommissioning',
  '全生命周期': 'Full lifecycle',
  '条件性': 'Conditional',
  '支撑': 'Supporting',
  '重要': 'Significant',
  '核心': 'Core',
  '实体聚变装置\nPHYSICAL ASSET': 'Physical fusion asset\nPHYSICAL ASSET',
  '安全与授权门\nSAFETY GATE': 'Safety and authorization gate\nSAFETY GATE',
  '知识与数字资产可见': 'Knowledge and digital assets visible',
  'EXL‑50U 可验证窄域孪生': 'EXL-50U verifiable narrow-scope twin',
  '多物理与运行协同': 'Multiphysics and operational coordination',
  '聚变电厂全生命周期孪生': 'Fusion power-plant lifecycle twin',
  '当前基线': 'Current baseline',
  '二期扩展': 'Phase II expansion',
  '远期目标': 'Long-term objective',
  '一期主线': 'Phase I mainline',
  '一期支撑': 'Phase I support',
  '后续为主': 'Primarily later phases',
  '已形成': 'Baseline available',
  '后续': 'Later work',
  '第一期能力边界 G0—G2': 'Phase I capability boundary G0–G2',
  '一期后能力缺口 G3—G5': 'Post-Phase-I capability gaps G3–G5',
  '十模块能力门': 'Ten-module capability gates',
  '图例': 'Legend',
  '电磁、热与结构工程': 'Electromagnetic, thermal and structural engineering',
  '数据、模型与证据基础设施': 'Data, model and evidence infrastructure',
};

const englishFragments: readonly [string, string][] = [
  ['典型窗口：', 'Typical window: '],
  ['求解时间：约 ', 'Solve time: approximately '],
  ['有效状态维数：约 ', 'Effective state dimension: approximately '],
  ['编辑性数量级综合，非求解器基准或时延承诺', 'Editorial order-of-magnitude synthesis; not a solver benchmark or latency commitment'],
  ['编辑性数量级，非统一硬件上的性能基准', 'Editorial order of magnitude; not a like-for-like hardware benchmark'],
  ['编辑性', 'editorial'],
  ['非官方评级', 'not an official rating'],
  ['非性能排名', 'not a performance ranking'],
  ['非性能基准', 'not a performance benchmark'],
  ['对数轴', 'log scale'],
  ['典型单次求解时间', 'Typical single-run solve time'],
  ['有效状态维数', 'Effective state dimension'],
  ['决策 / 模拟时间窗口', 'Decision / simulation time window'],
  ['决策时间窗口', 'Decision time window'],
  ['模型组合', 'Model ensemble'],
  ['求解时间秒', 'Solve time (s)'],
  ['耦合强度', 'Coupling strength'],
  ['行→列', 'row → column'],
  ['信息方向', 'information direction'],
  ['生命周期范围', 'Lifecycle coverage'],
  ['耦合深度', 'Coupling depth'],
  ['能力矩阵', 'Capability matrix'],
  ['成熟度差距', 'Maturity gap'],
  ['当前成熟度', 'Current maturity'],
  ['目标成熟度', 'Target maturity'],
  ['个月', ' months'],
  ['周', ' weeks'],
  ['项目月', 'Programme month'],
  ['项目周', 'Programme week'],
  ['开始月', 'Start month'],
  ['结束月', 'End month'],
  ['证据门', 'Evidence gate'],
  ['证据', 'Evidence'],
  ['输入', 'Inputs'],
  ['输出', 'Outputs'],
  ['验证', 'Verification'],
  ['适用边界', 'Applicability boundary'],
  ['边界', 'Boundary'],
  ['技术选型', 'Technical selection'],
  ['工具链', 'Toolchain'],
  ['交付', 'Deliverable'],
  ['位形与等离子体物理', 'Configuration and plasma physics'],
  ['工程多物理场', 'Engineering multiphysics'],
  ['集成控制与虚拟调试', 'Integrated control and virtual commissioning'],
  ['诊断、重构与状态感知', 'Diagnostics, reconstruction and state estimation'],
  ['诊断感知与状态重构', 'Diagnostics, sensing and state reconstruction'],
  ['数据、语义与证据基座', 'Data, semantics and evidence foundation'],
  ['数据、模型与证据基础设施', 'Data, model and evidence infrastructure'],
  ['装置事实与实验任务', 'Machine facts and experimental mission'],
  ['统一数字线程与 V&V', 'Unified digital thread and V&V'],
  ['最小闭环', 'minimum closed loop'],
  ['虚拟首炮就绪', 'virtual first-plasma readiness'],
  ['首等离子体', 'first plasma'],
  ['实时控制', 'real-time control'],
  ['虚拟调试', 'virtual commissioning'],
  ['合成诊断', 'synthetic diagnostics'],
  ['自由边界', 'free-boundary'],
  ['平衡重构', 'equilibrium reconstruction'],
  ['位形物理', 'configuration physics'],
  ['电磁载荷', 'electromagnetic loads'],
  ['瞬态传热', 'transient heat transfer'],
  ['结构响应', 'structural response'],
  ['故障注入', 'fault injection'],
  ['状态估计', 'state estimation'],
  ['模型卡', 'model card'],
  ['运行清单', 'run manifest'],
  ['不确定度', 'uncertainty'],
  ['可追溯', 'traceable'],
  ['只读', 'read-only'],
  ['关联', 'relations'],
  ['时间尺度', 'timescale'],
  ['时间窗口', 'time window'],
  ['覆盖', 'coverage'],
  ['路线图', 'roadmap'],
  ['路线', 'route'],
  ['装置数', 'devices'],
  ['论文数', 'papers'],
  ['代码数', 'codebases'],
  ['强项', 'strength'],
  ['可用', 'usable'],
  ['初步', 'initial'],
  ['未发现公开证据', 'no public evidence identified'],
];

const hanPattern = /\p{Script=Han}/u;

export function localizeScientificText(locale: AppLocale, source: string): string {
  if (locale !== 'en' || !hanPattern.test(source)) return source;
  const exact = exactEnglish[source];
  if (exact) return exact;
  let translated = source;
  for (const [chinese, english] of englishFragments) translated = translated.replaceAll(chinese, english);
  if (!hanPattern.test(translated)) return translated;

  const technicalTokens = translated.match(/[A-Za-z][A-Za-z0-9+./_\-]*(?:[‑–—→][A-Za-z0-9+./_\-]+)*/g) ?? [];
  const uniqueTokens = [...new Set(technicalTokens)].slice(0, 10);
  return uniqueTokens.length
    ? `Technical annotation — ${uniqueTokens.join(' · ')}`
    : 'Technical annotation — English record pending source verification';
}

function localizeOptionValue(value: unknown, locale: AppLocale, seen = new WeakMap<object, unknown>()): unknown {
  if (locale !== 'en' || value === null || value === undefined) return value;
  if (typeof value === 'string') return localizeScientificText(locale, value);
  if (typeof value === 'function') {
    return (...args: unknown[]) => localizeOptionValue(value(...args), locale);
  }
  if (typeof value !== 'object') return value;
  const cached = seen.get(value);
  if (cached) return cached;
  if (Array.isArray(value)) {
    const next: unknown[] = [];
    seen.set(value, next);
    for (const item of value) next.push(localizeOptionValue(item, locale, seen));
    return next;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const next: Record<string, unknown> = {};
  seen.set(value, next);
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) next[key] = localizeOptionValue(item, locale, seen);
  return next;
}

export function localizeScientificOption(locale: AppLocale, option: EChartsCoreOption): EChartsCoreOption {
  return localizeOptionValue(option, locale) as EChartsCoreOption;
}

function localizeReactNode(node: ReactNode, locale: AppLocale): ReactNode {
  if (locale !== 'en' || node === null || node === undefined || typeof node === 'boolean') return node;
  if (typeof node === 'string') return localizeScientificText(locale, node);
  if (typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map((item) => localizeReactNode(item, locale));
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<Record<string, unknown>>;
  const props = element.props;
  const localizedProps: Record<string, unknown> = {};
  for (const key of ['aria-label', 'alt', 'placeholder', 'title']) {
    const value = props[key];
    if (typeof value === 'string') localizedProps[key] = localizeScientificText(locale, value);
  }
  const children = props.children as ReactNode;
  if (children === undefined) return cloneElement(element, localizedProps);
  return cloneElement(element, localizedProps, Children.map(children, (child) => localizeReactNode(child, locale)));
}

export function LocalizedChartRegion({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return <>{localizeReactNode(children, locale)}</>;
}

export default function ScientificChart({
  id,
  option,
  ariaLabel,
  fallbackSrc,
  fallbackAlt,
  className = '',
  height = 460,
  eager = false,
  onChartClick,
  fallback,
}: ScientificChartProps) {
  const { locale } = useI18n();
  const chartTheme = useChartTheme();
  const localizedOption = useMemo(() => localizeScientificOption(locale, option), [locale, option]);
  const themedOption = useMemo(() => applyScientificChartTheme(localizedOption, chartTheme), [chartTheme, localizedOption]);
  const localizedAriaLabel = localizeScientificText(locale, ariaLabel);
  const localizedFallbackAlt = localizeScientificText(locale, fallbackAlt);
  const rootRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const optionRef = useRef(themedOption);
  const clickRef = useRef(onChartClick);
  const [nearViewport, setNearViewport] = useState(eager);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    optionRef.current = themedOption;
  }, [themedOption]);

  useEffect(() => {
    clickRef.current = onChartClick;
  }, [onChartClick]);

  useEffect(() => {
    if (eager || nearViewport || !rootRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      const timeout = globalThis.setTimeout(() => setNearViewport(true), 0);
      return () => globalThis.clearTimeout(timeout);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: '420px 0px' },
    );
    observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [eager, nearViewport]);

  useEffect(() => {
    if (!nearViewport || !mountRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    let resizeFallback: (() => void) | undefined;

    void import('./echartsRuntime')
      .then(({ init }) => {
        if (cancelled || !mountRef.current) return;
        const chart = init(mountRef.current, undefined, {
          renderer: 'svg',
          useCoarsePointer: true,
        });
        chartRef.current = chart;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        chart.setOption({ ...optionRef.current, animation: !reduceMotion }, true);
        chart.on('click', (params) => clickRef.current?.(params));
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(() => chart.resize());
          resizeObserver.observe(mountRef.current);
        } else {
          resizeFallback = () => chart.resize();
          window.addEventListener('resize', resizeFallback);
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (resizeFallback) window.removeEventListener('resize', resizeFallback);
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, [nearViewport]);

  useEffect(() => {
    if (!chartRef.current) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    chartRef.current.setOption({ ...themedOption, animation: !reduceMotion }, true);
  }, [themedOption]);

  function exportSvg() {
    const chart = chartRef.current;
    if (!chart) return;
    const anchor = document.createElement('a');
    anchor.href = chart.getDataURL({ type: 'svg', backgroundColor: chartTheme.background });
    anchor.download = `${id}.svg`;
    anchor.click();
  }

  return (
    <div
      ref={rootRef}
      className={`scientificChart${ready ? ' isReady' : ''}${failed ? ' hasFailed' : ''}${chartTheme.mode === 'dark' ? ' darkChart' : ''}${className ? ` ${className}` : ''}`}
      data-chart-theme={chartTheme.mode}
      style={{ '--scientific-chart-height': `${height}px` } as CSSProperties}
      data-echart={id}
    >
      {fallback ? (
        <div className="scientificChartFallback scientificChartFallbackContent" style={{ overflow: 'auto', objectFit: 'initial' }} aria-hidden={ready || undefined}>{localizeReactNode(fallback, locale)}</div>
      ) : (
        <img className="scientificChartFallback" src={fallbackSrc} alt={localizedFallbackAlt} aria-hidden={ready || undefined} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      )}
      <div ref={mountRef} className="scientificChartMount" role="img" aria-label={localizedAriaLabel} aria-hidden={!ready || undefined} />
      {!ready && !failed && <span className="scientificChartStatus">{localizeScientificText(locale, '交互图加载中…')}</span>}
      {failed && <span className="scientificChartStatus">{localizeScientificText(locale, '交互组件未加载，当前显示可读静态图。')}</span>}
      {ready && <button type="button" className="scientificChartExport" onClick={exportSvg} aria-label={localizeScientificText(locale, '导出当前图表为 SVG')}>SVG ↓</button>}
    </div>
  );
}
