/**
 * Browser-safe physics-settings contract reconstructed from DiagView2
 * origin/digView2 @ 868d74d5e0e6c9abaec0eb623bcdd13ead771c79.
 *
 * This module intentionally has no DOM, Three.js, worker, CHERAB or ADAS
 * dependency. It implements only the source branch's mathematical profile
 * equations and its manual *relative* spectral-line weight. Atomic-data and
 * absolute-radiation paths remain explicit, fail-closed unavailable states.
 */

export const DIAGVIEW2_PHYSICS_SOURCE = Object.freeze({
  branch: 'origin/digView2' as const,
  commit: '868d74d5e0e6c9abaec0eb623bcdd13ead771c79' as const,
  compatibility: 'browser-settings-reconstruction' as const,
});

export const DIAGVIEW2_PHYSICS_ELEMENTS = ['C', 'H', 'W', 'Ne', 'Ar', 'Fe'] as const;

export type DiagView2PhysicsElement = typeof DIAGVIEW2_PHYSICS_ELEMENTS[number];
export type DiagView2PhysicsDiagnosticMode = 'broadband-radiation' | 'spectral-line';
export type DiagView2PhysicsProfileSource = 'mathematical' | 'cherab-adas';
export type DiagView2PhysicsProfileModel =
  | 'linear'
  | 'parabolic'
  | 'square-parabolic'
  | 'flat-center';

export type DiagView2PhysicsProfileSpec = {
  model: DiagView2PhysicsProfileModel;
  coreValue: number;
  edgeValue: number;
};

export type DiagView2PhysicsSettings = {
  schema: 'fusiondigital.diagview2-physics-settings';
  version: 1;
  source: typeof DIAGVIEW2_PHYSICS_SOURCE;
  diagnosticMode: DiagView2PhysicsDiagnosticMode;
  profileSource: DiagView2PhysicsProfileSource;
  broadband: DiagView2PhysicsProfileSpec;
  plasma: {
    element: DiagView2PhysicsElement;
    te: DiagView2PhysicsProfileSpec;
    /** Values stored by the source GUI in units of 1e19 m^-3. */
    ne: DiagView2PhysicsProfileSpec;
    /** n_imp / n_e, expressed as percent in the source GUI. */
    impurityPercent: number;
  };
  spectral: {
    lineLabel: string;
    element: DiagView2PhysicsElement;
    chargeState: string;
    /** ADF15-style photon emissivity coefficient, cm^3/s. */
    pecCm3S: number;
    ionFraction: number;
    /** Provenance label only. A preset is not a browser atomic-data lookup. */
    pecSource: string;
    normalization: 'relative-line-weight';
  };
};

export type DiagView2SpectralLinePreset = Readonly<{
  label: string;
  element: DiagView2PhysicsElement;
  chargeState: string;
  pecCm3S: number;
  recommendedIonFraction: number;
  pecSource: string;
}>;

export const DIAGVIEW2_SPECTRAL_LINE_PRESETS = Object.freeze([
  Object.freeze({
    label: 'C III 465 nm', element: 'C', chargeState: 'C2+', pecCm3S: 1e-12,
    recommendedIonFraction: 0.5, pecSource: 'gui-preset:c-iii-465',
  }),
  Object.freeze({
    label: 'C IV 580.1 nm', element: 'C', chargeState: 'C3+', pecCm3S: 8e-13,
    recommendedIonFraction: 0.3, pecSource: 'gui-preset:c-iv-580',
  }),
  Object.freeze({
    label: 'H alpha 656.3 nm', element: 'H', chargeState: 'H0', pecCm3S: 3e-14,
    recommendedIonFraction: 1, pecSource: 'gui-preset:h-alpha-656',
  }),
  Object.freeze({
    label: 'Ne X 12.13 A', element: 'Ne', chargeState: 'Ne9+', pecCm3S: 2e-13,
    recommendedIonFraction: 0.1, pecSource: 'gui-preset:ne-x-12a',
  }),
  Object.freeze({
    label: 'Ar XVII 3.95 A', element: 'Ar', chargeState: 'Ar16+', pecCm3S: 1e-13,
    recommendedIonFraction: 0.1, pecSource: 'gui-preset:ar-xvii-395',
  }),
  Object.freeze({
    label: 'Fe XVII 15.02 Å', element: 'Fe', chargeState: 'Fe16+', pecCm3S: 1e-12,
    recommendedIonFraction: 0.1, pecSource: 'gui-preset:fe-xvii-1502',
  }),
] satisfies readonly DiagView2SpectralLinePreset[]);

