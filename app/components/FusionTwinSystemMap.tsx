'use client';

import type { EChartsCoreOption, EChartsType } from 'echarts/core';
import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import './fusion-twin-system-map.css';

type PhaseId = 'overview' | 'design' | 'construction' | 'commissioning' | 'operation' | 'maintenance' | 'decommissioning';
type ModuleId = 'physics' | 'engineering' | 'control' | 'diagnostics' | 'energy' | 'auxiliary' | 'hmi' | 'data' | 'integration' | 'ai';

type Phase = {
  id: PhaseId;
  cn: string;
  en: string;
  scale: string;
  baseline: string;
  focus: string;
  evidence: string;
};

type TwinModule = {
  id: ModuleId;
  no: string;
  cn: string;
  en: string;
  summary: string;
  input: string;
  output: string;
  aiRole: string;
  trust: string;
  href: string;
  color: string;
  position: [number, number];
  size: [number, number];
  intensities: [number, number, number, number, number, number];
};

type TwinLink = {
  source: string;
  target: string;
  type: 'data' | 'model' | 'governance' | 'command' | 'ai';
  relation: string;
  contract: string;
  curve?: number;
};

type ChartNode = {
  id: string;
  name: string;
  kind: 'phase' | 'module' | 'boundary';
  moduleId?: ModuleId;
  phaseId?: PhaseId;
  x: number;
  y: number;
  symbol: 'roundRect' | 'circle' | 'diamond';
  symbolSize: [number, number] | number;
  itemStyle: Record<string, unknown>;
  label: Record<string, unknown>;
  tooltipText: string;
};

const FONT = '"Microsoft YaHei UI","Microsoft YaHei","Noto Sans SC",Arial,sans-serif';
const PHASE_IDS: Exclude<PhaseId, 'overview'>[] = ['design', 'construction', 'commissioning', 'operation', 'maintenance', 'decommissioning'];
const INTENSITY_LABELS = ['条件性', '支撑', '重要', '核心'];

const phases: Phase[] = [
  { id: 'overview', cn: '全生命周期', en: 'LIFECYCLE', scale: 'μs—数十年', baseline: 'ONE CONFIGURATION-CONTROLLED DIGITAL THREAD', focus: '以同一装置身份、配置基线和证据链连接全周期决策，同时容纳实时闭环与长期工程演化。', evidence: '配置、时间、坐标、单位、不确定度、来源与 V&V 状态必须共同绑定。' },
  { id: 'design', cn: '设计', en: 'DESIGN', scale: '约 5—15 年', baseline: 'AS-DESIGNED', focus: '需求追踪、设计空间探索、物理—工程闭合与不确定度传播。', evidence: '设计基线、模型适用域、裕量与验证计划。' },
  { id: 'construction', cn: '建造', en: 'CONSTRUCTION', scale: '约 5—10+ 年', baseline: 'AS-BUILT', focus: '把制造实测、安装状态、材料批次和偏差回写数字主线。', evidence: '质量记录、as-built 几何、检验与接口符合性。' },
  { id: 'commissioning', cn: '调试', en: 'COMMISSIONING', scale: '约 1—3+ 年', baseline: 'AS-COMMISSIONED', focus: '标定、系统辨识、虚拟调试、SIL/HIL 与保护逻辑验收。', evidence: '标定记录、验收基线、故障注入与回放证据。' },
  { id: 'operation', cn: '运行', en: 'OPERATION', scale: 'μs—年；寿期约 20—40+ 年', baseline: 'AS-OPERATED', focus: '从快速保护、等离子体控制到脉冲规划、设备健康和电厂性能优化。', evidence: '在线质量标记、有效域、操作授权、联锁与每次决策回写。' },
  { id: 'maintenance', cn: '维护 / 升级', en: 'MAINTENANCE', scale: '天—月；重大升级约 1—3 年', baseline: 'AS-MAINTAINED', focus: '健康评估、剩余寿命、变更影响、远程维护和再调试。', evidence: '维修记录、配置变更、复验与恢复运行批准。' },
  { id: 'decommissioning', cn: '退役', en: 'DECOMMISSIONING', scale: '约 10—30+ 年', baseline: 'AS-DECOMMISSIONED', focus: '活化库存、拆解路径、材料流、废物管理与长期责任证据。', evidence: '剂量与库存模型、材料去向、许可和可追溯档案。' },
];

