// Single-owner local supervisor, intentionally not imported by the Web server.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, readdir, realpath, unlink, open, stat, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRunSpec, defaultRunSpec } from '../../app/simulations/run-spec.ts';
import { supervise } from './supervisor.mts';

const dir = path.dirname(fileURLToPath(import.meta.url));
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const [command, ...args] = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const workspace = await realpath(option('--workspace') ?? 'D:\\Code\\Fuse');
const results = path.join(workspace, 'results');
const safeId = (id: string | undefined) => { if (!id || !/^fuse-diiid-[a-z0-9-]{1,90}$/.test(id)) throw new Error('Provide a valid --run-id'); return id; };
if (command === 'template') { console.log(json(defaultRunSpec())); process.exit(0); }
if (command === 'status' || command === 'cancel') {
  const run = path.join(results, safeId(option('--run-id')));
  const status = JSON.parse(await readFile(path.join(run, 'status.json'),'utf8'));
  if (command === 'status') console.log(json(status));
  else if (status.state === 'running') {
    // Cooperative signal to the live owning supervisor; never kill a PID from disk.
    await writeFile(path.join(run, 'cancel.request'), 'cancel\n', { flag: 'wx' });
    console.log('Cancellation requested; verify terminal status before treating it as cancelled.');
  } else throw new Error('Attempt is not running');
  process.exit(0);
}
if (command !== 'run' || !option('--spec')) throw new Error('Usage: local-runner.mts run --spec <RunSpec.json> [--workspace <FUSE workspace>] | status/cancel --run-id <id> | template');
const specFile = option('--spec')!;
if ((await stat(specFile)).size > 16384) throw new Error('RunSpec too large');
const spec = parseRunSpec(JSON.parse(await readFile(specFile, 'utf8')));
const manifestText=await readFile(path.join(workspace,'environment','Manifest.toml'),'utf8');
const manifestPaths=[...manifestText.matchAll(/^path = (".*")$/gm)].map(m=>JSON.parse(m[1]) as string);
const actualPaths=await Promise.all(manifestPaths.map(p=>realpath(p)));
const approvedPaths=await Promise.all(['FUSE.jl','deps/TurbulentTransport.jl'].map(p=>realpath(path.join(workspace,p))));
if(actualPaths.length!==approvedPaths.length || approvedPaths.some(p=>!actualPaths.includes(p))) throw new Error('Manifest path dependencies are not bound to this workspace');
const git = (repo: string, arguments_: string[]) => execFileSync('git', ['-C', path.join(workspace,repo),...arguments_], { encoding:'utf8',windowsHide:true }).trim();
for (const [repo, expected] of [['FUSE.jl',spec.engineCommit],['FuseExamples','a77970e85356a429178232d119b3b747878c1e32']]) {
  if (git(repo,['rev-parse','HEAD']) !== expected || git(repo,['status','--porcelain','--untracked-files=all'])) throw new Error(`Pinned source mismatch: ${repo}`);
}
await mkdir(results,{recursive:true});
const lockPath = path.join(results,'.fusiondigital-runner.lock');
const lease = await open(lockPath,'wx').catch(()=>{ throw new Error('Runner workspace is leased. Do not delete the lease until its owner is reconciled.'); });
const id = 'fuse-diiid-' + new Date().toISOString().replace(/[^0-9]/g,'') + '-' + randomUUID().slice(0,8);
const output = path.join(results,id);
await lease.writeFile(json({id,supervisorPid:process.pid}));
await lease.close();
try {
  await mkdir(output); // immutable new attempt; no reuse or automatic retry
  await writeFile(path.join(output,'run-spec.json'),json(spec),{flag:'wx'});
  for (const name of ['run-diiid.jl','FuseProjection.jl']) await copyFile(path.join(dir,name),path.join(output,name));
  const files: string[] = ['environment/Project.toml','environment/Manifest.toml','FUSE.jl/sample/D3D_machine.json',spec.recipe==='diiid-lmode-fluxmatch'?'FUSE.jl/sample/D3D_standard_Lmode.json':'FUSE.jl/sample/D3D_eq_ods.json','FuseExamples/fluxmatcher.ipynb','deps/TurbulentTransport.jl/Project.toml'];
  async function collect(relative: string) {
    for (const e of (await readdir(path.join(workspace,relative),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      if(e.isSymbolicLink()) throw new Error('Unresolved dependency symlink');
      const child = `${relative}/${e.name}`; if(e.isDirectory()) await collect(child); else if(e.isFile()) files.push(child);
    }
  }
  await collect('deps/TurbulentTransport.jl/src');
  // Hash the available weight collection; hashes are local provenance, weights are not published.
  await collect('deps/TurbulentTransport.jl/models');
  const inventory=[];
  for(const name of files.sort()) inventory.push({name,sha256:sha(await readFile(path.join(workspace,name)))});
  await writeFile(path.join(output,'environment-lock.json'),json({schema:'fuse-environment-lock.v1',files:inventory,inventorySha256:sha(json(inventory))}),{flag:'wx'});
  const frozenNames=['run-spec.json','environment-lock.json','run-diiid.jl','FuseProjection.jl'];
  const frozen=new Map(await Promise.all(frozenNames.map(async name=>[name,sha(await readFile(path.join(output,name)))] as const)));
  let state = 'starting'; let reason: string | null = null;
  const startedUtc = new Date().toISOString();
  const save = async (extra={}) => {
    const temp=path.join(output,'status.pending.json');
    await writeFile(temp,json({schema:'simulation-attempt.v1',id,state,reason,recipe:spec.recipe,model:spec.model,specSha256:sha(json(spec)),startedUtc,...extra}));
    await rename(temp,path.join(output,'status.json'));
  };
  const julia = path.join(workspace,'.tools','julia-1.12.7','bin',process.platform==='win32'?'julia.exe':'julia');
  await save(); console.log(json({id,state,output}));
  const controller=new AbortController();
  const poll=setInterval(()=>void stat(path.join(output,'cancel.request')).then(()=>controller.abort()).catch(()=>{}),500);
  let code: number | null = null;
  try {
    const result=await supervise(julia,['--startup-file=no',`--project=${path.join(workspace,'environment')}`,path.join(output,'run-diiid.jl')],{
      cwd:output,logPath:path.join(output,'run.log'),timeoutMs:spec.resources.timeoutSeconds*1000,signal:controller.signal,
      env:{...process.env,JULIA_LOAD_PATH:'@;@stdlib',JULIA_DEPOT_PATH:path.join(workspace,'.julia-depot'),JULIA_NUM_THREADS:String(spec.resources.threads),GKSwstype:'100',FUSE_DEMO_OUTPUT_DIR:output,FUSE_RUN_ID:id,FUSE_WORKSPACE:workspace},
      onStarted:async()=>{state='running';await save();},
    });
    code=result.code;reason=result.reason;
  } catch { reason='supervisor-setup-failed'; }
  finally { clearInterval(poll); }
  state=reason ?? (code===0?'succeeded':'failed');
  if(state==='succeeded') {
    try {
      const manifest=JSON.parse(await readFile(path.join(output,'run-manifest.json'),'utf8'));
      const required=[...frozenNames,'physics.json','initial-native.h5','dd-native.h5','input-ini.json','input-act.json','effective-act.json','resolved-ini.json','resolved-act.json','checks.json','stages.json','inner-history.json'];
      if(manifest.schema!=='fuse-native-run.v2' || manifest.runId!==id || manifest.execution!=='succeeded' || manifest.recipe!==spec.recipe || manifest.model!==spec.model || manifest.threads!==spec.resources.threads || !Array.isArray(manifest.artifacts) || required.some(n=>!manifest.artifacts.some((a:{name:string})=>a.name===n))) throw new Error('Identity or required artifacts mismatch');
      for(const key of ['nativeRoundtrip','finiteGrid','positiveTe','positiveNe']) if(manifest.checks?.[key]!==true) throw new Error('Scientific output invalid');
      for(const artifact of manifest.artifacts) {
        if(path.basename(artifact.name)!==artifact.name || sha(await readFile(path.join(output,artifact.name)))!==artifact.sha256) throw new Error('Artifact mismatch');
      }
      for(const [name,hash] of frozen) if(sha(await readFile(path.join(output,name)))!==hash) throw new Error('Frozen execution input changed');
      // Detect dependency/input mutation during execution.
      for(const f of inventory) if(sha(await readFile(path.join(workspace,f.name)))!==f.sha256) throw new Error('Environment changed during run');
    } catch { state='collection-failed'; }
  }
  await save({exitCode:code,finishedUtc:new Date().toISOString()});
  console.log(json({id,state,output}));
  process.exitCode=state==='succeeded'?0:1;
} finally { await unlink(lockPath); }
