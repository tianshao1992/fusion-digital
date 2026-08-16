import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { AnalyticPlasmaVisualization } from '../app/components/deviceManifest';
import {
  ANALYTIC_FLUX_BAND_RADII,
  ANALYTIC_PLASMA_POLOIDAL_SEGMENTS,
  ANALYTIC_PLASMA_RUNTIME_SEMANTICS,
  ANALYTIC_PLASMA_TOROIDAL_SEGMENTS,
  ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT,
  buildAnalyticPlasmaGeometry,
  millerPointToWeb,
} from '../app/components/device-viewer/analyticPlasma';
import { messages } from '../app/i18n/messages';

const manifest = JSON.parse(await readFile(
  new URL('../public/models/iter-public-simplified/model-manifest.json', import.meta.url),
  'utf8',
)) as { visualizations: { analyticPlasma: AnalyticPlasmaVisualization } };
const definition = manifest.visualizations.analyticPlasma;

function close(actual: number, expected: number, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('Miller mapping matches the published ITER nominal parameters and web coordinate contract', () => {
  assert.deepEqual(
    {
      majorRadiusMetres: definition.majorRadiusMetres,
      minorRadiusMetres: definition.minorRadiusMetres,
      kappa95: definition.kappa95,
      delta95: definition.delta95,
      kappaSeparatrixReference: definition.kappaSeparatrixReference,
      deltaSeparatrixReference: definition.deltaSeparatrixReference,
      nominalPlasmaCurrentMA: definition.nominalPlasmaCurrentMA,
      toroidalFieldAtMajorRadiusT: definition.toroidalFieldAtMajorRadiusT,
      q95: definition.q95,
      nominalVolumeCubicMetres: definition.nominalVolumeCubicMetres,
    },
    {
      majorRadiusMetres: 6.2,
      minorRadiusMetres: 2,
      kappa95: 1.7,
      delta95: 0.33,
      kappaSeparatrixReference: 1.85,
      deltaSeparatrixReference: 0.49,
      nominalPlasmaCurrentMA: 15,
      toroidalFieldAtMajorRadiusT: 5.3,
      q95: 3,
      nominalVolumeCubicMetres: 837,
    },
  );
  assert.equal(
    definition.sourceUrl,
    'https://www-pub.iaea.org/MTCD/Publications/PDF/ITER-EDA-DS-22.pdf',
  );

  const outboard = millerPointToWeb(6.2, 2, 1.7, 0.33, 0, 0);
  close(outboard[0], 8.2);
  close(outboard[1], 0);
  close(outboard[2], 0);

  const inboard = millerPointToWeb(6.2, 2, 1.7, 0.33, Math.PI, 0);
  close(inboard[0], 4.2);
  close(inboard[1], 0);
  close(inboard[2], 0);

  const top = millerPointToWeb(6.2, 2, 1.7, 0.33, Math.PI / 2, 0);
  close(top[0], 6.2 - 2 * 0.33);
  close(top[1], 2 * 1.7);
  close(top[2], 0);

  const quarterTurn = millerPointToWeb(6.2, 2, 1.7, 0.33, 0, Math.PI / 2);
  close(quarterTurn[0], 0);
  close(quarterTurn[1], 0);
  close(quarterTurn[2], -8.2);

  assert.throws(
    () => millerPointToWeb(2, 2, 1.7, 0.33, 0, 0),
    /Invalid Miller geometry parameters/,
  );
  assert.throws(
    () => millerPointToWeb(6.2, 2, 1.7, 1, 0, 0),
    /Invalid Miller geometry parameters/,
  );
  assert.throws(
    () => millerPointToWeb(6.2, 2, 1.7, 0.33, Number.NaN, 0),
    /Invalid Miller geometry parameters/,
  );
});

test('analytic surface is finite, closed, outward-wound and non-degenerate', () => {
  const { surface95 } = buildAnalyticPlasmaGeometry(definition);
  const vertexCount = ANALYTIC_PLASMA_POLOIDAL_SEGMENTS * ANALYTIC_PLASMA_TOROIDAL_SEGMENTS;
  assert.equal(surface95.positions.length, vertexCount * 3);
  assert.equal(
    surface95.indices.length,
    ANALYTIC_PLASMA_POLOIDAL_SEGMENTS * ANALYTIC_PLASMA_TOROIDAL_SEGMENTS * 6,
  );

  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < surface95.positions.length; offset += 3) {
    const x = surface95.positions[offset];
    const y = surface95.positions[offset + 1];
    const z = surface95.positions[offset + 2];
    assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
    bounds[0] = Math.min(bounds[0], x);
    bounds[1] = Math.min(bounds[1], y);
    bounds[2] = Math.min(bounds[2], z);
    bounds[3] = Math.max(bounds[3], x);
    bounds[4] = Math.max(bounds[4], y);
    bounds[5] = Math.max(bounds[5], z);
  }
  close(bounds[0], -8.2);
  close(bounds[1], -3.4);
  close(bounds[2], -8.2);
  close(bounds[3], 8.2);
  close(bounds[4], 3.4);
  close(bounds[5], 8.2);

  let signedVolume = 0;
  for (let offset = 0; offset < surface95.indices.length; offset += 3) {
    const ai = surface95.indices[offset];
    const bi = surface95.indices[offset + 1];
    const ci = surface95.indices[offset + 2];
    assert.ok(ai < vertexCount && bi < vertexCount && ci < vertexCount);
    assert.ok(ai !== bi && bi !== ci && ci !== ai);

    const a = ai * 3;
    const b = bi * 3;
    const c = ci * 3;
    const ax = surface95.positions[a];
    const ay = surface95.positions[a + 1];
    const az = surface95.positions[a + 2];
    const bx = surface95.positions[b];
    const by = surface95.positions[b + 1];
    const bz = surface95.positions[b + 2];
    const cx = surface95.positions[c];
    const cy = surface95.positions[c + 1];
    const cz = surface95.positions[c + 2];
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    assert.ok(Math.hypot(nx, ny, nz) > 1e-5, `degenerate triangle at index ${offset / 3}`);

    const mx = (ax + bx + cx) / 3;
    const my = (ay + by + cy) / 3;
    const mz = (az + bz + cz) / 3;
    const cylindricalRadius = Math.hypot(mx, mz);
    const outwardX = mx - definition.majorRadiusMetres * mx / cylindricalRadius;
    const outwardY = my;
    const outwardZ = mz - definition.majorRadiusMetres * mz / cylindricalRadius;
    assert.ok(
      nx * outwardX + ny * outwardY + nz * outwardZ > 0,
      `inward triangle at index ${offset / 3}`,
    );

    signedVolume += (
      ax * (by * cz - bz * cy)
      + ay * (bz * cx - bx * cz)
      + az * (bx * cy - by * cx)
    ) / 6;
  }

  assert.ok(signedVolume > 0, 'outward winding should yield positive signed volume');
  assert.ok(
    signedVolume / definition.nominalVolumeCubicMetres > 0.9
      && signedVolume / definition.nominalVolumeCubicMetres < 1.1,
    'the geometry-only Miller proxy should remain close to the published nominal plasma volume',
  );
});

