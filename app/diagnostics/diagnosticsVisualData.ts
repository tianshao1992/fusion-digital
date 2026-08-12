export const diagnosticsTimescaleData = [
  { label: '高频磁 / Mirnov / 快事件', minSeconds: 1e-6, maxSeconds: 1e-2, color: '#ff7a21' },
  { label: '反射计 / ECE / 波动成像', minSeconds: 1e-5, maxSeconds: 1e-1, color: '#20aa9d' },
  { label: '平衡 / 位形 / 实时状态', minSeconds: 1e-4, maxSeconds: 1, color: '#806bd4' },
  { label: '光谱 / 辐射 / 热负荷', minSeconds: 1e-4, maxSeconds: 10 ** 1.5, color: '#3d866a' },
  { label: 'Thomson / 剖面产品', minSeconds: 1e-3, maxSeconds: 10, color: '#ff7a21' },
  { label: '燃料循环 / 真空 / 低温', minSeconds: 10 ** -0.5, maxSeconds: 10 ** 5.5, color: '#20aa9d' },
  { label: '标定漂移 / 维护趋势', minSeconds: 1e3, maxSeconds: 1e8, color: '#806bd4' },
  { label: '材料损伤 / 寿命 / 退役', minSeconds: 10 ** 4.5, maxSeconds: 1e9, color: '#3d866a' },
] as const;

export const diagnosticsRoadmapData = [
  { id: 'R0', title: '配置与磁诊断基线', startMonth: 0, endMonth: 12, period: '0–12 月', gate: '几何 / 标定 / 时钟 / MEQ–DINA 回放', color: '#20aa9d' },
  { id: 'R1', title: '合成诊断与独立观测', startMonth: 12, endMonth: 24, period: '12–24 月', gate: '干涉 / ECE / TS / IR / bolometry 观测闭环', color: '#806bd4' },
  { id: 'R2', title: '多诊断状态服务', startMonth: 18, endMonth: 36, period: '18–36 月', gate: '联合反演 · UQ · 残差 · 质量门', color: '#3d866a' },
  { id: 'R3', title: '诊断系统 SIL / HIL', startMonth: 30, endMonth: 48, period: '30–48 月', gate: '真实采集 / 网络 / PCS / 故障注入', color: '#ff7a21' },
  { id: 'R4', title: '受治理在线能力', startMonth: 42, endMonth: 60, period: '42–60 月', gate: '影子 → 只读 → 有限闭环 · 可回滚', color: '#bd4f43' },
  { id: 'R5', title: '整厂诊断孪生', startMonth: 48, endMonth: 96, period: '48–96 月', gate: '设备健康 · RAMI · 寿命 · 维护优化', color: '#20aa9d' },
] as const;
