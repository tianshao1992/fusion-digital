import { parseSimulationRun, type SimulationRun } from './contract';
import { parseFluxCoordinateMap, type FluxCoordinateMap } from './flux-coordinate-map';
import { parsePhysics, type PhysicsData } from './physics';
import { parseRunSpec, type RunSpec } from './run-spec';

export const FUSE_JOB_STATES = [
  'queued',
  'starting',
  'running',
  'cancellation-requested',
  'succeeded',
  'failed',
  'timed-out',
  'cancelled',
  'collection-failed',
  'reconciliation-required',
] as const;

export type FuseJobState = (typeof FUSE_JOB_STATES)[number] | 'connection-lost';
export type FuseJobStatus = {
  id: string;
  state: FuseJobState;
  processStopped?: boolean;
  exitCode?: number | null;
  reason?: string | null;
  startedUtc?: string;
  finishedUtc?: string;
  elapsedSeconds?: number;
  latestStage?: { name: string; state: string; timeUtc: string };
};

export type FuseCollectedResult = {
  schema: 'fuse-job-result.v1';
  runSpec: RunSpec;
  run: SimulationRun;
  physics: PhysicsData;
  coordinateMap?: FluxCoordinateMap;
  verification: {
    authority: 'local-gateway-verified';
    manifestSha256: string;
    runSpecSha256: string;
    physicsSha256: string;
    nativeSha256: string;
    coordinateMapSha256?: string;
  };
};

const fuseJobIdentifier = (value: unknown): value is string => typeof value === 'string' && /^fuse-diiid-[a-z0-9-]{1,90}$/.test(value);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const exactKeys = (value: unknown, keys: string[]): boolean => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
const canonicalRunSpec = (value: RunSpec): string => `${JSON.stringify(value, null, 2)}\n`;

function check(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}

export function parseFuseJobId(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  check(fuseJobIdentifier(normalized), 'INVALID_FUSE_JOB_ID');
  return normalized;
}

export function normalizeFuseGatewayEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('INVALID_GATEWAY_URL'); }
  check(!url.username && !url.password && !url.search && !url.hash && (url.pathname === '/' || url.pathname === ''), 'GATEWAY_ORIGIN_REQUIRED');
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  check((loopback && url.protocol === 'http:') || url.protocol === 'https:', 'SECURE_GATEWAY_REQUIRED');
  check(Boolean(url.port) || url.protocol === 'https:', 'GATEWAY_PORT_REQUIRED');
  return url.origin;
}

