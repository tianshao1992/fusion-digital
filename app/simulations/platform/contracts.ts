import { getRecipe, TORAX_COMMIT } from './catalog.ts';

export type EngineRunSpec = {
  schema: 'engine-runspec.v1'; engine: { id: 'torax'; commit: typeof TORAX_COMMIT };
  recipe: string; parameters: { duration: number; radialCells: number; heatingScale: number };
  resources: { cpus: number; timeoutSeconds: number };
  input: { profileSnapshotSha256: string } | null;
};
export type ProfileSnapshot = {
  schema: 'core-profile-snapshot.v1'; authority: 'simulated';
  source: { engineId: string; runId: string; recordSha256: string; artifactSha256: string; timeSeconds: number };
  coordinate: 'rho_tor_norm'; rho: number[];
  profiles: { id: 'te' | 'ti' | 'ne'; unit: 'eV' | 'm^-3'; values: number[] }[];
  mapping: 'kinetic-profiles-only.v1';
};
export type ResultArtifact = { path: string; sha256: string; bytes: number; rawSha256: string; rawBytes: number };
export type TransportResult = {
  schema: 'transport-timeseries.v1'; id: string; authority: 'simulated'; recordKind: 'simulation-run';
  engine: { id: string; version: string; commit: string; runtime: string; runtimeVersion: string };
  recipe: string; device: string; comparisonGroup: string;
  parameters: { duration: number; radialCells: number; heatingScale: number };
  time: { unit: 's'; reference: 'simulation-time'; values: number[] };
  axes: { id: string; coordinate: 'rho_tor_norm'; grid: 'cell' | 'face' | 'cell-with-boundaries'; values: number[] }[];
  profiles: { id: string; unit: string; axisId: string; values: (number | null)[][] }[];
  scalars: { id: string; unit: string; values: (number | null)[] }[];
  execution: { state: 'succeeded'; simError: 0; elapsedSeconds: number; steps: number };
  assessment: { dataChecks: 'passed'; numericalConvergence: 'not-established'; deviceValidation: 'not-established'; checks: string[] };
  provenance: { configSha256: string; nativeSha256: string; environmentSha256: string; adapterSha256: string; scientificAssets: { name: string; sha256: string }[] };
  lineage: { sourceRunId: string; sourceRecordSha256: string; sourceArtifactSha256: string; mapping: 'kinetic-profiles-only.v1'; snapshotSha256: string } | null;
  referenceProfiles: ProfileSnapshot | null;
  limitations: string[];
};
export type TransportRunEntry = {
  id: string; engineId: string; recipe: string; device: string; comparisonGroup: string;
  duration: number; steps: number; radialCells: number;
  metrics: { id: string; unit: string; value: number | null }[];
  artifact: ResultArtifact; sourceRunId: string | null;
};
export const quantityUnits: Record<string, string> = {
  te: 'eV', ti: 'eV', ne: 'm^-3', q: '1', psi: 'Wb', chi_e: 'm^2/s', chi_i: 'm^2/s',
  j_total: 'A/m^2', pressure: 'Pa', p_alpha_e: 'W/m^3', p_alpha_i: 'W/m^3',
  fusion_power: 'W', external_power: 'W', alpha_power: 'W', auxiliary_power: 'W',
  fusion_gain: '1', plasma_current: 'A', thermal_energy: 'J', q95: '1',
  te_volume_average: 'eV', ti_volume_average: 'eV', ne_volume_average: 'm^-3', bootstrap_fraction: '1',
};
export const profileIds = ['te', 'ti', 'ne', 'q', 'psi', 'chi_e', 'chi_i', 'j_total', 'pressure', 'p_alpha_e', 'p_alpha_i'];
export const scalarIds = Object.keys(quantityUnits).filter(id => !profileIds.includes(id));
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: unknown, allowed: string): boolean => object(v) && Object.keys(v).length === allowed.split(' ').length && Object.keys(v).every(k => allowed.split(' ').includes(k));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const bounded = (v: unknown, lo: number, hi: number): v is number => finite(v) && v >= lo && v <= hi;
export const isDigest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const isIdentifier = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(v);
const vector = (v: unknown, max = 4096): v is number[] => Array.isArray(v) && v.length > 0 && v.length <= max && v.every(finite);
const increasing = (v: number[]) => v.every((x, i) => i === 0 || x > v[i - 1]);
function check(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code); }