export type DiagView2PhysicsCapability = Readonly<{
  availability: 'available' | 'unavailable';
  execution: 'browser' | 'blocked';
  authority: 'virtual-software' | 'external-runtime-required';
  titleZh: string;
  titleEn: string;
  detailZh: string;
  detailEn: string;
}>;

export const DIAGVIEW2_PHYSICS_CAPABILITIES = Object.freeze({
  broadbandMathematical: Object.freeze({
    availability: 'available',
    execution: 'browser',
    authority: 'virtual-software',
    titleZh: '宽带数学剖面可用',
    titleEn: 'Broadband mathematical profile available',
    detailZh: '浏览器仅复现原分支的四种参数化剖面，输出是虚拟软件结果，不是实验测量。',
    detailEn: 'The browser reproduces the four source parametric profiles only; output is virtual software, not an experimental measurement.',
  } satisfies DiagView2PhysicsCapability),
  spectralRelativeManual: Object.freeze({
    availability: 'available',
    execution: 'browser',
    authority: 'virtual-software',
    titleZh: '手动谱线相对权重可用',
    titleEn: 'Manual relative spectral-line weight available',
    detailZh: '仅计算 PEC × ne × 离子份额的相对权重；不包含绝对杂质密度、仪器响应或原子数据查询。',
    detailEn: 'Computes only the relative PEC × ne × ion-fraction weight; it includes no absolute impurity density, instrument response, or atomic-data lookup.',
  } satisfies DiagView2PhysicsCapability),
  adasAtomicData: Object.freeze({
    availability: 'unavailable',
    execution: 'blocked',
    authority: 'external-runtime-required',
    titleZh: 'ADAS 原子数据不可用',
    titleEn: 'ADAS atomic data unavailable',
    detailZh: '公开浏览器未连接经审核的 ADAS 仓库，不会下载、外推或伪造原子系数。',
    detailEn: 'The public browser has no reviewed ADAS repository and will not download, extrapolate, or invent atomic coefficients.',
  } satisfies DiagView2PhysicsCapability),
  cherabRadiation: Object.freeze({
    availability: 'unavailable',
    execution: 'blocked',
    authority: 'external-runtime-required',
    titleZh: 'CHERAB 辐射求解不可用',
    titleEn: 'CHERAB radiation solve unavailable',
    detailZh: '原分支路径依赖 Python/CHERAB/OpenADAS 本地运行时及原子数据，本浏览器内核不执行该路径。',
    detailEn: 'The source path requires a local Python/CHERAB/OpenADAS runtime and atomic data; this browser kernel does not execute it.',
  } satisfies DiagView2PhysicsCapability),
  spectralAbsolute: Object.freeze({
    availability: 'unavailable',
    execution: 'blocked',
    authority: 'external-runtime-required',
    titleZh: '绝对谱线辐射率不可用',
    titleEn: 'Absolute spectral emissivity unavailable',
    detailZh: '杂质百分比保留为项目设置，但不用于浏览器相对谱线权重；绝对计算必须由受控后端完成。',
    detailEn: 'Impurity percent is preserved as a project setting but is not used in browser relative weights; absolute calculation requires a controlled backend.',
  } satisfies DiagView2PhysicsCapability),
});

