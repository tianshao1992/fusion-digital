// FUSE execution adapter for the loopback gateway. Native HDF5, logs, source
// trees and model weights remain in the configured local FUSE workspace.
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSimulationRun, type SimulationRun } from '../../app/simulations/contract.ts';
import { parseFluxCoordinateMap, type FluxCoordinateMap } from '../../app/simulations/flux-coordinate-map.ts';
import { parsePhysics, type PhysicsData } from '../../app/simulations/physics.ts';
import { parseRunSpec, type RunSpec } from '../../app/simulations/run-spec.ts';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const workspaceRoot = path.resolve(process.env.FUSE_WORKSPACE ?? 'D:/Code/Fuse');
export const resultsRoot = path.join(workspaceRoot, 'results');
const runner = path.join(project, 'scripts/simulations/local-runner.mts');
const terminalStates = new Set(['succeeded', 'failed', 'timed-out', 'cancelled', 'collection-failed', 'reconciliation-required']);
const stoppedStates = new Set(['succeeded', 'failed', 'timed-out', 'cancelled', 'collection-failed']);
const exposedStates = new Set(['queued', 'starting', 'running', 'cancellation-requested', ...terminalStates]);
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

type NativeStatus = {
  schema: 'simulation-attempt.v1'; id: string; state: string; reason: string | null;
  recipe: RunSpec['recipe']; model: RunSpec['model']; specSha256: string;
  startedUtc: string; finishedUtc?: string; exitCode?: number | null;
};
export type FuseJobStatus = {
  schema: 'engine-job.v1'; id: string; engineId: 'fuse'; state: string;
  processStopped: boolean; exitCode: number | null; elapsedSeconds: number;
  reason?: string | null;
  startedUtc?: string; finishedUtc?: string;
  latestStage?: { name: string; state: string; timeUtc: string };
};
export type FuseJobResult = {
  schema: 'fuse-job-result.v1'; runSpec: RunSpec; run: SimulationRun; physics: PhysicsData;
  coordinateMap: FluxCoordinateMap;
  verification: {
    authority: 'local-gateway-verified'; manifestSha256: string; runSpecSha256: string; physicsSha256: string;
    nativeSha256: string; coordinateMapSha256: string;
  };
};
type Launch = {
  child: ChildProcess; cancelFile: string; preflightFailureFile: string;
  cancelRequested: boolean; closed: boolean; preflightFailed: boolean;
  spawnFailed: boolean; exitCode: number | null;
};
const launches = new Map<string, Launch>();

