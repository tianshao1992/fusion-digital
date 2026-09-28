/** Editorial data supplied with the 2026-09-28 homepage brief; not a shot database. */
export const controlEvidence = {
  suppliedOn: '2026-09-28',
  proposedCutoff: '2026-09-30',
  cumulativeFloor: 750,
  verified: false,
  stages: [
    { period: '2025.07', success: 8, source: 'slide-reading', estimated: false },
    { period: '2025 Q4', success: 18 + 26, source: 'slide-merged', estimated: false },
    { period: '2026 Q1', success: 64, source: 'slide', estimated: false },
    { period: '2026 Q2–Q3', success: 750 - 8 - (18 + 26) - 64, source: 'estimated-residual', estimated: true },
  ],
} as const;

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
  { name: 'FusionDigital', kind: ['数字孪生 · 验证方案', 'DIGITAL TWIN · VERIFY'], clock: ['跨炮 / 分钟级', 'BETWEEN SHOTS / MINUTES'], headline: ['让每一次放电，先在数字世界验证。', 'Test the next discharge in a digital world.'], copy: ['以实验校准模型，预测候选方案，评估不确定度与适用边界，形成可追溯证据。', 'Calibrate models against experiments. Predict candidate outcomes and assess uncertainty, validity and evidence.'], tags: [['多保真模型', '虚拟实验', 'V&V / UQ'], ['Multi-fidelity models', 'Virtual experiments', 'V&V / UQ']] },
  { name: 'FusionControl', kind: ['实时控制 · 执行策略', 'REAL-TIME CONTROL · EXECUTE'], clock: ['单炮 / 亚毫秒级目标', 'WITHIN SHOT / SUB-MS TARGET'], headline: ['让经过验证的策略，进入受约束的运行。', 'Bring validated policies into bounded operation.'], copy: ['经人工审批与安全门后，由独立实时系统执行冻结策略，持续接受联锁、限值与回退保护。', 'After approval and safety gates, an independent real-time system executes frozen policies under limits, interlocks and fallback.'], tags: [['状态估计', '策略执行', '安全回退'], ['State estimation', 'Policy execution', 'Safe fallback']] },
] as const;
