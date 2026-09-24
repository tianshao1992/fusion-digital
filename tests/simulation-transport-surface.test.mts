import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gunzipSync } from 'node:zlib';
import { FIELD_SLICE_CELL_BUDGET } from '../app/simulations/flux-surface-geometry.ts';
import { interpolateProfile, parseTransportResult, type TransportRunEntry } from '../app/simulations/platform/contracts.ts';
import { crossSectionCells, parseTransportGeometry, type FieldCell, type GeometryEntry, type TransportGeometry } from '../app/simulations/platform/geometry.ts';
import { selectableTransportRings, transportColorScale, transportCutPlane, transportSurfaceValue } from '../app/simulations/platform/surface-display.ts';

const runEntries: TransportRunEntry[] = JSON.parse(await readFile(new URL('../app/simulations/data/transport-runs.json', import.meta.url), 'utf8'));
const geometryEntries: GeometryEntry[] = JSON.parse(await readFile(new URL('../app/simulations/data/transport-geometries.json', import.meta.url), 'utf8'));

async function archivedArtifact(artifact: TransportRunEntry['artifact']): Promise<unknown> {
  const compressed = await readFile(new URL(`../public${artifact.path}`, import.meta.url));
  const raw = gunzipSync(compressed);
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(compressed.length, artifact.bytes);
  assert.equal(raw.length, artifact.rawBytes);
  assert.equal(digest(compressed), artifact.sha256);
  assert.equal(digest(raw), artifact.rawSha256);
  return JSON.parse(raw.toString());
}

const cases = await Promise.all(runEntries.map(async entry => {
  const sidecar = geometryEntries.find(item => item.runId === entry.id);
  assert.ok(sidecar, `missing same-run geometry: ${entry.id}`);
  const result = parseTransportResult(await archivedArtifact(entry.artifact));
  const geometry = parseTransportGeometry(await archivedArtifact(sidecar.artifact));
  assert.equal(result.id, geometry.runId);
  assert.equal(result.provenance.nativeSha256, geometry.sourceNativeSha256);
  return { result, geometry };
}));

const reconstructed = cases.find(item => item.geometry.kind === 'shape-reconstruction')!;
const step = cases.find(item => item.geometry.kind === 'input-equilibrium-grid')!;

test('published shape geometry has selectable rho rings independent of q availability', () => {
  assert.equal(cases.length, 8);
  for (const { result, geometry } of cases) {
    const rings = selectableTransportRings(geometry, result);
    if (geometry.kind === 'input-equilibrium-grid') {
      assert.deepEqual(rings, []);
      continue;
    }
    assert.ok(rings.length > 1, result.id);
    assert.ok(rings.every(ring => ring.rho > 0 && ring.rho <= 1));
    const noQ = structuredClone(result);
    noQ.profiles = noQ.profiles.filter(profile => profile.id !== 'q');
    assert.deepEqual(selectableTransportRings(geometry, noQ), rings);
    assert.equal(transportSurfaceValue(noQ, 'q', 0, rings[0].rho), null);
  }
});

