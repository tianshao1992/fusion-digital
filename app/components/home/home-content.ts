/** User-supplied chart and experimental summary, received 2026-10-01; not a shot database. */
export const controlEvidence = {
  suppliedOn: '2026-10-01',
  applicationFloor: 700,
  verified: false,
  stages: [
    { period: '2025 Q2', total: 15, success: 8, failed: 7, operation: 0, reportedRate: 53, ratePending: false },
    { period: '2025 Q4', total: 70, success: 44, failed: 19, operation: 7, reportedRate: 70, ratePending: false },
    { period: '2026 Q1', total: 95, success: 64, failed: 21, operation: 10, reportedRate: 73, ratePending: true },
    { period: '2026 Q3', total: 606, success: 562, failed: 33, operation: 11, reportedRate: 94, ratePending: false },
  ],
} as const;

export const controlTotals = controlEvidence.stages.reduce((total, item) => ({
  total: total.total + item.total, success: total.success + item.success,
  failed: total.failed + item.failed, operation: total.operation + item.operation,
}), { total: 0, success: 0, failed: 0, operation: 0 });

export const capabilities = [
  { id: '01', href: '/digital-prototype', title: ['数字样机', 'Digital prototypes'], short: ['三维装置与放电回放', '3D devices & shot replay'] },
  { id: '02', href: '/fusion-data', title: ['聚变数据', 'Fusion data'], short: ['炮次、信号与数据来源', 'Shots, signals & provenance'] },
  { id: '03', href: '/simulations', title: ['仿真引擎', 'Simulation engines'], short: ['计算流程与模拟结果', 'Workflows & simulation results'] },
  { id: '04', href: '/search', title: ['证据检索', 'Evidence search'], short: ['论文、代码与原始依据', 'Papers, code & original sources'] },
  { id: '05', href: '/knowledge-graph', title: ['知识图谱', 'Knowledge graph'], short: ['连接跨领域研究', 'Connected research'] },
  { id: '06', href: '/facilities', title: ['装置观测台', 'Fusion facilities'], short: ['全球装置与工程进展', 'Devices & engineering progress'] },
] as const;

export const layers = [
  { name: 'FusionEvolve', kind: ['智能体 · 提出方案', 'AGENTS · PROPOSE'], clock: ['跨装置 / 天级', 'CROSS-DEVICE / DAYS'], headline: ['把每一次经验，变成下一次决策。', 'Turn every experiment into the next decision.'], copy: ['专家设定目标与边界，智能体连接知识、编排工具、形成候选实验方案。', 'Experts define goals and boundaries. Agents connect knowledge, orchestrate tools and propose experiments.'], tags: [['任务规划', '知识积累', '工具编排'], ['Planning', 'Knowledge', 'Orchestration']] },
  { name: 'FusionDigital', kind: ['数字孪生 · 训练与验证', 'DIGITAL TWIN · TRAIN & VERIFY'], clock: ['跨炮 / 分钟级', 'BETWEEN SHOTS / MINUTES'], headline: ['让每一次放电，先在数字世界验证。', 'Test the next discharge in a digital world.'], copy: ['承接 FusionEvolve 的候选方案，以实验校准模型，为 FusionControl 提供强化学习训练环境、策略评测与可追溯验证证据；再用真实放电反馈更新模型。', 'Evaluate FusionEvolve proposals with experiment-calibrated models. Provide RL training environments, policy evaluation and traceable validation evidence for FusionControl; use real discharge feedback to update the twin.'], tags: [['多保真模型', '策略训练', 'V&V / UQ'], ['Multi-fidelity models', 'Policy training', 'V&V / UQ']] },
  { name: 'FusionControl', kind: ['实时控制 · 执行策略', 'REAL-TIME CONTROL · EXECUTE'], clock: ['单炮 / 亚毫秒级目标', 'WITHIN SHOT / SUB-MS TARGET'], headline: ['让经过验证的策略，进入受约束的运行。', 'Bring validated policies into bounded operation.'], copy: ['经人工审批与安全门后，由独立实时系统执行冻结策略，持续接受联锁、限值与回退保护。', 'After approval and safety gates, an independent real-time system executes frozen policies under limits, interlocks and fallback.'], tags: [['状态估计', '策略执行', '安全回退'], ['State estimation', 'Policy execution', 'Safe fallback']] },
] as const;