export type DiagView2PhysicsExecutionPlan =
  | Readonly<{
    runnable: true;
    kernel: 'broadband-mathematical' | 'spectral-relative-manual';
    authority: 'virtual-software';
    signalUnit: 'relative-emissivity' | 'relative line weight';
    usesImpurityPercent: false;
    status: DiagView2PhysicsCapability;
  }>
  | Readonly<{
    runnable: false;
    kernel: null;
    authority: 'external-runtime-required';
    blockedBy: readonly ['adas-atomic-data', 'cherab-runtime'];
    statusZh: string;
    statusEn: string;
  }>;

export type DiagView2PhysicsProfileResult = Readonly<{
  model: DiagView2PhysicsProfileModel;
  authority: 'virtual-software';
  rho: Float64Array;
  values: Float64Array;
}>;

export type DiagView2TeNeProfiles = Readonly<{
  authority: 'virtual-software';
  teEv: DiagView2PhysicsProfileResult;
  neM3: DiagView2PhysicsProfileResult;
}>;

export type DiagView2SpectralRelativeResult = Readonly<{
  authority: 'virtual-software';
  normalization: 'relative';
  unit: 'relative line weight';
  formula: 'ne_cm^-3 * PEC_cm^3/s * ion_fraction';
  usesImpurityPercent: false;
  values: Float64Array;
}>;

export class DiagView2PhysicsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiagView2PhysicsValidationError';
  }
}

const PROFILE_MODELS = ['linear', 'parabolic', 'square-parabolic', 'flat-center'] as const;
const MAX_JSON_LENGTH = 262_144;

function fail(path: string, message: string): never {
  throw new DiagView2PhysicsValidationError(`${path}: ${message}`);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'expected an object');
  }
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], path: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) fail(`${path}.${key}`, 'unknown field');
  }
  for (const key of keys) {
    if (!(key in record)) fail(`${path}.${key}`, 'missing required field');
  }
}

function finiteNumber(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a finite number');
  if (value < min || value > max) fail(path, `expected ${min} <= value <= ${max}`);
  return Object.is(value, -0) ? 0 : value;
}

function nonEmptyString(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string') fail(path, 'expected a string');
  const text = value.trim();
  if (!text) fail(path, 'must not be empty');
  if (text.length > maxLength) fail(path, `must not exceed ${maxLength} characters`);
  return text;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  options: T,
  path: string,
): T[number] {
  if (typeof value !== 'string' || !options.includes(value)) {
    fail(path, `expected one of ${options.join(', ')}`);
  }
  return value as T[number];
}

function parseProfile(value: unknown, path: string, min = 0, max = 1e100): DiagView2PhysicsProfileSpec {
  const record = asRecord(value, path);
  exactKeys(record, ['model', 'coreValue', 'edgeValue'], path);
  return {
    model: enumValue(record.model, PROFILE_MODELS, `${path}.model`),
    coreValue: finiteNumber(record.coreValue, `${path}.coreValue`, min, max),
    edgeValue: finiteNumber(record.edgeValue, `${path}.edgeValue`, min, max),
  };
}

function parseSource(value: unknown, path: string): typeof DIAGVIEW2_PHYSICS_SOURCE {
  const record = asRecord(value, path);
  exactKeys(record, ['branch', 'commit', 'compatibility'], path);
  if (record.branch !== DIAGVIEW2_PHYSICS_SOURCE.branch) fail(`${path}.branch`, 'unreviewed source branch');
  if (record.commit !== DIAGVIEW2_PHYSICS_SOURCE.commit) fail(`${path}.commit`, 'unreviewed source revision');
  if (record.compatibility !== DIAGVIEW2_PHYSICS_SOURCE.compatibility) {
    fail(`${path}.compatibility`, 'unsupported compatibility mode');
  }
  return DIAGVIEW2_PHYSICS_SOURCE;
}