test('separatrix reference contours are finite, closed and remain reference-only', () => {
  const geometry = buildAnalyticPlasmaGeometry(definition);
  assert.equal(geometry.separatrixReferenceContours.length, 2);

  geometry.separatrixReferenceContours.forEach((contour, contourIndex) => {
    assert.equal(contour.length, (ANALYTIC_PLASMA_POLOIDAL_SEGMENTS + 1) * 3);
    assert.ok(Array.from(contour).every(Number.isFinite));
    for (let axis = 0; axis < 3; axis += 1) {
      close(contour[axis], contour[contour.length - 3 + axis], 1e-5);
    }
    for (let offset = 2; offset < contour.length; offset += 3) close(contour[offset], 0, 1e-5);

    const topOffset = (ANALYTIC_PLASMA_POLOIDAL_SEGMENTS / 4) * 3;
    close(Math.abs(contour[topOffset]), 6.2 - 2 * 0.49);
    close(contour[topOffset + 1], 2 * 1.85);
    assert.equal(Math.sign(contour[0]), contourIndex === 0 ? 1 : -1);
  });

  assert.deepEqual(ANALYTIC_PLASMA_RUNTIME_SEMANTICS, {
    geometryOnly: true,
    isEfit: false,
    hasPsiGrid: false,
    hasXPoint: false,
    hasDiagnostics: false,
    hasAnalyticFluxCoordinateBands: true,
    fluxCoordinateIsPsi: false,
    pickable: false,
  });
  assert.equal(ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT, true);
  assert.equal(definition.topologyReference, 'single-null');
  assert.equal(definition.hasXPoint, false);
  assert.equal(definition.isEfit, false);
});

