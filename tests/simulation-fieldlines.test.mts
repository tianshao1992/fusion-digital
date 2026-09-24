import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fieldlineWebPoints } from '../app/components/device-viewer/EfitFieldLineOverlay.ts';
import { parsePhysics, type PhysicsBundle, type PhysicsData } from '../app/simulations/physics.ts';
import { parseTransportResult, type TransportRunEntry, type TransportResult } from '../app/simulations/platform/contracts.ts';
import { parseTransportGeometry, type GeometryEntry, type TransportGeometry } from '../app/simulations/platform/geometry.ts';
import { buildFuseQFieldLines, buildToraxQFieldLines, SIMULATION_FIELDLINE_LEVELS } from '../app/simulations/simulation-fieldlines.ts';

function artifact(path: string): unknown {
  return JSON.parse(gunzipSync(readFileSync(new URL(`../public${path}`, import.meta.url))).toString());
}
const fuseBundles: PhysicsBundle[] = JSON.parse(readFileSync(new URL('../app/simulations/data/physics-bundles.json', import.meta.url), 'utf8'));
const fuse = fuseBundles.map(bundle => parsePhysics(artifact(bundle.path)));
const toraxEntries: TransportRunEntry[] = JSON.parse(readFileSync(new URL('../app/simulations/data/transport-runs.json', import.meta.url), 'utf8'));
const geometryEntries: GeometryEntry[] = JSON.parse(readFileSync(new URL('../app/simulations/data/transport-geometries.json', import.meta.url), 'utf8'));
const torax = toraxEntries.map(entry => {
  const result = parseTransportResult(artifact(entry.artifact.path));
  const geometry = parseTransportGeometry(artifact(geometryEntries.find(item => item.runId === entry.id)!.artifact.path));
  return { result, geometry };
});

test('published FUSE contours make five bounded, signed q illustrations, not B-integrated field lines', () => {
  assert.ok(fuse.length >= 5);
  for (const data of fuse) {
    const original = JSON.stringify(data);
    const set = buildFuseQFieldLines(data);
    assert.ok(set, data.runId);
    assert.equal(set.authority, 'derived-display');
    assert.equal(set.method, 'q-constrained-geometric-helix');
    assert.equal(set.engineId, 'fuse');
    assert.equal(set.timeSeconds, data.timeSeconds); // Equilibrium, not core-profile time.
    assert.equal(set.geometryTimeReference, 'equilibrium-snapshot');
    assert.equal(set.coordinate, 'psi_norm');
    assert.deepEqual(set.lines.map(line => line.psiNorm), [...SIMULATION_FIELDLINE_LEVELS]);
    for (const line of set.lines) {
      const points = line.pointsRphiZ;
      assert.ok(points.length >= 3 * 257 && points.length <= 3 * 4095);
      assert.equal(points.length % 3, 0);
      assert.ok(points.every(Number.isFinite));
      assert.ok(Math.abs(points[1]) < 1e-12);
      assert.ok(Math.abs(points.at(-2)! - 2 * Math.PI * line.q) < 1e-10);
      assert.ok(Math.abs(points[0] - points.at(-3)!) < 1e-10);
      assert.ok(Math.abs(points[2] - points.at(-1)!) < 1e-10);
      // The poloidal circuit closes, but an integer-q 3D loop is not asserted.
      assert.equal(Math.sign(points.at(-2)!), Math.sign(line.q));
    }
    assert.equal(JSON.stringify(data), original);
  }
  const solved = fuse.find(data => data.equilibriumOrigin === 'model-solved')!;
  assert.ok(buildFuseQFieldLines(solved)!.lines.every(line => line.q < 0));
});

test('scientific R-phi-Z metres use the reviewed EFIT-to-Three transform', () => {
  const point = buildFuseQFieldLines(fuse[0])!.lines[0].pointsRphiZ.slice(3, 6);
  const [x, y, z] = fieldlineWebPoints(point);
  assert.ok(Math.abs(Math.hypot(x, z) - point[0]) < 1e-10);
  assert.equal(y, point[2]);
  assert.ok(Math.abs(x - point[0] * Math.cos(point[1])) < 1e-10);
  assert.ok(Math.abs(z + point[0] * Math.sin(point[1])) < 1e-10);
});

test('FUSE fail-closes on missing q, malformed contour, non-closed contour and output budget', () => {
  const source = fuse[0];
  const noQ = structuredClone(source); noQ.profiles = noQ.profiles.filter(profile => profile.id !== 'q');
  assert.equal(buildFuseQFieldLines(noQ), null);
  const wrongQSource = structuredClone(source);
  wrongQSource.profiles.find(item => item.id === 'q')!.source = 'core_profiles.profiles_1d.q';
  assert.equal(buildFuseQFieldLines(wrongQSource), null);
  const missingQ = structuredClone(source);
  const profile = missingQ.profiles.find(item => item.id === 'q')!;
  profile.y = profile.y.map(() => null);
  assert.equal(buildFuseQFieldLines(missingQ), null);
  const open = structuredClone(source);
  open.equilibrium.contours.find(item => item.psiNorm === .2)!.paths[0].pop();
  assert.equal(buildFuseQFieldLines(open), null);
  const crossing = structuredClone(source);
  const crossingPath = crossing.equilibrium.contours.find(item => item.psiNorm === .2)!.paths[0];
  [crossingPath[15], crossingPath[70]] = [crossingPath[70], crossingPath[15]];
  assert.equal(buildFuseQFieldLines(crossing), null, 'self-intersecting closed contour is not a magnetic surface');
  const multi = structuredClone(source);
  multi.equilibrium.contours.find(item => item.psiNorm === .2)!.paths.push(structuredClone(multi.equilibrium.contours.find(item => item.psiNorm === .2)!.paths[0]));
  assert.equal(buildFuseQFieldLines(multi), null);
  const tooManyTurns = structuredClone(fuse.find(item => item.runId.startsWith('fuse-fpp-'))!);
  const manyQ = tooManyTurns.profiles.find(item => item.id === 'q')!;
  manyQ.y = manyQ.x.map(() => 32);
  assert.ok(buildFuseQFieldLines(tooManyTurns) === null, 'field-line point budget must reject high-q large-radius display');
  assert.equal(buildFuseQFieldLines({ ...source, cocos: 0 } as unknown as PhysicsData), null);
  assert.equal(buildFuseQFieldLines({ ...source, equilibrium: { ...source.equilibrium, psiUnit: 'Wb/rad' } } as unknown as PhysicsData), null);
});