export function createDefaultDiagView2PhysicsSettings(): DiagView2PhysicsSettings {
  const preset = DIAGVIEW2_SPECTRAL_LINE_PRESETS[0];
  return {
    schema: 'fusiondigital.diagview2-physics-settings',
    version: 1,
    source: DIAGVIEW2_PHYSICS_SOURCE,
    diagnosticMode: 'broadband-radiation',
    profileSource: 'mathematical',
    broadband: { model: 'linear', coreValue: 1, edgeValue: 0 },
    plasma: {
      element: 'C',
      te: { model: 'linear', coreValue: 2_000, edgeValue: 50 },
      ne: { model: 'linear', coreValue: 5, edgeValue: 0.5 },
      impurityPercent: 1,
    },
    spectral: {
      lineLabel: preset.label,
      element: preset.element,
      chargeState: preset.chargeState,
      pecCm3S: preset.pecCm3S,
      ionFraction: preset.recommendedIonFraction,
      pecSource: preset.pecSource,
      normalization: 'relative-line-weight',
    },
  };
}

export function parseDiagView2PhysicsSettings(input: unknown): DiagView2PhysicsSettings {
  let value = input;
  if (typeof value === 'string') {
    if (value.length > MAX_JSON_LENGTH) fail('settings', 'JSON payload is too large');
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      fail('settings', 'invalid JSON');
    }
  }
  const root = asRecord(value, 'settings');
  exactKeys(root, [
    'schema', 'version', 'source', 'diagnosticMode', 'profileSource',
    'broadband', 'plasma', 'spectral',
  ], 'settings');
  if (root.schema !== 'fusiondigital.diagview2-physics-settings') fail('settings.schema', 'unsupported schema');
  if (root.version !== 1) fail('settings.version', 'unsupported version');

  const plasma = asRecord(root.plasma, 'settings.plasma');
  exactKeys(plasma, ['element', 'te', 'ne', 'impurityPercent'], 'settings.plasma');
  const spectral = asRecord(root.spectral, 'settings.spectral');
  exactKeys(spectral, [
    'lineLabel', 'element', 'chargeState', 'pecCm3S', 'ionFraction', 'pecSource', 'normalization',
  ], 'settings.spectral');
  if (spectral.normalization !== 'relative-line-weight') {
    fail('settings.spectral.normalization', 'absolute spectral execution is not available in this browser');
  }

  return {
    schema: 'fusiondigital.diagview2-physics-settings',
    version: 1,
    source: parseSource(root.source, 'settings.source'),
    diagnosticMode: enumValue(
      root.diagnosticMode,
      ['broadband-radiation', 'spectral-line'] as const,
      'settings.diagnosticMode',
    ),
    profileSource: enumValue(
      root.profileSource,
      ['mathematical', 'cherab-adas'] as const,
      'settings.profileSource',
    ),
    broadband: parseProfile(root.broadband, 'settings.broadband'),
    plasma: {
      element: enumValue(plasma.element, DIAGVIEW2_PHYSICS_ELEMENTS, 'settings.plasma.element'),
      te: parseProfile(plasma.te, 'settings.plasma.te'),
      ne: parseProfile(plasma.ne, 'settings.plasma.ne'),
      impurityPercent: finiteNumber(plasma.impurityPercent, 'settings.plasma.impurityPercent', 0, 100),
    },
    spectral: {
      lineLabel: nonEmptyString(spectral.lineLabel, 'settings.spectral.lineLabel', 100),
      element: enumValue(spectral.element, DIAGVIEW2_PHYSICS_ELEMENTS, 'settings.spectral.element'),
      chargeState: nonEmptyString(spectral.chargeState, 'settings.spectral.chargeState', 40),
      pecCm3S: finiteNumber(spectral.pecCm3S, 'settings.spectral.pecCm3S', 0, 1),
      ionFraction: finiteNumber(spectral.ionFraction, 'settings.spectral.ionFraction', 0, 1),
      pecSource: nonEmptyString(spectral.pecSource, 'settings.spectral.pecSource', 160),
      normalization: 'relative-line-weight',
    },
  };
}

export function serializeDiagView2PhysicsSettings(settings: DiagView2PhysicsSettings): string {
  return `${JSON.stringify(parseDiagView2PhysicsSettings(settings), null, 2)}\n`;
}

export function getDiagView2SpectralLinePreset(lineLabel: string): DiagView2SpectralLinePreset {
  const preset = DIAGVIEW2_SPECTRAL_LINE_PRESETS.find((candidate) => candidate.label === lineLabel);
  if (!preset) fail('spectral.lineLabel', `unknown source preset ${JSON.stringify(lineLabel)}`);
  return preset;
}

