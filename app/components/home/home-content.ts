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
  { id: '01', href: '/#prototype-workspace', title: ['数字样机', 'Digital prototypes'], sub: 'EXPLORE THE DEVICE', copy: ['在多装置三维视图中探索装配、剖切、平衡重建与诊断覆盖。', 'Explore assemblies, sections, reconstructed equilibria and diagnostic coverage across devices.'] },
  { id: '02', href: '/fusion-data', title: ['聚变数据', 'Fusion data'], sub: 'CONNECT THE EVIDENCE', copy: ['按炮次连接实验信号、数据语义和来源。公开快照，不是实时遥测。', 'Connect shot signals, semantics and provenance. Public snapshots, not live telemetry.'] },
  { id: '03', href: '/simulations', title: ['仿真引擎', 'Simulation engines'], sub: 'TEST IN THE DIGITAL WORLD', copy: ['探索 FUSE、TORAX、CHERAB–Raysect 等模拟结果与可追溯计算流程。', 'Explore FUSE, TORAX and CHERAB–Raysect results with traceable simulation workflows.'] },
  { id: '04', href: '/search', title: ['证据检索', 'Evidence search'], sub: 'FIND THE SOURCE', copy: ['从问题追溯论文、代码与装置资料。公开版提供确定性检索。', 'Trace questions to papers, code and facility sources through deterministic public search.'] },
  { id: '05', href: '/knowledge-graph', title: ['知识图谱', 'Knowledge graph'], sub: 'SEE THE CONNECTIONS', copy: ['连接物理、工程、诊断与控制，让研究结论回到原始依据。', 'Connect physics, engineering, diagnostics and control, with conclusions linked to sources.'] },
  { id: '06', href: '/facilities', title: ['装置观测台', 'Fusion facilities'], sub: 'FOLLOW THE PROGRESS', copy: ['按生命周期浏览聚变装置，追踪工程进展、来源与核验日期。', 'Browse fusion facilities by lifecycle, with engineering progress, sources and review dates.'] },
] as const;

export const layers = [
  { name: 'FusionEvolve', kind: ['智能体 · 提出方案', 'AGENTS · PROPOSE'], clock: ['跨装置 / 天级', 'CROSS-DEVICE / DAYS'], headline: ['把每一次经验，变成下一次决策。', 'Turn every experiment into the next decision.'], copy: ['专家设定目标与边界，智能体连接知识、编排工具、形成候选实验方案。', 'Experts define goals and boundaries. Agents connect knowledge, orchestrate tools and propose experiments.'], tags: [['任务规划', '知识积累', '工具编排'], ['Planning', 'Knowledge', 'Orchestration']] },
  { name: 'FusionDigital', kind: ['数字孪生 · 验证方案', 'DIGITAL TWIN · VERIFY'], clock: ['跨炮 / 分钟级', 'BETWEEN SHOTS / MINUTES'], headline: ['让每一次放电，先在数字世界验证。', 'Test the next discharge in a digital world.'], copy: ['以实验校准模型，预测候选方案，评估不确定度与适用边界，形成可追溯证据。', 'Calibrate models against experiments. Predict candidate outcomes and assess uncertainty, validity and evidence.'], tags: [['多保真模型', '虚拟实验', 'V&V / UQ'], ['Multi-fidelity models', 'Virtual experiments', 'V&V / UQ']] },
  { name: 'FusionControl', kind: ['实时控制 · 执行策略', 'REAL-TIME CONTROL · EXECUTE'], clock: ['单炮 / 亚毫秒级目标', 'WITHIN SHOT / SUB-MS TARGET'], headline: ['让经过验证的策略，进入受约束的运行。', 'Bring validated policies into bounded operation.'], copy: ['经人工审批与安全门后，由独立实时系统执行冻结策略，持续接受联锁、限值与回退保护。', 'After approval and safety gates, an independent real-time system executes frozen policies under limits, interlocks and fallback.'], tags: [['状态估计', '策略执行', '安全回退'], ['State estimation', 'Policy execution', 'Safe fallback']] },
] as const;
