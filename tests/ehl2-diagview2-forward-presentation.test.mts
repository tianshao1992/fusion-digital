import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDiagView2ForwardFigureData,
  diagView2ForwardFigureToJson,
  diagView2ForwardFigureToMatlab,
  diagView2ForwardFigureToSvg,
} from '../app/components/device-viewer/ehl2DiagView2ForwardPresentation.ts';
import {
  buildDiagView2MathProfile,
  type DiagView2GeqdskData,
  type DiagView2MathProfile,
} from '../app/components/device-viewer/ehl2DiagView2Core.ts';
import {
  buildDiagView2SpectralRelativeWeights,
  createDefaultDiagView2PhysicsSettings,
} from '../app/components/device-viewer/ehl2DiagView2Physics.ts';

function linspace(start: number, end: number, count: number): Float64Array {
  return Float64Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
}

function fixture(caseName = 'EHL-2 presentation <&"\' test'): DiagView2GeqdskData {
  const nw = 21;
  const nh = 17;
  const rM = linspace(0.5, 1.5, nw);
  const zM = linspace(-1, 1, nh);
  const psiNorm = new Float64Array(nw * nh).fill(0.25);
  return {
    caseName,
    nw,
    nh,
    rdimM: 1,
    zdimM: 2,
    rcentrM: 1,
    rleftM: 0.5,
    zmidM: 0,
    rmaxisM: 1.02,
    zmaxisM: 0.18,
    simag: 0,
    sibry: 1,
    bcentrT: 2,
    currentA: 100_000,
    fpol: new Float64Array(nw).fill(1),
    pressure: new Float64Array(nw),
    ffprim: new Float64Array(nw),
    pprime: new Float64Array(nw),
    psirz: Float64Array.from(psiNorm),
    qpsi: new Float64Array(nw).fill(1),
    rM,
    zM,
    psiNorm,
    boundaryRM: Float64Array.from([1.3, 1.212, 1, 0.788, 0.7, 0.788, 1, 1.212]),
    boundaryZM: Float64Array.from([0, 0.424, 0.6, 0.424, 0, -0.424, -0.6, -0.424]),
    limiterRM: new Float64Array(),
    limiterZM: new Float64Array(),
    trailingTokenCount: 0,
  };
}

test('figure data selects the nearest magnetic-axis Z slice and applies the LCFS mask to Te/ne', () => {
  const gfile = fixture();
  const settings = createDefaultDiagView2PhysicsSettings();
  const profile = buildDiagView2MathProfile(
    gfile,
    settings.broadband.model,
    settings.broadband.coreValue,
    settings.broadband.edgeValue,
  );
  const figure = buildDiagView2ForwardFigureData(gfile, settings, profile);

  assert.equal(figure.radial.selectedZIndex, 9);
  assert.equal(figure.radial.selectedZM, 0.125);
  assert.ok(Math.abs(figure.radial.deltaZM + 0.055) < 1e-12);
  assert.equal(figure.radial.rM.length, gfile.nw);
  assert.equal(figure.radial.psiNorm[0], 0.25);
  assert.equal(figure.radial.rho[0], 0.5);
  assert.equal(figure.radial.teEv[0], 0, 'LCFS polygon masks a low-psi cell outside the main plasma');
  assert.equal(figure.radial.neM3[0], 0);
  assert.ok(figure.radial.teEv[10] > 0);
  assert.ok(figure.radial.neM3[10] > 1e19);
  assert.equal(figure.authority, 'virtual-software');
  assert.equal(figure.metadata.normalization, 'relative-only');
  assert.equal(figure.metadata.experimentalMeasurement, false);
  assert.equal(figure.metadata.absoluteCalibration, false);
  assert.equal(figure.metadata.physicsSettings.plasma.ne.coreValue, 5);
  assert.ok(Object.isFrozen(figure));
  assert.ok(Object.isFrozen(figure.metadata));
  assert.ok(Object.isFrozen(figure.metadata.physicsSettings.plasma.ne));
  assert.ok(Object.isFrozen(figure.radial.emission));
});

test('R-Z and LCFS sampling is deterministic, bounded and honestly labelled', () => {
  const gfile = fixture();
  const settings = createDefaultDiagView2PhysicsSettings();
  const profile = buildDiagView2MathProfile(gfile, 'linear', 1, 0);
  const first = buildDiagView2ForwardFigureData(gfile, settings, profile, {
    maxGridCells: 50,
    maxBoundaryPoints: 4,
  });
  const second = buildDiagView2ForwardFigureData(gfile, settings, profile, {
    maxGridCells: 50,
    maxBoundaryPoints: 4,
  });

  assert.equal(first.grid.coverage, 'deterministic-strided-sample');
  assert.equal(first.grid.isDownsampled, true);
  assert.ok(first.grid.sampledCellCount <= 50);
  assert.equal(first.grid.sourceCellCount, 357);
  assert.ok(first.grid.strideR > 1 || first.grid.strideZ > 1);
  assert.equal(first.grid.rM.at(0), gfile.rM[0]);
  assert.equal(first.grid.rM.at(-1), gfile.rM.at(-1));
  assert.equal(first.grid.zM.at(0), gfile.zM[0]);
  assert.equal(first.grid.zM.at(-1), gfile.zM.at(-1));
  assert.deepEqual(first.grid, second.grid);
  assert.equal(first.lcfs.isDownsampled, true);
  assert.ok(first.lcfs.sampledPointCount <= 4);
  assert.equal(first.lcfs.rM.at(0), gfile.boundaryRM[0]);
  assert.equal(first.lcfs.rM.at(-1), gfile.boundaryRM.at(-1));
});