export function applyDiagView2SpectralLinePreset(
  settings: DiagView2PhysicsSettings,
  lineLabel: string,
): DiagView2PhysicsSettings {
  const parsed = parseDiagView2PhysicsSettings(settings);
  const preset = getDiagView2SpectralLinePreset(lineLabel);
  return {
    ...parsed,
    plasma: { ...parsed.plasma, element: preset.element },
    spectral: {
      lineLabel: preset.label,
      element: preset.element,
      chargeState: preset.chargeState,
      pecCm3S: preset.pecCm3S,
      ionFraction: preset.recommendedIonFraction,
      pecSource: preset.pecSource,
      normalization: 'relative-line-weight',
    },
  };
}

export function pecCm3SToDiagView2Display(pecCm3S: number): number {
  return finiteNumber(pecCm3S, 'pecCm3S', 0, 1) / 1e-13;
}

export function diagView2DisplayToPecCm3S(displayValue: number): number {
  const result = finiteNumber(displayValue, 'pecDisplayValue', 0, 1e13) * 1e-13;
  if (!Number.isFinite(result)) fail('pecDisplayValue', 'conversion produced a non-finite PEC');
  return result;
}

export function resolveDiagView2PhysicsExecutionPlan(
  settings: DiagView2PhysicsSettings,
): DiagView2PhysicsExecutionPlan {
  const parsed = parseDiagView2PhysicsSettings(settings);
  if (parsed.profileSource === 'cherab-adas') {
    return Object.freeze({
      runnable: false,
      kernel: null,
      authority: 'external-runtime-required',
      blockedBy: ['adas-atomic-data', 'cherab-runtime'] as const,
      statusZh: `${DIAGVIEW2_PHYSICS_CAPABILITIES.adasAtomicData.titleZh}；${DIAGVIEW2_PHYSICS_CAPABILITIES.cherabRadiation.titleZh}。`,
      statusEn: `${DIAGVIEW2_PHYSICS_CAPABILITIES.adasAtomicData.titleEn}; ${DIAGVIEW2_PHYSICS_CAPABILITIES.cherabRadiation.titleEn}.`,
    });
  }
  if (parsed.diagnosticMode === 'broadband-radiation') {
    return Object.freeze({
      runnable: true,
      kernel: 'broadband-mathematical',
      authority: 'virtual-software',
      signalUnit: 'relative-emissivity',
      usesImpurityPercent: false,
      status: DIAGVIEW2_PHYSICS_CAPABILITIES.broadbandMathematical,
    });
  }
  return Object.freeze({
    runnable: true,
    kernel: 'spectral-relative-manual',
    authority: 'virtual-software',
    signalUnit: 'relative line weight',
    usesImpurityPercent: false,
    status: DIAGVIEW2_PHYSICS_CAPABILITIES.spectralRelativeManual,
  });
}

function profileShape(model: DiagView2PhysicsProfileModel, rho: number): number {
  if (model === 'linear') return 1 - rho;
  if (model === 'parabolic') return 1 - rho ** 2;
  if (model === 'square-parabolic') return (1 - rho ** 2) ** 2;
  return (1 - rho ** 4) ** 2;
}

export function evaluateDiagView2PhysicsProfile(
  model: DiagView2PhysicsProfileModel,
  rho: number,
  coreValue: number,
  edgeValue: number,
): number {
  const checkedModel = enumValue(model, PROFILE_MODELS, 'profile.model');
  const checkedRho = finiteNumber(rho, 'profile.rho', 0, 1);
  const core = finiteNumber(coreValue, 'profile.coreValue', 0, 1e100);
  const edge = finiteNumber(edgeValue, 'profile.edgeValue', 0, 1e100);
  const value = edge + (core - edge) * profileShape(checkedModel, checkedRho);
  if (!Number.isFinite(value)) fail('profile', 'evaluation produced a non-finite value');
  return value;
}