export function parseFuseCatalog(value: unknown): { concurrency: number } {
  check(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_GATEWAY_CATALOG');
  const catalog = value as { schema?: unknown; executionEngineIds?: unknown; concurrency?: unknown };
  check(catalog.schema === 'engine-catalog.v1' && Array.isArray(catalog.executionEngineIds) && catalog.executionEngineIds.includes('fuse'), 'INCOMPATIBLE_GATEWAY');
  check(Number.isInteger(catalog.concurrency) && (catalog.concurrency as number) >= 1 && (catalog.concurrency as number) <= 1024, 'INVALID_GATEWAY_CATALOG');
  return { concurrency: catalog.concurrency as number };
}

export function parseFuseJobStatus(value: unknown): FuseJobStatus {
  check(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_JOB_STATUS');
  const status = value as Record<string, unknown>;
  check(status.schema === 'engine-job.v1' && status.engineId === 'fuse' && fuseJobIdentifier(status.id), 'INVALID_JOB_STATUS');
  check(typeof status.state === 'string' && (FUSE_JOB_STATES as readonly string[]).includes(status.state), 'INVALID_JOB_STATUS');
  check(typeof status.processStopped === 'boolean' && (status.exitCode === null || Number.isInteger(status.exitCode)), 'INVALID_JOB_STATUS');
  check(status.reason === undefined || status.reason === null || (typeof status.reason === 'string' && status.reason.length <= 200), 'INVALID_JOB_STATUS');
  check(status.startedUtc === undefined || (typeof status.startedUtc === 'string' && !Number.isNaN(Date.parse(status.startedUtc))), 'INVALID_JOB_STATUS');
  check(status.finishedUtc === undefined || (typeof status.finishedUtc === 'string' && !Number.isNaN(Date.parse(status.finishedUtc))), 'INVALID_JOB_STATUS');
  check(status.elapsedSeconds === undefined || (finite(status.elapsedSeconds) && status.elapsedSeconds >= 0), 'INVALID_JOB_STATUS');
  if (status.latestStage !== undefined) {
    check(status.latestStage && typeof status.latestStage === 'object' && !Array.isArray(status.latestStage), 'INVALID_JOB_STATUS');
    const stage = status.latestStage as Record<string, unknown>;
    check(Object.keys(stage).length === 3 && typeof stage.name === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(stage.name) && typeof stage.state === 'string' && /^[a-zA-Z0-9._-]{1,100}$/.test(stage.state) && typeof stage.timeUtc === 'string' && !Number.isNaN(Date.parse(stage.timeUtc)), 'INVALID_JOB_STATUS');
  }
  return {
    id: status.id,
    state: status.state as FuseJobState,
    processStopped: status.processStopped as boolean,
    exitCode: status.exitCode as number | null,
    ...(status.reason !== undefined ? { reason: status.reason as string | null } : {}),
    ...(status.startedUtc !== undefined ? { startedUtc: status.startedUtc as string } : {}),
    ...(status.finishedUtc !== undefined ? { finishedUtc: status.finishedUtc as string } : {}),
    ...(status.elapsedSeconds !== undefined ? { elapsedSeconds: status.elapsedSeconds as number } : {}),
    ...(status.latestStage !== undefined ? { latestStage: { ...(status.latestStage as FuseJobStatus['latestStage'])! } } : {}),
  };
}

export function parseRecoveredFuseJobStatus(expectedJobId: unknown, value: unknown): FuseJobStatus {
  const id = parseFuseJobId(expectedJobId);
  const status = parseFuseJobStatus(value);
  check(status.id === id, 'JOB_IDENTITY_MISMATCH');
  return status;
}

export function parseFuseSubmission(value: unknown): { id: string } {
  check(value && typeof value === 'object' && !Array.isArray(value) && fuseJobIdentifier((value as { id?: unknown }).id), 'INVALID_JOB_SUBMISSION');
  return { id: (value as { id: string }).id };
}

async function sha256(value: string): Promise<string> {
  check(globalThis.crypto?.subtle, 'FUSE_JOB_VERIFICATION_UNAVAILABLE');
  const bytes = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function parseFuseCollectedResult(value: unknown): Promise<FuseCollectedResult> {
  check(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_FUSE_JOB_RESULT');
  const envelope = value as Record<string, unknown>;
  check(envelope.schema === 'fuse-job-result.v1', 'INVALID_FUSE_JOB_RESULT');
  check(Object.keys(envelope).every(key => ['schema', 'runSpec', 'run', 'physics', 'coordinateMap', 'verification'].includes(key)), 'INVALID_FUSE_JOB_RESULT');
  const runSpec = parseRunSpec(envelope.runSpec);
  const run = parseSimulationRun(envelope.run);
  const physics = parsePhysics(envelope.physics);
  check(run.engine.id === 'fuse' && fuseJobIdentifier(run.id) && run.id === physics.runId, 'FUSE_JOB_RESULT_IDENTITY_MISMATCH');
  const runSpecArtifact = run.source.artifacts.find(artifact => artifact.name === 'run-spec.json');
  const physicsArtifact = run.source.artifacts.find(artifact => artifact.name === 'physics.json');
  const nativeArtifact = run.source.artifacts.find(artifact => artifact.name === 'dd-native.h5');
  const mapArtifact = run.source.artifacts.find(artifact => artifact.name === 'coordinate-map.json');
  check(physicsArtifact && digest(physicsArtifact.sha256), 'FUSE_JOB_RESULT_PHYSICS_UNBOUND');
  check(envelope.verification && typeof envelope.verification === 'object' && !Array.isArray(envelope.verification), 'INVALID_FUSE_JOB_VERIFICATION');
  const verification = envelope.verification as FuseCollectedResult['verification'];
  const verificationKeys = envelope.coordinateMap === undefined
    ? ['authority', 'manifestSha256', 'runSpecSha256', 'physicsSha256', 'nativeSha256']
    : ['authority', 'manifestSha256', 'runSpecSha256', 'physicsSha256', 'nativeSha256', 'coordinateMapSha256'];
  check(exactKeys(verification, verificationKeys) && verification.authority === 'local-gateway-verified', 'INVALID_FUSE_JOB_VERIFICATION');
  check(digest(verification.manifestSha256) && digest(verification.runSpecSha256) && digest(verification.physicsSha256) && digest(verification.nativeSha256), 'INVALID_FUSE_JOB_VERIFICATION');
  check(runSpecArtifact && digest(runSpecArtifact.sha256) && verification.runSpecSha256 === runSpecArtifact.sha256, 'FUSE_JOB_RESULT_RUN_SPEC_UNBOUND');
  check(verification.runSpecSha256 === await sha256(canonicalRunSpec(runSpec)), 'FUSE_JOB_VERIFICATION_MISMATCH');
  check(verification.manifestSha256 === run.source.recordSha256 && verification.physicsSha256 === physicsArtifact.sha256, 'FUSE_JOB_VERIFICATION_MISMATCH');
  check(nativeArtifact && verification.nativeSha256 === nativeArtifact.sha256, 'FUSE_JOB_VERIFICATION_MISMATCH');
  let coordinateMap: FluxCoordinateMap | undefined;
  if (envelope.coordinateMap !== undefined) {
    coordinateMap = parseFluxCoordinateMap(envelope.coordinateMap);
    check(nativeArtifact && digest(nativeArtifact.sha256) && mapArtifact && digest(mapArtifact.sha256) && digest(verification.coordinateMapSha256), 'FUSE_JOB_RESULT_NATIVE_UNBOUND');
    check(verification.coordinateMapSha256 === mapArtifact.sha256, 'FUSE_JOB_VERIFICATION_MISMATCH');
    check(
      coordinateMap.runId === run.id
      && coordinateMap.source.physicsSha256 === physicsArtifact.sha256
      && coordinateMap.source.nativeSha256 === nativeArtifact.sha256
      && coordinateMap.source.equilibriumTimeSeconds === physics.timeSeconds
      && coordinateMap.source.coreTimeSeconds === physics.coreTimeSeconds
      && coordinateMap.source.cocos === physics.cocos,
      'FUSE_JOB_RESULT_COORDINATE_MISMATCH',
    );
  }
  return { schema: 'fuse-job-result.v1', runSpec, run, physics, ...(coordinateMap ? { coordinateMap } : {}), verification: { ...verification } };
}

export function assertFuseResultMatchesSpec(result: FuseCollectedResult, spec: RunSpec): void {
  const expected = parseRunSpec(spec);
  check(canonicalRunSpec(result.runSpec) === canonicalRunSpec(expected), 'FUSE_JOB_RESULT_RUN_SPEC_MISMATCH');
  const expectedCase = expected.recipe === 'diiid-default-stationary' ? 'diiid-stationary' : 'diiid-fluxmatch-profile';
  check(result.run.caseId === expectedCase, 'FUSE_JOB_RESULT_RECIPE_MISMATCH');
  check(result.run.engine.commit === expected.engineCommit && result.run.engine.threads === expected.resources.threads, 'FUSE_JOB_RESULT_ENGINE_MISMATCH');
  check(result.run.solverTolerances?.xtol === expected.solver.xtol, 'FUSE_JOB_RESULT_SOLVER_MISMATCH');
  if (expected.recipe === 'diiid-lmode-fluxmatch') {
    check(result.run.convergence.kind === 'variants' && result.run.convergence.labels.length === 1 && result.run.convergence.labels[0] === expected.model, 'FUSE_JOB_RESULT_MODEL_MISMATCH');
  } else {
    check(expected.model === 'TGLFNN' && result.run.convergence.kind === 'iterations' && result.run.convergence.threshold === expected.solver.stationaryThreshold, 'FUSE_JOB_RESULT_MODEL_MISMATCH');
  }
}

export function isFuseJobActive(status: FuseJobStatus | null): boolean {
  return !!status && ['queued', 'starting', 'running', 'cancellation-requested', 'connection-lost'].includes(status.state);
}

export async function readGatewayJson(response: Response, maximumBytes = 24_000_000): Promise<unknown> {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maximumBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('GATEWAY_RESPONSE_TOO_LARGE');
  }
  if (!response.body) throw new Error('EMPTY_GATEWAY_RESPONSE');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0; let complete = false;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) { complete = true; break; }
      size += value.length;
      if (size > maximumBytes) throw new Error('GATEWAY_RESPONSE_TOO_LARGE');
      chunks.push(value);
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('INVALID_GATEWAY_RESPONSE'); }
}
