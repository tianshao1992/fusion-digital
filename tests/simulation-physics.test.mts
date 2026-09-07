import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { loadPhysics, parsePhysics, profileDisplay, type PhysicsBundle } from '../app/simulations/physics.ts';
import { buildEquilibriumFieldProjection, gridCellBounds, interpolateBounded, normalizedPoloidalFlux, pointInClosedPolygon, sampleSpatialFieldAtPsiNorm, spatialFieldUnavailableReason, SPATIAL_FIELD_SPECS } from '../app/simulations/equilibrium-field.ts';
import { loadFluxCoordinateMap, parseFluxCoordinateMap, type FluxCoordinateMapBundle } from '../app/simulations/flux-coordinate-map.ts';
import { parseSimulationRun } from '../app/simulations/contract.ts';
import { loadInnerHistory, parseInnerHistory, type DiagnosticsBundle } from '../app/simulations/diagnostics.ts';
import { compareRuns } from '../app/simulations/comparison.ts';
const bundles:PhysicsBundle[]=JSON.parse(readFileSync(new URL('../app/simulations/data/physics-bundles.json',import.meta.url),'utf8'));
const coordinateMapEntries:FluxCoordinateMapBundle[]=JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-coordinate-maps.json',import.meta.url),'utf8'));
const bundle=bundles.find(b=>b.runId==='fuse-fpp-20260907-003257-48a4fa67')!;
const bytes=readFileSync(new URL(`../public${bundle.path}`,import.meta.url));
const raw=gunzipSync(bytes); const original=JSON.parse(raw.toString());
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');

test('coupled diagnostics preserve all four native histories, bound to the manifest',async()=>{
  const ds:DiagnosticsBundle[]=JSON.parse(readFileSync(new URL('../app/simulations/data/diagnostics-bundles.json',import.meta.url),'utf8'));assert.equal(ds.length,1);
  const d=ds[0],zip=readFileSync(new URL(`../public${d.path}`,import.meta.url)),raw=gunzipSync(zip),rows=parseInnerHistory(JSON.parse(raw.toString()));
  assert.equal(hash(zip),d.sha256);assert.equal(hash(raw),d.rawSha256);assert.equal(zip.length,d.bytes);assert.equal(raw.length,d.rawBytes);assert.equal(rows.length,d.iterations);assert.deepEqual(rows.map(r=>r.evaluationResiduals.length),[47,86,47,53]);
  const runs=JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-demo.json',import.meta.url),'utf8')).map(parseSimulationRun);
  const run=runs.find((r:{id:string})=>r.id===d.runId);assert.equal(run.source.recordSha256,d.recordSha256);assert.ok(run.source.artifacts.some((a:{name:string;sha256:string})=>a.name==='inner-history.json'&&a.sha256===d.rawSha256));
  assert.equal(run.convergence.values.length,rows.length);assert.equal(run.assessment,'passed-demo-criterion');
  const c=structuredClone(rows);c[0].iteration=2;assert.throws(()=>parseInnerHistory(c));
  const f=globalThis.fetch;try{globalThis.fetch=async()=>new Response(zip);assert.equal((await loadInnerHistory(d,new AbortController().signal)).length,4);await assert.rejects(loadInnerHistory({...d,iterations:3},new AbortController().signal),/IDENTITY/);}finally{globalThis.fetch=f;}
});

test('DIII-D model comparison uses physical scalars, not residual ranks',()=>{
  const runs=JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-demo.json',import.meta.url),'utf8')).map(parseSimulationRun).filter((r:{caseId:string})=>r.caseId==='diiid-fluxmatch-profile');
  assert.equal(runs.length,3);const rows=compareRuns(runs[0],runs[1]);assert.equal(rows.length,3);assert.ok(rows.every(r=>r.id.startsWith('central_')&&r.current!==undefined&&r.reference!==undefined));
});

