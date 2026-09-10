// Browser-safe control contracts. Runtime paths and plant endpoints are operator-owned.
export const CONTROL_SOURCE_COMMIT = 'b267fcca0512640f9d96ca9d0cf10bef8b3de4dc';
export const CONTROL_RUNNER_SHA256 = 'c9426ca64805d64ca9e98cc3081dcf6f1619e648a186e95e2cbc8bb64d0051ec';
export type ControlEngine = 'fge' | 'dina';
export const IMAGE_DIGESTS: Record<ControlEngine, string> = {
  fge: 'sha256:c96eb08308a2236a438f2c36e77939afc2d9cdee5d9f355529cc2de78006b961',
  dina: 'sha256:e78579340491f4bca5c41084c5b8ffa57bd766965c94ad20f972656e8f4c7acc',
};
export const controlRecipes = [
  { id: 'fge-linear-20175', engineId: 'fge' as const, shot: 20175, initialTimeSeconds: .4, channels: 12, zh: '20175 · 线性 FGE · 电压基线', en: '20175 · linear FGE · voltage baseline', scopeZh: '固定初态、直接电压输入与内部垂直控制；PSM 未启用。', scopeEn: 'Fixed initial state, direct voltage input and internal vertical control; PSM disabled.' },
  { id: 'dina-warmstart-14795', engineId: 'dina' as const, shot: 14795, initialTimeSeconds: .8, channels: 11, zh: '14795 · DINA warm start', en: '14795 · DINA warm start', scopeZh: '从 800 ms 状态启动，11 路电压程序与内部 VS 控制。', scopeEn: 'Start from the 800 ms state with 11 voltage commands and internal VS control.' },
];
export type ControlRunSpec = {
  schema: 'control-runspec.v1'; engine: { id: ControlEngine; commit: string }; recipe: string;
  parameters: { durationSeconds: number; timeStepSeconds: .001; recordEvery: number; voltagesV: number[] };
  resources: { timeoutSeconds: number }; input: null;
};
export type ControlSignal = { id: string; unit: 'A' | 'm' | 'V' | '1' | 's'; values: (number | null)[] };
export type ControlResult = {
  schema: 'control-result.v1'; id: string; authority: 'simulated'; recordKind: 'simulation-run';
  origin: 'remote-docker' | 'archived-remote-docker';
  engine: { id: ControlEngine; sourceCommit: string; imageDigest: string | null }; recipe: string;
  initialState: { shot: number; timeSeconds: number }; spec: ControlRunSpec | null;
  time: { unit: 's'; reference: 'simulation-time'; dtSeconds: number; values: number[] };
  signals: ControlSignal[];
  actions: { channels: string[]; commandedV: (number | null)[][]; sentV: (number | null)[][] | null; appliedV: null; appliedStatus: 'not-reported' };
  geometry: { state: 'available' | 'unavailable'; coordinate: 'cylindrical-rz'; cocos: null; fluxState: 'unavailable'; reason: string; frames: { timeIndex: number; lcfs: [number, number][] }[] };
  execution: { state: 'succeeded' | 'failed' | 'cancelled' | 'timed-out'; requestedSteps: number; completedSteps: number; dispatchedSteps: number; unconfirmedSteps: number; elapsedSeconds: number | null; reason: string | null };
  assessment: { dataChecks: 'passed' | 'partial'; numericalConvergence: 'not-established'; deviceValidation: 'not-established' };
  provenance: { resultSha256: string; manifestSha256: string; adapterSha256: string | null; specSha256: string | null; sourceLabel: string };
  limitations: string[];
};
export type ControlRunEntry = { id: string; engineId: ControlEngine; recipe: string; labelZh: string; labelEn: string; origin: ControlResult['origin']; artifact: { path: string; sha256: string; bytes: number; rawSha256: string; rawBytes: number } };
export const CONTROL_STATES = ['queued', 'starting', 'running', 'collecting', 'cancellation-requested', 'succeeded', 'failed', 'timed-out', 'cancelled', 'collection-failed', 'reconciliation-required'] as const;
export type ControlJob = { schema: 'engine-job.v1'; id: string; engineId: ControlEngine; state: typeof CONTROL_STATES[number]; processStopped: boolean; elapsedSeconds: number; reason: string | null };
export const isControlEngine = (v: unknown): v is ControlEngine => v === 'fge' || v === 'dina';
export const isControlId = (v: unknown): v is string => typeof v === 'string' && /^(fge|dina)-[A-Za-z0-9][A-Za-z0-9._-]{0,105}$/.test(v);
export const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: unknown, expected: string) => object(v) && Object.keys(v).length === expected.split(' ').length && Object.keys(v).every(k => expected.split(' ').includes(k));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const sample = (v: unknown) => v === null || finite(v);
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(v);
function check(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code); }
export function recipeFor(engine: ControlEngine) { return controlRecipes.find(r => r.engineId === engine)!; }
export function defaultControlSpec(engine: ControlEngine): ControlRunSpec {
  return { schema: 'control-runspec.v1', engine: { id: engine, commit: CONTROL_SOURCE_COMMIT }, recipe: recipeFor(engine).id, parameters: { durationSeconds: .016, timeStepSeconds: .001, recordEvery: 1, voltagesV: Array(recipeFor(engine).channels).fill(0) as number[] }, resources: { timeoutSeconds: 180 }, input: null };
}
export function parseControlSpec(value: unknown): ControlRunSpec {
  check(keys(value, 'schema engine recipe parameters resources input'), 'INVALID_CONTROL_SPEC');
  const s = value as unknown as ControlRunSpec;
  check(s.schema === 'control-runspec.v1' && keys(s.engine, 'id commit') && isControlEngine(s.engine.id) && s.engine.commit === CONTROL_SOURCE_COMMIT, 'UNSUPPORTED_CONTROL_ENGINE');
  const r = recipeFor(s.engine.id);
  check(s.recipe === r.id && s.input === null, 'UNSUPPORTED_CONTROL_RECIPE_OR_INPUT');
  check(keys(s.parameters, 'durationSeconds timeStepSeconds recordEvery voltagesV'), 'INVALID_CONTROL_PARAMETERS');
  const p = s.parameters, steps = p.durationSeconds / .001;
  check(finite(p.durationSeconds) && p.durationSeconds >= .001 && p.durationSeconds <= .5 && Math.abs(steps - Math.round(steps)) < 1e-8 && p.timeStepSeconds === .001, 'INVALID_CONTROL_DURATION');
  check(p.recordEvery === 1, 'INVALID_RECORD_CADENCE');
  // Initial release only admits the validated zero-voltage baseline. New waveforms need their own recipe.
  check(Array.isArray(p.voltagesV) && p.voltagesV.length === r.channels && p.voltagesV.every(v => finite(v) && v === 0), 'UNREVIEWED_VOLTAGE_PROGRAM');
  check(keys(s.resources, 'timeoutSeconds') && Number.isInteger(s.resources.timeoutSeconds) && s.resources.timeoutSeconds >= 30 && s.resources.timeoutSeconds <= 1800, 'INVALID_CONTROL_RESOURCES');
  return structuredClone(s);
}
export function parseControlResult(value: unknown): ControlResult {
  check(keys(value, 'schema id authority recordKind origin engine recipe initialState spec time signals actions geometry execution assessment provenance limitations'), 'INVALID_CONTROL_RESULT');
  const r = value as unknown as ControlResult;
  check(r.schema === 'control-result.v1' && isControlId(r.id) && r.authority === 'simulated' && r.recordKind === 'simulation-run' && ['remote-docker', 'archived-remote-docker'].includes(r.origin), 'INVALID_CONTROL_IDENTITY');
  check(keys(r.engine, 'id sourceCommit imageDigest') && isControlEngine(r.engine.id) && r.id.startsWith(r.engine.id + '-') && /^[a-f0-9]{40}$/.test(r.engine.sourceCommit) && (r.engine.imageDigest === null || r.engine.imageDigest === IMAGE_DIGESTS[r.engine.id]), 'INVALID_CONTROL_SOURCE');
  const recipe = recipeFor(r.engine.id);
  check(r.recipe === recipe.id && keys(r.initialState, 'shot timeSeconds') && r.initialState.shot === recipe.shot && r.initialState.timeSeconds === recipe.initialTimeSeconds, 'INVALID_CONTROL_INITIAL_STATE');
  if (r.spec !== null) { const s = parseControlSpec(r.spec); check(s.engine.id === r.engine.id && s.engine.commit === r.engine.sourceCommit && s.recipe === r.recipe && r.engine.imageDigest === IMAGE_DIGESTS[r.engine.id], 'CONTROL_SPEC_MISMATCH'); }
  else check(r.origin === 'archived-remote-docker', 'MISSING_CONTROL_SPEC');
  check(keys(r.time, 'unit reference dtSeconds values') && r.time.unit === 's' && r.time.reference === 'simulation-time' && finite(r.time.dtSeconds) && r.time.dtSeconds > 0 && Array.isArray(r.time.values) && r.time.values.length > 0 && r.time.values.length <= 10001, 'INVALID_CONTROL_TIME');
  check(r.time.values.every((v, i) => finite(v) && v >= 0 && (i === 0 || v > r.time.values[i - 1])), 'INVALID_CONTROL_TIME');
  const n = r.time.values.length;
  check(Array.isArray(r.signals) && r.signals.length >= 3 && r.signals.length <= 64 && new Set(r.signals.map(s => s.id)).size === r.signals.length, 'INVALID_CONTROL_SIGNALS');
  for (const s of r.signals) check(keys(s, 'id unit values') && identifier(s.id) && ['A', 'm', 'V', '1', 's'].includes(s.unit) && Array.isArray(s.values) && s.values.length === n && s.values.every(sample), 'INVALID_CONTROL_SIGNAL');
  for (const [id, unit] of [['ip', 'A'], ['r', 'm'], ['z', 'm']]) check(r.signals.some(s => s.id === id && s.unit === unit), 'MISSING_CONTROL_SIGNAL');
  const a = r.actions;
  check(keys(a, 'channels commandedV sentV appliedV appliedStatus') && Array.isArray(a.channels) && a.channels.length === recipe.channels && a.channels.every(identifier) && new Set(a.channels).size === a.channels.length && a.appliedV === null && a.appliedStatus === 'not-reported', 'INVALID_CONTROL_ACTIONS');
  const matrixValid = (matrix: unknown) => Array.isArray(matrix) && matrix.length === n && matrix.every(row => Array.isArray(row) && row.length === recipe.channels && row.every(sample));
  check(matrixValid(a.commandedV) && (a.sentV === null || matrixValid(a.sentV)), 'INVALID_CONTROL_ACTIONS');
  const g = r.geometry;
  check(keys(g, 'state coordinate cocos fluxState reason frames') && ['available', 'unavailable'].includes(g.state) && g.coordinate === 'cylindrical-rz' && g.cocos === null && g.fluxState === 'unavailable' && typeof g.reason === 'string' && g.reason.length <= 500 && Array.isArray(g.frames) && g.frames.length <= n, 'INVALID_CONTROL_GEOMETRY');
  check(g.state === 'available' ? g.frames.length > 0 && r.engine.id === 'fge' : g.frames.length === 0, 'INVALID_CONTROL_GEOMETRY');
  let last = -1;
  for (const f of g.frames) { check(keys(f, 'timeIndex lcfs') && Number.isInteger(f.timeIndex) && f.timeIndex > last && f.timeIndex < n && Array.isArray(f.lcfs) && f.lcfs.length >= 3 && f.lcfs.length <= 512 && f.lcfs.every(p => Array.isArray(p) && p.length === 2 && p.every(finite) && p[0] > 0), 'INVALID_LCFS_FRAME'); last = f.timeIndex; }
  const e = r.execution;
  check(keys(e, 'state requestedSteps completedSteps dispatchedSteps unconfirmedSteps elapsedSeconds reason') && ['succeeded', 'failed', 'cancelled', 'timed-out'].includes(e.state) && Number.isInteger(e.requestedSteps) && e.requestedSteps >= 1 && e.requestedSteps <= 100000 && Number.isInteger(e.completedSteps) && e.completedSteps >= 0 && e.completedSteps <= e.requestedSteps && (e.elapsedSeconds === null || finite(e.elapsedSeconds) && e.elapsedSeconds >= 0) && (e.reason === null || typeof e.reason === 'string' && e.reason.length <= 500), 'INVALID_CONTROL_EXECUTION');
  check(Number.isInteger(e.dispatchedSteps) && e.dispatchedSteps >= e.completedSteps && e.dispatchedSteps <= e.requestedSteps && Number.isInteger(e.unconfirmedSteps) && e.unconfirmedSteps === e.dispatchedSteps - e.completedSteps, 'INVALID_UNCONFIRMED_STEPS');
  if (e.state === 'succeeded') check(e.completedSteps === e.requestedSteps, 'INCOMPLETE_CONTROL_RUN');
  if (r.spec) check(n === e.completedSteps + 1 && r.time.values.every((v, i) => Math.abs(v - i * .001) < 1e-9), 'CONTROL_SAMPLE_COUNT_MISMATCH');
  if (r.spec) { check(e.requestedSteps === Math.round(r.spec.parameters.durationSeconds / .001) && r.time.dtSeconds === .001, 'CONTROL_HORIZON_MISMATCH'); if (e.state === 'succeeded') check(Math.abs(r.time.values.at(-1)! - r.spec.parameters.durationSeconds) < 1e-8, 'INCOMPLETE_CONTROL_TIME'); }
  check(keys(r.assessment, 'dataChecks numericalConvergence deviceValidation') && ['passed', 'partial'].includes(r.assessment.dataChecks) && r.assessment.numericalConvergence === 'not-established' && r.assessment.deviceValidation === 'not-established', 'INVALID_CONTROL_ASSESSMENT');
  if (e.state === 'succeeded') check(r.assessment.dataChecks === 'passed' && r.signals.filter(s => ['ip', 'r', 'z'].includes(s.id)).every(s => s.values.every(finite)), 'MISSING_SUCCESSFUL_CONTROL_DATA');
  const p = r.provenance;
  check(keys(p, 'resultSha256 manifestSha256 adapterSha256 specSha256 sourceLabel') && digest(p.resultSha256) && digest(p.manifestSha256) && (p.adapterSha256 === null || digest(p.adapterSha256)) && (p.specSha256 === null || digest(p.specSha256)) && typeof p.sourceLabel === 'string' && p.sourceLabel.length <= 200, 'INVALID_CONTROL_PROVENANCE');
  check(Array.isArray(r.limitations) && r.limitations.length <= 20 && r.limitations.every(s => typeof s === 'string' && s.length <= 500), 'INVALID_CONTROL_LIMITATIONS');
  return structuredClone(r);
}
export function parseControlJob(value: unknown, expectedId?: string): ControlJob {
  check(keys(value, 'schema id engineId state processStopped elapsedSeconds reason'), 'INVALID_CONTROL_JOB');
  const j = value as unknown as ControlJob;
  check(j.schema === 'engine-job.v1' && isControlId(j.id) && (!expectedId || j.id === expectedId) && isControlEngine(j.engineId) && j.id.startsWith(j.engineId + '-') && CONTROL_STATES.includes(j.state) && typeof j.processStopped === 'boolean' && finite(j.elapsedSeconds) && j.elapsedSeconds >= 0 && (j.reason === null || typeof j.reason === 'string' && /^[A-Z0-9_]{1,100}$/.test(j.reason)), 'INVALID_CONTROL_JOB');
  return structuredClone(j);
}
