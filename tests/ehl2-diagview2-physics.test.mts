import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDiagView2SpectralLinePreset,
  buildDiagView2PhysicsProfile,
  buildDiagView2SpectralRelativeWeights,
  buildDiagView2TeNeProfiles,
  createDefaultDiagView2PhysicsSettings,
  DIAGVIEW2_PHYSICS_CAPABILITIES,
  DIAGVIEW2_PHYSICS_ELEMENTS,
  DIAGVIEW2_PHYSICS_SOURCE,
  DIAGVIEW2_SPECTRAL_LINE_PRESETS,
  DiagView2PhysicsValidationError,
  diagView2DisplayToPecCm3S,
  evaluateDiagView2PhysicsProfile,
  getDiagView2SpectralLinePreset,
  parseDiagView2PhysicsSettings,
  pecCm3SToDiagView2Display,
  resolveDiagView2PhysicsExecutionPlan,
  serializeDiagView2PhysicsSettings,
} from '../app/components/device-viewer/ehl2DiagView2Physics.ts';

function approximate(actual: number, expected: number, tolerance = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test('defaults reproduce the reviewed DiagView2 GUI physics controls and source identity', () => {
  const settings = createDefaultDiagView2PhysicsSettings();
  assert.deepEqual(settings.source, DIAGVIEW2_PHYSICS_SOURCE);
  assert.equal(settings.diagnosticMode, 'broadband-radiation');
  assert.equal(settings.profileSource, 'mathematical');
  assert.deepEqual(settings.broadband, { model: 'linear', coreValue: 1, edgeValue: 0 });
  assert.deepEqual(settings.plasma, {
    element: 'C',
    te: { model: 'linear', coreValue: 2_000, edgeValue: 50 },
    ne: { model: 'linear', coreValue: 5, edgeValue: 0.5 },
    impurityPercent: 1,
  });
  assert.deepEqual(settings.spectral, {
    lineLabel: 'C III 465 nm',
    element: 'C',
    chargeState: 'C2+',
    pecCm3S: 1e-12,
    ionFraction: 0.5,
    pecSource: 'gui-preset:c-iii-465',
    normalization: 'relative-line-weight',
  });
  assert.deepEqual(DIAGVIEW2_PHYSICS_ELEMENTS, ['C', 'H', 'W', 'Ne', 'Ar', 'Fe']);
});

test('all six spectral presets and the source PEC display scaling are preserved', () => {
  assert.equal(DIAGVIEW2_SPECTRAL_LINE_PRESETS.length, 6);
  const fe = getDiagView2SpectralLinePreset('Fe XVII 15.02 Å');
  assert.deepEqual(fe, {
    label: 'Fe XVII 15.02 Å', element: 'Fe', chargeState: 'Fe16+', pecCm3S: 1e-12,
    recommendedIonFraction: 0.1, pecSource: 'gui-preset:fe-xvii-1502',
  });
  const applied = applyDiagView2SpectralLinePreset(createDefaultDiagView2PhysicsSettings(), fe.label);
  assert.equal(applied.plasma.element, 'Fe');
  assert.equal(applied.spectral.chargeState, 'Fe16+');
  assert.equal(applied.spectral.ionFraction, 0.1);
  assert.equal(pecCm3SToDiagView2Display(8e-13), 8);
  assert.equal(diagView2DisplayToPecCm3S(8), 8e-13);
});

test('the four source mathematical profile equations and outside-LCFS mask are exact', () => {
  const expected = {
    linear: 0.5,
    parabolic: 0.75,
    'square-parabolic': 0.5625,
    'flat-center': (1 - 0.5 ** 4) ** 2,
  } as const;
  for (const [model, shape] of Object.entries(expected)) {
    approximate(evaluateDiagView2PhysicsProfile(model as keyof typeof expected, 0.5, 10, 2), 2 + 8 * shape);
    const result = buildDiagView2PhysicsProfile(
      [-0.25, 0, 0.25, 1, 1.01],
      { model: model as keyof typeof expected, coreValue: 10, edgeValue: 2 },
    );
    assert.deepEqual([...result.rho], [0, 0, 0.5, 1, 1]);
    approximate(result.values[2], 2 + 8 * shape);
    assert.equal(result.values[3], 2);
    assert.equal(result.values[4], 0);
  }
});

test('Te/ne retain independent profile models and source GUI density units', () => {
  const settings = createDefaultDiagView2PhysicsSettings();
  settings.plasma.te.model = 'flat-center';
  settings.plasma.ne.model = 'square-parabolic';
  const profiles = buildDiagView2TeNeProfiles([0, 0.25, 1.2], settings.plasma);
  assert.equal(profiles.teEv.model, 'flat-center');
  assert.equal(profiles.neM3.model, 'square-parabolic');
  assert.equal(profiles.teEv.values[0], 2_000);
  assert.equal(profiles.neM3.values[0], 5e19);
  assert.equal(profiles.neM3.values[2], 0);
});

test('manual spectral mode matches the source relative ADF15 density convention', () => {
  const result = buildDiagView2SpectralRelativeWeights(
    [1e19, 2e19],
    [1e-12, 3e-12],
    [0.5, 0.25],
  );
  assert.deepEqual([...result.values], [5, 15]);
  assert.equal(result.formula, 'ne_cm^-3 * PEC_cm^3/s * ion_fraction');
  assert.equal(result.unit, 'relative line weight');
  assert.equal(result.normalization, 'relative');
  assert.equal(result.usesImpurityPercent, false);
});

test('execution plans never represent ADAS, CHERAB or absolute spectral output as browser results', () => {
  const broadband = createDefaultDiagView2PhysicsSettings();
  const broadbandPlan = resolveDiagView2PhysicsExecutionPlan(broadband);
  assert.equal(broadbandPlan.runnable, true);
  assert.equal(broadbandPlan.kernel, 'broadband-mathematical');

  const spectral = { ...broadband, diagnosticMode: 'spectral-line' as const };
  const spectralPlan = resolveDiagView2PhysicsExecutionPlan(spectral);
  assert.equal(spectralPlan.runnable, true);
  assert.equal(spectralPlan.kernel, 'spectral-relative-manual');
  assert.equal(spectralPlan.usesImpurityPercent, false);

  const atomic = { ...broadband, profileSource: 'cherab-adas' as const };
  const blocked = resolveDiagView2PhysicsExecutionPlan(atomic);
  assert.equal(blocked.runnable, false);
  if (blocked.runnable) assert.fail('CHERAB/ADAS must be blocked');
  assert.deepEqual(blocked.blockedBy, ['adas-atomic-data', 'cherab-runtime']);
  assert.match(blocked.statusZh, /ADAS.*CHERAB/);
  assert.match(blocked.statusEn, /ADAS.*CHERAB/);

  assert.equal(DIAGVIEW2_PHYSICS_CAPABILITIES.adasAtomicData.availability, 'unavailable');
  assert.equal(DIAGVIEW2_PHYSICS_CAPABILITIES.cherabRadiation.availability, 'unavailable');
  assert.equal(DIAGVIEW2_PHYSICS_CAPABILITIES.spectralAbsolute.execution, 'blocked');
  assert.match(DIAGVIEW2_PHYSICS_CAPABILITIES.adasAtomicData.detailZh, /不会.*伪造/);
  assert.match(DIAGVIEW2_PHYSICS_CAPABILITIES.cherabRadiation.detailEn, /does not execute/i);
});

test('settings JSON round-trips and external input fails closed', () => {
  const settings = createDefaultDiagView2PhysicsSettings();
  assert.deepEqual(parseDiagView2PhysicsSettings(serializeDiagView2PhysicsSettings(settings)), settings);

  const unknown = structuredClone(settings) as Record<string, unknown>;
  unknown.unreviewed = true;
  assert.throws(() => parseDiagView2PhysicsSettings(unknown), /settings\.unreviewed: unknown field/);

  const badRevision = structuredClone(settings);
  (badRevision.source as { commit: string }).commit = 'unreviewed';
  assert.throws(() => parseDiagView2PhysicsSettings(badRevision), /unreviewed source revision/);

  const absolute = structuredClone(settings);
  (absolute.spectral as { normalization: string }).normalization = 'absolute';
  assert.throws(() => parseDiagView2PhysicsSettings(absolute), /absolute spectral execution is not available/);

  const badIon = structuredClone(settings);
  badIon.spectral.ionFraction = 1.01;
  assert.throws(() => parseDiagView2PhysicsSettings(badIon), /expected 0 <= value <= 1/);
  assert.throws(() => parseDiagView2PhysicsSettings('{'), DiagView2PhysicsValidationError);
  assert.throws(
    () => buildDiagView2SpectralRelativeWeights([1e19, 2e19], [1e-12], 0.5),
    /expected 2, received 1/,
  );
  assert.throws(
    () => buildDiagView2SpectralRelativeWeights([Number.NaN], 1e-12, 0.5),
    /expected a finite number/,
  );
});
