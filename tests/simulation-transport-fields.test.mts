import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { parseTransportGeometry, parseVerifiedTransportGeometry, spaceTimeCells, crossSectionCells, inputContourSegments, type GeometryEntry } from '../app/simulations/platform/geometry.ts';
import { parseTransportResult, interpolateProfile, type TransportRunEntry } from '../app/simulations/platform/contracts.ts';

const entries: TransportRunEntry[] = JSON.parse(await readFile(new URL('../app/simulations/data/transport-runs.json', import.meta.url), 'utf8'));
const geometryEntries: GeometryEntry[] = JSON.parse(await readFile(new URL('../app/simulations/data/transport-geometries.json', import.meta.url), 'utf8'));
async function load(artifact: GeometryEntry['artifact']) {
  const compressed = await readFile(new URL(`../public${artifact.path}`, import.meta.url)), raw = gunzipSync(compressed);
  const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
  assert.equal(sha(compressed), artifact.sha256); assert.equal(sha(raw), artifact.rawSha256);
  assert.equal(compressed.length, artifact.bytes); assert.equal(raw.length, artifact.rawBytes);
  return JSON.parse(raw.toString());
}
const cases = await Promise.all(entries.map(async entry => {
  const ge = geometryEntries.find(g => g.runId === entry.id)!;
  return { result: parseTransportResult(await load(entry.artifact)), geometry: parseTransportGeometry(await load(ge.artifact)) };
}));

test('eight geometry sidecars bind unchanged native solver results and declare geometry origin', () => {
  assert.equal(cases.length, 8); assert.equal(geometryEntries.length, 8);
  for (const { result, geometry } of cases) {
    assert.equal(geometry.runId, result.id); assert.equal(geometry.sourceNativeSha256, result.provenance.nativeSha256);
    assert.equal(geometry.cocos, null); assert.equal(geometry.authority, 'derived-display');
    assert.equal(geometry.kind, result.recipe === 'step-flat-top' ? 'input-equilibrium-grid' : 'shape-reconstruction');
    assert.ok(crossSectionCells(geometry, result, 'te', result.execution.steps).length > 1000);
  }
});
test('live geometry response preserves its gateway-verified artifact identity', () => {
  const { result, geometry } = cases[0], entry = geometryEntries.find(value => value.runId === result.id)!;
  const verified = parseVerifiedTransportGeometry({ schema: 'transport-geometry-result.v1', geometry, verification: { authority: 'local-gateway-verified', geometrySha256: entry.artifact.rawSha256 } }, result.id, result.provenance.nativeSha256);
  assert.equal(verified.geometrySha256, entry.artifact.rawSha256);
  assert.throws(() => parseVerifiedTransportGeometry({ schema: 'transport-geometry-result.v1', geometry, verification: { authority: 'local-gateway-verified', geometrySha256: '0'.repeat(64) } }, 'different-run', result.provenance.nativeSha256));
});
test('time-radius cells retain actual nonuniform native times, units and profile samples', () => {
  const { result } = cases.find(c => c.result.recipe === 'iter-grid-50')!;
  const p = result.profiles.find(p => p.id === 'te')!, axis = result.axes.find(a => a.id === p.axisId)!;
  const cells = spaceTimeCells(result, 'te');
  assert.equal(cells.length, result.time.values.length*axis.values.length);
  for (const [it, ir] of [[0,0],[3,5],[result.execution.steps,axis.values.length-1]]) {
    const c = cells[it*axis.values.length+ir];
    assert.equal(c.x,result.time.values[it]); assert.equal(c.y,axis.values[ir]); assert.equal(c.value,p.values[it][ir]);
    assert.ok(c.polygon.every(([t,rho]) => t >= 0 && t <= result.parameters.duration && rho >= 0 && rho <= 1));
  }
});
test('STEP uses the input 151x151 psi grid with correct R-Z orientation, LCFS mask and honest null mapping', () => {
  const { result, geometry } = cases.find(c => c.result.recipe === 'step-flat-top')!, grid = geometry.grid!;
  assert.equal(grid.r.length,151); assert.equal(grid.z.length,151);
  const i = grid.r.reduce((best,v,i) => Math.abs(v-geometry.axis[0]) < Math.abs(grid.r[best]-geometry.axis[0]) ? i : best,0);
  const j = grid.z.reduce((best,v,i) => Math.abs(v-geometry.axis[1]) < Math.abs(grid.z[best]-geometry.axis[1]) ? i : best,0);
  assert.ok(Math.abs((grid.psi[j][i]!-grid.psiAxis)/(grid.psiBoundary-grid.psiAxis)) < .01);
  assert.equal(grid.rho[j][i], null); // Small native axis overshoot is not clamped to a fabricated rho=0.
  assert.equal(grid.psi[0][0],null);
  assert.deepEqual(crossSectionCells(geometry,result,'input_psi',0),crossSectionCells(geometry,result,'input_psi',result.execution.steps));
  assert.ok(inputContourSegments(geometry,.5).length > 50);
  const p = result.profiles.find(p => p.id === 'te')!, x = result.axes.find(a => a.id === p.axisId)!.values;
  const cell = crossSectionCells(geometry,result,'te',1)[50];
  assert.equal(cell.value,interpolateProfile(x,p.values[1],cell.rho!));
});
test('parametric sections retain closed surfaces and do not manufacture a psi(R,Z) solution', () => {
  for (const { result, geometry } of cases.filter(c => !c.geometry.grid)) {
    assert.equal(geometry.axis[1],0); assert.equal(geometry.rings[0].rho,0); assert.equal(geometry.rings.at(-1)!.rho,1);
    for (const ring of geometry.rings) {
      assert.ok(Math.abs(ring.points[0][0]-ring.points.at(-1)![0]) < 1e-10);
      assert.ok(Math.abs(ring.points[0][1]-ring.points.at(-1)![1]) < 1e-10);
    }
    assert.deepEqual(crossSectionCells(geometry,result,'input_psi',0),[]);
    assert.ok(geometry.assumptions.includes('not-a-2D-equilibrium-solve'));
  }
});
test('geometry contract rejects source substitution, grid shape errors, false COCOS and outside rho', () => {
  const { result, geometry } = cases.find(c => c.geometry.grid)!;
  const altered = structuredClone(geometry); altered.grid!.rho[50][50]=1.2;
  assert.throws(() => parseTransportGeometry(altered));
  assert.throws(() => parseTransportGeometry({ ...geometry,cocos:11 }));
  assert.throws(() => crossSectionCells({ ...geometry,runId:'different' },result,'te',0));
  altered.grid!.rho[50].pop(); assert.throws(() => parseTransportGeometry(altered));
});
