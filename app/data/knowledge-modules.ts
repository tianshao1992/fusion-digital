export const knowledgeModules = [
  { id: 'physics', no: '01', zh: '物理模拟', en: 'Physics', href: '/physics' },
  { id: 'engineering', no: '02', zh: '工程仿真', en: 'Engineering', href: '/engineering' },
  { id: 'control', no: '03', zh: '集成控制', en: 'Control', href: '/control' },
  { id: 'diagnostics', no: '04', zh: '诊断感知', en: 'Diagnostics', href: '/diagnostics' },
  { id: 'energy', no: '05', zh: '能量转化', en: 'Energy', href: '/#domain-energy' },
  { id: 'auxiliary', no: '06', zh: '辅机模拟', en: 'Auxiliary', href: '/#domain-auxiliary' },
  { id: 'hmi', no: '07', zh: '人机交互', en: 'Human-machine', href: '/#domain-hmi' },
  { id: 'data', no: '08', zh: '数据基座', en: 'Data', href: '/#domain-data' },
  { id: 'integration', no: '09', zh: '总体集成', en: 'Integration', href: '/#domain-integration' },
  { id: 'ai', no: '10', zh: '智能原生', en: 'AI-native', href: '/ai' },
] as const;

export type KnowledgeModuleId = (typeof knowledgeModules)[number]['id'];