test('TORAX section and surface use one native profile and one display color scale', () => {
  const { result, geometry } = reconstructed;
  const timeIndex = result.execution.steps;
  const cells = crossSectionCells(geometry, result, 'te', timeIndex);
  assert.ok(cells.length > 1000);
  const profile = result.profiles.find(item => item.id === 'te')!;
  const axis = result.axes.find(item => item.id === profile.axisId)!;
  const fixed = transportColorScale(result, 'te', cells, true);
  const current = transportColorScale(result, 'te', cells, false);
  const sectionAndSurface = transportColorScale(result, 'te', cells, false, timeIndex);
  assert.equal(fixed.scale, .001);
  assert.equal(fixed.unit, 'keV');
  const allNative = profile.values.flat().filter((value): value is number => value !== null);
  assert.equal(fixed.minimum, Math.min(...allNative) * fixed.scale);
  assert.equal(fixed.maximum, Math.max(...allNative) * fixed.scale);
  assert.equal(current.minimum, Math.min(...cells.map(cell => cell.value)) * current.scale);
  assert.equal(current.maximum, Math.max(...cells.map(cell => cell.value)) * current.scale);
  const atTime = profile.values[timeIndex].filter((value): value is number => value !== null);
  assert.equal(sectionAndSurface.minimum, Math.min(...cells.map(cell => cell.value), ...atTime) * current.scale);
  assert.equal(sectionAndSurface.maximum, Math.max(...cells.map(cell => cell.value), ...atTime) * current.scale);
  const ring = selectableTransportRings(geometry, result)[3];
  const native = transportSurfaceValue(result, 'te', timeIndex, ring.rho);
  assert.equal(native, interpolateProfile(axis.values, profile.values[timeIndex], ring.rho));
  assert.ok(native !== null && native * fixed.scale >= fixed.minimum && native * fixed.scale <= fixed.maximum);
  assert.ok(native !== null && native * sectionAndSurface.scale >= sectionAndSurface.minimum && native * sectionAndSurface.scale <= sectionAndSurface.maximum);
  const cell = cells.find(item => item.rho !== null)!;
  assert.equal(cell.value, transportSurfaceValue(result, 'te', timeIndex, cell.rho!));
});

test('surface lookup preserves missing values and rejects out-of-domain time and radius', () => {
  const { result, geometry } = reconstructed;
  const rho = selectableTransportRings(geometry, result)[2].rho;
  const profile = result.profiles.find(item => item.id === 'te')!;
  const axis = result.axes.find(item => item.id === profile.axisId)!;
  assert.equal(transportSurfaceValue(result, 'te', -1, rho), null);
  assert.equal(transportSurfaceValue(result, 'te', result.time.values.length, rho), null);
  assert.equal(transportSurfaceValue(result, 'te', .5, rho), null);
  assert.equal(transportSurfaceValue(result, 'te', 0, -1), null);
  assert.equal(transportSurfaceValue(result, 'not-exported', 0, rho), null);
  const missing = structuredClone(result);
  const missingProfile = missing.profiles.find(item => item.id === 'te')!;
  missingProfile.values[0] = missingProfile.values[0].map(() => null);
  assert.equal(transportSurfaceValue(missing, 'te', 0, rho), null);
  const missingCells = crossSectionCells(geometry, missing, 'te', 0);
  assert.equal(missingCells.length, 0);
  assert.equal(transportCutPlane(missingCells).cells, 0);
  const oneValue = structuredClone(missing);
  const oneProfile = oneValue.profiles.find(item => item.id === 'te')!;
  oneProfile.values = oneProfile.values.map(row => row.map(() => null));
  const exactRho = axis.values[2];
  oneProfile.values[0][2] = 1234;
  assert.equal(transportSurfaceValue(oneValue, 'te', 0, exactRho), 1234);
  assert.equal(transportSurfaceValue(oneValue, 'te', 0, (axis.values[1] + exactRho) / 2), null);
  const scale = transportColorScale(oneValue, 'te', [], true);
  assert.equal(scale.minimum, 1.234);
  assert.ok(scale.maximum > scale.minimum);
});

test('STEP input grid retains its 2-D cells but provides no invented 3-D ring', () => {
  const { result, geometry } = step;
  assert.deepEqual(selectableTransportRings(geometry, result), []);
  const cells = crossSectionCells(geometry, result, 'input_psi_norm', 0);
  assert.ok(cells.length > 1000);
  assert.equal(transportColorScale(result, 'input_psi_norm', cells, false).scale, 1);
  assert.equal(transportSurfaceValue(result, 'input_psi_norm', 0, .5), null);
  assert.ok(transportCutPlane(cells).cells === cells.length);
});