function fileError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === code;
}
async function readJson(file: string, maximum: number): Promise<unknown> {
  return JSON.parse((await readBytes(file, maximum)).toString('utf8'));
}
async function readBytes(file: string, maximum: number): Promise<Buffer> {
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > maximum) throw new Error('FILE_SIZE_LIMIT');
  return readFile(file);
}
async function hashFile(file: string): Promise<string> {
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('INVALID_RESULT_ARTIFACT');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
function safeId(id: string): string {
  if (!/^fuse-diiid-[a-z0-9-]{1,90}$/.test(id)) throw new Error('INVALID_JOB_ID');
  return id;
}
export function fuseAttemptPath(id: string): string {
  return path.join(resultsRoot, safeId(id));
}
function normalizedState(state: string): string {
  return exposedStates.has(state) ? state : 'failed';
}
function elapsedSeconds(value: NativeStatus): number {
  const started = Date.parse(value.startedUtc);
  const finished = value.finishedUtc ? Date.parse(value.finishedUtc) : Date.now();
  return Number.isFinite(started) && Number.isFinite(finished) ? Math.max(0, (finished - started) / 1000) : 0;
}
async function nativeStatus(id: string): Promise<NativeStatus> {
  const value = await readJson(path.join(fuseAttemptPath(id), 'status.json'), 32_768) as NativeStatus;
  if (value.schema !== 'simulation-attempt.v1' || value.id !== id || typeof value.state !== 'string'
    || typeof value.startedUtc !== 'string' || !Number.isFinite(Date.parse(value.startedUtc))
    || (value.finishedUtc !== undefined && (typeof value.finishedUtc !== 'string' || !Number.isFinite(Date.parse(value.finishedUtc))))
    || (value.reason !== null && (typeof value.reason !== 'string' || !/^[a-z][a-z0-9-]{0,80}$/.test(value.reason)))
    || (value.exitCode !== undefined && value.exitCode !== null && !Number.isInteger(value.exitCode))
    || !/^[a-f0-9]{64}$/.test(value.specSha256)) throw new Error('INVALID_JOB_STATUS');
  return value;
}
async function latestStage(id: string): Promise<FuseJobStatus['latestStage']> {
  try {
    const values = await readJson(path.join(fuseAttemptPath(id), 'stages.json'), 256_000);
    if (!Array.isArray(values) || values.length > 2_000) throw new Error('INVALID_STAGE_LOG');
    const value = values.at(-1) as { stage?: unknown; state?: unknown; timeUtc?: unknown } | undefined;
    if (!value) return undefined;
    if (typeof value.stage !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(value.stage)
      || typeof value.state !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(value.state)
      || typeof value.timeUtc !== 'string' || !Number.isFinite(Date.parse(value.timeUtc))) throw new Error('INVALID_STAGE_LOG');
    return { name: value.stage, state: value.state, timeUtc: value.timeUtc };
  } catch (error) {
    if (fileError(error, 'ENOENT')) return undefined;
    throw error;
  }
}
export function reconciledStatus(id: string): FuseJobStatus {
  // A closed Node launcher is not proof that Julia or another descendant has
  // stopped. Retain the global lease until an operator reconciles this attempt.
  return { schema: 'engine-job.v1', id, engineId: 'fuse', state: 'reconciliation-required', processStopped: false, exitCode: null, elapsedSeconds: 0, reason: 'launcher-state-unresolved' };
}
function stoppedLaunchFailureStatus(id: string, exitCode: number | null,
  reason: 'runner-preflight-failed' | 'runner-launch-failed'): FuseJobStatus {
  return { schema: 'engine-job.v1', id, engineId: 'fuse', state: 'failed', processStopped: true,
    exitCode, elapsedSeconds: 0, reason };
}
export async function status(id: string): Promise<FuseJobStatus> {
  safeId(id);
  const launch = launches.get(id);
  try {
    const value = await nativeStatus(id);
    const baseState = normalizedState(value.state);
    const state = launch?.cancelRequested && !terminalStates.has(baseState) ? 'cancellation-requested' : baseState;
    const stage = await latestStage(id);
    return {
      schema: 'engine-job.v1', id, engineId: 'fuse', state,
      processStopped: stoppedStates.has(baseState) && (!launch || launch.closed),
      exitCode: typeof value.exitCode === 'number' ? value.exitCode : null,
      elapsedSeconds: elapsedSeconds(value),
      reason: value.reason,
      startedUtc: value.startedUtc,
      ...(value.finishedUtc ? { finishedUtc: value.finishedUtc } : {}),
      ...(stage ? { latestStage: stage } : {}),
    };
  } catch (error) {
    if (!fileError(error, 'ENOENT')) throw error;
    if (!launch) throw new Error('UNKNOWN_JOB');
    if (launch.closed && launch.preflightFailed) return stoppedLaunchFailureStatus(id, launch.exitCode, 'runner-preflight-failed');
    if (launch.closed && launch.spawnFailed) return stoppedLaunchFailureStatus(id, launch.exitCode, 'runner-launch-failed');
    if (launch.closed) return reconciledStatus(id);
    return { schema: 'engine-job.v1', id, engineId: 'fuse', state: launch.cancelRequested ? 'cancellation-requested' : 'queued', processStopped: false, exitCode: null, elapsedSeconds: 0 };
  }
}

export async function cancel(id: string): Promise<{ id: string; engineId: 'fuse'; state: 'cancellation-requested' }> {
  const current = await status(id);
  if (!['queued', 'starting', 'running', 'cancellation-requested'].includes(current.state)) throw new Error('JOB_ALREADY_TERMINAL');
  const launch = launches.get(id);
  if (launch) {
    launch.cancelRequested = true;
    await writeFile(launch.cancelFile, 'cancel\n', { flag: 'wx' }).catch(error => {
      if (!fileError(error, 'EEXIST')) throw error;
    });
  } else {
    await writeFile(path.join(fuseAttemptPath(id), 'cancel.request'), 'cancel\n', { flag: 'wx' }).catch(error => {
      if (!fileError(error, 'EEXIST')) throw error;
    });
  }
  return { id, engineId: 'fuse', state: 'cancellation-requested' };
}

export async function submit(value: unknown, input?: unknown): Promise<{ id: string; completion: Promise<FuseJobStatus> }> {
  if (input !== undefined) throw new Error('FUSE_INPUT_NOT_SUPPORTED');
  const spec = parseRunSpec(value);
  if ([...launches.values()].some(launch => !launch.closed)) throw new Error('ENGINE_BUSY_OR_UNRECONCILED');
  await mkdir(resultsRoot, { recursive: true });
  try {
    await stat(path.join(resultsRoot, '.fusiondigital-runner.lock'));
    throw new Error('ENGINE_BUSY_OR_UNRECONCILED');
  } catch (error) {
    if (!fileError(error, 'ENOENT')) throw error;
  }
  const id = `fuse-diiid-${new Date().toISOString().replace(/[^0-9]/g, '')}-${randomUUID().slice(0, 8)}`;
  safeId(id);
  const staging = await mkdtemp(path.join(tmpdir(), 'fusiondigital-fuse-'));
  const specFile = path.join(staging, 'run-spec.json');
  const cancelFile = path.join(staging, 'cancel.request');
  const preflightFailureFile = path.join(staging, 'preflight-failed.json');
  await writeFile(specFile, json(spec), { flag: 'wx' });
  const child = spawn(process.execPath, ['--import', 'tsx', runner, 'run', '--spec', specFile, '--workspace', workspaceRoot, '--run-id', id, '--cancel-file', cancelFile, '--preflight-failure-file', preflightFailureFile], {
    cwd: project, windowsHide: true, stdio: 'ignore', shell: false,
  });
  const launch: Launch = { child, cancelFile, preflightFailureFile, cancelRequested: false, closed: false,
    preflightFailed: false, spawnFailed: false, exitCode: null };
  launches.set(id, launch);
  const completion = new Promise<FuseJobStatus>((resolve) => {
    let settled = false;
    const finish = async (exitCode: number | null, spawnFailed = false) => {
      if (settled) return;
      settled = true;
      launch.exitCode = exitCode;
      launch.spawnFailed = spawnFailed;
      try {
        const marker = await readJson(preflightFailureFile, 1_024) as Record<string, unknown>;
        launch.preflightFailed = Object.keys(marker).length === 4
          && marker.schema === 'fuse-runner-preflight.v1' && marker.id === id
          && marker.specSha256 === digest(json(spec)) && marker.state === 'failed';
      } catch { launch.preflightFailed = false; }
      launch.closed = true;
      // Temp cleanup failure must not strand the unified gateway slot after
      // process closure; the execution classification above is independent.
      await rm(staging, { recursive: true, force: true }).catch(() => undefined);
      try { resolve(await status(id)); } catch { resolve(reconciledStatus(id)); }
    };
    child.once('error', () => void finish(null, true));
    child.once('close', code => void finish(code));
  });
  return { id, completion };
}

function artifactMap(manifest: Record<string, unknown>): Map<string, string> {
  const artifacts = manifest.artifacts;
  if (!Array.isArray(artifacts) || artifacts.length > 20) throw new Error('INVALID_FUSE_MANIFEST');
  const result = new Map<string, string>();
  for (const value of artifacts) {
    if (!value || typeof value !== 'object') throw new Error('INVALID_FUSE_MANIFEST');
    const item = value as { name?: unknown; sha256?: unknown };
    if (typeof item.name !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(item.name)
      || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) || result.has(item.name)) throw new Error('INVALID_FUSE_MANIFEST');
    result.set(item.name, item.sha256);
  }
  return result;
}
export async function collect(id: string): Promise<FuseJobResult> {
  const current = await status(id);
  if (current.state !== 'succeeded' || !current.processStopped || current.exitCode !== 0) throw new Error('JOB_NOT_SUCCEEDED');
  const directory = fuseAttemptPath(id);
  const manifestBytes = await readBytes(path.join(directory, 'run-manifest.json'), 2_000_000);
  const manifest = JSON.parse(manifestBytes.toString()) as Record<string, unknown>;
  const specBytes = await readBytes(path.join(directory, 'run-spec.json'), 16_384);
  const spec = parseRunSpec(JSON.parse(specBytes.toString('utf8')));
  if (!specBytes.equals(Buffer.from(json(spec), 'utf8'))) throw new Error('RUN_SPEC_NOT_CANONICAL');
  const specSha256 = digest(specBytes);
  const attempt = await nativeStatus(id);
  if (manifest.schema !== 'fuse-native-run.v2' || manifest.runId !== id || manifest.execution !== 'succeeded'
    || manifest.authority !== 'simulated' || manifest.recipe !== spec.recipe || manifest.model !== spec.model
    || manifest.fuseCommit !== spec.engineCommit || manifest.threads !== spec.resources.threads
    || attempt.recipe !== spec.recipe || attempt.model !== spec.model || attempt.specSha256 !== specSha256) throw new Error('RESULT_IDENTITY');
  const artifacts = artifactMap(manifest);
  const required = ['physics.json', 'coordinate-map.json', 'dd-native.h5', 'initial-native.h5', 'solved-native.h5', 'checks.json', 'run-spec.json', 'environment-lock.json', 'run-diiid.jl', 'FuseProjection.jl'];
  if (required.some(name => !artifacts.has(name))) throw new Error('MISSING_RESULT_ARTIFACT');
  if (artifacts.get('run-spec.json') !== specSha256) throw new Error('RESULT_IDENTITY');
  for (const [name, expected] of artifacts) {
    if (await hashFile(path.join(directory, name)) !== expected) throw new Error('MANIFEST_INTEGRITY');
  }
  const checks = manifest.checks as Record<string, unknown> | undefined;
  if (!checks || ['nativeRoundtrip', 'finiteGrid', 'positiveTe', 'positiveNe'].some(key => checks[key] !== true)) throw new Error('SCIENTIFIC_OUTPUT_INVALID');
  const physicsBytes = await readBytes(path.join(directory, 'physics.json'), 20_000_000);
  const physics = parsePhysics(JSON.parse(physicsBytes.toString()));
  const coordinateMap = parseFluxCoordinateMap(await readJson(path.join(directory, 'coordinate-map.json'), 1_000_000));
  if (physics.schema !== 'fuse-physics.v2' || physics.runId !== id || coordinateMap.runId !== id
    || !physics.reference || !physics.fluxMatch || physics.fluxMatch.selectedResidual !== manifest.selectedResidual
    || coordinateMap.source.physicsSha256 !== digest(physicsBytes)
    || coordinateMap.source.nativeSha256 !== artifacts.get('dd-native.h5')
    || coordinateMap.projectorSha256 !== artifacts.get('FuseProjection.jl')
    || coordinateMap.source.equilibriumTimeSeconds !== physics.timeSeconds
    || coordinateMap.source.coreTimeSeconds !== physics.coreTimeSeconds
    || coordinateMap.source.cocos !== physics.cocos) throw new Error('PROJECTION_IDENTITY');
  const versions = manifest.versions as Record<string, unknown> | undefined;
  if (!versions || typeof versions.fuse !== 'string' || typeof versions.julia !== 'string') throw new Error('INVALID_FUSE_MANIFEST');
  const stationary = spec.recipe === 'diiid-default-stationary';
  const history = Array.isArray(manifest.stationaryHistory) ? manifest.stationaryHistory : [];
  const selectedResidual = manifest.selectedResidual;
  const evaluationCount = manifest.evaluationCount;
  if (!history.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)
    || typeof selectedResidual !== 'number' || !Number.isFinite(selectedResidual) || selectedResidual < 0
    || !Number.isInteger(evaluationCount) || (evaluationCount as number) < 0) throw new Error('INVALID_CONVERGENCE_EVIDENCE');
  const passed = stationary && history.length >= 2 && history.at(-1)! <= spec.solver.stationaryThreshold;
  const metricSpecs = [['te', 'central_electron_temperature_keV', 'keV', 0.001], ['ti', 'central_ion_temperature_keV', 'keV', 0.001], ['ne', 'central_electron_density_m3', 'm⁻³', 1]] as const;
  const metrics = metricSpecs.flatMap(([profileId, metricId, unit, scale]) => {
    const value = physics.profiles.find(profile => profile.id === profileId)?.y[0];
    return typeof value === 'number' ? [{ id: metricId, unit, value: value * scale }] : [];
  });
  const elapsed = manifest.elapsedSeconds;
  if (typeof elapsed !== 'number' || !Number.isFinite(elapsed) || elapsed < 0) throw new Error('INVALID_FUSE_MANIFEST');
  const run = parseSimulationRun({
    schema: 'simulation-result.v1', resultProfile: 'fuse-physics-run.v1', id,
    caseId: stationary ? 'diiid-stationary' : 'diiid-fluxmatch-profile',
    authority: 'simulated', recordKind: 'simulation-run', execution: 'succeeded',
    assessment: passed ? 'passed-demo-criterion' : 'not-established',
    engine: { id: 'fuse', version: versions.fuse, commit: spec.engineCommit, runtime: { name: 'Julia', version: versions.julia }, threads: spec.resources.threads },
    metrics,
    convergence: stationary
      ? { kind: 'iterations', labels: history.map((_, index) => String(index + 1)), values: history, threshold: spec.solver.stationaryThreshold }
      : { kind: 'variants', labels: [spec.model], values: [selectedResidual], calls: [evaluationCount], threshold: null },
    solverTolerances: { xtol: spec.solver.xtol }, timing: { seconds: elapsed, scope: 'simulation-stage' },
    source: { recordSha256: digest(manifestBytes), artifacts: [...artifacts].map(([name, sha256]) => ({ name, sha256 })) },
  });
  return {
    schema: 'fuse-job-result.v1', runSpec: spec, run, physics, coordinateMap,
    verification: {
      authority: 'local-gateway-verified', manifestSha256: digest(manifestBytes),
      runSpecSha256: specSha256,
      physicsSha256: digest(physicsBytes), nativeSha256: artifacts.get('dd-native.h5')!,
      coordinateMapSha256: artifacts.get('coordinate-map.json')!,
    },
  };
}
