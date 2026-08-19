import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  accessMeta,
  dataCategoryMeta,
  dataFoundationCutoff,
  dataFoundationRecords,
  dataFoundationRoute,
  dataLayerMeta,
  fusionDataCharacteristics,
  maturityMeta,
  type DataFoundationRecord,
} from '../app/data-foundation/dataFoundation';

const HAN = /\p{Script=Han}/u;
const chartSource = readFileSync(new URL('../app/data-foundation/DataFoundationCharts.tsx', import.meta.url), 'utf8');
const scientificChartSource = readFileSync(new URL('../app/components/charts/ScientificChart.tsx', import.meta.url), 'utf8');
const echartsRuntimeSource = readFileSync(new URL('../app/components/charts/echartsRuntime.ts', import.meta.url), 'utf8');
const architectureChartSource = chartSource.slice(chartSource.indexOf('export function DataArchitectureChart'), chartSource.indexOf('export function DataLandscapeChart'));
const landscapeChartSource = chartSource.slice(chartSource.indexOf('export function DataLandscapeChart'));

const byId = (id: string): DataFoundationRecord => {
  const record = dataFoundationRecords.find((candidate) => candidate.id === id);
  assert.ok(record, `missing required data-foundation record: ${id}`);
  return record;
};

test('fusion data-foundation catalogue is broad, unique and evidence-backed', () => {
  assert.ok(dataFoundationRecords.length >= 56, 'catalogue must retain at least 56 independently sourced records');
  assert.equal(new Set(dataFoundationRecords.map(({ id }) => id)).size, dataFoundationRecords.length, 'record IDs must be unique');

  assert.deepEqual(
    new Set(dataFoundationRecords.map(({ category }) => category)),
    new Set(Object.keys(dataCategoryMeta)),
    'all six evidence categories must be represented',
  );
  assert.equal(Object.keys(dataCategoryMeta).length, 6);
  assert.equal(Object.keys(accessMeta).length, 7, 'open data, licensed standards and controlled archives must not share one access label');

  const representedLayers = new Set(dataFoundationRecords.flatMap(({ layers }) => layers));
  assert.deepEqual(representedLayers, new Set(Object.keys(dataLayerMeta)), 'all eight data-lifecycle layers must be represented');
  assert.equal(Object.keys(dataLayerMeta).length, 8);

  for (const record of dataFoundationRecords) {
    assert.match(record.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${record.id} must be a stable slug`);
    assert.ok(record.layers.length > 0, `${record.id} must declare at least one lifecycle layer`);
    assert.equal(new Set(record.layers).size, record.layers.length, `${record.id} repeats a lifecycle layer`);
    assert.ok(record.sources.length > 0, `${record.id} must cite at least one primary source`);
    assert.ok(record.interfaces.length > 0, `${record.id} must expose its interface or data contract`);
    assert.ok(record.technologies.length > 0, `${record.id} must identify its implementation technology`);
    assert.ok(record.devices.length > 0, `${record.id} must state its facility or application scope`);
    assert.ok(record.interoperability >= 1 && record.interoperability <= 5, `${record.id} interoperability must use the 1-5 scale`);
    assert.ok(record.lifecycleReach >= 1 && record.lifecycleReach <= 5, `${record.id} lifecycle reach must use the 1-5 scale`);
    assert.ok(record.boundary.length > 20 && record.boundaryEn.length > 20, `${record.id} must document a substantive usage boundary`);
    assert.match(record.scope, HAN, `${record.id} must provide an authored Chinese scope`);
    assert.match(record.objects, HAN, `${record.id} must provide authored Chinese data objects`);
    assert.match(record.boundary, HAN, `${record.id} must provide an authored Chinese applicability boundary`);

    for (const source of record.sources) {
      assert.match(source.url, /^https:\/\//, `${record.id} source must use HTTPS: ${source.url}`);
      assert.ok(source.label.length > 0 && source.labelEn.length > 0, `${record.id} source labels must be bilingual`);
    }
  }

  assert.equal(dataFoundationCutoff, '2026-08-19');
  assert.ok(fusionDataCharacteristics.every(({ zh, detail, implication }) => HAN.test(`${zh}${detail}${implication}`)));
  assert.ok(dataFoundationRoute.every(({ zh, deliverable }) => HAN.test(`${zh}${deliverable}`)));
});

test('English catalogue and taxonomy are authored English rather than leaked Chinese fallbacks', () => {
  const englishPresentation = {
    categoryLabels: Object.values(dataCategoryMeta).map(({ en }) => en),
    layerLabels: Object.values(dataLayerMeta).flatMap(({ en, shortEn }) => [en, shortEn]),
    accessLabels: Object.values(accessMeta).map(({ en }) => en),
    maturityLabels: Object.values(maturityMeta).map(({ en }) => en),
    characteristics: fusionDataCharacteristics.flatMap(({ en, detailEn, implicationEn }) => [en, detailEn, implicationEn]),
    route: dataFoundationRoute.flatMap(({ en, tools, deliverableEn }) => [en, tools, deliverableEn]),
    records: dataFoundationRecords.flatMap((record) => [
      record.name,
      record.organizationEn,
      record.regionEn,
      record.scopeEn,
      record.objectsEn,
      record.boundaryEn,
      ...record.interfaces,
      ...record.technologies,
      ...record.devices,
      ...record.sources.map(({ labelEn }) => labelEn),
    ]),
  };

  assert.doesNotMatch(JSON.stringify(englishPresentation), HAN);
  assert.equal(fusionDataCharacteristics.length, 12, 'the data-characteristics summary must retain all twelve fusion-specific traits');
  assert.equal(new Set(fusionDataCharacteristics.map(({ id }) => id)).size, fusionDataCharacteristics.length);
});

test('L0-L7 route is complete, ordered and maps one-to-one to the lifecycle taxonomy', () => {
  assert.deepEqual(dataFoundationRoute.map(({ id }) => id), ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
  assert.equal(dataFoundationRoute.length, Object.keys(dataLayerMeta).length);
  assert.deepEqual(Object.values(dataLayerMeta).map(({ no }) => no), dataFoundationRoute.map(({ id }) => id));
  assert.ok(dataFoundationRoute.every(({ tools, deliverable, deliverableEn }) => tools && deliverable && deliverableEn));
});

test('data-foundation charts retain mobile and assistive-technology fallbacks', () => {
  assert.match(chartSource, /query:\s*\{\s*maxWidth:\s*700\s*\}/, 'the eight-layer graph must provide a compact mobile layout');
  assert.match(chartSource, /const compactNodes = nodes\.map/, 'mobile graph nodes must be explicitly rearranged');
  assert.equal((chartSource.match(/keepFallbackAccessible/g) ?? []).length, 2, 'both data charts must keep their semantic tables available to assistive technology');
  assert.match(scientificChartSource, /ready && !keepFallbackAccessible/, 'the shared chart host must not aria-hide an opted-in semantic fallback');
});

test('architecture nodes render bilingual labels inside unclipped desktop and mobile bounds', () => {
  assert.ok(architectureChartSource.length > 0, 'the architecture chart source must be discoverable');
  assert.match(chartSource, /const ROUTE_NODE_LABELS = \{[\s\S]*?L0:[\s\S]*?L7:/, 'all lifecycle nodes need authored compact labels');
  assert.match(architectureChartSource, /label:\s*\{\s*show:\s*true,\s*position:\s*'inside'/, 'graph-node labels must be explicitly visible');
  assert.match(architectureChartSource, /top:\s*66,[\s\S]*?bottom:\s*62,/, 'desktop graph extrema need symbol-safe vertical gutters');
  assert.match(architectureChartSource, /query:\s*\{\s*maxWidth:\s*700\s*\}[\s\S]*?top:\s*40,[\s\S]*?bottom:\s*40,/, 'compact graph extrema need mobile-safe vertical gutters');
  assert.match(architectureChartSource, /x:\s*280,/, 'compact graph columns must use a canvas-proportional x span so ECharts does not collapse symbol height');
  assert.match(architectureChartSource, /confine:\s*true/, 'tooltips must stay inside the chart boundary');
});

test('architecture SSR fallback includes the governed control branch as well as L0-L7', () => {
  assert.match(architectureChartSource, /ARCHITECTURE_BRANCH_ROWS\.map/, 'the semantic fallback must include hot path, shadow service and release gate rows');
  assert.match(chartSource, /en:\s*'Deterministic control hot path'/);
  assert.match(chartSource, /en:\s*'Read-only shadow services'/);
  assert.match(chartSource, /en:\s*'Evidence and release gate'/);
});

test('evidence-landscape nodes keep their names visible and project the active language', () => {
  assert.ok(landscapeChartSource.length > 0, 'the evidence-landscape chart source must be discoverable');
  assert.match(landscapeChartSource, /name:\s*record\.name/, 'every evidence point must retain its catalogue name');
  assert.match(
    landscapeChartSource,
    /label:\s*\{[\s\S]*?show:\s*true/,
    'scatter-point names must remain visible without requiring hover',
  );
  assert.match(landscapeChartSource, /formatter:\s*['"]\{b\}['"]/, 'the visible label must project each point name');
  assert.match(landscapeChartSource, /organization:\s*en\s*\?\s*record\.organizationEn\s*:\s*record\.organization/);
  assert.match(landscapeChartSource, /scope:\s*en\s*\?\s*record\.scopeEn\s*:\s*record\.scope/);
  assert.match(landscapeChartSource, /name:\s*en\s*\?\s*'Lifecycle reach →'\s*:\s*'生命周期覆盖 →'/);
  assert.match(landscapeChartSource, /name:\s*en\s*\?\s*'Semantic interoperability →'\s*:\s*'语义互操作 →'/);
  assert.match(landscapeChartSource, /\},\s*\[en,\s*palette\]\);/, 'changing locale must rebuild the ECharts option');
});

test('evidence-landscape keeps a complete SSR fallback, no generic placeholder and a mobile chart layout', () => {
  assert.match(
    landscapeChartSource,
    /fallback=\{<table[\s\S]*?<caption>\{en\s*\?\s*'Fusion-data evidence landscape'\s*:\s*'聚变数据证据版图'\}[\s\S]*?dataFoundationRecords\.map/,
    'the server-rendered fallback must expose the complete bilingual evidence catalogue',
  );
  assert.match(landscapeChartSource, /keepFallbackAccessible/, 'the fallback table must remain available after chart hydration');
  assert.doesNotMatch(landscapeChartSource, /Technical annotation|通用图表占位|generic placeholder/i);
  assert.match(echartsRuntimeSource, /LegendComponent/, 'the category legend must be registered in the tree-shaken ECharts runtime');
  assert.match(echartsRuntimeSource, /PolarComponent/, 'polar axes must be registered for charts that use radiusAxis or angleAxis');
  assert.match(
    landscapeChartSource,
    /media:\s*\[[\s\S]*?query:\s*\{\s*maxWidth:\s*700\s*\}/,
    'the dense evidence landscape needs an explicit compact-screen ECharts option',
  );
});

test('catalogue preserves the professional boundary between storage, semantics, access, lineage and assurance', () => {
  const imas = byId('imas-data-dictionary');
  assert.equal(imas.category, 'semantic-standard');
  assert.ok(imas.layers.includes('semantic-exchange'));
  assert.match(imas.boundaryEn, /semantic model/i);
  assert.match(imas.boundaryEn, /not a replacement for facility raw archives/i);

  const mdsplus = byId('mdsplus');
  assert.equal(mdsplus.category, 'archive-access');
  assert.ok(mdsplus.layers.includes('source-archive'));
  assert.match(mdsplus.boundaryEn, /permits writes and deletion/i);
  assert.match(mdsplus.boundaryEn, /locked snapshot and an independent hash manifest/i);

  const uda = byId('uda');
  assert.equal(uda.category, 'archive-access');
  assert.ok(uda.layers.includes('federated-access'));
  assert.match(uda.boundaryEn, /transport and abstraction layer/i);
  assert.match(uda.boundaryEn, /machine mapping remain provider responsibilities/i);

  const physicalStorage = byId('scientific-storage-formats');
  assert.equal(physicalStorage.category, 'archive-access');
  assert.deepEqual(physicalStorage.technologies, ['HDF5', 'Zarr', 'Parquet']);
  assert.match(physicalStorage.boundaryEn, /how data are stored, not what they mean in fusion physics/i);
  assert.match(physicalStorage.boundaryEn, /do not inherently provide immutability/i);
  assert.match(physicalStorage.boundaryEn, /IMAS semantics, quality, authorization, provenance and Object-Lock\/WORM retention remain separate responsibilities/i);
  const hdf5Users = dataFoundationRecords.filter(({ interfaces }) => interfaces.some((value) => /HDF5/i.test(value)));
  assert.ok(hdf5Users.length >= 3, 'HDF5 must be represented as a serialization/backend interface');
  assert.ok(hdf5Users.some(({ id }) => id === 'imas-python'));
  assert.ok(hdf5Users.some(({ id }) => id === 'openstep'));

  const provenance = byId('fusionprov');
  assert.equal(provenance.category, 'governance-report');
  assert.ok(provenance.interfaces.some((value) => value.startsWith('PROV-')));
  assert.match(provenance.boundaryEn, /not whether it is physically correct/i);

  const vvuq = byId('asme-vvuq');
  assert.equal(vvuq.category, 'governance-report');
  assert.equal(vvuq.access, 'licensed');
  assert.match(vvuq.boundaryEn, /licence or purchase/i);
  assert.match(vvuq.boundaryEn, /do not replace domain validation/i);

  const gum = byId('jcgm-gum');
  assert.equal(gum.category, 'governance-report');
  assert.equal(gum.access, 'open');
  assert.match(gum.boundaryEn, /general metrology framework/i);

  const disruptionPy = byId('disruptionpy');
  assert.deepEqual(disruptionPy.devices, ['Alcator C-Mod', 'DIII-D', 'EAST', 'HBT-EP', 'MAST']);
  assert.match(disruptionPy.boundaryEn, /framework is open source, not the underlying experimental data/i);

  const disruptionBench = byId('disruptionbench');
  assert.equal(disruptionBench.category, 'workflow-library');
  assert.match(disruptionBench.objectsEn, /does not ship the underlying experimental data/i);

  const mgkdb = byId('mgkdb');
  assert.equal(mgkdb.access, 'controlled');
  assert.match(mgkdb.boundaryEn, /NERSC account and separate credentials/i);

  const itpaConfinement = byId('itpa-confinement-pedestal');
  assert.equal(itpaConfinement.access, 'consortium');
  assert.match(itpaConfinement.boundaryEn, /does not establish a current public service or download route/i);

  const openAdas = byId('open-adas');
  assert.equal(openAdas.access, 'open-conditional');
  assert.match(openAdas.boundaryEn, /personal use/i);
  assert.match(openAdas.boundaryEn, /written permission/i);

  const rawSnapshot = dataFoundationRoute.find(({ id }) => id === 'L1')!;
  assert.match(rawSnapshot.tools, /WRITE_ONCE/);
  assert.match(rawSnapshot.tools, /Object Lock\/WORM/);
  assert.match(rawSnapshot.tools, /SHA-256 manifest/);
  assert.match(rawSnapshot.deliverableEn, /retention lock/i);
  assert.match(rawSnapshot.deliverableEn, /verified recovery/i);

  const iaeaLake = byId('iaea-fusion-data-lake');
  assert.equal(iaeaLake.category, 'open-data');
  assert.equal(iaeaLake.maturity, 'emerging');
  assert.match(iaeaLake.boundaryEn, /proof of concept/i);
  assert.match(iaeaLake.boundaryEn, /not a production lake containing all global raw data/i);
});
