// Explicit review/publication boundary. Never called automatically by a worker.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { parsePhysics } from '../../app/simulations/physics.ts';
import { parseSimulationRun } from '../../app/simulations/contract.ts';
import { parseRunSpec } from '../../app/simulations/run-spec.ts';
const directory=process.argv[2];if(!directory)throw new Error('Provide the exact successful run directory');
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const manifestBytes=await readFile(path.join(directory,'run-manifest.json'));
const manifest=JSON.parse(manifestBytes.toString());
const status=JSON.parse(await readFile(path.join(directory,'status.json'),'utf8'));
const spec=parseRunSpec(JSON.parse(await readFile(path.join(directory,'run-spec.json'),'utf8')));
if(manifest.schema!=='fuse-native-run.v2'||manifest.execution!=='succeeded'||status.state!=='succeeded'||status.id!==manifest.runId||manifest.recipe!==spec.recipe||manifest.model!==spec.model)throw new Error('Run not independently collected');
const names=['physics.json','dd-native.h5','initial-native.h5','checks.json','run-spec.json','environment-lock.json','run-diiid.jl','FuseProjection.jl','inner-history.json'];
if(!Array.isArray(manifest.artifacts)||names.some(n=>!manifest.artifacts.some((a:{name:string})=>a.name===n)))throw new Error('Missing required evidence');
for(const a of manifest.artifacts){if(!/^[a-zA-Z0-9._-]+$/.test(a.name)||hash(await readFile(path.join(directory,a.name)))!==a.sha256)throw new Error('Artifact mismatch');}
for(const k of ['nativeRoundtrip','finiteGrid','positiveTe','positiveNe'])if(manifest.checks[k]!==true)throw new Error('Invalid scientific result');
const raw=await readFile(path.join(directory,'physics.json'));
const physics=parsePhysics(JSON.parse(raw.toString()));
if(physics.schema!=='fuse-physics.v2'||physics.runId!==manifest.runId||!physics.reference||!physics.fluxMatch||physics.fluxMatch.selectedResidual!==manifest.selectedResidual)throw new Error('Mismatched scientific projection');
const stationary=spec.recipe==='diiid-default-stationary';
const passed=stationary&&manifest.stationaryHistory.length>=2&&manifest.stationaryHistory.at(-1)<=spec.solver.stationaryThreshold;
const metricSpecs=[['te','central_electron_temperature_keV','keV',0.001],['ti','central_ion_temperature_keV','keV',0.001],['ne','central_electron_density_m3','m⁻³',1]] as const;
const metrics=metricSpecs.flatMap(([id,key,unit,scale])=>{const p=physics.profiles.find(p=>p.id===id);const value=p?.y[0];return typeof value==='number'?[{id:key,unit,value:value*scale}]:[];});
const run=parseSimulationRun({schema:'simulation-result.v1',resultProfile:'fuse-physics-run.v1',id:manifest.runId,caseId:stationary?'diiid-stationary':'diiid-fluxmatch-profile',authority:'simulated',recordKind:'simulation-run',execution:'succeeded',assessment:passed?'passed-demo-criterion':'not-established',engine:{id:'fuse',version:manifest.versions.fuse,commit:spec.engineCommit,runtime:{name:'Julia',version:manifest.versions.julia},threads:manifest.threads},metrics,
  convergence:stationary?{kind:'iterations',labels:manifest.stationaryHistory.map((_:number,i:number)=>String(i+1)),values:manifest.stationaryHistory,threshold:spec.solver.stationaryThreshold}:{kind:'variants',labels:[spec.model],values:[manifest.selectedResidual],calls:[manifest.evaluationCount],threshold:null},
  solverTolerances:{xtol:spec.solver.xtol},timing:{seconds:manifest.elapsedSeconds,scope:'simulation-stage'},source:{recordSha256:hash(manifestBytes),artifacts:manifest.artifacts},
});
const compressed=gzipSync(raw,{level:9});
const bundle={runId:run.id,recordSha256:run.source.recordSha256,path:`/data/simulations/${hash(compressed)}.json.gz`,sha256:hash(compressed),bytes:compressed.length,rawSha256:hash(raw),rawBytes:raw.length,profiles:physics.profiles.length,grid:[physics.equilibrium.r.length,physics.equilibrium.z.length]};
const recordsPath='app/simulations/data/fuse-demo.json',bundlesPath='app/simulations/data/physics-bundles.json';
const records=JSON.parse(await readFile(recordsPath,'utf8')),bundles=JSON.parse(await readFile(bundlesPath,'utf8'));
if(records.some((r:{id:string})=>r.id===run.id)||bundles.some((b:{runId:string})=>b.runId===run.id))throw new Error('Run already published; refusing to replace its identity');
await mkdir('public/data/simulations',{recursive:true});
await writeFile(`public${bundle.path}`,compressed,{flag:'wx'});
await writeFile(recordsPath,JSON.stringify([run,...records],null,2)+'\n');
await writeFile(bundlesPath,JSON.stringify([bundle,...bundles],null,2)+'\n');
console.log(JSON.stringify({runId:run.id,model:spec.model,recipe:spec.recipe,profiles:bundle.profiles,grid:bundle.grid,bytes:bundle.bytes,selectedResidual:manifest.selectedResidual,stationaryCriterion:passed,nativePublished:false}));