export function defaultEngineSpec(recipe = 'iter-hybrid', input: EngineRunSpec['input'] = null): EngineRunSpec {
  return { schema: 'engine-runspec.v1', engine: { id: 'torax', commit: TORAX_COMMIT }, recipe, parameters: { ...getRecipe(recipe).defaults }, resources: { cpus: 8, timeoutSeconds: 1800 }, input };
}
export function parseEngineSpec(value: unknown): EngineRunSpec {
  check(keys(value, 'schema engine recipe parameters resources input'), 'INVALID_RUN_SPEC');
  const s = value as unknown as EngineRunSpec;
  check(s.schema === 'engine-runspec.v1' && keys(s.engine, 'id commit') && s.engine.id === 'torax' && s.engine.commit === TORAX_COMMIT, 'UNSUPPORTED_ENGINE');
  const recipe = getRecipe(s.recipe);
  check(keys(s.parameters, 'duration radialCells heatingScale') && bounded(s.parameters.duration, .01, 400) && Number.isInteger(s.parameters.radialCells) && bounded(s.parameters.radialCells, 10, 100) && bounded(s.parameters.heatingScale, .5, 1.5), 'INVALID_PARAMETERS');
  check(keys(s.resources, 'cpus timeoutSeconds') && Number.isInteger(s.resources.cpus) && bounded(s.resources.cpus, 1, 8) && Number.isInteger(s.resources.timeoutSeconds) && bounded(s.resources.timeoutSeconds, 30, 3600), 'INVALID_RESOURCES');
  check(s.input === null || (keys(s.input, 'profileSnapshotSha256') && isDigest(s.input.profileSnapshotSha256)), 'INVALID_INPUT_BINDING');
  check((recipe.origin === 'coupled') === (s.input !== null), 'INPUT_REQUIRED_OR_UNEXPECTED');
  check(recipe.id !== 'step-flat-top' || s.parameters.heatingScale === 1, 'STEP_HEATING_SCALE_UNSUPPORTED');
  return structuredClone(s);
}
export function parseProfileSnapshot(value: unknown): ProfileSnapshot {
  check(keys(value, 'schema authority source coordinate rho profiles mapping'), 'INVALID_PROFILE_SNAPSHOT');
  const p = value as unknown as ProfileSnapshot;
  check(p.schema === 'core-profile-snapshot.v1' && p.authority === 'simulated' && p.coordinate === 'rho_tor_norm' && p.mapping === 'kinetic-profiles-only.v1', 'INCOMPATIBLE_PROFILE_SNAPSHOT');
  check(keys(p.source, 'engineId runId recordSha256 artifactSha256 timeSeconds') && isIdentifier(p.source.engineId) && isIdentifier(p.source.runId) && isDigest(p.source.recordSha256) && isDigest(p.source.artifactSha256) && finite(p.source.timeSeconds), 'INVALID_SOURCE');
  check(vector(p.rho, 1024) && p.rho.length >= 3 && increasing(p.rho) && p.rho[0] === 0 && p.rho.at(-1) === 1, 'INCOMPATIBLE_RADIAL_AXIS');
  check(Array.isArray(p.profiles) && p.profiles.length === 3 && new Set(p.profiles.map(v => v.id)).size === 3, 'MISSING_CORE_PROFILES');
  for (const channel of p.profiles) check(keys(channel, 'id unit values') && ['te', 'ti', 'ne'].includes(channel.id) && channel.unit === quantityUnits[channel.id] && vector(channel.values, 1024) && channel.values.length === p.rho.length && channel.values.every(v => v > 0), 'INVALID_CORE_PROFILE');
  return structuredClone(p);
}
export function parseTransportResult(value: unknown): TransportResult {
  check(keys(value, 'schema id authority recordKind engine recipe device comparisonGroup parameters time axes profiles scalars execution assessment provenance lineage referenceProfiles limitations'), 'INVALID_TRANSPORT_RESULT');
  const r = value as unknown as TransportResult;
  check(r.schema === 'transport-timeseries.v1' && r.authority === 'simulated' && r.recordKind === 'simulation-run' && isIdentifier(r.id) && isIdentifier(r.recipe) && isIdentifier(r.device) && isIdentifier(r.comparisonGroup), 'INVALID_RESULT_IDENTITY');
  check(keys(r.engine, 'id version commit runtime runtimeVersion') && [r.engine.id, r.engine.version, r.engine.runtime, r.engine.runtimeVersion].every(isIdentifier) && /^[a-f0-9]{40}$/.test(r.engine.commit), 'INVALID_ENGINE');
  check(keys(r.parameters, 'duration radialCells heatingScale') && bounded(r.parameters.duration, .001, 10000) && Number.isInteger(r.parameters.radialCells) && bounded(r.parameters.radialCells, 2, 1024) && bounded(r.parameters.heatingScale, 0, 10), 'INVALID_RESULT_PARAMETERS');
  check(keys(r.time, 'unit reference values') && r.time.unit === 's' && r.time.reference === 'simulation-time' && vector(r.time.values) && increasing(r.time.values) && r.time.values.length > 1, 'INVALID_TIME_AXIS');
  const nt = r.time.values.length;
  check(Array.isArray(r.axes) && r.axes.length > 0 && r.axes.length <= 8 && new Set(r.axes.map(a => a.id)).size === r.axes.length, 'INVALID_AXES');
  for (const a of r.axes) check(keys(a, 'id coordinate grid values') && isIdentifier(a.id) && a.coordinate === 'rho_tor_norm' && ['cell', 'face', 'cell-with-boundaries'].includes(a.grid) && vector(a.values, 1026) && increasing(a.values) && a.values.every(v => v >= 0 && v <= 1) && a.values.length === r.parameters.radialCells + (a.grid === 'cell' ? 0 : a.grid === 'face' ? 1 : 2), 'INVALID_RADIAL_AXIS');
  check(Array.isArray(r.profiles) && r.profiles.length >= 3 && r.profiles.length <= 32 && new Set(r.profiles.map(p => p.id)).size === r.profiles.length, 'INVALID_CHANNELS');
  check(['te', 'ti', 'ne'].every(id => r.profiles.some(p => p.id === id)), 'MISSING_CORE_PROFILES');
  let samples = 0;
  for (const p of r.profiles) {
    const axis = r.axes.find(a => a.id === p.axisId);
    check(keys(p, 'id unit axisId values') && profileIds.includes(p.id) && p.unit === quantityUnits[p.id] && axis && Array.isArray(p.values) && p.values.length === nt, 'INVALID_PROFILE');
    for (const row of p.values) { check(Array.isArray(row) && row.length === axis.values.length && row.every(v => v === null || finite(v)), 'INVALID_PROFILE_SHAPE'); samples += row.length; }
    if (['te', 'ti', 'ne'].includes(p.id)) check(p.values.every(row => row.every(v => v !== null && v > 0)), 'NONPOSITIVE_CORE_PROFILE');
  }
  check(samples <= 2_000_000, 'RESULT_SAMPLE_BUDGET');
  check(Array.isArray(r.scalars) && r.scalars.length <= 32 && new Set(r.scalars.map(s => s.id)).size === r.scalars.length, 'INVALID_SCALARS');
  for (const s of r.scalars) check(keys(s, 'id unit values') && scalarIds.includes(s.id) && s.unit === quantityUnits[s.id] && Array.isArray(s.values) && s.values.length === nt && s.values.every(v => v === null || finite(v)), 'INVALID_SCALAR');
  check(keys(r.execution, 'state simError elapsedSeconds steps') && r.execution.state === 'succeeded' && r.execution.simError === 0 && bounded(r.execution.elapsedSeconds, 0, 1e8) && r.execution.steps === nt - 1, 'INVALID_EXECUTION');
  check(Math.abs(r.time.values.at(-1)! - r.time.values[0] - r.parameters.duration) < 1e-8, 'INCOMPLETE_TIME_RANGE');
  check(keys(r.assessment, 'dataChecks numericalConvergence deviceValidation checks') && r.assessment.dataChecks === 'passed' && r.assessment.numericalConvergence === 'not-established' && r.assessment.deviceValidation === 'not-established' && Array.isArray(r.assessment.checks) && r.assessment.checks.length <= 50 && r.assessment.checks.every(isIdentifier), 'INVALID_ASSESSMENT');
  check(keys(r.provenance, 'configSha256 nativeSha256 environmentSha256 adapterSha256 scientificAssets') && [r.provenance.configSha256, r.provenance.nativeSha256, r.provenance.environmentSha256, r.provenance.adapterSha256].every(isDigest) && Array.isArray(r.provenance.scientificAssets) && r.provenance.scientificAssets.length <= 25 && r.provenance.scientificAssets.every(a => keys(a, 'name sha256') && isIdentifier(a.name) && isDigest(a.sha256)), 'INVALID_PROVENANCE');
  check(Array.isArray(r.limitations) && r.limitations.length <= 30 && r.limitations.every(v => typeof v === 'string' && v.length <= 300), 'INVALID_LIMITATIONS');
  if (r.lineage !== null) {
    check(keys(r.lineage, 'sourceRunId sourceRecordSha256 sourceArtifactSha256 mapping snapshotSha256') && isIdentifier(r.lineage.sourceRunId) && [r.lineage.sourceRecordSha256, r.lineage.sourceArtifactSha256, r.lineage.snapshotSha256].every(isDigest) && r.lineage.mapping === 'kinetic-profiles-only.v1', 'INVALID_LINEAGE');
    const ref = parseProfileSnapshot(r.referenceProfiles);
    check(ref.source.runId === r.lineage.sourceRunId && ref.source.recordSha256 === r.lineage.sourceRecordSha256 && ref.source.artifactSha256 === r.lineage.sourceArtifactSha256, 'LINEAGE_MISMATCH');
  } else check(r.referenceProfiles === null, 'UNBOUND_REFERENCE');
  return structuredClone(r);
}
export function canCompare(a: Pick<TransportResult, 'device' | 'comparisonGroup'>, b: Pick<TransportResult, 'device' | 'comparisonGroup'>): boolean {
  return a.device === b.device && a.comparisonGroup === b.comparisonGroup;
}
export function interpolateProfile(x: number[], y: (number | null)[], target: number): number | null {
  if (target < x[0] || target > x.at(-1)!) return null;
  const i = x.findIndex(v => v >= target);
  if (i < 0) return null;
  if (x[i] === target || i === 0) return y[i];
  if (y[i] === null || y[i - 1] === null) return null;
  return y[i - 1]! + (y[i]! - y[i - 1]!) * (target - x[i - 1]) / (x[i] - x[i - 1]);
}