test('every published bundle is content-addressed and linked to its own native manifest',()=>{
  const runs=JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-demo.json',import.meta.url),'utf8')).map(parseSimulationRun);
  for(const b of bundles){
    const zipped=readFileSync(new URL(`../public${b.path}`,import.meta.url));const native=gunzipSync(zipped);const p=parsePhysics(JSON.parse(native.toString()));
    assert.equal(hash(zipped),b.sha256);assert.equal(hash(native),b.rawSha256);assert.equal(zipped.length,b.bytes);assert.equal(native.length,b.rawBytes);assert.equal(p.runId,b.runId);assert.equal(p.profiles.length,b.profiles);
    const run=runs.find((r:{id:string})=>r.id===p.runId);assert.equal(run?.source.recordSha256,b.recordSha256);assert.ok(run.source.artifacts.some((a:{name:string;sha256:string})=>a.name==='physics.json'&&a.sha256===b.rawSha256));
    assert.doesNotMatch(native.toString(),/D:\\\\|C:\\\\|Stacktrace|access_token|privateKey/);
    if(p.schema==='fuse-physics.v2'){
      assert.ok(p.reference&&p.fluxMatch);assert.equal(p.reference.authority,'upstream-initialized-reference');assert.equal(p.fluxMatch.residualCriterion,null);
      if(run.caseId==='diiid-fluxmatch-profile'){assert.equal(p.equilibriumOrigin,'input-reconstruction');assert.equal(p.fluxMatch.stateRelation,'same-state');assert.equal(p.fluxMatch.selectedResidual,run.convergence.values[0]);assert.equal(p.fluxMatch.evaluationResiduals.length,run.convergence.calls[0]);assert.equal(run.assessment,'not-established');}
      if(run.caseId==='diiid-stationary'){assert.equal(p.equilibriumOrigin,'model-solved');assert.equal(p.fluxMatch.stateRelation,'post-coupling-recomputed');}
      const momentum=p.fluxMatch.channels.find(c=>c.id==='momentum');if(momentum)assert.equal(momentum.unit,'kg/s^2');
      for(const v of p.profiles.filter(p=>p.id.startsWith('transport_')))assert.match(v.source,/^core_transport\.model\.\d+\.profiles_1d\.(electrons\.(energy|particles)|total_ion_energy)\.flux$/);
      const clone=structuredClone(p);clone.fluxMatch!.residualCriterion=0.001 as unknown as null;assert.throws(()=>parsePhysics(clone));
      const extra=structuredClone(p) as typeof p & {secret?:string};extra.secret='sentinel';assert.throws(()=>parsePhysics(extra));
      const wrong=structuredClone(p);wrong.fluxMatch!.channels[0].target.pop();assert.throws(()=>parsePhysics(wrong));
    }
  }
});
test('published scientific bytes bind the exact native result and summary identity',()=>{
  assert.ok(bundles.length>=1); assert.equal(bytes.length,bundle.bytes);assert.equal(hash(bytes),bundle.sha256);assert.equal(hash(raw),bundle.rawSha256);assert.equal(raw.length,bundle.rawBytes);
  const p=parsePhysics(original);assert.equal(p.runId,bundle.runId);assert.equal(p.profiles.length,118);assert.deepEqual([p.equilibrium.r.length,p.equilibrium.z.length],[67,129]);assert.equal(p.geometry.layers.length,28);assert.equal(p.geometry.coils.length,11);assert.equal(p.coreTransportModel,'none');
  const runs=JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-demo.json',import.meta.url),'utf8')).map(parseSimulationRun);
  const run=runs.find((r:{id:string})=>r.id===p.runId);assert.ok(run);assert.equal(run.source.recordSha256,bundle.recordSha256);assert.ok(run.source.artifacts.some((a:{name:string;sha256:string})=>a.name==='physics.json'&&a.sha256===bundle.rawSha256));
});
test('matrix order, units, axes and missing samples are validated without fabricated zeros',()=>{
  const p=parsePhysics(original);assert.equal(p.equilibrium.arrayOrder,'z,r');assert.equal(p.equilibrium.psiUnit,'Wb');
  for(const mutate of [(p:typeof original)=>{p.equilibrium.psi.pop();},(p:typeof original)=>{p.equilibrium.r[1]=p.equilibrium.r[0];},(p:typeof original)=>{p.profiles[0].y[0]=Infinity;},(p:typeof original)=>{p.profiles[0].unit='unqualified';},(p:typeof original)=>{p.equilibrium.psiBoundary=p.equilibrium.psiAxis;}]){const copy=structuredClone(original);mutate(copy);assert.throws(()=>parsePhysics(copy));}
  const copy=structuredClone(original);copy.profiles[0].y[0]=null;const missing=parsePhysics(copy).profiles[0];assert.equal(profileDisplay(missing).data[0][1],null);
  const wrongTemperatureUnit=structuredClone(original);wrongTemperatureUnit.profiles.find((profile:{id:string})=>profile.id==='te').unit='Pa';assert.throws(()=>parsePhysics(wrongTemperatureUnit));
  const emptyProfile=structuredClone(original);emptyProfile.profiles[0].y=emptyProfile.profiles[0].y.map(()=>null);assert.throws(()=>parsePhysics(emptyProfile));
  const signedSafetyFactor=structuredClone(original);const q=signedSafetyFactor.profiles.find((profile:{id:string})=>profile.id==='q');q.y=q.y.map((value:number|null)=>value===null?null:-Math.abs(value));assert.ok(parsePhysics(signedSafetyFactor).profiles.find(profile=>profile.id==='q')!.y.some(value=>value!==null&&value<0));
});
test('equilibrium cloud projects the native psi grid through an LCFS mask',()=>{
  const p=parsePhysics(original);
  const normalized=buildEquilibriumFieldProjection(p,'psi_norm');
  const rawPsi=buildEquilibriumFieldProjection(p,'psi');
  assert.ok(normalized.samples.length>0);
  assert.ok(normalized.samples.length<p.equilibrium.r.length*p.equilibrium.z.length);
  assert.equal(normalized.samples.length,rawPsi.samples.length);
  assert.deepEqual([normalized.minimum,normalized.maximum],[0,1]);
  assert.deepEqual([rawPsi.minimum,rawPsi.maximum],[Math.min(p.equilibrium.psiAxis,p.equilibrium.psiBoundary),Math.max(p.equilibrium.psiAxis,p.equilibrium.psiBoundary)]);
  normalized.samples.forEach((sample,index)=>{
    const [r,z,value,psiNorm,psiWb,rLower,rUpper,zLower,zUpper]=sample;
    const rIndex=p.equilibrium.r.indexOf(r),zIndex=p.equilibrium.z.indexOf(z);
    assert.ok(rIndex>=0&&zIndex>=0);
    assert.ok(pointInClosedPolygon(r,z,p.equilibrium.boundary));
    assert.equal(psiWb,p.equilibrium.psi[zIndex][rIndex]);
    assert.equal(psiNorm,normalizedPoloidalFlux(psiWb,p.equilibrium.psiAxis,p.equilibrium.psiBoundary));
    assert.equal(value,psiNorm);
    assert.deepEqual([rLower,rUpper],gridCellBounds(p.equilibrium.r,rIndex));
    assert.deepEqual([zLower,zUpper],gridCellBounds(p.equilibrium.z,zIndex));
    assert.ok(rLower<=r&&r<=rUpper&&zLower<=z&&z<=zUpper);
    assert.deepEqual(rawPsi.samples[index].slice(0,2),[r,z]);
    assert.equal(rawPsi.samples[index][2],psiWb);
  });
  const square:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[1,0],[1,1],[0,1]];
  assert.equal(pointInClosedPolygon(.5,.5,square),true);
  assert.equal(pointInClosedPolygon(1,.5,square),true);
  assert.equal(pointInClosedPolygon(1.1,.5,square),false);
  assert.deepEqual(gridCellBounds([0,1,4],0),[-.5,.5]);
  assert.deepEqual(gridCellBounds([0,1,4],1),[.5,2.5]);
  assert.deepEqual(gridCellBounds([0,1,4],2),[2.5,5.5]);
  assert.equal(normalizedPoloidalFlux(2,2,0),0);
  assert.equal(normalizedPoloidalFlux(0,2,0),1);
});
test('native flux-coordinate sidecars are content-addressed and bound to each physics result',()=>{
  assert.equal(coordinateMapEntries.length,bundles.length);
  const runs=JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-demo.json',import.meta.url),'utf8')).map(parseSimulationRun);
  for(const entry of coordinateMapEntries as FluxCoordinateMapBundle[]){
    const physicsBundle=bundles.find(item=>item.runId===entry.runId)!;
    const run=runs.find((item:{id:string})=>item.id===entry.runId)!;
    const compressed=readFileSync(new URL(`../public${entry.artifact.path}`,import.meta.url));
    const raw=gunzipSync(compressed);const map=parseFluxCoordinateMap(JSON.parse(raw.toString()));
    assert.equal(hash(compressed),entry.artifact.sha256);assert.equal(hash(raw),entry.artifact.rawSha256);
    assert.equal(compressed.length,entry.artifact.bytes);assert.equal(raw.length,entry.artifact.rawBytes);
    assert.equal(map.runId,physicsBundle.runId);assert.equal(map.source.physicsSha256,physicsBundle.rawSha256);assert.equal(map.source.nativeSha256,entry.sourceNativeSha256);assert.ok(run.source.artifacts.some((artifact:{name:string;sha256:string})=>artifact.name==='dd-native.h5'&&artifact.sha256===map.source.nativeSha256));
    assert.deepEqual([map.psiNorm[0],map.psiNorm.at(-1),map.rhoTorNorm[0],map.rhoTorNorm.at(-1)],[0,1,0,1]);
    assert.ok(map.psiNorm.every((value,index)=>index===0||value>map.psiNorm[index-1]));
    assert.ok(map.rhoTorNorm.every((value,index)=>index===0||value>map.rhoTorNorm[index-1]));
    assert.ok(Math.max(...map.psiNorm.map((value,index)=>Math.abs(Math.sqrt(value)-map.rhoTorNorm[index])))>.05,'the native toroidal-flux coordinate must not collapse to sqrt(psiN)');
  }
});
test('rho-based profiles map to the R-Z grid with bounded interpolation and preserved display units',()=>{
  const p=parsePhysics(original);const entry=(coordinateMapEntries as FluxCoordinateMapBundle[]).find(item=>item.runId===p.runId)!;
  const map=parseFluxCoordinateMap(JSON.parse(gunzipSync(readFileSync(new URL(`../public${entry.artifact.path}`,import.meta.url))).toString()));
  assert.equal(spatialFieldUnavailableReason(p,'te',map),null);assert.equal(spatialFieldUnavailableReason(p,'te'), 'flux-coordinate-map-unavailable');
  assert.throws(()=>buildEquilibriumFieldProjection(p,'te'),/flux-coordinate-map-unavailable/);
  const projection=buildEquilibriumFieldProjection(p,'te',map);assert.equal(projection.unit,'keV');assert.equal(projection.sourceUnit,'eV');assert.equal(projection.authority,'profile-mapped');assert.ok(projection.samples.length>1000);
  const sample=projection.samples[Math.floor(projection.samples.length/2)], profile=p.profiles.find(item=>item.id==='te')!;
  const rho=interpolateBounded(map.psiNorm,map.rhoTorNorm,sample[3]);assert.equal(sample[9],rho);assert.notEqual(rho,null);
  const rawValue=interpolateBounded(profile.x,profile.y,rho!);assert.notEqual(rawValue,null);assert.ok(Math.abs(sample[2]-rawValue!*1e-3)<1e-10);
  const point=sampleSpatialFieldAtPsiNorm(p,'ne',sample[3],map,sample[4]);assert.ok(point&&point.value>0&&point.unit==='10²⁰ m⁻³');
  assert.equal(interpolateBounded([0,.5,1],[1,null,3],.25),null);assert.equal(interpolateBounded([0,.5,1],[1,2,3],-0.01),null);assert.equal(interpolateBounded([0,.5,1],[1,2,3],1.01),null);
  const invalid=structuredClone(map);invalid.source.coreTimeSeconds+=1;assert.equal(spatialFieldUnavailableReason(p,'te',invalid),'profile-state-mismatch');
});
test('spatial selector only exposes qualified flux functions',()=>{
  const p=parsePhysics(original);
  assert.deepEqual(SPATIAL_FIELD_SPECS.map(item=>item.id),['psi_norm','psi','te','ti','ne','q','pressure']);
  assert.ok(p.profiles.some(item=>item.id==='eq_j_tor'),'the 1D current profile remains available outside the spatial selector');
});
test('browser loader verifies coordinate-map bytes and run/state identity',async()=>{
  const p=parsePhysics(original);const entry=(coordinateMapEntries as FluxCoordinateMapBundle[]).find(item=>item.runId===p.runId)!;const compressed=readFileSync(new URL(`../public${entry.artifact.path}`,import.meta.url));
  const originalFetch=globalThis.fetch;
  try{globalThis.fetch=async()=>new Response(compressed);assert.equal((await loadFluxCoordinateMap(entry,bundle,p,new AbortController().signal)).runId,p.runId);
    await assert.rejects(loadFluxCoordinateMap({...entry,sourcePhysicsSha256:'0'.repeat(64)},bundle,p,new AbortController().signal),/CATALOG_MISMATCH/);
  }finally{globalThis.fetch=originalFetch;}
});
test('temperature and current display conversions do not overwrite native units',()=>{
  const te=parsePhysics(original).profiles.find(p=>p.id==='te')!; const q=original.profiles.find((p:{id:string})=>p.id==='q');
  assert.equal(te.unit,'eV');assert.equal(profileDisplay(te).unit,'keV');assert.equal(profileDisplay(te).data[0][1],te.y[0]!*0.001);assert.equal(te.axis,'rho_tor_norm');assert.equal(q.axis,'psi_norm');
  const electronic=original.profiles.filter((p:{id:string})=>/^source_\d+_(electron_heating|electron_power|particles)$/.test(p.id));assert.ok(electronic.length);assert.ok(electronic.every((p:{source:string})=>p.source.includes('.electrons.')));
  assert.ok(original.profiles.filter((p:{id:string})=>p.id.startsWith('ion_')).every((p:{label:string})=>!/^Ion \d /.test(p.label)));
});
test('public scientific projection contains no native HDF payload or private path',()=>{
  for(const target of ['root','profile','coil']) { const copy=structuredClone(original); const object=target==='root'?copy:target==='profile'?copy.profiles[0]:copy.geometry.coils[0];object.privateExtra='sentinel';assert.throws(()=>parsePhysics(copy)); }
  assert.doesNotMatch(raw.toString(),/D:\\\\|C:\\\\|Stacktrace|privateKey|access_token|FUSE_WORKSPACE/);
  assert.ok(bundle.path.endsWith('.json.gz'));assert.ok(bundle.bytes<6000000);
});
test('browser loader verifies bytes, hash, decompressed size and run identity',async()=>{
  const originalFetch=globalThis.fetch;
  try {globalThis.fetch=async()=>new Response(bytes);assert.equal((await loadPhysics(bundle,new AbortController().signal)).runId,bundle.runId);
    await assert.rejects(loadPhysics({...bundle,sha256:'0'.repeat(64)},new AbortController().signal),/INTEGRITY/);
    await assert.rejects(loadPhysics({...bundle,rawBytes:10},new AbortController().signal),/SIZE_LIMIT/);
    await assert.rejects(loadPhysics({...bundle,runId:'another-run'},new AbortController().signal),/IDENTITY/);
    await assert.rejects(loadPhysics({...bundle,path:'https://example.com/private'},new AbortController().signal),/INVALID_BUNDLE/);
    globalThis.fetch=async()=>new Response(raw,{headers:{'content-encoding':'gzip'}});assert.equal((await loadPhysics(bundle,new AbortController().signal)).runId,bundle.runId);
    await assert.rejects(loadPhysics({...bundle,rawSha256:'0'.repeat(64)},new AbortController().signal),/INTEGRITY/);
    globalThis.fetch=async()=>new Response('not found',{status:404});await assert.rejects(loadPhysics(bundle,new AbortController().signal),/UNAVAILABLE/);
  } finally{globalThis.fetch=originalFetch;}
});
