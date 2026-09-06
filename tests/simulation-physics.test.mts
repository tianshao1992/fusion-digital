import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { loadPhysics, parsePhysics, profileDisplay, type PhysicsBundle } from '../app/simulations/physics.ts';
import { parseSimulationRun } from '../app/simulations/contract.ts';
const bundles:PhysicsBundle[]=JSON.parse(readFileSync(new URL('../app/simulations/data/physics-bundles.json',import.meta.url),'utf8'));
const bundle=bundles[0];
const bytes=readFileSync(new URL(`../public${bundle.path}`,import.meta.url));
const raw=gunzipSync(bytes); const original=JSON.parse(raw.toString());
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
test('published scientific bytes bind the exact native result and summary identity',()=>{
  assert.equal(bundles.length,1); assert.equal(bytes.length,bundle.bytes);assert.equal(hash(bytes),bundle.sha256);assert.equal(hash(raw),bundle.rawSha256);assert.equal(raw.length,bundle.rawBytes);
  const p=parsePhysics(original);assert.equal(p.runId,bundle.runId);assert.equal(p.profiles.length,118);assert.deepEqual([p.equilibrium.r.length,p.equilibrium.z.length],[67,129]);assert.equal(p.geometry.layers.length,28);assert.equal(p.geometry.coils.length,11);assert.equal(p.coreTransportModel,'none');
  const runs=JSON.parse(readFileSync(new URL('../app/simulations/data/fuse-demo.json',import.meta.url),'utf8')).map(parseSimulationRun);
  const run=runs.find((r:{id:string})=>r.id===p.runId);assert.ok(run);assert.equal(run.source.recordSha256,bundle.recordSha256);assert.ok(run.source.artifacts.some((a:{name:string;sha256:string})=>a.name==='physics.json'&&a.sha256===bundle.rawSha256));
});
test('matrix order, units, axes and missing samples are validated without fabricated zeros',()=>{
  const p=parsePhysics(original);assert.equal(p.equilibrium.arrayOrder,'z,r');assert.equal(p.equilibrium.psiUnit,'Wb');
  for(const mutate of [(p:typeof original)=>{p.equilibrium.psi.pop();},(p:typeof original)=>{p.equilibrium.r[1]=p.equilibrium.r[0];},(p:typeof original)=>{p.profiles[0].y[0]=Infinity;},(p:typeof original)=>{p.profiles[0].unit='unqualified';},(p:typeof original)=>{p.equilibrium.psiBoundary=p.equilibrium.psiAxis;}]){const copy=structuredClone(original);mutate(copy);assert.throws(()=>parsePhysics(copy));}
  const copy=structuredClone(original);copy.profiles[0].y[0]=null;const missing=parsePhysics(copy).profiles[0];assert.equal(profileDisplay(missing).data[0][1],null);
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