const modules: TwinModule[] = [
  { id: 'physics', no: '01', cn: '物理模拟', en: 'PHYSICS', summary: '平衡、输运、MHD、边界与粒子过程。', input: '装置配置、诊断观测、执行器与边界条件', output: '等离子体状态、稳定性、热/粒子/中子载荷源', aiRole: '加速反演、代理输运与场景搜索；保持物理约束和适用域。', trust: '高保真计算、实验后验、守恒检查与不确定度。', href: '/physics', color: '#ff8738', position: [250, 515], size: [160, 82], intensities: [4, 2, 4, 4, 3, 1] },
  { id: 'engineering', no: '02', cn: '工程仿真', en: 'ENGINEERING', summary: '电磁、结构、热流体、中子与材料响应。', input: '几何、材料、边界条件和等离子体载荷', output: '温度、应力、电磁力、损伤、活化与工程裕量', aiRole: '降阶模型、损伤识别和寿命代理；不得取代合格分析。', trust: '基准题、试验、网格/时间步收敛与规范符合性。', href: '/engineering', color: '#ffb05f', position: [445, 515], size: [160, 82], intensities: [4, 4, 3, 3, 4, 4] },
  { id: 'control', no: '03', cn: '集成控制', en: 'CONTROL / PCS', summary: '状态估计、约束控制、PCS 与多执行器协调。', input: '经质量标记的状态、场景目标、设备能力和安全约束', output: '通过验证与授权门的控制指令', aiRole: '策略建议、预测控制和异常规避；默认不直达执行器。', trust: '实时确定性、SIL/HIL、保护独立性与权限治理。', href: '/control', color: '#ff8738', position: [895, 415], size: [164, 86], intensities: [3, 2, 4, 4, 3, 1] },
  { id: 'diagnostics', no: '04', cn: '诊断感知', en: 'DIAGNOSTICS & SENSING', summary: '标定、反演、观测融合、信号质量和异常识别。', input: '传感器原始信号、诊断几何与标定信息', output: '带质量标记和不确定度的观测与状态', aiRole: '去噪、缺失补全、异常识别和多模态状态估计。', trust: '盲测、漂移监测、残差保留和失效降级。', href: '/diagnostics', color: '#65e6d2', position: [225, 315], size: [164, 86], intensities: [3, 3, 4, 4, 4, 2] },
  { id: 'energy', no: '05', cn: '能量转化', en: 'ENERGY', summary: '包层换热、热循环、发电系统与电网响应。', input: '热/中子源、冷却边界和电网需求', output: '热功率、净电功率、效率和动态约束', aiRole: '运行优化和性能代理；纯实验装置可能不适用。', trust: '守恒、部件试验、循环基准和电网约束验证。', href: '/#domains', color: '#f0cf69', position: [640, 515], size: [160, 82], intensities: [4, 4, 3, 4, 3, 2] },
  { id: 'auxiliary', no: '06', cn: '辅机模拟', en: 'AUXILIARY', summary: '真空、低温、燃料、电源、冷却与 BOP。', input: '设备状态、设定值、需求曲线和故障事件', output: '服务能力、厂用负荷、边界条件与故障响应', aiRole: '设备健康、负荷预测与故障定位。', trust: '设备曲线、联锁试验、故障树和运行回放。', href: '/#domains', color: '#67cfd3', position: [835, 515], size: [160, 82], intensities: [3, 4, 3, 4, 4, 3] },
  { id: 'hmi', no: '07', cn: '人机交互', en: 'HUMAN–MACHINE', summary: '态势感知、解释、协同和人在回路授权。', input: '状态、风险、备选方案、证据和不确定度', output: '操作意图、限制条件、批准与注释', aiRole: '解释、检索与方案比较；责任主体始终明确。', trust: '可解释界面、告警管理、行为试验和审计记录。', href: '/#domains', color: '#bff4df', position: [825, 315], size: [170, 86], intensities: [2, 2, 4, 4, 4, 3] },
  { id: 'data', no: '08', cn: '数据基座', en: 'DATA FOUNDATION', summary: '配置、时间、坐标、单位、血缘和不确定度。', input: '全域原始数据、配置、模型与实验记录', output: '对时、版本化、可发现、可追溯的数据产品', aiRole: '语义映射与数据质量辅助；不得改写原始证据。', trust: '主数据、访问控制、校验和、版本与来源账本。', href: '/#domains', color: '#65e6d2', position: [425, 315], size: [176, 92], intensities: [3, 4, 4, 4, 4, 4] },
  { id: 'integration', no: '09', cn: '总体集成', en: 'WHOLE-PLANT', summary: '场景编排、协同仿真、接口契约、需求与 VVUQ。', input: '专业模型、数据服务、需求、配置与成熟度状态', output: '一致场景、工作流、证据链和电厂级决策视图', aiRole: '工作流规划与跨域协同；所有调用受权限和证据门约束。', trust: '接口测试、配置基线、VVUQ、变更与责任管理。', href: '/physics#integrated', color: '#e9fff6', position: [630, 315], size: [184, 94], intensities: [4, 4, 4, 4, 4, 4] },
  { id: 'ai', no: '10', cn: '智能原生', en: 'AI-NATIVE ENABLEMENT', summary: '代理模型、同化、异常识别、优化、基础模型与智能体。', input: '受治理的数据、物理先验、工具权限和使用场景', output: '带置信度的估计、预测、告警、候选方案与计划', aiRole: '跨域加速与知识协同，而不是凌驾于系统之上的“大脑”。', trust: '有效域、校准、独立验证、权限、安全门与人工授权。', href: '/ai', color: '#a98bff', position: [600, 152], size: [560, 56], intensities: [2, 2, 3, 3, 3, 2] },
];

