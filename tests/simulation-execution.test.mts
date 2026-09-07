import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { defaultRunSpec, parseRunSpec } from '../app/simulations/run-spec.ts';
import { fuseCatalog } from '../app/simulations/engine-catalog.ts';
import * as transportRuntime from '../scripts/simulations/engine-service.mts';
import { createGateway } from '../scripts/simulations/gateway.mts';
import { supervise } from '../scripts/simulations/supervisor.mts';

const execFileAsync = promisify(execFile);

test('RunSpec is closed, bounded and maps only approved offline recipes',()=>{
  const s=defaultRunSpec();assert.deepEqual(parseRunSpec(s),s);
  for(const model of ['TGLFNN','GKNN','QLNN'])assert.equal(parseRunSpec({...s,model}).model,model);
  for(const bad of [{...s,command:'cmd.exe'},{...s,recipe:'live-shot'},{...s,engineCommit:'0'.repeat(40)},{...s,recipe:'diiid-default-stationary',model:'GKNN'},{...s,resources:{...s.resources,threads:9}},{...s,solver:{...s.solver,xtol:NaN}},{...s,solver:{...s.solver,maxIterations:0}},{...s,resources:{...s.resources,timeoutSeconds:10000}}])assert.throws(()=>parseRunSpec(bad));
});
test('complete pinned actor inventory has 71 unique types in 18 families, not readiness claims',()=>{
  const actors=fuseCatalog.families.flatMap(f=>f.actors);assert.equal(actors.length,71);assert.equal(new Set(actors).size,71);assert.equal(fuseCatalog.families.length,18);assert.ok(fuseCatalog.families.some(f=>f.domain==='physics'));assert.ok(fuseCatalog.families.some(f=>f.domain==='engineering'));
});
test('local supervisor records success and flushes scientific logs before returning',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'fuse-supervisor-'));const logPath=path.join(dir,'success.log');
  const r=await supervise(process.execPath,['-e','process.stdout.write("SYNTHETIC supervisor fixture")'],{logPath,timeoutMs:5000});
  assert.deepEqual(r,{code:0,reason:null,closed:true});assert.match(await readFile(logPath,'utf8'),/SYNTHETIC/);
});
test('missing executable is handled even when launch fails immediately',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'fuse-supervisor-'));
  const r=await supervise(path.join(dir,'does-not-exist.exe'),[],{logPath:path.join(dir,'missing.log'),timeoutMs:5000});
  assert.equal(r.reason,'launch-failed');assert.equal(r.closed,true);
});
test('nonzero exit is not presented as a successful run',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'fuse-supervisor-'));
  const r=await supervise(process.execPath,['-e','process.exit(7)'],{logPath:path.join(dir,'exit.log'),timeoutMs:5000});assert.equal(r.code,7);assert.equal(r.closed,true);
});
test('timeout terminates the live process and waits for close',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'fuse-supervisor-'));
  const r=await supervise(process.execPath,['-e','setInterval(()=>{},100)'],{logPath:path.join(dir,'timeout.log'),timeoutMs:300});assert.equal(r.reason,'timed-out');assert.equal(r.closed,true);assert.notEqual(r.code,0);
});
test('cancellation and state-write failure reconcile process before return',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'fuse-supervisor-'));const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),300);
  const r=await supervise(process.execPath,['-e','setInterval(()=>{},100)'],{logPath:path.join(dir,'cancel.log'),timeoutMs:5000,signal:controller.signal});clearTimeout(timer);assert.equal(r.reason,'cancelled');assert.equal(r.closed,true);
  const failed=await supervise(process.execPath,['-e','setInterval(()=>{},100)'],{logPath:path.join(dir,'state.log'),timeoutMs:5000,onStarted:async()=>{throw new Error('SYNTHETIC disk error');}});assert.equal(failed.reason,'status-write-failed');assert.equal(failed.closed,true);
});
test('existing log is never overwritten and prevents launch',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'fuse-supervisor-'));const logPath=path.join(dir,'existing.log');await writeFile(logPath,'protected fixture');
  await assert.rejects(supervise(process.execPath,['-e','process.exit(0)'],{logPath,timeoutMs:5000}),/EEXIST/);assert.equal(await readFile(logPath,'utf8'),'protected fixture');
});

