// Explicit offline operator action. Never called by HTTP routes or automatically after a run.
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { IMAGE_DIGESTS, isControlId, parseControlSpec } from '../../app/simulations/control/contracts.ts';

export function rearmControlNode(root: string, jobId: string, freshContainer: string) {
  if (process.platform !== 'linux' || !path.isAbsolute(root) || !isControlId(jobId) || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(freshContainer)) throw new Error('INVALID_CONTROL_REARM');
  if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) throw new Error('LOCAL_DOCKER_CONTEXT_REQUIRED');
  const context = JSON.parse(execFileSync('docker', ['context', 'inspect'], { encoding: 'utf8', timeout: 10000, maxBuffer: 65536 }));
  if (context.length !== 1 || context[0].Endpoints?.docker?.Host !== 'unix:///var/run/docker.sock') throw new Error('LOCAL_DOCKER_CONTEXT_REQUIRED');
  const db = new DatabaseSync(path.join(root, 'jobs.sqlite'));
  try {
    db.exec('BEGIN IMMEDIATE');
    const owner = db.prepare('SELECT pid FROM gateway_owner WHERE singleton=1').get();
    if (owner) { try { process.kill(Number(owner.pid), 0); throw new Error('CONTROL_STOP_GATEWAY_BEFORE_REARM'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; } }
    const lease = db.prepare('SELECT job_id FROM lease WHERE singleton=1').get();
    const job = db.prepare('SELECT * FROM jobs WHERE id=?').get(jobId);
    if (!job || lease?.job_id !== jobId) throw new Error('CONTROL_LEASE_MISMATCH');
    if (typeof job.pid === 'number') { try { process.kill(job.pid, 0); throw new Error('CONTROL_WORKER_STILL_PRESENT'); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ESRCH') throw e; } }
    else if (job.stopped !== 1) throw new Error('CONTROL_WORKER_IDENTITY_UNRESOLVED');
    const spec = parseControlSpec(JSON.parse(String(job.spec))), port = spec.engine.id === 'fge' ? '2223' : '5560';
    const value = JSON.parse(execFileSync('docker', ['inspect', '--type', 'container', freshContainer], { encoding: 'utf8', timeout: 20000, maxBuffer: 1_000_000 }));
    if (value.length !== 1) throw new Error('CONTROL_CONTAINER_AMBIGUOUS');
    const c = value[0], bindings = c.NetworkSettings?.Ports?.['5558/tcp'];
    if (!c.State?.Running || c.Image !== IMAGE_DIGESTS[spec.engine.id] || !Number.isFinite(Date.parse(c.Created)) || Date.parse(c.Created) <= Number(job.started) || !bindings?.length || bindings.some((b: { HostIp: string; HostPort: string }) => b.HostIp !== '127.0.0.1' || b.HostPort !== port)) throw new Error('FRESH_CONTROL_CONTAINER_REQUIRED');
    const manifest = path.join(root, jobId, 'native/manifest.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).execution?.containerId === c.Id) throw new Error('FRESH_CONTROL_CONTAINER_REQUIRED');
    db.exec('CREATE TABLE IF NOT EXISTS rearm_audit(job_id TEXT NOT NULL, new_container_id TEXT NOT NULL, checked_at REAL NOT NULL)');
    db.prepare('INSERT INTO rearm_audit VALUES(?,?,?)').run(jobId, c.Id, Date.now());
    db.prepare("UPDATE jobs SET stopped=1,state=CASE WHEN state='reconciliation-required' THEN 'failed' ELSE state END,finished=COALESCE(finished,?),reason='OPERATOR_RECONCILED_FRESH_CONTAINER' WHERE id=?").run(Date.now(), jobId);
    db.prepare('DELETE FROM lease WHERE singleton=1 AND job_id=?').run(jobId); db.exec('COMMIT');
    return { jobId, rearmed: true, readiness: 'fresh-container-inspected; next RESET still required' };
  } catch (e) { try { db.exec('ROLLBACK'); } catch { /* preserve original failure */ } throw e; } finally { db.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 6 || args[0] !== '--root' || args[2] !== '--job' || args[4] !== '--fresh-container') throw new Error('USAGE_ROOT_JOB_FRESH_CONTAINER_REQUIRED');
  console.log(JSON.stringify(rearmControlNode(args[1], args[3], args[5])));
}