test('analytic flux-coordinate bands fill both Z-section lobes without inventing psi data', () => {
  const geometry = buildAnalyticPlasmaGeometry(definition);
  assert.equal(geometry.fluxCoordinateBands.length, ANALYTIC_FLUX_BAND_RADII.length - 1);

  geometry.fluxCoordinateBands.forEach((band, bandIndex) => {
    close(band.normalizedRadiusMin, ANALYTIC_FLUX_BAND_RADII[bandIndex]);
    close(band.normalizedRadiusMax, ANALYTIC_FLUX_BAND_RADII[bandIndex + 1]);
    assert.ok(Array.from(band.positions).every(Number.isFinite));
    assert.ok(Array.from(band.indices).every((index) => Number.isSafeInteger(index)
      && index >= 0 && index < band.positions.length / 3));
    assert.ok(band.indices.length > 0);

    let positiveLobe = false;
    let negativeLobe = false;
    for (let offset = 0; offset < band.positions.length; offset += 3) {
      positiveLobe ||= band.positions[offset] > 0;
      negativeLobe ||= band.positions[offset] < 0;
      close(band.positions[offset + 2], -0.012, 1e-6);
    }
    assert.ok(positiveLobe && negativeLobe, `band ${bandIndex} must contain both section lobes`);

    for (let offset = 0; offset < band.indices.length; offset += 3) {
      const a = band.indices[offset] * 3;
      const b = band.indices[offset + 1] * 3;
      const c = band.indices[offset + 2] * 3;
      const abx = band.positions[b] - band.positions[a];
      const aby = band.positions[b + 1] - band.positions[a + 1];
      const acx = band.positions[c] - band.positions[a];
      const acy = band.positions[c + 1] - band.positions[a + 1];
      assert.ok(Math.abs(abx * acy - aby * acx) > 1e-8, `degenerate flux-band triangle ${offset / 3}`);
    }
  });

  assert.equal(ANALYTIC_PLASMA_RUNTIME_SEMANTICS.hasAnalyticFluxCoordinateBands, true);
  assert.equal(ANALYTIC_PLASMA_RUNTIME_SEMANTICS.fluxCoordinateIsPsi, false);
  assert.equal(definition.hasPsiGrid, false);
  assert.equal(definition.isEfit, false);
});

test('viewer and bilingual copy preserve the geometry-only interaction boundary', async () => {
  const viewer = await readFile(
    new URL('../app/components/TokamakCadViewer.tsx', import.meta.url),
    'utf8',
  );

  assert.match(viewer, /ANALYTIC_PLASMA_VISIBLE_BY_DEFAULT/);
  assert.match(viewer, /surface\.raycast\s*=\s*\(\)\s*=>\s*undefined/);
  assert.match(viewer, /contour\.raycast\s*=\s*\(\)\s*=>\s*undefined/);
  assert.match(viewer, /bandMesh\.raycast\s*=\s*\(\)\s*=>\s*undefined/);
  assert.match(viewer, /ITER_ANALYTIC_FLUX_COORDINATE_BAND_/);
  assert.match(viewer, /analyticFluxBandRoot\.visible\s*=\s*enabled\s*&&\s*axis\s*===\s*['"]z['"]/);
  assert.match(viewer, /viewerMaterials\.add\(surfaceMaterial\)/);
  assert.match(viewer, /viewerMaterials\.add\(contourMaterial\)/);
  assert.match(viewer, /material\.clippingPlanes\s*=\s*enabled\s*\?\s*\[clippingPlane\]\s*:\s*null/);
  assert.match(viewer, /viewerMaterials\.forEach\(\(material\)\s*=>\s*applyMaterialOpacity/);
  assert.match(viewer, /localScene\?\.traverse[\s\S]*?renderable\.geometry\?\.dispose\(\)/);
  assert.match(viewer, /localDisposableMaterials\?\.forEach\(\(material\)\s*=>\s*material\.dispose\(\)\)/);
  assert.match(viewer, /setAnalyticPlasmaVisible:\s*\(visible\)/);
  assert.match(viewer, /setVisualTheme\(visualThemeRef\.current\)/);
  assert.match(viewer, /const light = theme === 'light'/);
  assert.match(viewer, /analyticPlasmaPulseBase = light \? 1\.05 : 3\.15/);

  const zhHelp = messages['zh-CN']['viewer.analyticPlasmaHelp'];
  const enHelp = messages.en['viewer.analyticPlasmaHelp'];
  assert.match(zhHelp, /仅几何/);
  assert.match(zhHelp, /不是 EFIT/);
  assert.match(zhHelp, /真实 LCFS/);
  assert.match(zhHelp, /ψ 网格/);
  assert.match(zhHelp, /解析磁通坐标/);
  assert.match(zhHelp, /X 点/);
  assert.match(enHelp, /geometry only/i);
  assert.match(enHelp, /not EFIT/i);
  assert.match(enHelp, /real LCFS/i);
  assert.match(enHelp, /psi grid/i);
  assert.match(enHelp, /analytic flux coordinates/i);
  assert.match(enHelp, /X point/i);
});
