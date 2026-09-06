// Usage: node --import tsx scripts/simulations/publish-physics.mts <new run directory>
// Publishes ONLY the explicit scientific projection and a sanitized result record.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { parsePhysics } from '../../app/simulations/physics.ts';
import { parseSimulationRun } from '../../app/simulations/contract.ts';
import { readVerified } from './import-fuse-demo.mjs';
const runDir=process.argv[2]; if(!runDir) throw new Error('Provide an explicit run directory');
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const raw=await readFile(path.join(runDir,'physics.json')); const data=parsePhysics(JSON.parse(raw.toString()));
const manifestBytes=await readFile(path.join(runDir,'run-manifest.json')); const manifest=JSON.parse(manifestBytes.toString());
const run=parseSimulationRun(await readVerified(path.join(runDir,'run-manifest.json'),'fpp-stationary',data.runId));
if(manifest.run_id!==data.runId || !run.source.artifacts.some(a=>a.name==='physics.json'&&a.sha256===hash(raw))) throw new Error('Mismatched run identity');
// Keep the exact bytes hashed by the native run, including JSON formatting.
const compressed=gzipSync(raw,{level:9});
const bundle={runId:run.id,recordSha256:run.source.recordSha256,path:`/data/simulations/${hash(compressed)}.json.gz`,sha256:hash(compressed),bytes:compressed.length,rawSha256:hash(raw),rawBytes:raw.length,profiles:data.profiles.length,grid:[data.equilibrium.r.length,data.equilibrium.z.length]};
await mkdir('public/data/simulations',{recursive:true});
await writeFile(`public${bundle.path}`,compressed,{flag:'wx'});
const recordsPath='app/simulations/data/fuse-demo.json';
const records=JSON.parse(await readFile(recordsPath,'utf8')).filter((r:{id:string})=>r.id!==run.id);
await writeFile(recordsPath,JSON.stringify([run,...records],null,2)+'\n');
await writeFile('app/simulations/data/physics-bundles.json',JSON.stringify([bundle],null,2)+'\n');
console.log(JSON.stringify({runId:run.id,compressedBytes:bundle.bytes,rawBytes:bundle.rawBytes,profiles:bundle.profiles,grid:bundle.grid,nativePublished:false}));