test('TORAX uses only same-run fixed shape geometry and the selected native q time', () => {
  assert.equal(torax.length, 8);
  for (const { result, geometry } of torax) {
    const originalResult = JSON.stringify(result), originalGeometry = JSON.stringify(geometry);
    for (const timeIndex of [0, result.execution.steps]) {
      const set = buildToraxQFieldLines(result, geometry, timeIndex);
      if (geometry.kind === 'input-equilibrium-grid') {
        assert.equal(set, null, 'STEP input grid has no reviewed closed TORAX trace contours');
        continue;
      }
      assert.ok(set, result.recipe);
      assert.equal(set.authority, 'derived-display');
      assert.equal(set.engineId, 'torax');
      assert.equal(set.method, 'q-constrained-geometric-helix');
      assert.equal(set.coordinate, 'rho_tor_norm');
      assert.equal(set.geometryTimeReference, 'fixed-input-geometry');
      assert.equal(set.timeSeconds, result.time.values[timeIndex]);
      assert.equal(set.lines.length, 5);
      set.lines.forEach((line, index) => {
        assert.ok(Math.abs(line.coordinateValue - SIMULATION_FIELDLINE_LEVELS[index]) <= .025);
        assert.equal(line.psiNorm, line.coordinateValue); // Renderer colour key, not a psi coordinate.
        assert.ok(Math.abs(line.pointsRphiZ.at(-2)! - 2 * Math.PI * line.q) < 1e-10);
      });
    }
    assert.equal(JSON.stringify(result), originalResult);
    assert.equal(JSON.stringify(geometry), originalGeometry);
  }
  const changing = torax.find(item => item.result.recipe === 'iter-hybrid')!;
  assert.notEqual(buildToraxQFieldLines(changing.result, changing.geometry, 0)!.lines[0].q,
    buildToraxQFieldLines(changing.result, changing.geometry, changing.result.execution.steps)!.lines[0].q);
});

test('TORAX rejects result/geometry substitutions, invalid time and missing q without fallback', () => {
  const { result, geometry } = torax.find(item => item.geometry.kind === 'shape-reconstruction')!;
  assert.equal(buildToraxQFieldLines(result, { ...geometry, runId: 'wrong' }, 0), null);
  assert.equal(buildToraxQFieldLines(result, { ...geometry, sourceNativeSha256: '0'.repeat(64) }, 0), null);
  assert.equal(buildToraxQFieldLines(result, { ...geometry, cocos: 11 } as unknown as TransportGeometry, 0), null);
  assert.equal(buildToraxQFieldLines(result, { ...geometry, unit: 'cm' } as unknown as TransportGeometry, 0), null);
  assert.equal(buildToraxQFieldLines(result, { ...geometry, assumptions: [] }, 0), null);
  assert.equal(buildToraxQFieldLines(result, null, 0), null);
  assert.equal(buildToraxQFieldLines(result, geometry, -1), null);
  assert.equal(buildToraxQFieldLines(result, geometry, result.time.values.length), null);
  const missingQ = structuredClone(result);
  missingQ.profiles.find(profile => profile.id === 'q')!.values[0] = missingQ.profiles.find(profile => profile.id === 'q')!.values[0].map(() => null);
  assert.equal(buildToraxQFieldLines(missingQ, geometry, 0), null);
  const differentEngine = { ...result, engine: { ...result.engine, id: 'fuse' } } as TransportResult;
  assert.equal(buildToraxQFieldLines(differentEngine, geometry, 0), null);
  const negativeQ = structuredClone(result);
  negativeQ.profiles.find(profile => profile.id === 'q')!.values[0] = negativeQ.profiles.find(profile => profile.id === 'q')!.values[0].map(() => -2);
  assert.ok(buildToraxQFieldLines(negativeQ, geometry, 0)!.lines.every(line => line.q === -2 && line.pointsRphiZ.at(-2)! < 0));
  const crossingGeometry = structuredClone(geometry);
  const crossingRing = crossingGeometry.rings.reduce((best, ring) => Math.abs(ring.rho - .2) < Math.abs(best.rho - .2) ? ring : best);
  [crossingRing.points[15], crossingRing.points[70]] = [crossingRing.points[70], crossingRing.points[15]];
  assert.equal(buildToraxQFieldLines(result, crossingGeometry, 0), null, 'self-intersecting reconstructed ring is rejected');
});
