// Local execution boundary: never imported into the public Next/Vite application.
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { copyFile, mkdir, open, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { getRecipe } from '../../app/simulations/platform/catalog.ts';
import { parseEngineSpec, parseProfileSnapshot, parseTransportResult, isIdentifier, type ProfileSnapshot, type TransportRunEntry } from '../../app/simulations/platform/contracts.ts';
import { parsePhysics } from '../../app/simulations/physics.ts';
import { parseTransportGeometry } from '../../app/simulations/platform/geometry.ts';

export const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const runtimeRoot = path.resolve(process.env.TORAX_WORKSPACE ?? 'D:/Code/Torax');
export const resultsRoot = path.join(runtimeRoot, 'local/platform-runs');
export const sha = (v: Uint8Array | string) => createHash('sha256').update(v).digest('hex');
export const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
export async function readJson(file: string, maximum = 20_000_000): Promise<unknown> {
  if ((await stat(file)).size > maximum) throw new Error('FILE_SIZE_LIMIT');
  return JSON.parse(await readFile(file, 'utf8'));
}
export function attemptPath(id: string) {
  if (!isIdentifier(id) || !id.startsWith('torax-')) throw new Error('INVALID_JOB_ID');
  return path.join(resultsRoot, id);
}
export async function createFuseSnapshot(): Promise<ProfileSnapshot> {
  const bundles = JSON.parse(await readFile(path.join(project, 'app/simulations/data/physics-bundles.json'), 'utf8'));
  const bundle = bundles[0];
  if (!/^\/data\/simulations\/[a-f0-9]{64}\.json\.gz$/.test(bundle.path)) throw new Error('INVALID_FUSE_ASSET');
  const compressed = await readFile(path.join(project, 'public', bundle.path));
  if (compressed.length !== bundle.bytes || sha(compressed) !== bundle.sha256) throw new Error('FUSE_ASSET_INTEGRITY');
  const raw = gunzipSync(compressed, { maxOutputLength: 20_000_000 });
  if (raw.length !== bundle.rawBytes || sha(raw) !== bundle.rawSha256) throw new Error('FUSE_RAW_INTEGRITY');
  const physics = parsePhysics(JSON.parse(raw.toString()));
  if (physics.runId !== bundle.runId) throw new Error('FUSE_IDENTITY');
  const channels = ['te', 'ti', 'ne'].map(id => {
    const p = physics.profiles.find(p => p.id === id);
    if (!p || p.axis !== 'rho_tor_norm') throw new Error('FUSE_PROFILE_UNAVAILABLE');
    return p;
  });
  if (channels.some(c => JSON.stringify(c.x) !== JSON.stringify(channels[0].x))) throw new Error('FUSE_AXIS_MISMATCH');
  return parseProfileSnapshot({ schema: 'core-profile-snapshot.v1', authority: 'simulated',
    source: { engineId: 'fuse', runId: physics.runId, recordSha256: bundle.recordSha256, artifactSha256: bundle.rawSha256, timeSeconds: physics.coreTimeSeconds },
    coordinate: 'rho_tor_norm', rho: channels[0].x,
    profiles: channels.map(p => ({ id: p.id, unit: p.unit, values: p.y })), mapping: 'kinetic-profiles-only.v1' });
}
function linuxPath(p: string) {
  if (process.platform !== 'win32') return p;
  if (!/^[a-z]:[\\/]/i.test(p)) throw new Error('WSL_REQUIRES_LOCAL_DRIVE');
  return `/mnt/${p[0].toLowerCase()}/${p.slice(3).replaceAll('\\', '/')}`;
}
export type JobStatus = { schema: 'engine-job.v1'; id: string; state: string; processStopped: boolean; exitCode: number | null; elapsedSeconds: number; pid?: number | null };
export async function status(id: string): Promise<JobStatus> {
  const value = await readJson(path.join(attemptPath(id), 'status.json'), 16384) as JobStatus;
  return { schema: value.schema, id: value.id, state: value.state, processStopped: value.processStopped, exitCode: value.exitCode, elapsedSeconds: value.elapsedSeconds };
}
export async function cancel(id: string) {
  const job = await status(id);
  if (!['queued', 'starting', 'running'].includes(job.state)) throw new Error('JOB_ALREADY_TERMINAL');
  await writeFile(path.join(attemptPath(id), 'cancel'), 'cancel\n', { flag: 'wx' }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  return { id, state: 'cancellation-requested' };
}
// Adapter boundary: replacing TORAX requires a new validator/launcher/collector,
// not changes to the transport viewer. FUSE's mature native runner remains separate.
export async function submit(value: unknown, input?: unknown): Promise<{ id: string; completion: Promise<JobStatus> }> {
  const { spec, snapshot } = validateInput(value, input);
  await mkdir(resultsRoot, { recursive: true });
  const leasePath = path.join(resultsRoot, '.runner.lock');
  const lease = await open(leasePath, 'wx').catch(() => { throw new Error('ENGINE_BUSY_OR_UNRECONCILED'); });
  const id = `torax-${spec.recipe}-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await lease.writeFile(json({ id, owner: process.pid })); await lease.close();
  const out = attemptPath(id);
  try {
    await mkdir(out);
    await writeFile(path.join(out, 'spec.json'), json(spec), { flag: 'wx' });
    await writeFile(path.join(out, 'recipe.json'), json(getRecipe(spec.recipe)), { flag: 'wx' });
    if (snapshot) await writeFile(path.join(out, 'snapshot.json'), json(snapshot), { flag: 'wx' });
    for (const file of ['adapter.py', 'supervisor.py', 'export_geometry.py', 'hdf_reader.py']) await copyFile(path.join(project, 'scripts/simulations/torax', file), path.join(out, file));
    await writeFile(path.join(out, 'status.json'), json({ schema: 'engine-job.v1', id, state: 'queued', processStopped: false, exitCode: null, elapsedSeconds: 0 }));
    const root = linuxPath(runtimeRoot), target = linuxPath(out);
    const command = process.platform === 'win32' ? 'wsl.exe' : path.join(runtimeRoot, '.venv-wsl/bin/python');
    const args = [...(process.platform === 'win32' ? ['-d', process.env.TORAX_WSL_DISTRO ?? 'Ubuntu', '--', `${root}/.venv-wsl/bin/python`] : []), `${target}/adapter.py`, '--root', root, '--attempt', target];
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore', shell: false });
    const completion = new Promise<JobStatus>((resolve, reject) => {
      let settled = false;
      const finish = async () => {
        if (settled) return; settled = true;
        try {
          let job = await status(id);
          if (!job.processStopped) {
            // Never infer Linux child termination from wsl.exe exit. Retain lease.
            await writeFile(path.join(out, 'cancel'), 'launcher-exited\n');
            job = { ...job, state: 'reconciliation-required' };
            await writeFile(path.join(out, 'status.json'), json(job));
          } else await unlink(leasePath);
          resolve(job);
        } catch (error) { reject(error); }
      };
      child.once('error', finish); child.once('close', finish);
    });
    return { id, completion };
  } catch (error) { await unlink(leasePath); throw error; }
}
export function validateInput(value: unknown, input?: unknown) {
  const spec = parseEngineSpec(value);
  const snapshot = input === undefined ? null : parseProfileSnapshot(input);
  if ((snapshot === null) !== (spec.input === null) || (snapshot && sha(json(snapshot)) !== spec.input?.profileSnapshotSha256)) throw new Error('SNAPSHOT_BINDING');
  return { spec, snapshot };
}
export async function collectGeometry(id: string) {
  const result = await collect(id), out = attemptPath(id);
  const manifest = await readJson(path.join(out, 'manifest.json'), 20000) as Record<string, { sha256: string; bytes: number }>;
  for (const name of ['geometry.json', 'export_geometry.py', 'hdf_reader.py']) {
    const data = await readFile(path.join(out, name));
    if (data.length !== manifest[name]?.bytes || sha(data) !== manifest[name]?.sha256) throw new Error('GEOMETRY_INTEGRITY');
  }
  const geometry = parseTransportGeometry(await readJson(path.join(out, 'geometry.json')));
  if (geometry.runId !== id || geometry.sourceNativeSha256 !== result.provenance.nativeSha256 || geometry.projectorSha256 !== manifest['export_geometry.py'].sha256) throw new Error('GEOMETRY_IDENTITY');
  return geometry;
}
export async function collect(id: string) {
  const out = attemptPath(id), job = await status(id);
  if (job.state !== 'succeeded' || !job.processStopped || job.exitCode !== 0) throw new Error('JOB_NOT_SUCCEEDED');
  const manifest = await readJson(path.join(out, 'manifest.json'), 20000) as Record<string, { sha256: string; bytes: number }>;
  for (const name of ['spec.json', 'recipe.json', 'adapter.py', 'supervisor.py', 'result.json', 'native.nc', 'environment.json', 'resolved-config.json']) {
    const bytes = await readFile(path.join(out, name));
    if (sha(bytes) !== manifest[name]?.sha256 || bytes.length !== manifest[name]?.bytes) throw new Error('MANIFEST_INTEGRITY');
  }
  const r = parseTransportResult(await readJson(path.join(out, 'result.json')));
  const s = parseEngineSpec(await readJson(path.join(out, 'spec.json')));
  const recipe = getRecipe(s.recipe);
  if (r.id !== id || r.engine.id !== s.engine.id || r.engine.commit !== s.engine.commit || r.recipe !== s.recipe || r.device !== recipe.device || r.comparisonGroup !== recipe.family || JSON.stringify(r.parameters) !== JSON.stringify(s.parameters)) throw new Error('RESULT_IDENTITY');
  for (const [field, name] of [['nativeSha256', 'native.nc'], ['configSha256', 'resolved-config.json'], ['environmentSha256', 'environment.json'], ['adapterSha256', 'adapter.py']] as const) {
    if (r.provenance[field] !== manifest[name].sha256) throw new Error('PROVENANCE_INTEGRITY');
  }
  if (r.lineage) {
    const bytes = await readFile(path.join(out, 'snapshot.json'));
    if (sha(bytes) !== s.input?.profileSnapshotSha256 || sha(bytes) !== r.lineage.snapshotSha256 || sha(json(r.referenceProfiles)) !== sha(bytes)) throw new Error('LINEAGE_INTEGRITY');
  } else if (s.input) throw new Error('MISSING_LINEAGE');
  return r;
}
export async function publishProjection(id: string): Promise<TransportRunEntry> {
  const r = await collect(id), raw = Buffer.from(json(r)), compressed = gzipSync(raw, { level: 9 });
  const artifact = { path: `/data/simulations/${sha(compressed)}.json.gz`, sha256: sha(compressed), bytes: compressed.length, rawSha256: sha(raw), rawBytes: raw.length };
  if (artifact.bytes > 6_000_000 || artifact.rawBytes > 20_000_000) throw new Error('PROJECTION_TOO_LARGE');
  await writeFile(path.join(project, 'public', artifact.path), compressed);
  const entry: TransportRunEntry = { id, engineId: r.engine.id, recipe: r.recipe, device: r.device, comparisonGroup: r.comparisonGroup, duration: r.parameters.duration,
    steps: r.execution.steps, radialCells: r.parameters.radialCells, metrics: r.scalars.map(s => ({ id: s.id, unit: s.unit, value: s.values.at(-1)! })), artifact, sourceRunId: r.lineage?.sourceRunId ?? null };
  const catalogPath = path.join(project, 'app/simulations/data/transport-runs.json');
  const entries = await readJson(catalogPath) as TransportRunEntry[];
  await writeFile(catalogPath, json([...entries.filter(e => e.recipe !== entry.recipe), entry]));
  return entry;
}