test('real manifest and pin preflight failures are terminal and release unified gateway capacity', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'fuse-preflight-'));
  const fuseRepository = path.join(workspace, 'FUSE.jl');
  const transportRepository = path.join(workspace, 'deps', 'TurbulentTransport.jl');
  await mkdir(path.join(workspace, 'environment'), { recursive: true });
  await mkdir(fuseRepository, { recursive: true });
  await mkdir(transportRepository, { recursive: true });
  await writeFile(path.join(workspace, 'environment', 'Manifest.toml'), '# deliberately unbound path dependencies\n');
  const previousWorkspace = process.env.FUSE_WORKSPACE;
  process.env.FUSE_WORKSPACE = workspace;
  const fuseRuntime = await import(new URL(`../scripts/simulations/fuse-engine-service.mts?preflight=${randomUUID()}`, import.meta.url).href);
  if (previousWorkspace === undefined) delete process.env.FUSE_WORKSPACE;
  else process.env.FUSE_WORKSPACE = previousWorkspace;

  const token = randomBytes(32).toString('hex');
  const origin = 'https://fusiondigital.club';
  const server = createGateway(token, origin, transportRuntime, fuseRuntime);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' };
  const submit = (key: string) => fetch(`${base}/v1/jobs`, { method: 'POST', headers: { ...headers, 'Idempotency-Key': key },
    body: JSON.stringify({ spec: defaultRunSpec() }) });
  const waitForFailure = async (id: string) => {
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const current = await fuseRuntime.status(id);
      if (current.state === 'failed') return current;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`preflight failure did not become terminal: ${id}`);
  };
  try {
    const manifestFailure = await submit('fuse-preflight-manifest-0001');
    assert.equal(manifestFailure.status, 202);
    const firstId = (await manifestFailure.json() as { id: string }).id;
    assert.deepEqual(await waitForFailure(firstId), {
      schema: 'engine-job.v1', id: firstId, engineId: 'fuse', state: 'failed',
      processStopped: true, exitCode: 1, elapsedSeconds: 0, reason: 'runner-preflight-failed',
    });
    await new Promise(resolve => setImmediate(resolve));

    await execFileAsync('git', ['init', fuseRepository], { windowsHide: true });
    await writeFile(path.join(fuseRepository, 'fixture.txt'), 'unpinned test repository\n');
    await execFileAsync('git', ['-C', fuseRepository, 'add', 'fixture.txt'], { windowsHide: true });
    await execFileAsync('git', ['-C', fuseRepository, '-c', 'user.name=FusionDigital Test',
      '-c', 'user.email=fusiondigital-test@example.invalid', 'commit', '-m', 'fixture'], { windowsHide: true });
    await writeFile(path.join(workspace, 'environment', 'Manifest.toml'),
      `path = ${JSON.stringify(fuseRepository)}\npath = ${JSON.stringify(transportRepository)}\n`);

    const pinFailure = await submit('fuse-preflight-pin-0002');
    assert.equal(pinFailure.status, 202, 'the manifest failure must release the gateway slot');
    const secondId = (await pinFailure.json() as { id: string }).id;
    const secondStatus = await waitForFailure(secondId);
    assert.equal(secondStatus.reason, 'runner-preflight-failed');
    assert.equal(secondStatus.processStopped, true);
    await new Promise(resolve => setImmediate(resolve));

    const afterPinFailure = await submit('fuse-preflight-pin-0003');
    assert.equal(afterPinFailure.status, 202, 'the pin failure must release the gateway slot');
    const thirdId = (await afterPinFailure.json() as { id: string }).id;
    await waitForFailure(thirdId);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(workspace, { recursive: true, force: true });
  }
});
