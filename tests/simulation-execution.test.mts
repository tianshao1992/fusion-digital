import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultRunSpec, parseRunSpec } from '../app/simulations/run-spec.ts';
import { fuseCatalog } from '../app/simulations/engine-catalog.ts';
import { supervise } from '../scripts/simulations/supervisor.mts';

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