test('surface selection rejects run/hash substitutions and malformed closed rings', () => {
  const { result, geometry } = reconstructed;
  assert.deepEqual(selectableTransportRings(null, result), []);
  assert.deepEqual(selectableTransportRings({ ...geometry, runId: 'wrong-run' }, result), []);
  assert.deepEqual(selectableTransportRings({ ...geometry, sourceNativeSha256: '0'.repeat(64) }, result), []);
  const bad = structuredClone(geometry);
  const target = bad.rings[5];
  target.points.at(-1)![0] += .01;
  assert.deepEqual(selectableTransportRings(bad, result), [], 'one malformed source ring disqualifies the complete 3-D geometry and cut plane');
  const crossing = structuredClone(geometry);
  const crossed = crossing.rings[5];
  [crossed.points[15], crossed.points[70]] = [crossed.points[70], crossed.points[15]];
  assert.deepEqual(selectableTransportRings(crossing, result), [], 'one self-intersecting ring disqualifies the complete 3-D geometry');
  const shifted = structuredClone(geometry);
  const shiftedRing = shifted.rings[5];
  const originalPoints = shiftedRing.points.slice(0, -1);
  const offset = 20;
  shiftedRing.points = [...originalPoints.slice(offset), ...originalPoints.slice(0, offset), [...originalPoints[offset]]];
  assert.deepEqual(selectableTransportRings(shifted, result), [], 'closed nested rings with misaligned cell indices cannot form the 3-D cut plane');
});

test('surface selection requires reconstructed-display provenance and does not mutate its source', () => {
  const { result, geometry } = reconstructed;
  const originalResult = structuredClone(result);
  const originalGeometry = structuredClone(geometry);
  assert.ok(selectableTransportRings(geometry, result).length > 0);
  const invalid: [string, (value: TransportGeometry) => void][] = [
    ['authority', value => { Object.assign(value, { authority: 'simulation-samples' }); }],
    ['time reference', value => { Object.assign(value, { timeReference: 'time-dependent' }); }],
    ['COCOS', value => { Object.assign(value, { cocos: 11 }); }],
    ['input grid', value => { value.grid = structuredClone(step.geometry.grid); }],
    ['coordinate', value => { Object.assign(value, { coordinate: 'rho-phi-z' }); }],
    ['unit', value => { Object.assign(value, { unit: 'cm' }); }],
    ['not-a-2D-equilibrium-solve assumption', value => {
      value.assumptions = value.assumptions.filter(item => item !== 'not-a-2D-equilibrium-solve');
    }],
    ['profiles-constant-on-reconstructed-surfaces assumption', value => {
      value.assumptions = value.assumptions.filter(item => item !== 'profiles-constant-on-reconstructed-surfaces');
    }],
  ];
  for (const [name, alter] of invalid) {
    const variant = structuredClone(geometry);
    alter(variant);
    const before = structuredClone(variant);
    assert.deepEqual(selectableTransportRings(variant, result), [], name);
    assert.deepEqual(variant, before, `${name} variant was mutated`);
    assert.deepEqual(geometry, originalGeometry, `${name} changed the original geometry`);
    assert.deepEqual(result, originalResult, `${name} changed the original result`);
  }
});

test('surface selection rejects axis-outside, degenerate edges, zero area, and non-nested rho rings', () => {
  const { result, geometry } = reconstructed;
  const original = structuredClone(geometry);
  const valid = selectableTransportRings(geometry, result);
  assert.ok(valid.length > 6);

  const axisOutside = structuredClone(geometry);
  axisOutside.axis = [geometry.axis[0] + 100, geometry.axis[1] + 100];
  assert.deepEqual(selectableTransportRings(axisOutside, result), [], 'an axis outside every ring cannot define a selectable magnetic surface');

  const zeroEdge = structuredClone(geometry);
  const zeroEdgeRing = zeroEdge.rings[5];
  zeroEdgeRing.points[20] = [...zeroEdgeRing.points[19]];
  assert.deepEqual(selectableTransportRings(zeroEdge, result), [], 'one zero-length ring edge disqualifies the complete 3-D geometry');

  const zeroArea = structuredClone(geometry);
  const zeroAreaRing = zeroArea.rings[5];
  const count = zeroAreaRing.points.length - 1;
  zeroAreaRing.points = Array.from({ length: count + 1 }, (_, index) => {
    const offset = .1 * Math.cos(2 * Math.PI * index / count);
    return [geometry.axis[0] + offset, geometry.axis[1] + offset];
  });
  zeroAreaRing.points[count] = [...zeroAreaRing.points[0]];
  assert.deepEqual(selectableTransportRings(zeroArea, result), [], 'closed, collinear zero-area ring disqualifies the complete 3-D geometry');

  const inverted = structuredClone(geometry);
  [inverted.rings[5].points, inverted.rings[6].points] = [inverted.rings[6].points, inverted.rings[5].points];
  assert.deepEqual(selectableTransportRings(inverted, result), [], 'larger-rho ring cannot lie inside the previous source ring');
  assert.deepEqual(geometry, original, 'negative variants must not change the real archived geometry');
  assert.equal(selectableTransportRings(geometry, result).length, valid.length, 'real archived geometry remains selectable');
});