const links: TwinLink[] = [
  { source: 'asset', target: 'diagnostics', type: 'data', relation: '实物观测', contract: '传感器标识、采样时钟、标定、质量与不确定度' },
  { source: 'diagnostics', target: 'data', type: 'data', relation: '可信状态', contract: '时间同步、坐标、单位、质量标记和残差' },
  { source: 'data', target: 'integration', type: 'governance', relation: '数字线程', contract: '装置 ID、配置版本、场景、血缘与访问权限' },
  { source: 'integration', target: 'hmi', type: 'governance', relation: '方案与证据', contract: '目标、备选方案、不确定度、V&V 状态和责任主体' },
  { source: 'hmi', target: 'control', type: 'command', relation: '意图与授权', contract: '操作目标、限制条件、批准范围和有效期' },
  { source: 'integration', target: 'control', type: 'governance', relation: '场景与约束', contract: '场景版本、模型版本、设备边界与控制有效域' },
  { source: 'control', target: 'gate', type: 'command', relation: '候选控制', contract: '确定性保护、物理约束、V&V 与权限检查' },
  { source: 'gate', target: 'asset', type: 'command', relation: '经验证执行', contract: '只有通过安全联锁和授权的命令才能执行', curve: 0.36 },
  { source: 'data', target: 'physics', type: 'data', relation: '配置与观测', contract: '几何、执行器、边界、诊断及其不确定度' },
  { source: 'data', target: 'engineering', type: 'data', relation: '资产与载荷', contract: 'CAD、材料、工况、载荷历史与测量数据' },
  { source: 'data', target: 'energy', type: 'data', relation: '热源与工况', contract: '热/中子源、流体状态、厂用电与电网信号' },
  { source: 'data', target: 'auxiliary', type: 'data', relation: '设备状态', contract: '设备配置、设定值、联锁与故障事件' },
  { source: 'physics', target: 'engineering', type: 'model', relation: '多物理载荷', contract: '时间基准、网格映射、守恒量、误差和适用域' },
  { source: 'engineering', target: 'energy', type: 'model', relation: '热工边界', contract: '热功率、温度、流量、压力和部件裕量' },
  { source: 'engineering', target: 'auxiliary', type: 'model', relation: '设备边界', contract: '冷却、低温、真空、电源能力和故障状态' },
  { source: 'physics', target: 'integration', type: 'governance', relation: '物理预测', contract: '模型版本、输入、输出、不确定度和验证状态' },
  { source: 'engineering', target: 'integration', type: 'governance', relation: '工程裕量', contract: '载荷工况、规范判据、余量和证据来源' },
  { source: 'energy', target: 'integration', type: 'governance', relation: '整厂性能', contract: '功率、效率、约束、瞬态和适用对象' },
  { source: 'auxiliary', target: 'control', type: 'data', relation: '执行器可用性', contract: '容量、速率、延迟、故障和联锁状态' },
  { source: 'ai', target: 'diagnostics', type: 'ai', relation: '感知增强', contract: '训练范围、置信度、漂移、盲测和降级策略' },
  { source: 'ai', target: 'data', type: 'ai', relation: '语义与质量辅助', contract: 'AI 可辅助映射和质量识别，但不得覆盖原始记录、版本与血缘' },
  { source: 'ai', target: 'integration', type: 'ai', relation: '工作流与知识协同', contract: '工具权限、证据状态、责任边界和全过程审计' },
  { source: 'ai', target: 'physics', type: 'ai', relation: '代理与同化', contract: '物理先验、适用域、校准和高保真对照' },
  { source: 'ai', target: 'engineering', type: 'ai', relation: 'ROM 与健康', contract: '训练设计、误差界、载荷范围和独立验证' },
  { source: 'ai', target: 'energy', type: 'ai', relation: '性能优化', contract: '约束、鲁棒性、外推监测和人工批准' },
  { source: 'ai', target: 'auxiliary', type: 'ai', relation: '故障与负荷预测', contract: '设备谱系、漂移、误报/漏报和回退逻辑' },
  { source: 'ai', target: 'hmi', type: 'ai', relation: '解释与协同', contract: '来源引用、权限、建议性质和责任边界' },
  { source: 'ai', target: 'control', type: 'ai', relation: '候选策略', contract: 'AI 不直连执行器；必须经过控制器、验证与安全门' },
  { source: 'integration', target: 'data', type: 'governance', relation: '证据回写', contract: '决策、模型版本、残差、批准和执行结果回写不可篡改证据链', curve: -0.18 },
];

