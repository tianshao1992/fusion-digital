// Dedicated compute-host service. The public website never imports this module.
import { DatabaseSync } from 'node:sqlite';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { CONTROL_SOURCE_COMMIT, CONTROL_RUNNER_SHA256, IMAGE_DIGESTS, isControlEngine, isControlId, parseControlSpec, type ControlEngine, type ControlJob } from '../../app/simulations/control/contracts.ts';
import { collectControlBundle, sha } from './control-collector.mts';

export type ControlServiceOptions = { root: string; workspace: string; runnerSha256: string; engines: ControlEngine[]; containers: Partial<Record<ControlEngine, string>>; python?: string };
type Stored = { id: string; spec: string; state: ControlJob['state']; stopped: number; started: number; finished: number | null; reason: string | null };
export function createControlService(options: ControlServiceOptions) {
  if (!path.isAbsolute(options.root) || !path.isAbsolute(options.workspace) || options.runnerSha256 !== CONTROL_RUNNER_SHA256 || !options.engines.length || !options.engines.every(isControlEngine)) throw new Error('INVALID_CONTROL_NODE_CONFIG');
  for (const engine of options.engines) if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(options.containers[engine] ?? '')) throw new Error('INVALID_CONTROL_CONTAINER');
  mkdirSync(options.root, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(options.root, 'jobs.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, spec TEXT NOT NULL, state TEXT NOT NULL, stopped INTEGER NOT NULL, started REAL NOT NULL, finished REAL, pid INTEGER, reason TEXT);
    CREATE TABLE IF NOT EXISTS lease(singleton INTEGER PRIMARY KEY CHECK(singleton=1), job_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS gateway_owner(singleton INTEGER PRIMARY KEY CHECK(singleton=1), pid INTEGER NOT NULL, instance TEXT NOT NULL);`);
  const instance = randomUUID();
  try {
    db.exec('BEGIN IMMEDIATE');
    const owner = db.prepare('SELECT pid FROM gateway_owner WHERE singleton=1').get();
    if (owner) { try { process.kill(Number(owner.pid), 0); throw new Error('CONTROL_GATEWAY_ALREADY_RUNNING'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; } }
    db.prepare('INSERT OR REPLACE INTO gateway_owner VALUES(1,?,?)').run(process.pid, instance);
    db.exec("UPDATE jobs SET state='reconciliation-required', stopped=0, reason='GATEWAY_RESTART_REQUIRES_OPERATOR_RECONCILIATION' WHERE stopped=0; COMMIT;");
  } catch (e) { try { db.exec('ROLLBACK'); } catch { /* preserve error */ } db.close(); throw e; }
  const children = new Map<string, ChildProcess>();
  const row = (id: string) => { if (!isControlId(id)) throw new Error('INVALID_JOB_ID'); const r = db.prepare('SELECT * FROM jobs WHERE id=?').get(id) as unknown as Stored | undefined; if (!r) throw new Error('CONTROL_JOB_NOT_FOUND'); return r; };
  const directory = (id: string) => path.join(options.root, id);
  const update = (id: string, state: ControlJob['state'], stopped: boolean, reason: string | null = null) => db.prepare('UPDATE jobs SET state=?,stopped=?,reason=?,finished=CASE WHEN ?=1 THEN COALESCE(finished,?) ELSE finished END WHERE id=?').run(state, stopped ? 1 : 0, reason, stopped ? 1 : 0, Date.now(), id);
  const busy = () => !!db.prepare('SELECT job_id FROM lease WHERE singleton=1').get();
  const status = async (id: string): Promise<ControlJob> => { const r = row(id); return { schema: 'engine-job.v1', id, engineId: parseControlSpec(JSON.parse(r.spec)).engine.id, state: r.state, processStopped: r.stopped === 1, elapsedSeconds: Math.max(0, ((r.finished ?? Date.now()) - r.started) / 1000), reason: r.reason }; };
  const collect = async (id: string) => { const r = row(id); if (r.stopped !== 1) throw new Error('CONTROL_PROCESS_NOT_STOPPED'); return collectControlBundle(path.join(directory(id), 'native'), id, parseControlSpec(JSON.parse(r.spec)), options.runnerSha256); };
  const submit = async (value: unknown, key: string, bodyHash: string) => {
    const spec = parseControlSpec(value);
    if (!options.engines.includes(spec.engine.id)) throw new Error('CONTROL_ENGINE_NOT_CONFIGURED');
    if (!/^[A-Za-z0-9-]{16,80}$/.test(key) || !/^[a-f0-9]{64}$/.test(bodyHash)) throw new Error('INVALID_IDEMPOTENCY');
    const existing = db.prepare('SELECT id,hash FROM jobs WHERE idem=?').get(key);
    if (existing) { if (existing.hash !== bodyHash) throw new Error('IDEMPOTENCY_CONFLICT'); return { id: existing.id as string, duplicate: true, engineId: spec.engine.id }; }
    if (busy()) throw new Error('CONTROL_NODE_REARM_REQUIRED');
    const script = path.join(options.workspace, 'scripts/digital_twin/export_control_run.py');
    if (sha(readFileSync(script)) !== options.runnerSha256 || spec.engine.commit !== CONTROL_SOURCE_COMMIT) throw new Error('CONTROL_RUNNER_IDENTITY');
    const id = `${spec.engine.id}-${randomUUID()}`, dir = directory(id);
    // One transaction owns both idempotency and the persistent plant lease before any spawn.
    db.exec('BEGIN IMMEDIATE');
    let launched: ChildProcess | null = null, launchAttempted = false;
    try {
      db.prepare('INSERT INTO lease(singleton,job_id) VALUES(1,?)').run(id);
      db.prepare('INSERT INTO jobs(id,idem,hash,spec,state,stopped,started) VALUES(?,?,?,?,?,0,?)').run(id, key, bodyHash, JSON.stringify(spec), 'starting', Date.now());
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    try {
      mkdirSync(dir, { mode: 0o700 }); writeFileSync(path.join(dir, 'request.json'), JSON.stringify(spec), { flag: 'wx', mode: 0o600 });
      launchAttempted = true;
      const child = spawn(options.python ?? 'python3', [script, '--spec', path.join(dir, 'request.json'), '--output-dir', path.join(dir, 'native'), '--container', options.containers[spec.engine.id]!, '--expected-image-id', IMAGE_DIGESTS[spec.engine.id], '--cancel-file', path.join(dir, 'cancel')], { cwd: options.workspace, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      launched = child;
      // Install an error listener before any fallible bookkeeping. Never let an unhandled child error kill the supervisor.
      child.on('error', () => undefined);
      db.prepare('UPDATE jobs SET pid=? WHERE id=?').run(child.pid ?? null, id);
      for (const [name, stream] of [['stdout', child.stdout], ['stderr', child.stderr]] as const) { let bytes = 0; stream?.on('data', (chunk: Buffer) => { const limited = chunk.subarray(0, Math.max(0, 65536 - bytes)); bytes += limited.length; if (limited.length) appendFileSync(path.join(dir, name + '.log'), limited, { mode: 0o600 }); }); }
      children.set(id, child); update(id, 'running', false);
      let exited = false, spawnFailed = false;
      const timer = setTimeout(() => {
        if (exited) return;
        writeFileSync(path.join(dir, 'cancel'), 'timeout', { mode: 0o600 });
        update(id, 'cancellation-requested', false, 'CONTROL_SUPERVISOR_TIMEOUT');
        const killTimer = setTimeout(() => { if (!exited && child.pid) { try { if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch { /* close handler determines process outcome; lease is never released here */ } } }, 15000);
        killTimer.unref();
      }, (spec.resources.timeoutSeconds + 30) * 1000); timer.unref();
      child.once('error', () => { spawnFailed = true; update(id, 'failed', true, 'CONTROL_SPAWN_FAILED'); });
      child.once('close', (exitCode) => {
        exited = true; clearTimeout(timer); children.delete(id); if (spawnFailed) return;
        if (!existsSync(path.join(dir, 'native/manifest.json'))) { update(id, exitCode === 0 ? 'collection-failed' : 'failed', true, 'CONTROL_RUNNER_FAILED_BEFORE_FINALIZATION'); return; }
        update(id, 'collecting', true);
        void collect(id).then(r => update(id, r.execution.state, true, 'CONTROL_NODE_REARM_REQUIRED')).catch(error => {
          if (error instanceof Error && error.message === 'CONTROL_NO_CONFIRMED_SAMPLES') {
            const native = JSON.parse(readFileSync(path.join(dir, 'native/result.json'), 'utf8'));
            update(id, native.status === 'cancelled' ? 'cancelled' : native.status === 'timed_out' ? 'timed-out' : 'failed', true, 'CONTROL_NO_CONFIRMED_SAMPLES');
          } else update(id, 'collection-failed', true, 'CONTROL_NATIVE_BUNDLE_INVALID');
        });
        // A closed Python process does not prove a pending STEP stopped inside Docker.
        // Leave lease in place for operator container replacement and reconciliation.
      });
    } catch {
      if (launchAttempted) {
        try { writeFileSync(path.join(dir, 'cancel'), 'supervisor-error', { mode: 0o600 }); launched?.kill('SIGTERM'); } catch { /* Lease remains held even when cancellation fails. */ }
        update(id, 'reconciliation-required', false, 'CONTROL_POSTSPAWN_STATE_UNCERTAIN');
      } else update(id, 'failed', true, 'CONTROL_PRESPAWN_FAILED');
    }
    return { id, duplicate: false, engineId: spec.engine.id };
  };
  const cancel = async (id: string) => { const r = row(id); if (r.stopped) return status(id); writeFileSync(path.join(directory(id), 'cancel'), 'cancel', { mode: 0o600 }); if (r.state !== 'reconciliation-required') update(id, 'cancellation-requested', false, 'OPERATOR_CANCEL_REQUESTED'); return status(id); };
  return { engines: options.engines, busy, submit, status, collect, cancel, close: () => { if (children.size) throw new Error('CONTROL_ACTIVE_WORKERS_EXIST'); db.prepare('DELETE FROM gateway_owner WHERE singleton=1 AND instance=?').run(instance); db.close(); } };
}
export type ControlService = ReturnType<typeof createControlService>;
let service: ControlService | null = null;
export function configuredControlService(): ControlService | null {
  if (service) return service;
  const names = (process.env.CONTROL_ENGINES ?? '').split(',').filter(Boolean);
  if (!names.length) return null;
  if (!names.every(isControlEngine)) throw new Error('INVALID_CONTROL_ENGINES');
  if (!process.env.CONTROL_RESULTS_ROOT || !process.env.FUSIONCONTROL_WORKSPACE || !process.env.CONTROL_RUNNER_SHA256) throw new Error('CONTROL_NODE_CONFIG_REQUIRED');
  if (!existsSync(process.env.FUSIONCONTROL_WORKSPACE)) throw new Error('CONTROL_WORKSPACE_NOT_FOUND');
  service = createControlService({ root: process.env.CONTROL_RESULTS_ROOT, workspace: process.env.FUSIONCONTROL_WORKSPACE, runnerSha256: process.env.CONTROL_RUNNER_SHA256, engines: names, containers: { fge: process.env.CONTROL_FGE_CONTAINER, dina: process.env.CONTROL_DINA_CONTAINER }, python: process.env.CONTROL_PYTHON });
  return service;
}