test('3-D cut plane preserves each 2-D cell value, R-Z position, and missing-cell exclusion', () => {
  for (const { result, geometry } of cases) {
    const cells = crossSectionCells(geometry, result, 'te', result.execution.steps);
    const source = JSON.stringify(cells);
    const slice = transportCutPlane(cells);
    assert.equal(slice.cells, cells.length);
    assert.equal(slice.positions.length, cells.length * 12);
    assert.equal(slice.values.length, cells.length * 4);
    assert.equal(slice.indices.length, cells.length * 6);
    assert.ok(slice.cells <= FIELD_SLICE_CELL_BUDGET);
    for (const index of [0, Math.floor(cells.length / 2), cells.length - 1]) {
      const cell = cells[index];
      for (let corner = 0; corner < 4; corner++) {
        const offset = (index * 4 + corner) * 3;
        assert.ok(Math.abs(slice.positions[offset] - cell.polygon[corner][0]) < 1e-5);
        assert.ok(Math.abs(slice.positions[offset + 1] - cell.polygon[corner][1]) < 1e-5);
        assert.equal(slice.positions[offset + 2], 0);
        assert.ok(Math.abs(slice.values[index * 4 + corner] - cell.value) <= Math.max(1e-7, Math.abs(cell.value) * 1e-6));
      }
      assert.deepEqual([...slice.indices.slice(index * 6, index * 6 + 6)], [index * 4, index * 4 + 1, index * 4 + 2, index * 4, index * 4 + 2, index * 4 + 3]);
    }
    assert.equal(JSON.stringify(cells), source);
  }
});

test('cut plane rejects nonfinite samples, malformed cells, and vertex budget overflow', () => {
  const cell: FieldCell = { x: 1, y: 0, value: 42, rho: .5, polygon: [[1, 0], [2, 0], [2, 1], [1, 1]] };
  assert.equal(transportCutPlane([cell]).values[0], 42);
  assert.throws(() => transportCutPlane([{ ...cell, value: Number.NaN }]), /TRANSPORT_CUT_PLANE_BUDGET_OR_COORDINATES/);
  assert.throws(() => transportCutPlane([{ ...cell, polygon: [[1, 0], [2, 0], [2, 1]] }]), /TRANSPORT_CUT_PLANE_BUDGET_OR_COORDINATES/);
  assert.throws(() => transportCutPlane([{ ...cell, polygon: [[1, 0], [2, 0], [2, 1], [Number.POSITIVE_INFINITY, 1]] }]), /TRANSPORT_CUT_PLANE_BUDGET_OR_COORDINATES/);
  assert.throws(() => transportCutPlane([{ ...cell, polygon: [[1, 0], [2, 1], [2, 0], [1, 1]] }]), /TRANSPORT_CUT_PLANE_BUDGET_OR_COORDINATES/);
  assert.throws(() => transportCutPlane(Array(FIELD_SLICE_CELL_BUDGET + 1).fill(cell)), /TRANSPORT_CUT_PLANE_BUDGET_OR_COORDINATES/);
});