test('spectral presentation preserves the relative-line-weight boundary', () => {
  const gfile = fixture();
  const defaults = createDefaultDiagView2PhysicsSettings();
  const settings = {
    ...defaults,
    diagnosticMode: 'spectral-line' as const,
  };
  const ne = buildDiagView2MathProfile(
    gfile,
    settings.plasma.ne.model,
    settings.plasma.ne.coreValue,
    settings.plasma.ne.edgeValue,
  );
  const weights = buildDiagView2SpectralRelativeWeights(
    Float64Array.from(ne.values, (value) => value * 1e19),
    settings.spectral.pecCm3S,
    settings.spectral.ionFraction,
  );
  const profile: DiagView2MathProfile = {
    ...ne,
    values: weights.values,
    unit: 'relative-line-weight',
  };
  const figure = buildDiagView2ForwardFigureData(gfile, settings, profile);

  assert.equal(figure.metadata.executionKernel, 'spectral-relative-manual');
  assert.equal(figure.metadata.fieldUnit, 'relative-line-weight');
  assert.equal(figure.metadata.normalization, 'relative-only');
  assert.ok(figure.radial.emission.some((value) => value > 0));
  assert.throws(
    () => buildDiagView2ForwardFigureData(gfile, settings, { ...profile, unit: 'relative-emissivity' }),
    /profile\.unit: expected relative-line-weight/,
  );
});

test('JSON, MATLAB and SVG exports contain complete scientific metadata and no non-finite numbers', () => {
  const gfile = fixture();
  const settings = createDefaultDiagView2PhysicsSettings();
  const figure = buildDiagView2ForwardFigureData(
    gfile,
    settings,
    buildDiagView2MathProfile(gfile, 'parabolic', 2, 0.1),
    { maxGridCells: 50 },
  );
  const json = diagView2ForwardFigureToJson(figure);
  const matlab = diagView2ForwardFigureToMatlab(figure);
  const svg = diagView2ForwardFigureToSvg(figure);

  const parsed = JSON.parse(json) as typeof figure;
  assert.equal(parsed.schema, 'fusiondigital.diagview2-forward-figure');
  assert.equal(parsed.metadata.sourceCommit, '868d74d5e0e6c9abaec0eb623bcdd13ead771c79');
  assert.equal(parsed.grid.sourceDimensions.nw, 21);
  assert.equal(parsed.grid.coverage, 'deterministic-strided-sample');
  assert.match(matlab, /VIRTUAL SOFTWARE \/ RELATIVE ONLY \/ NOT AN EXPERIMENTAL MEASUREMENT/);
  assert.match(matlab, /reshape\(grid_emission_r_major, \[numel\(grid_z\), numel\(grid_r\)\]\)/);
  assert.match(matlab, /plot\(lcfs_r,lcfs_z/);
  assert.match(matlab, /plot\(axis_r,axis_z/);
  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(svg, /width="1440" height="900" viewBox="0 0 1440 900"/);
  assert.match(svg, /id="rz-heatmap"/);
  assert.match(svg, /id="lcfs"/);
  assert.match(svg, /id="magnetic-axis"/);
  assert.match(svg, /EHL-2 presentation &lt;&amp;&quot;&apos; test/);
  assert.match(svg, /deterministic sample/);
  for (const output of [json, matlab, svg]) {
    assert.doesNotMatch(output, /\b(?:NaN|Infinity)\b/);
  }
});

test('presentation fails closed on non-finite and non-browser inputs', () => {
  const gfile = fixture();
  const settings = createDefaultDiagView2PhysicsSettings();
  const profile = buildDiagView2MathProfile(gfile, 'linear', 1, 0);
  const badValues = Float64Array.from(profile.values);
  badValues[3] = Number.NaN;
  assert.throws(
    () => buildDiagView2ForwardFigureData(gfile, settings, { ...profile, values: badValues }),
    /profile\.values\[3\]: expected a finite number/,
  );
  assert.throws(
    () => buildDiagView2ForwardFigureData(gfile, { ...settings, profileSource: 'cherab-adas' }, profile),
    /CHERAB\/ADAS is not a browser-runnable presentation source/,
  );
});