const timeScales = [
  ['μs—ms', '采集、联锁与快速保护'],
  ['ms—s', '状态估计、位形与稳定性控制'],
  ['s—h', '脉冲、排热、热工与辅机过程'],
  ['h—月', '实验计划、运行周期与检修'],
  ['年—数十年', '设计、老化、升级与退役'],
];

const edgeStyle = {
  data: { color: '#65e6d2', type: 'solid' as const, width: 1.7 },
  model: { color: '#ff9b54', type: 'dashed' as const, width: 1.6 },
  governance: { color: '#d7e5de', type: 'solid' as const, width: 1.1 },
  command: { color: '#ff8738', type: 'solid' as const, width: 2.4 },
  ai: { color: '#a98bff', type: 'dashed' as const, width: 1.5 },
};

function selectedPhaseIndex(id: PhaseId) {
  return id === 'overview' ? -1 : PHASE_IDS.indexOf(id);
}

function nodeLabel(module: TwinModule) {
  if (module.id === 'ai') return `{no|${module.no}}  {cn|${module.cn}}  {en|${module.en}}`;
  return `{no|${module.no}}  {cn|${module.cn}}\n{en|${module.en}}`;
}

function readChartDatum(params: unknown) {
  if (!params || typeof params !== 'object') return null;
  const data = (params as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  return data as Record<string, unknown>;
}

export default function FusionTwinSystemMap() {
  const mountRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const [selectedPhase, setSelectedPhase] = useState<PhaseId>('overview');
  const [selectedModule, setSelectedModule] = useState<ModuleId | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const phase = phases.find((item) => item.id === selectedPhase) ?? phases[0];
  const activeModule = selectedModule ? modules.find((item) => item.id === selectedModule) ?? null : null;
  const phaseIndex = selectedPhaseIndex(selectedPhase);

  const option = useMemo<EChartsCoreOption>(() => {
    const directlyRelated = new Set<string>();
    if (selectedModule) {
      directlyRelated.add(selectedModule);
      for (const link of links) {
        if (link.source === selectedModule) directlyRelated.add(link.target);
        if (link.target === selectedModule) directlyRelated.add(link.source);
      }
    }

    const phaseNodes: ChartNode[] = PHASE_IDS.map((id, index) => {
      const item = phases.find((candidate) => candidate.id === id)!;
      const isActive = selectedPhase === id;
      return {
        id: `phase-${id}`,
        name: `${item.cn}\n${item.scale}`,
        kind: 'phase',
        phaseId: id,
        x: 120 + index * 190,
        y: 42,
        symbol: 'roundRect',
        symbolSize: [164, 62],
        itemStyle: {
          color: isActive ? '#17372d' : '#0d1814',
          borderColor: isActive ? '#ff8738' : '#345047',
          borderWidth: isActive ? 2.4 : 1,
          shadowBlur: isActive ? 18 : 0,
          shadowColor: '#ff873866',
        },
        label: { color: isActive ? '#ffffff' : '#b7c9bf', fontSize: 11, lineHeight: 18, fontWeight: 700 },
        tooltipText: `<b>${item.cn} / ${item.en}</b><br/>典型尺度：${item.scale}<br/>${item.focus}`,
      };
    });

    const moduleNodes: ChartNode[] = modules.map((item) => {
      const intensity = phaseIndex < 0 ? 4 : item.intensities[phaseIndex];
      const selected = selectedModule === item.id;
      const connected = !selectedModule || directlyRelated.has(item.id);
      const opacity = selectedModule ? (selected ? 1 : connected ? 0.72 : 0.18) : 0.46 + intensity * 0.135;
      return {
        id: item.id,
        name: nodeLabel(item),
        kind: 'module',
        moduleId: item.id,
        x: item.position[0],
        y: item.position[1],
        symbol: 'roundRect',
        symbolSize: item.size,
        itemStyle: {
          color: item.id === 'ai' ? '#1b1530' : '#0d1815',
          opacity,
          borderColor: item.color,
          borderWidth: selected ? 3 : Math.max(1, intensity * 0.55),
          borderType: item.id === 'ai' ? 'dashed' : 'solid',
          shadowBlur: selected || item.id === 'ai' ? 18 : intensity >= 4 ? 8 : 0,
          shadowColor: `${item.color}66`,
        },
        label: {
          formatter: nodeLabel(item),
          rich: {
            no: { color: item.color, fontFamily: FONT, fontSize: 9, fontWeight: 800 },
            cn: { color: '#f5fff9', fontFamily: FONT, fontSize: item.id === 'ai' ? 16 : 14, fontWeight: 700 },
            en: { color: '#8ea79b', fontFamily: FONT, fontSize: 8, lineHeight: 18, fontWeight: 700 },
          },
        },
        tooltipText: `<b>${item.no} · ${item.cn}</b><br/>${item.summary}<br/>阶段参与：${phaseIndex < 0 ? '跨全生命周期' : INTENSITY_LABELS[intensity - 1]}`,
      };
    });

    const boundaryNodes: ChartNode[] = [
      {
        id: 'map-bound-start', name: '', kind: 'boundary', x: -40, y: -10, symbol: 'circle', symbolSize: 1,
        itemStyle: { opacity: 0 }, label: { show: false }, tooltipText: '',
      },
      {
        id: 'map-bound-end', name: '', kind: 'boundary', x: 1220, y: 620, symbol: 'circle', symbolSize: 1,
        itemStyle: { opacity: 0 }, label: { show: false }, tooltipText: '',
      },
      {
        id: 'asset', name: '实体聚变装置\nPHYSICAL ASSET', kind: 'boundary', x: 55, y: 365, symbol: 'circle', symbolSize: 116,
        itemStyle: { color: '#27170f', borderColor: '#ff8738', borderWidth: 2.5, shadowBlur: 20, shadowColor: '#ff873844' },
        label: { color: '#ffd8bd', fontSize: 11, lineHeight: 18, fontWeight: 700 },
        tooltipText: '<b>实体聚变装置</b><br/>实验系统、聚变堆或电厂及其真实传感器、执行器与配置状态。',
      },
      {
        id: 'gate', name: '安全与授权门\nSAFETY GATE', kind: 'boundary', x: 1125, y: 365, symbol: 'diamond', symbolSize: 122,
        itemStyle: { color: '#261a10', borderColor: '#ff8738', borderWidth: 2.5, shadowBlur: 18, shadowColor: '#ff873844' },
        label: { color: '#ffd8bd', fontSize: 11, lineHeight: 18, fontWeight: 700 },
        tooltipText: '<b>安全与授权门</b><br/>物理约束、V&V、确定性保护、联锁和人员授权共同限制动作通道。',
      },
    ];

    const linkData = links.map((link) => {
      const style = edgeStyle[link.type];
      const relevant = !selectedModule || link.source === selectedModule || link.target === selectedModule;
      return {
        ...link,
        lineStyle: {
          color: style.color,
          width: relevant ? style.width : 0.7,
          type: style.type,
          opacity: relevant ? (link.type === 'governance' ? 0.48 : 0.72) : 0.05,
          curveness: link.curve ?? (link.type === 'ai' ? 0.08 : 0.04),
        },
      };
    });

    return {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: FONT },
      aria: {
        enabled: true,
        description: '聚变装置数字孪生全生命周期与十项能力的固定布局系统地图。智能原生跨域赋能，但所有控制动作必须通过安全与授权门。',
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: '#07100ded',
        borderColor: '#4d6a5d',
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: '#dcebe4', fontFamily: FONT, fontSize: 11, lineHeight: 18 },
        formatter: (params: unknown) => {
          const datum = readChartDatum(params);
          if (!datum) return '';
          if (typeof datum.tooltipText === 'string') return datum.tooltipText;
          if (typeof datum.relation === 'string') return `<b>${datum.relation}</b><br/>接口契约：${String(datum.contract ?? '')}`;
          return '';
        },
      },
      series: [{
        type: 'graph',
        layout: 'none',
        left: 32,
        right: 32,
        top: 18,
        bottom: 26,
        roam: false,
        silent: false,
        animationDurationUpdate: 420,
        data: [...phaseNodes, ...moduleNodes, ...boundaryNodes],
        links: linkData,
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 6],
        lineStyle: { opacity: 0.5 },
        label: { show: true, position: 'inside', fontFamily: FONT },
        emphasis: { focus: 'adjacency', scale: 1.04, lineStyle: { opacity: 1, width: 2.6 } },
      }],
    };
  }, [phaseIndex, selectedModule, selectedPhase]);

  const latestOptionRef = useRef(option);
  useLayoutEffect(() => {
    latestOptionRef.current = option;
  }, [option]);

  useEffect(() => {
    if (!mountRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | undefined;
    let resizeFallback: (() => void) | undefined;

    void import('./charts/echartsRuntime')
      .then(({ init }) => {
        if (cancelled || !mountRef.current) return;
        const chart = init(mountRef.current, undefined, { renderer: 'svg', useCoarsePointer: true });
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        chart.setOption({ ...latestOptionRef.current, animation: !reduceMotion }, true);
        chart.on('click', (params: unknown) => {
          const datum = readChartDatum(params);
          if (datum?.kind === 'module' && typeof datum.moduleId === 'string') {
            const moduleId = datum.moduleId as ModuleId;
            setSelectedModule((current) => current === moduleId ? null : moduleId);
          }
          if (datum?.kind === 'phase' && typeof datum.phaseId === 'string') {
            setSelectedPhase(datum.phaseId as PhaseId);
          }
        });
        chartRef.current = chart;
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
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    chartRef.current.setOption({ ...option, animation: !reduceMotion }, true);
  }, [option]);

  return (
    <section className="fusionTwinMapSection" id="mainline" aria-labelledby="fusion-twin-map-title" data-echart="fusion-twin-system-map">
      <div className="fusionTwinMapIntro">
        <div>
          <p className="sectionIndex">00—01 / FUSION DIGITAL TWIN SYSTEM MAP</p>
          <h2 id="fusion-twin-map-title">一个装置 · 一条数字主线 · 十项协同能力</h2>
          <p>聚变数字孪生不是三维外观，也不是一个万能求解器；它是贯穿设计、建造、调试、运行、维护升级与退役，以配置受控的数据、经验证的多保真模型和可追溯证据支撑人机决策的持续系统。</p>
          <small>ONE ASSET · ONE DIGITAL THREAD · TEN COORDINATED CAPABILITIES</small>
        </div>
        <aside>
          <b>AI-NATIVE / GOVERNED ENABLEMENT</b>
          <p>AI 加速感知、代理建模、优化与知识协同，但不替代物理约束、验证证据、确定性保护和人的授权。</p>
        </aside>
      </div>

      <div className="fusionTwinMapShell">
        <div className="fusionTwinPhaseTabs" role="group" aria-label="选择聚变装置生命周期阶段">
          {phases.map((item) => (
            <button key={item.id} type="button" className={selectedPhase === item.id ? 'isActive' : ''} aria-pressed={selectedPhase === item.id} onClick={() => setSelectedPhase(item.id)}>
              <span>{item.cn}{item.id !== 'overview' && <i>{item.en}</i>}</span><small>{item.id === 'overview' ? item.scale : item.baseline}</small>
            </button>
          ))}
        </div>

        <div className="fusionTwinModuleDock" aria-label="十项数字孪生能力的键盘导航">
          <p>CAPABILITY FOCUS / 能力聚焦</p>
          <div>
            {modules.map((item) => (
              <button
                key={item.id}
                type="button"
                data-module-id={item.id}
                className={selectedModule === item.id ? 'isActive' : ''}
                aria-pressed={selectedModule === item.id}
                style={{ '--module-color': item.color } as CSSProperties}
                onClick={() => setSelectedModule((current) => current === item.id ? null : item.id)}
              >
                <b>{item.no}</b><span>{item.cn}</span><small>{item.en}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="fusionTwinMapViewport" aria-label="可横向滚动查看完整系统地图">
          <div className="fusionTwinMapCanvas">
            <div className={`fusionTwinMapFallback${ready ? ' isHidden' : ''}`} aria-hidden={ready || undefined}>
              <div className="fallbackAi">10 · 智能原生 / AI-NATIVE — 受治理的跨域赋能轨道</div>
              <div className="fallbackCore"><span>实体装置</span><i>→</i><span>诊断感知</span><i>→</i><span>数据基座</span><i>→</i><span>总体集成</span><i>→</i><span>人机交互</span><i>→</i><span>集成控制</span><i>→</i><span>安全与授权门</span></div>
              <div className="fallbackModels">{modules.filter((item) => ['physics', 'engineering', 'energy', 'auxiliary'].includes(item.id)).map((item) => <button type="button" key={item.id} onClick={() => setSelectedModule(item.id)}>{item.no} · {item.cn}<small>{item.en}</small></button>)}</div>
            </div>
            <div ref={mountRef} className={`fusionTwinMapMount${ready ? ' isReady' : ''}`} role="img" aria-label="聚变装置数字孪生全生命周期、十项能力、数据与控制闭环以及人工智能赋能关系图" aria-hidden={!ready || undefined} />
            {!ready && !failed && <span className="fusionTwinMapStatus">交互系统地图加载中…</span>}
            {failed && <span className="fusionTwinMapStatus">交互图未加载，当前显示可读结构图。</span>}
          </div>
        </div>

        <div className="fusionTwinMapDetails" aria-live="polite">
          <article className="phaseDetail">
            <p>{phase.baseline}</p>
            <h3>{phase.cn} <small>{phase.en}</small></h3>
            <b>{phase.scale}</b>
            <div>{phase.focus}</div>
            <span>证据门：{phase.evidence}</span>
          </article>
          <article className={`moduleDetail${activeModule ? ' hasModule' : ''}`}>
            {activeModule ? <>
              <p style={{ color: activeModule.color }}>{activeModule.no} / {activeModule.en}</p>
              <h3>{activeModule.cn}</h3>
              <div className="moduleIo"><span><b>输入</b>{activeModule.input}</span><span><b>输出</b>{activeModule.output}</span></div>
              <p><b>AI 赋能：</b>{activeModule.aiRole}</p>
              <p><b>可信门：</b>{activeModule.trust}</p>
              <a href={activeModule.href}>进入相关知识域 ↗</a>
            </> : <>
              <p>DIGITAL TWIN DECISION LOOP</p>
              <h3>观测 → 同化 → 估计 → 预测 → 量化不确定度 → 人机决策 → 安全执行 → 证据回写</h3>
              <div>点击任一模块查看输入、输出、AI 作用与可信边界；点击生命周期阶段查看能力权重如何随装置状态变化。</div>
              <span>任何预测都必须绑定配置、时间、坐标、单位、不确定度、来源与 V&V 状态。</span>
            </>}
          </article>
        </div>

        <div className="fusionTwinTimeScale" aria-label="聚变数字孪生嵌套时间尺度">
          <p>NESTED CLOCKS / 嵌套时间尺度</p>
          <div>{timeScales.map(([scale, copy]) => <span key={scale}><b>{scale}</b><small>{copy}</small></span>)}</div>
        </div>

        <div className="fusionTwinMapLegend">
          <span className="dataFlow">观测 / 数据流</span><span className="modelFlow">模型耦合</span><span className="evidenceFlow">配置 / 证据</span><span className="commandFlow">经验证控制</span><span className="aiFlow">AI 候选与加速</span>
          <p>图中生命周期为示意性典型范围，不是项目工期承诺；模块强度表示相对参与程度，不表示技术成熟度或安全等级。维护升级与运行可重复交叠，能量转化对纯实验装置可能不适用。</p>
        </div>
      </div>

      <div className="srOnly">
        十个模块包括：{modules.map((item) => item.cn).join('、')}。人工智能不得直接连接装置执行器；安全相关动作仍由确定性保护、联锁、经验证控制逻辑和授权机制约束。
      </div>
    </section>
  );
}
