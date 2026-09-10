// Browser-safe capability and recipe registry. Runtime launch plans live in scripts/.
import { CONTROL_SOURCE_COMMIT } from '../control/contracts.ts';
export const TORAX_COMMIT = '4aea2377385ba4dfe37b0ef4396374162af1314b';
export const FUSE_SOURCE_COMMIT = '9ef2f99af73497706a097d99a2aaac2f08405370';
export type EngineDescriptor = {
  id: string; name: string; version: string; commit: string; runtime: string;
  domains: readonly string[]; capabilities: readonly string[];
  inputProfiles: readonly string[]; outputProfiles: readonly string[];
  execution: 'local-adapter' | 'legacy-adapter' | 'cloud-adapter'; checkpoint: boolean;
};
export const engines: readonly EngineDescriptor[] = [
  ...(['fge', 'dina'] as const).map(id => ({ id, name: id.toUpperCase(), version: id === 'fge' ? 'linear HFM' : 'warm-start', commit: CONTROL_SOURCE_COMMIT, runtime: 'Linux Docker / Python', domains: ['control'], capabilities: ['virtual-discharge', 'control-timeseries'], inputProfiles: ['control-runspec.v1'], outputProfiles: ['control-result.v1', 'control-coupling-assessment.v1'], execution: 'cloud-adapter' as const, checkpoint: false })),
  { id: 'fuse', name: 'FUSE', version: '1.2.0', commit: FUSE_SOURCE_COMMIT, runtime: 'Julia', domains: ['physics', 'engineering'], capabilities: ['equilibrium', 'core-transport', 'sources', 'engineering', 'plant-design'], inputProfiles: ['imas-native', 'simulation-runspec.v1'], outputProfiles: ['fuse-physics.v2', 'core-profile-snapshot.v1'], execution: 'legacy-adapter', checkpoint: false },
  { id: 'torax', name: 'TORAX', version: '1.4.3', commit: TORAX_COMMIT, runtime: 'Python / JAX', domains: ['physics'], capabilities: ['core-transport', 'current-diffusion', 'sources', 'pulse-design', 'profile-handoff'], inputProfiles: ['engine-runspec.v1', 'core-profile-snapshot.v1'], outputProfiles: ['transport-timeseries.v1'], execution: 'local-adapter', checkpoint: false },
];
export const capabilities = [
  { id: 'virtual-discharge', zh: '虚拟放电', en: 'Virtual discharge', scopeZh: '固定初态、毫秒步进与电压程序', scopeEn: 'Fixed initial state, millisecond steps and voltage programs' },
  { id: 'control-timeseries', zh: '控制响应', en: 'Control response', scopeZh: '电流、位置和执行器时序', scopeEn: 'Current, position and actuator time series' },
  { id: 'core-transport', zh: '核心输运', en: 'Core transport', scopeZh: '温度、密度与输运系数', scopeEn: 'Temperature, density and transport coefficients' },
  { id: 'current-diffusion', zh: '电流与脉冲', en: 'Current & pulses', scopeZh: '电流扩散、爬升与时序', scopeEn: 'Current diffusion, ramp-up and trajectories' },
  { id: 'sources', zh: '加热与粒子源', en: 'Heating & fueling', scopeZh: '源项与参数研究', scopeEn: 'Sources and parameter studies' },
  { id: 'equilibrium', zh: '磁平衡', en: 'Equilibrium', scopeZh: '有来源的二维场与三维磁面', scopeEn: 'Traceable 2D fields and 3D flux surfaces' },
  { id: 'engineering', zh: '工程仿真', en: 'Engineering', scopeZh: '部件、载荷和工程评估', scopeEn: 'Components, loads and engineering assessment' },
  { id: 'profile-handoff', zh: '引擎协同', en: 'Engine coupling', scopeZh: '明确输入端口、单位和映射', scopeEn: 'Explicit input ports, units and mappings' },
] as const;
export type Recipe = {
  id: string; engineId: string; device: string; family: string;
  zh: string; en: string; descriptionZh: string; descriptionEn: string;
  model: string; solver: string; origin: 'upstream' | 'derived' | 'coupled';
  defaults: { duration: number; radialCells: number; heatingScale: number };
};
export const recipes: readonly Recipe[] = [
  { id: 'basic', engineId: 'torax', device: 'ITER-like', family: 'basic', zh: '基础热输运', en: 'Basic heat transport', descriptionZh: '圆截面 · 常数输运 · 环境与数据基线', descriptionEn: 'Circular geometry · constant transport · baseline', model: 'constant', solver: 'linear', origin: 'upstream', defaults: { duration: 5, radialCells: 25, heatingScale: 1 } },
  { id: 'iter-hybrid', engineId: 'torax', device: 'ITER', family: 'iter-hybrid', zh: 'ITER 混合场景', en: 'ITER hybrid', descriptionZh: 'QLKNN · 四方程 · 指定台基与 CHEASE 几何', descriptionEn: 'QLKNN · four equations · prescribed pedestal / CHEASE', model: 'QLKNN_7_11', solver: 'predictor-corrector', origin: 'upstream', defaults: { duration: 5, radialCells: 25, heatingScale: 1 } },
  { id: 'iter-rampup', engineId: 'torax', device: 'ITER', family: 'iter-rampup', zh: 'ITER 电流爬升', en: 'ITER current ramp-up', descriptionZh: '80 秒时序 · Newton-Raphson · 固定步长', descriptionEn: '80 s trajectory · Newton-Raphson · fixed steps', model: 'QLKNN_7_11', solver: 'newton-raphson', origin: 'upstream', defaults: { duration: 80, radialCells: 25, heatingScale: 1 } },
  { id: 'step-flat-top', engineId: 'torax', device: 'STEP', family: 'step-flat-top', zh: 'STEP 非感应平顶', en: 'STEP non-inductive flat-top', descriptionZh: 'OpenSTEP / IMAS · Bohm–gyroBohm · 新经典输运', descriptionEn: 'OpenSTEP / IMAS · Bohm–gyroBohm · neoclassical transport', model: 'Bohm-gyroBohm', solver: 'newton-raphson', origin: 'upstream', defaults: { duration: 400, radialCells: 100, heatingScale: 1 } },
  { id: 'iter-heat-low', engineId: 'torax', device: 'ITER', family: 'iter-hybrid', zh: '辅助加热 −20%', en: 'Auxiliary heating −20%', descriptionZh: '同一 hybrid 场景的受控参数变化', descriptionEn: 'Controlled parameter variation of the hybrid case', model: 'QLKNN_7_11', solver: 'predictor-corrector', origin: 'derived', defaults: { duration: 5, radialCells: 25, heatingScale: .8 } },
  { id: 'iter-heat-high', engineId: 'torax', device: 'ITER', family: 'iter-hybrid', zh: '辅助加热 +20%', en: 'Auxiliary heating +20%', descriptionZh: '与基线比较响应，不预设单调性或精度提升', descriptionEn: 'Compare response without assuming monotonicity or accuracy', model: 'QLKNN_7_11', solver: 'predictor-corrector', origin: 'derived', defaults: { duration: 5, radialCells: 25, heatingScale: 1.2 } },
  { id: 'iter-grid-50', engineId: 'torax', device: 'ITER', family: 'iter-hybrid', zh: '径向网格加密', en: 'Radial grid refinement', descriptionZh: '50 单元敏感性样例 · 不等同完整收敛研究', descriptionEn: '50-cell sensitivity case · not a complete convergence study', model: 'QLKNN_7_11', solver: 'predictor-corrector', origin: 'derived', defaults: { duration: 5, radialCells: 50, heatingScale: 1 } },
  { id: 'fuse-profile-handoff', engineId: 'torax', device: 'DIII-D-derived', family: 'fuse-profile-handoff', zh: 'FUSE → TORAX 剖面传递', en: 'FUSE → TORAX profile handoff', descriptionZh: '真实 FUSE Te/Ti/ne 初始化 · 显式圆截面近似', descriptionEn: 'Actual FUSE Te/Ti/ne initialization · explicit circular approximation', model: 'constant', solver: 'linear', origin: 'coupled', defaults: { duration: .2, radialCells: 50, heatingScale: 1 } },
];
export function getRecipe(id: string): Recipe {
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) throw new Error('UNKNOWN_RECIPE');
  return recipe;
}
