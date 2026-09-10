// Private native bundle -> allowlisted public projection. Never import in the browser.
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { IMAGE_DIGESTS, parseControlResult, parseControlSpec, recipeFor, type ControlResult, type ControlRunSpec } from '../../app/simulations/control/contracts.ts';

export const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const requireValue = (v: unknown, code: string) => { if (!v) throw new Error(code); };
async function bounded(file: string) { const stat = await lstat(file); requireValue(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 200_000_000, 'CONTROL_NATIVE_FILE_INVALID'); return readFile(file); }
export async function collectControlBundle(directory: string, id: string, expected: ControlRunSpec, runnerSha: string): Promise<ControlResult> {
  const [raw, manifestBytes, specBytes] = await Promise.all(['result.json', 'manifest.json', 'spec.json'].map(f => bounded(path.join(directory, f))));
  return projectControlBundle(raw, manifestBytes, specBytes, id, expected, runnerSha);
}
export function projectControlBundle(raw: Buffer, manifestBytes: Buffer, specBytes: Buffer, id: string, expected: ControlRunSpec, runnerSha: string): ControlResult {
  const normalized = JSON.parse(specBytes.toString());
  // The raw exporter records its disabled PSM default explicitly; the public baseline omits this operator-only switch.
  requireValue(normalized?.parameters?.usePsm === false, 'CONTROL_PSM_NOT_APPROVED');
  delete normalized.parameters.usePsm;
  const spec = parseControlSpec(expected), nativeSpec = parseControlSpec(normalized), m = JSON.parse(manifestBytes.toString()), r = JSON.parse(raw.toString());
  requireValue(isDeepStrictEqual(nativeSpec, spec), 'CONTROL_SPEC_BINDING');
  requireValue(m.schemaVersion === 'control-run-manifest.v1' && m.authority === 'simulated' && m.engine?.id === spec.engine.id && m.engine?.commit === spec.engine.commit && m.runnerCommit === spec.engine.commit && m.scenarioId === spec.recipe && m.runnerSha256 === runnerSha && /^[a-f0-9]{64}$/.test(runnerSha), 'CONTROL_MANIFEST_BINDING');
  requireValue(m.execution?.backend === 'docker_raw_protocol' && m.execution?.imageVerification === 'docker_inspect' && m.execution?.endpointBinding === 'loopback_only' && m.execution?.imageId === IMAGE_DIGESTS[spec.engine.id] && /^[a-f0-9]{64}$/.test(m.execution?.containerId), 'CONTROL_DOCKER_IDENTITY');
  requireValue(m.quality?.missingValues === 'fail_closed' && m.quality?.imputation === 'none' && m.controller?.training === false && m.controller?.vsOwnership === 'plant_internal', 'CONTROL_QUALITY_BINDING');
  for (const [name, bytes] of [['result.json', raw], ['spec.json', specBytes]] as const) {
    requireValue(Array.isArray(m.artifacts) && m.artifacts.filter((a: { path: string }) => a.path === name).length === 1, 'CONTROL_ARTIFACT_BINDING');
    const a = m.artifacts.find((a: { path: string }) => a.path === name);
    requireValue(a.bytes === bytes.length && a.sha256 === sha(bytes), 'CONTROL_ARTIFACT_HASH');
  }
  requireValue(r.schemaVersion === 'control-run.v1' && r.authority === 'simulated' && r.engine === spec.engine.id && r.scenarioId === spec.recipe && r.dtS === .001 && r.requestedSteps === Math.round(spec.parameters.durationSeconds / .001) && m.status === r.status && ['completed', 'failed', 'cancelled', 'timed_out'].includes(r.status), 'CONTROL_NATIVE_IDENTITY');
  requireValue(Number.isInteger(r.completedSteps) && r.completedSteps >= 0 && r.completedSteps <= r.requestedSteps && Number.isInteger(r.dispatchedSteps) && r.dispatchedSteps >= r.completedSteps && r.dispatchedSteps <= r.requestedSteps && r.unconfirmedSteps === r.dispatchedSteps - r.completedSteps && Array.isArray(r.frames) && r.frames.length <= 501, 'CONTROL_NATIVE_STEPS');
  if (r.frames.length === 0 && r.completedSteps === 0 && r.status !== 'completed') throw new Error('CONTROL_NO_CONFIRMED_SAMPLES');
  requireValue(r.frames.length === r.completedSteps + 1, 'CONTROL_NATIVE_STEPS');
  const channels = ['CS', ...Array.from({ length: 10 }, (_, i) => `PF${i + 1}`), ...(spec.engine.id === 'fge' ? ['VS'] : [])];
  const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const voltage = (v: unknown) => Array.isArray(v) && v.length === channels.length && v.every(finite);
  for (const [i, f] of r.frames.entries()) {
    requireValue(f.step === i && Math.abs(f.tRelativeS - i * .001) < 1e-9 && [f.signals?.Ip, f.signals?.R, f.signals?.Z].every(finite), 'CONTROL_FRAME_INVALID');
    if (i === 0) requireValue(f.action === null, 'CONTROL_RESET_ACTION');
    else requireValue(voltage(f.action?.rawCommandV) && voltage(f.action?.mappedCommandV) && voltage(f.action?.psmSentV) && isDeepStrictEqual(f.action.rawCommandV, spec.parameters.voltagesV) && isDeepStrictEqual(f.action.channelNames, channels) && f.action.actualAppliedV === null && f.action.actualAppliedStatus === 'not_reported' && f.action.vsOwnership === 'plant_internal', 'CONTROL_ACTION_BINDING');
    if (i > 0) requireValue(isDeepStrictEqual(f.action.rawCommandV, f.action.mappedCommandV) && isDeepStrictEqual(f.action.mappedCommandV, f.action.psmSentV), 'CONTROL_BASELINE_VOLTAGE_MISMATCH');
    if (r.status === 'completed') requireValue(f.failure === false, 'CONTROL_PLANT_FAILURE');
  }
  const frames = r.frames.filter((f: { step: number }) => f.step % spec.parameters.recordEvery === 0 || f.step === r.completedSteps);
  const signals: ControlResult['signals'] = [['Ip', 'ip', 'A'], ['R', 'r', 'm'], ['Z', 'z', 'm'], ['Rmin', 'rmin', 'm'], ['Rmax', 'rmax', 'm'], ['kappa', 'kappa', '1'], ['VS_V', 'vs_voltage', 'V']].filter(([source]) => frames.some((f: { signals: Record<string, unknown> }) => f.signals[source] !== undefined)).map(([source, target, unit]) => ({ id: target, unit: unit as 'A' | 'm' | 'V' | '1', values: frames.map((f: { signals: Record<string, unknown> }) => f.signals[source] === undefined ? null : f.signals[source]) }));
  // PF values remain separate signals. Missing optional channels stay null, never zero.
  for (let i = 0; i < 12; i++) if (frames.some((f: { signals: { I_PF?: number[] } }) => f.signals.I_PF?.[i] !== undefined)) signals.push({ id: `pf_current_${i}`, unit: 'A', values: frames.map((f: { signals: { I_PF?: number[] } }) => f.signals.I_PF?.[i] ?? null) });
  const geometry: ControlResult['geometry'] = { state: 'unavailable', coordinate: 'cylindrical-rz', cocos: null, fluxState: 'unavailable', reason: 'Flux units, COCOS and native array ordering are not verified. No TORAX geometry is inferred.', frames: [] };
  if (spec.engine.id === 'fge') for (const [timeIndex, f] of frames.entries()) if (Array.isArray(f.fields?.lcfsPointsM) && f.fields.lcfsPointsM.length >= 3) geometry.frames.push({ timeIndex, lcfs: f.fields.lcfsPointsM });
  if (geometry.frames.length) geometry.state = 'available';
  const recipe = recipeFor(spec.engine.id);
  return parseControlResult({ schema: 'control-result.v1', id, authority: 'simulated', recordKind: 'simulation-run', origin: 'remote-docker', engine: { id: spec.engine.id, sourceCommit: spec.engine.commit, imageDigest: m.execution.imageId }, recipe: spec.recipe,
    initialState: { shot: recipe.shot, timeSeconds: recipe.initialTimeSeconds }, spec, time: { unit: 's', reference: 'simulation-time', dtSeconds: .001, values: frames.map((f: { tRelativeS: number }) => f.tRelativeS) }, signals,
    actions: { channels, commandedV: frames.map((f: { action: { rawCommandV: number[] } | null }) => f.action?.rawCommandV ?? channels.map(() => null)), sentV: frames.map((f: { action: { psmSentV: number[] } | null }) => f.action?.psmSentV ?? channels.map(() => null)), appliedV: null, appliedStatus: 'not-reported' }, geometry,
    execution: { state: ({ completed: 'succeeded', failed: 'failed', cancelled: 'cancelled', timed_out: 'timed-out' } as const)[r.status as 'completed'], requestedSteps: r.requestedSteps, completedSteps: r.completedSteps, dispatchedSteps: r.dispatchedSteps, unconfirmedSteps: r.unconfirmedSteps, elapsedSeconds: null, reason: r.status === 'completed' ? null : 'Partial native run; unconfirmed dispatched commands may have advanced the plant.' },
    assessment: { dataChecks: r.status === 'completed' ? 'passed' : 'partial', numericalConvergence: 'not-established', deviceValidation: 'not-established' }, provenance: { resultSha256: sha(raw), manifestSha256: sha(manifestBytes), adapterSha256: runnerSha, specSha256: sha(specBytes), sourceLabel: 'FusionControl strict raw-protocol exporter; Docker Image ID verified on compute host.' },
    limitations: ['Protocol validation is not numerical convergence or EXL-50U validation.', 'Initial checkpoint identity is container-pinned; the native checkpoint hash is not independently verified.', 'Actual applied PF/CS voltage is not reported by the plant.', 'Controller/PSM settings are a fixed baseline, not a trained policy.', 'TORAX coupling is not implemented.', 'Socket closure does not prove plant readiness; the node requires operator rearm.'] });
}
