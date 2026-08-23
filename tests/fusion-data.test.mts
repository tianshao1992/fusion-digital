import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MockFusionDataProvider,
  mockFusionShots,
} from '../app/fusion-data/mockFusionData';
import {
  buildCaeFieldFrame,
  buildDiagnosticQuality,
  buildEquilibriumFrame,
  buildRadialProfiles,
  diagnosticChannels,
} from '../app/fusion-data/fusionDataDerived';
import { sourceValueToDisplay } from '../app/fusion-data/fusionDataContract';

const workspaceSource = readFileSync(new URL('../app/fusion-data/FusionDataWorkspace.tsx', import.meta.url), 'utf8');
const chartsSource = readFileSync(new URL('../app/fusion-data/FusionDataCharts.tsx', import.meta.url), 'utf8');
const embedSource = readFileSync(new URL('../app/fusion-data/ParaViewEmbed.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../app/fusion-data/page.tsx', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../app/components/charts/echartsRuntime.ts', import.meta.url), 'utf8');
const foundationSource = readFileSync(new URL('../app/data-foundation/page.tsx', import.meta.url), 'utf8');

test('mock fusion catalogue has deterministic, explicit and non-observational identity', () => {
  assert.equal(mockFusionShots.length, 8);
  assert.equal(new Set(mockFusionShots.map(({ summary }) => summary.id)).size, mockFusionShots.length);
  assert.ok(mockFusionShots.every(({ summary }) => summary.synthetic));
  assert.ok(mockFusionShots.every(({ summary }) => summary.compliance === 'mapping-preview'));
  assert.ok(mockFusionShots.every(({ summary }) => /^SYN-\d+$/.test(summary.id)));
  assert.ok(mockFusionShots.every(({ summary }) => summary.processingRun.startsWith('mock-pipeline-r')));
  assert.ok(mockFusionShots.every(({ provenance }) => provenance.generatedAt === '2026-08-23T00:00:00Z'));
});

test('every mock signal preserves an explicit MDSplus-to-IMAS mapping and independent authority', () => {
  for (const shot of mockFusionShots) {
    assert.equal(shot.signals.length, 4);
    assert.ok(shot.artifacts.some(({ authority }) => authority === 'simulated'));
    assert.ok(shot.signals.some(({ authority }) => authority === 'reconstructed'));
    for (const signal of shot.signals) {
      assert.equal(signal.points.length, 81);
      assert.equal(signal.imas.ddVersion, '4.1.0');
      assert.ok(signal.imas.ids.length > 0 && signal.imas.path.length > 0);
      assert.equal(signal.imas.homogeneousTime, 1);
      assert.ok(signal.sourceUnit.length > 0 && signal.unit.length > 0);
      assert.ok(signal.sourceToValueScale > 0);
      assert.equal(signal.valueSpace, 'display');
      assert.equal(signal.samplePolicy, 'nearest');
      assert.equal(signal.connectAcrossGaps, false);
      assert.equal(signal.mdsplus.access, 'read-only-gateway');
      assert.equal(signal.mdsplus.shot, shot.summary.pulse);
      assert.equal(signal.mdsplus.resolvedShot, shot.summary.pulse);
      assert.notEqual(signal.mdsplus.resolvedShot, 0, 'latest-shot aliases must be resolved before reaching the UI');
      assert.doesNotMatch(JSON.stringify(signal.mdsplus), /https?:\/\//i, 'browser fixtures must not contain a raw MDSplus endpoint');
    }
  }

  const mappings = Object.fromEntries(mockFusionShots[0].signals.map((signal) => [signal.id, `${signal.imas.ids}/${signal.imas.path}`]));
  assert.equal(mappings.ip, 'summary/global_quantities/ip/value');
  assert.equal(mappings.ne_line, 'summary/line_average/n_e/value');
  assert.equal(mappings.w_thermal, 'summary/global_quantities/energy_thermal/value');
  assert.equal(mappings.p_ohm, 'summary/global_quantities/power_ohm/value');

  const [ip, density, energy, heating] = mockFusionShots[0].signals;
  assert.equal(sourceValueToDisplay(1_000_000, ip), 1);
  assert.equal(sourceValueToDisplay(6e19, density), 6);
  assert.equal(sourceValueToDisplay(1_000_000, energy), 1);
  assert.equal(sourceValueToDisplay(1_000_000, heating), 1);
});

test('mock provider applies catalogue filtering, shot identity and sliced reads through one contract', async () => {
  const provider = new MockFusionDataProvider();
  const densityShots = await provider.listShots({ search: 'density' });
  assert.ok(densityShots.some(({ id }) => id === 'SYN-10423'));
  const reference = mockFusionShots[0].summary;
  const signals = await provider.loadSignals({ shot: reference, signalIds: ['ip'], timeRange: [1, 1.2] });
  assert.equal(signals.length, 1);
  assert.equal(signals[0].points.length, 5);
  assert.ok(signals[0].points.every(({ time }) => time >= 1 && time <= 1.2));
  const downsampled = await provider.loadSignals({ shot: reference, signalIds: ['ip'], maxPoints: 3 });
  assert.equal(downsampled[0].points.length, 3);
  assert.equal(downsampled[0].points[0].time, 0);
  assert.equal(downsampled[0].points.at(-1)?.time, 4);
  assert.equal((await provider.listArtifacts(reference)).length, 1);
});

test('derived profile, equilibrium, quality and CAE fixtures stay finite and time-addressable', () => {
  const shot = mockFusionShots[2];
  const index = 28;
  const profiles = buildRadialProfiles(shot, index);
  assert.equal(profiles.availability.available, true);
  assert.equal(profiles.rho.length, 31);
  assert.equal(profiles.rho[0], 0);
  assert.equal(profiles.rho.at(-1), 1);
  assert.ok([...profiles.electronTemperature, ...profiles.electronDensity, ...profiles.safetyFactor].every(Number.isFinite));

  const equilibrium = buildEquilibriumFrame(shot, index);
  assert.equal(equilibrium.availability.available, true);
  assert.equal(equilibrium.psi.length, 43 * 43);
  assert.deepEqual(equilibrium.boundary[0], equilibrium.boundary.at(-1), 'LCFS fallback must be a closed outline');
  assert.ok(equilibrium.psi.every((value) => value.every(Number.isFinite)));

  const quality = buildDiagnosticQuality(shot);
  assert.equal(quality.length, diagnosticChannels.length * shot.signals[0].points.length);
  assert.ok(quality.some(({ quality: state }) => state === 'missing'));
  assert.ok(quality.some(({ quality: state }) => state === 'warning'));

  const cae = buildCaeFieldFrame(shot, index);
  assert.equal(cae.availability.available, true);
  assert.equal(cae.values.length, 34 * 30);
  assert.ok(cae.max > cae.min);
  assert.equal(cae.field, 'von_mises_stress');
  assert.equal(cae.unit, 'MPa');

  const missingIndex = 44;
  const unavailableProfiles = buildRadialProfiles(shot, missingIndex);
  const unavailableEquilibrium = buildEquilibriumFrame(shot, missingIndex);
  const unavailableCae = buildCaeFieldFrame(shot, missingIndex);
  assert.equal(unavailableProfiles.availability.available, false);
  assert.equal(unavailableEquilibrium.availability.available, false);
  assert.equal(unavailableCae.availability.available, false);
  assert.equal(unavailableProfiles.availability.quality, 'missing');
  assert.equal(unavailableEquilibrium.availability.quality, 'missing');
  assert.equal(unavailableCae.availability.quality, 'missing');
  assert.deepEqual(unavailableProfiles.rho, []);
  assert.deepEqual(unavailableEquilibrium.psi, []);
  assert.deepEqual(unavailableCae.values, []);
});

test('workspace shares one time cursor across ECharts panels and the ParaView adapter', () => {
  assert.match(workspaceSource, /selectedIndex=\{selectedIndex\}/);
  assert.match(workspaceSource, /QualityHeatmap[\s\S]*?onSeek=\{setSelectedIndex\}/);
  assert.match(workspaceSource, /ParaViewEmbed[\s\S]*?selectedTime=\{selectedTime\}/);
  assert.match(workspaceSource, /connectNulls:\s*false/);
  assert.match(workspaceSource, /type:\s*'inside'/);
  assert.match(chartsSource, /keepFallbackAccessible/g);
  assert.match(runtimeSource, /LineChart/);
  assert.match(runtimeSource, /AxisPointerComponent/);
});

test('ParaView support is a trusted build-time trame shell with a visible disconnected fallback', () => {
  assert.match(pageSource, /NEXT_PUBLIC_PARAVIEW_TRAME_URL/);
  assert.match(pageSource, /url\.protocol === 'https:'/);
  assert.match(embedSource, /sandbox="allow-downloads allow-forms allow-pointer-lock allow-scripts allow-same-origin"/);
  assert.match(embedSource, /postMessage\([\s\S]*?viewerOrigin\)/);
  assert.match(embedSource, /event\.origin !== viewerOrigin/);
  assert.match(embedSource, /event\.source !== iframeRef\.current\?\.contentWindow/);
  assert.match(embedSource, /fusiondigital:set-context/);
  assert.match(embedSource, /PARAVIEW \/ TRAME · DISCONNECTED/);
  assert.doesNotMatch(embedSource, /<input[^>]+(?:url|endpoint)/i, 'users must not provide arbitrary viewer endpoints');
});

test('data foundation exposes the new workspace and synthetic authority is never hidden', () => {
  assert.match(foundationSource, /href="\/fusion-data"/);
  assert.match(workspaceSource, /SYNTHETIC DATA ONLY/);
  assert.match(workspaceSource, /MOCK \/ SYNTHETIC/);
  assert.match(workspaceSource, /They are not ITER or facility observations/);
});
