export type KnowledgeModuleStatus = '已开放' | '建设中' | '规划中';

export type KnowledgeModuleResource = {
  label: string;
  href: string;
  kind: '页面' | '报告' | '数据' | '架构';
};

export type KnowledgeModule = {
  id: string;
  number: string;
  title: string;
  keyword: string;
  status: KnowledgeModuleStatus;
  summary: string;
  topics: string[];
  resources: KnowledgeModuleResource[];
  researchPage?: string;
};

export const knowledgeModules: KnowledgeModule[] = [
  {
    id: 'physics', number: '01', title: '物理模拟', keyword: 'PHYSICS', status: '已开放',
    summary: '连接平衡、输运、MHD、边界、粒子与中子过程，组织多保真物理模型和装置证据。',
    topics: ['平衡与位形', '输运与加热', 'MHD 稳定性', '边界与等离子体壁相互作用', '中子与燃料循环'],
    researchPage: '/physics',
    resources: [
      { label: '物理研究页面', href: '/physics', kind: '页面' },
      { label: '物理模拟技术报告', href: '/fusion-physics-simulation-report.pdf', kind: '报告' },
    ],
  },
  {
    id: 'engineering', number: '02', title: '工程仿真', keyword: 'ENGINEERING', status: '已开放',
    summary: '把等离子体载荷连接到电磁、结构、磁体、热流体、中子、氚、安全和维护分析。',
    topics: ['CAD / PLM', '电磁与结构', '磁体与失超', '热流体', '核工程与维护'],
    researchPage: '/engineering',
    resources: [
      { label: '工程研究页面', href: '/engineering', kind: '页面' },
      { label: '工程仿真 PDF', href: '/tokamak-engineering-simulation-report.pdf', kind: '报告' },
      { label: '工程仿真 Word', href: '/tokamak-engineering-simulation-report.docx', kind: '报告' },
    ],
  },
  {
    id: 'control', number: '03', title: '集成控制', keyword: 'CONTROL', status: '已开放',
    summary: '按控制任务、装置和 PCS 组织状态估计、位形、剖面、稳定性、排热和多执行器协调。',
    topics: ['状态估计', '位形与剖面', '稳定性控制', '执行器协调', 'SIL / HIL'],
    researchPage: '/control',
    resources: [
      { label: '集成控制研究页面', href: '/control', kind: '页面' },
      { label: '集成控制报告', href: '/fusion-integrated-control-research-report.docx', kind: '报告' },
      { label: '论文与代码索引', href: '/fusion-control-paper-code-index.csv', kind: '数据' },
    ],
  },
  {
    id: 'diagnostics', number: '04', title: '诊断感知', keyword: 'SENSING', status: '已开放',
    summary: '从传感器、几何和标定出发，连接采集质控、反演、合成诊断、同化与实时决策接口。',
    topics: ['诊断几何', '标定与质控', '反演与层析', '合成诊断', '多模态状态估计'],
    researchPage: '/diagnostics',
    resources: [
      { label: '诊断研究页面', href: '/diagnostics', kind: '页面' },
      { label: '诊断技术报告', href: '/fusion-diagnostics-research-report.docx', kind: '报告' },
      { label: '论文与代码索引', href: '/fusion-diagnostics-paper-code-index.csv', kind: '数据' },
    ],
  },
  {
    id: 'energy', number: '05', title: '能量转化', keyword: 'ENERGY', status: '规划中',
    summary: '研究包层热取出、一次与二次回路、发电循环、厂用电和电网接口。',
    topics: ['包层热取出', '热力循环', '厂用电', '储能与电网'],
    resources: [
      { label: '模块路线图', href: '/knowledge-graph/roadmap', kind: '架构' },
      { label: '平台接入路线', href: '/platform#roadmap', kind: '架构' },
    ],
  },
  {
    id: 'auxiliary', number: '06', title: '辅机模拟', keyword: 'AUXILIARY', status: '规划中',
    summary: '覆盖真空、低温、燃料、加热与电流驱动、冷却和电源等装置辅助系统。',
    topics: ['真空', '低温', '燃料与氚', '冷却', '电源与加热'],
    resources: [
      { label: '模块路线图', href: '/knowledge-graph/roadmap', kind: '架构' },
      { label: '平台接入路线', href: '/platform#architecture', kind: '架构' },
    ],
  },
  {
    id: 'hmi', number: '07', title: '人机交互', keyword: 'HMI', status: '建设中',
    summary: '面向研究人员和运行人员组织态势感知、解释、方案比较和人在回路操作。',
    topics: ['态势感知', '告警解释', '方案比较', '三维交互', '人在回路'],
    resources: [
      { label: '数字样机工作台', href: '/#prototype-workspace', kind: '页面' },
      { label: '证据检索', href: '/search', kind: '页面' },
    ],
  },
  {
    id: 'data', number: '08', title: '数据基座', keyword: 'DATA', status: '建设中',
    summary: '统一装置、部件、炮号、时间、坐标、单位、版本与血缘，连接实验和工程数据资产。',
    topics: ['MDSplus', 'NAS 与对象存储', 'CAD / CAE 数据', '知识文档', '数据血缘'],
    resources: [
      { label: '数据合同与接入路线', href: '/platform#contracts', kind: '架构' },
      { label: '知识图谱', href: '/knowledge-graph#graph', kind: '页面' },
    ],
  },
  {
    id: 'integration', number: '09', title: '总体集成', keyword: 'INTEGRATION', status: '建设中',
    summary: '以统一需求、系统架构、接口合同、配置基线和 VVUQ 组织跨专业数字线程。',
    topics: ['系统架构', '协同仿真', '接口合同', '配置管理', 'VVUQ'],
    resources: [
      { label: '十模块系统图', href: '/knowledge-graph/system-map', kind: '架构' },
      { label: '平台总体架构', href: '/platform#architecture', kind: '架构' },
    ],
  },
  {
    id: 'ai', number: '10', title: '智能原生', keyword: 'AI', status: '已开放',
    summary: '连接代理模型、多模态表征、优化、基础模型与智能体，服务于检索、分析和受控工具编排。',
    topics: ['代理模型', '多模态状态', '科学机器学习', '基础模型', '智能体'],
    researchPage: '/ai',
    resources: [
      { label: '智能原生研究页面', href: '/ai', kind: '页面' },
      { label: '智能原生报告', href: '/fusion-ai-native-research-report.docx', kind: '报告' },
      { label: '论文与代码索引', href: '/fusion-ai-native-paper-code-index.csv', kind: '数据' },
    ],
  },
];

export function getKnowledgeModule(id: string) {
  return knowledgeModules.find((item) => item.id === id);
}