function arrayLikeLength(value: ArrayLike<number>, path: string): number {
  if (typeof value === 'string' || value === null || typeof value !== 'object') {
    fail(path, 'expected a numeric array-like value');
  }
  const length = value.length;
  if (!Number.isInteger(length) || length < 0 || length > 10_000_000) {
    fail(`${path}.length`, 'expected an integer between 0 and 10000000');
  }
  return length;
}

export function buildDiagView2PhysicsProfile(
  psiNorm: ArrayLike<number>,
  spec: DiagView2PhysicsProfileSpec,
  valueScale = 1,
): DiagView2PhysicsProfileResult {
  const profile = parseProfile(spec, 'profile');
  const scale = finiteNumber(valueScale, 'profile.valueScale', 0, 1e100);
  const length = arrayLikeLength(psiNorm, 'psiNorm');
  const rho = new Float64Array(length);
  const values = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    const psi = finiteNumber(psiNorm[index], `psiNorm[${index}]`, -1e100, 1e100);
    const clipped = Math.min(1, Math.max(0, psi));
    rho[index] = Math.sqrt(clipped);
    // Matches PlasmaProfile.get_profile_2d's base psi_norm > 1 mask.
    values[index] = psi > 1
      ? 0
      : evaluateDiagView2PhysicsProfile(profile.model, rho[index], profile.coreValue, profile.edgeValue) * scale;
    if (!Number.isFinite(values[index])) fail(`profile.values[${index}]`, 'non-finite result');
  }
  return Object.freeze({ model: profile.model, authority: 'virtual-software', rho, values });
}

export function buildDiagView2TeNeProfiles(
  psiNorm: ArrayLike<number>,
  plasma: DiagView2PhysicsSettings['plasma'],
): DiagView2TeNeProfiles {
  const wrapper = createDefaultDiagView2PhysicsSettings();
  const parsed = parseDiagView2PhysicsSettings({ ...wrapper, plasma }).plasma;
  return Object.freeze({
    authority: 'virtual-software',
    teEv: buildDiagView2PhysicsProfile(psiNorm, parsed.te),
    neM3: buildDiagView2PhysicsProfile(psiNorm, parsed.ne, 1e19),
  });
}

export function computeDiagView2SpectralRelativeLineWeight(
  neM3: number,
  pecCm3S: number,
  ionFraction: number,
): number {
  const ne = finiteNumber(neM3, 'spectral.neM3', 0, 1e30);
  const pec = finiteNumber(pecCm3S, 'spectral.pecCm3S', 0, 1);
  const fraction = finiteNumber(ionFraction, 'spectral.ionFraction', 0, 1);
  const result = (ne / 1e6) * pec * fraction;
  if (!Number.isFinite(result)) fail('spectral.relativeWeight', 'calculation produced a non-finite value');
  return result;
}

function spectralInputAt(
  value: number | ArrayLike<number>,
  index: number,
  length: number,
  path: string,
): number {
  if (typeof value === 'number') return value;
  const inputLength = arrayLikeLength(value, path);
  if (inputLength !== length) fail(`${path}.length`, `expected ${length}, received ${inputLength}`);
  return value[index];
}

export function buildDiagView2SpectralRelativeWeights(
  neM3: ArrayLike<number>,
  pecCm3S: number | ArrayLike<number>,
  ionFraction: number | ArrayLike<number>,
): DiagView2SpectralRelativeResult {
  const length = arrayLikeLength(neM3, 'spectral.neM3');
  const values = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    values[index] = computeDiagView2SpectralRelativeLineWeight(
      neM3[index],
      spectralInputAt(pecCm3S, index, length, 'spectral.pecCm3S'),
      spectralInputAt(ionFraction, index, length, 'spectral.ionFraction'),
    );
  }
  return Object.freeze({
    authority: 'virtual-software',
    normalization: 'relative',
    unit: 'relative line weight',
    formula: 'ne_cm^-3 * PEC_cm^3/s * ion_fraction',
    usesImpurityPercent: false,
    values,
  });
}
