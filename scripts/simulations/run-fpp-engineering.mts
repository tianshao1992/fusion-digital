// Approved fixed-input recipe. No request-defined command, path, or arbitrary actor.
import { execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, open, copyFile, writeFile, readFile, unlink, realpath, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { supervise } from './supervisor.mts';
import { parseEngineering } from '../../app/simulations/engineering.ts';
const root = await realpath('D:\\Code\\Fuse');
const verifyBaseline = () => execFileSync('powershell.exe', ['-NoProfile', '-File', path.join(root, 'scripts', 'verify-baseline.ps1')], { stdio: 'pipe', windowsHide: true });
verifyBaseline();
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const environmentNames = ['environment/Project.toml', 'environment/Manifest.toml'];
const environmentHashes = await Promise.all(environmentNames.map(async n => sha(await readFile(path.join(root, n)))));
const manifest = await readFile(path.join(root, 'environment', 'Manifest.toml'), 'utf8');
const pins = await Promise.all([...manifest.matchAll(/^path = (".*")$/gm)].map(m => realpath(JSON.parse(m[1]))));
const expectedPaths = await Promise.all(['FUSE.jl', 'deps/TurbulentTransport.jl'].map(p => realpath(path.join(root, p))));
if (pins.length !== 2 || expectedPaths.some(p => !pins.includes(p))) throw new Error('Environment path mismatch');
const results = path.join(root, 'results'), leasePath = path.join(results, '.fusiondigital-runner.lock');
const lease = await open(leasePath, 'wx');
const id = 'fuse-engineering-' + new Date().toISOString().replace(/[^0-9]/g, '') + '-' + randomUUID().slice(0, 8);
await lease.writeFile(JSON.stringify({ id, supervisorPid: process.pid })); await lease.close();
const parentId = 'fuse-fpp-20260907-003257-48a4fa67';
const parentHash = '7bc4af2942c024b1033bc6e25da6cb1d43f7cf9fb946388a84e3ad0ba9f19433';
const out = path.join(results, id), parent = path.join(results, parentId), dir = path.dirname(fileURLToPath(import.meta.url));
let state = 'starting', reason: string | null = null, phase = 'inputs'; const startedUtc = new Date().toISOString();
let exitCode: number | null = null;
const save = async () => { const temp = path.join(out, 'status.pending.json'); await writeFile(temp, JSON.stringify({ schema: 'simulation-attempt.v1', id, recipe: 'fpp-center-stack', state, phase, reason, exitCode, startedUtc, updatedUtc: new Date().toISOString() })); await rename(temp, path.join(out, 'status.json')); };
try {
  await mkdir(out); await save();
  try {
    const parentBytes = await readFile(path.join(parent, 'run-manifest.json'));
    if (sha(parentBytes) !== parentHash) throw new Error('Parent manifest identity mismatch');
    const parentManifest = JSON.parse(parentBytes.toString());
    for (const [from, to] of [['dd-native.h5', 'parent-dd.h5'], ['resolved-act.json', 'parent-act.json'], ['run-manifest.json', 'parent-manifest.json'], ['provenance.json', 'parent-provenance.json']]) {
      const bytes = await readFile(path.join(parent, from));
      if (from !== 'run-manifest.json' && !Object.values(parentManifest.artifacts).some(a => { const v = a as { path: string; sha256: string }; return v.path === from && v.sha256 === sha(bytes); })) throw new Error('Parent artifact mismatch');
      await writeFile(path.join(out, to), bytes, { flag: 'wx' });
    }
    for (const name of ['run-fpp-engineering.jl', 'FuseProjection.jl']) await copyFile(path.join(dir, name), path.join(out, name));
    const frozenNames = ['parent-dd.h5', 'parent-act.json', 'parent-manifest.json', 'parent-provenance.json', 'run-fpp-engineering.jl', 'FuseProjection.jl'];
    const frozen = new Map(await Promise.all(frozenNames.map(async n => [n, sha(await readFile(path.join(out, n)))] as const)));
    console.log(JSON.stringify({ id, state, out })); phase = 'simulation';
    const controller = new AbortController();
    const poll = setInterval(() => void stat(path.join(out, 'cancel.request')).then(() => controller.abort()).catch(() => {}), 500);
    try {
      const result = await supervise(path.join(root, '.tools', 'julia-1.12.7', 'bin', 'julia.exe'), ['--startup-file=no', `--project=${path.join(root, 'environment')}`, path.join(out, 'run-fpp-engineering.jl')], {
        cwd: out, logPath: path.join(out, 'run.log'), timeoutMs: 1800000, signal: controller.signal,
        env: { ...process.env, JULIA_LOAD_PATH: '@;@stdlib', JULIA_DEPOT_PATH: path.join(root, '.julia-depot'), JULIA_NUM_THREADS: '8', GKSwstype: '100', FUSE_WORKSPACE: root, FUSE_RUN_ID: id, FUSE_DEMO_OUTPUT_DIR: out },
        onStarted: async () => { state = 'running'; await save(); },
      });
      exitCode = result.code; reason = result.reason; state = reason ?? (exitCode === 0 ? 'succeeded' : 'failed');
    } finally { clearInterval(poll); }
    phase = 'collection';
    if (state === 'succeeded') {
      const m = JSON.parse(await readFile(path.join(out, 'run-manifest.json'), 'utf8'));
      const required = [...frozenNames, 'engineering.json', ...[101, 201, 401].flatMap(n => [`stress-${n}.h5`, `stress-${n}-act.json`])].sort();
      if (m.schema !== 'fuse-engineering-manifest.v1' || m.runId !== id || m.execution !== 'succeeded' || m.nativeRoundtrip !== true || !Array.isArray(m.artifacts) || m.artifacts.map((a: { name: string }) => a.name).sort().join('|') !== required.join('|')) throw new Error('Incomplete engineering artifacts');
      for (const a of m.artifacts) if (!/^[a-zA-Z0-9._-]+$/.test(a.name) || sha(await readFile(path.join(out, a.name))) !== a.sha256) throw new Error('Artifact mismatch');
      for (const [n, h] of frozen) if (sha(await readFile(path.join(out, n))) !== h) throw new Error('Frozen input changed');
      const p = parseEngineering(JSON.parse(await readFile(path.join(out, 'engineering.json'), 'utf8')));
      if (p.runId !== id || p.parentRunId !== parentId || p.parentRecordSha256 !== parentHash) throw new Error('Projection identity mismatch');
      verifyBaseline();
      for (const [i, n] of environmentNames.entries()) if (sha(await readFile(path.join(root, n))) !== environmentHashes[i]) throw new Error('Environment drift');
    }
  } catch (error) { state = phase === 'collection' ? 'collection-failed' : 'failed'; reason = error instanceof Error ? error.message : 'Unknown runner error'; }
  await save(); console.log(JSON.stringify({ id, state, reason, out })); process.exitCode = state === 'succeeded' ? 0 : 1;
} finally { await unlink(leasePath); }
