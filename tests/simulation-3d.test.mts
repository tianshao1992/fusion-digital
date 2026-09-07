import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildPoloidalFieldSlice, revolveContours, SURFACE_VERTEX_BUDGET } from '../app/simulations/flux-surface-geometry.ts';
import type { EquilibriumFieldSample } from '../app/simulations/equilibrium-field.ts';
import { parsePhysics, type PhysicsBundle, type RZ } from '../app/simulations/physics.ts';

const square: RZ = [[1, -1], [2, -1], [2, 1], [1, 1], [1, -1]];
test('revolution preserves metres, handedness and every source point', () => {
  const original = structuredClone(square);
  const mesh = revolveContours([square], 360, 8);
  assert.equal(mesh.positions.length / 3, 45);
  assert.equal(mesh.triangles, 64);
  assert.equal(mesh.closedPaths, 1);
  for (let j = 0; j <= 8; j++) for (let i = 0; i < square.length; i++) {
    const k = (j * square.length + i) * 3;
    assert.ok(Math.abs(Math.hypot(mesh.positions[k], mesh.positions[k + 2]) - square[i][0]) < 1e-6);
    assert.equal(mesh.positions[k + 1], square[i][1]);
  }
  assert.ok(mesh.positions[(2 * 5) * 3 + 2] < 0);
  assert.deepEqual(square, original);
  assert.ok([...mesh.indices].every(i => i >= 0 && i < 45));
});
test('partial toroidal and open poloidal paths are never silently capped', () => {
  const mesh = revolveContours([[[1, 0], [2, 0]]], 90, 8);
  assert.equal(mesh.closedPaths, 0);
  assert.equal(mesh.triangles, 16);
  assert.ok(Math.abs(mesh.positions.at(-3)!) < 1e-6);
  assert.equal(mesh.positions.at(-1), -2);
});
test('multiple paths remain disconnected and clockwise winding stays outward', () => {
  const mesh = revolveContours([square, square.toReversed()], 270, 8);
  assert.equal(mesh.closedPaths, 2);
  const split = square.length * 9;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const tri = [...mesh.indices.slice(i, i + 3)];
    assert.ok(tri.every(v => v < split) || tri.every(v => v >= split));
  }
  const normalY = (m: ReturnType<typeof revolveContours>) => {
    const [a, b, c] = [...m.indices.slice(0, 3)].map(i => [...m.positions.slice(i * 3, i * 3 + 3)]);
    return (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
  };
  const clockwiseFromSameEdge: RZ = [square[1], square[0], square[3], square[2], square[1]];
  assert.ok(normalY(revolveContours([square])) < 0);
  assert.ok(normalY(revolveContours([clockwiseFromSameEdge])) < 0);
});
test('malformed geometry and excessive allocation fail closed', () => {
  for (const path of [[], [[-1, 0], [1, 0]], [[1, NaN], [1, 0]], [[Infinity, 0], [1, 0]]]) assert.throws(() => revolveContours([path as RZ]));
  for (const degrees of [NaN, 0, 361]) assert.throws(() => revolveContours([square], degrees));
  for (const segments of [2, 129, 12.5]) assert.throws(() => revolveContours([square], 270, segments));
  assert.throws(() => revolveContours([Array.from({ length: 4000 }, (_, i) => [1, i] as [number, number])], 270, 128), /BUDGET/);
});
test('poloidal field slice preserves cell values and the scientific-to-Three coordinate transform',()=>{
  const samples:EquilibriumFieldSample[]=[[2,.5,7,.4,-1,1.5,2.5,.25,.75,.6]];
  const slice=buildPoloidalFieldSlice(samples,90);assert.equal(slice.cells,1);assert.deepEqual([...slice.values],[7,7,7,7]);assert.deepEqual([...slice.indices],[0,1,2,0,2,3]);
  for(let index=0;index<4;index++){const x=slice.positions[index*3],y=slice.positions[index*3+1],z=slice.positions[index*3+2];assert.ok(Math.abs(x)<1e-6);assert.ok([.25,.75].some(value=>Math.abs(y-value)<1e-6));assert.ok([1.5,2.5].some(value=>Math.abs(z+value)<1e-6));}
  assert.throws(()=>buildPoloidalFieldSlice([[2,.5,7,.4,-1,1.5,2.5,.25,.75] as unknown as EquilibriumFieldSample]),/FIELD_SLICE_SAMPLES/);
});
test('every real published FUSE contour and LCFS fits the demo budget without decimation', () => {
  const bundles: PhysicsBundle[] = JSON.parse(readFileSync(new URL('../app/simulations/data/physics-bundles.json', import.meta.url), 'utf8'));
  assert.ok(bundles.length >= 5);
  for (const b of bundles) {
    const data = parsePhysics(JSON.parse(gunzipSync(readFileSync(new URL(`../public${b.path}`, import.meta.url))).toString()));
    for (const paths of [...data.equilibrium.contours.map(c => c.paths), [data.equilibrium.boundary]]) {
      const mesh = revolveContours(paths);
      assert.equal(mesh.closedPaths, paths.length);
      assert.ok(mesh.positions.length / 3 <= SURFACE_VERTEX_BUDGET);
      assert.ok(mesh.positions.every(Number.isFinite));
      assert.ok(mesh.indices.every(i => i < mesh.positions.length / 3));
      assert.equal(mesh.sourcePoints, paths.reduce((sum, p) => sum + p.length, 0));
    }
  }
});
