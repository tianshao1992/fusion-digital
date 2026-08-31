#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const SCHEMA_VERSION = 'fusiondigital.exl50u.sensor-points.v1';
const MANIFEST_SCHEMA_VERSION = 'fusiondigital.exl50u.sensor-points-package.v1';
const AS_OF = '2026-08-31';
const CAD_ELEVATION_DATUM_MM = 4_805;
const EXPECTED_COUNTS = Object.freeze({ LD: 42, PF: 7, TF: 14, TF_V: 12, SMOKE: 1 });
const EXPECTED_RECORD_COUNT = Object.values(EXPECTED_COUNTS).reduce((sum, count) => sum + count, 0);
const EXPECTED_SOURCE_SHA256 = 'DDF9CAC621BF7DCF26F70A879F65381B9D0944AD02CDB460E7F1660F5B563789';
const EXPECTED_MODEL_BOUNDS_MM = Object.freeze({
  min: Object.freeze([-2_915.914493, -2_915.914493, -4_804.999999]),
  max: Object.freeze([2_915.914493, 2_915.914493, 2_502]),
});

const sourcePath = process.argv[2];
const outputPath = resolve(process.argv[3] ?? 'public/models/exl50u-sensor-points-v1/sensor-points.json');
const manifestPath = resolve(dirname(outputPath), 'manifest.json');

if (!sourcePath) {
  throw new Error('usage: node scripts/exl50u/build_sensor_points.mjs <sensor_positions.json> [output.json]');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function clean(value) {
  if (Math.abs(value) < 5e-13) return 0;
  return Number(value.toFixed(12));
}

function familyFor(sourceKey) {
  if (/^LD\d{3}$/.test(sourceKey)) return 'LD';
  if (/^PF\d+$/.test(sourceKey)) return 'PF';
  if (/^TF\d+_V$/.test(sourceKey)) return 'TF_V';
  if (/^TF\d+$/.test(sourceKey)) return 'TF';
  if (sourceKey === '烟雾上（一圈）') return 'SMOKE';
  throw new Error(`unsupported EXL-50U sensor key: ${sourceKey}`);
}

function webPoint(hMm, rMm, phiDeg) {
  const phi = phiDeg * Math.PI / 180;
  return [
    clean(rMm * Math.cos(phi) / 1_000),
    clean((hMm - CAD_ELEVATION_DATUM_MM) / 1_000),
    clean(-rMm * Math.sin(phi) / 1_000),
  ];
}

function insideCadBounds(webMetres) {
  const sourceMillimetres = [webMetres[0] * 1_000, -webMetres[2] * 1_000, webMetres[1] * 1_000];
  return sourceMillimetres.every((value, axis) => (
    value >= EXPECTED_MODEL_BOUNDS_MM.min[axis] - 1e-6
    && value <= EXPECTED_MODEL_BOUNDS_MM.max[axis] + 1e-6
  ));
}

const sourceBytes = await readFile(resolve(sourcePath));
const sourceHash = sha256(sourceBytes);
if (sourceHash !== EXPECTED_SOURCE_SHA256) {
  throw new Error(`sensor_positions.json SHA-256 drift: ${sourceHash}`);
}

const source = JSON.parse(sourceBytes.toString('utf8'));
if (!source || typeof source !== 'object' || Array.isArray(source)) {
  throw new Error('sensor_positions.json must contain one object map');
}

const sourceRows = Object.entries(source);
if (sourceRows.length !== EXPECTED_RECORD_COUNT) {
  throw new Error(`expected ${EXPECTED_RECORD_COUNT} sensor rows, received ${sourceRows.length}`);
}

const coordinateKeys = new Set();
const sourceKeys = new Set();
const familyCounts = { LD: 0, PF: 0, TF: 0, TF_V: 0, SMOKE: 0 };
const records = sourceRows.map(([sourceKey, tuple], index) => {
  if (sourceKeys.has(sourceKey)) throw new Error(`duplicate sensor key: ${sourceKey}`);
  sourceKeys.add(sourceKey);
  if (!Array.isArray(tuple) || tuple.length !== 3
    || tuple.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`${sourceKey} must be a finite [H_mm, R_mm, phi_deg] tuple`);
  }
  const [hMm, rMm, phiDeg] = tuple;
  if (hMm < 0 || hMm > 20_000 || rMm <= 0 || rMm > 10_000 || phiDeg < 0 || phiDeg >= 360) {
    throw new Error(`${sourceKey} is outside the reviewed cylindrical coordinate envelope`);
  }
  const coordinateKey = JSON.stringify(tuple);
  if (coordinateKeys.has(coordinateKey)) throw new Error(`${sourceKey} duplicates an existing coordinate`);
  coordinateKeys.add(coordinateKey);
  const family = familyFor(sourceKey);
  familyCounts[family] += 1;
  const webMetres = webPoint(hMm, rMm, phiDeg);
  if (!insideCadBounds(webMetres)) throw new Error(`${sourceKey} falls outside the reviewed EXL-50U CAD bounds`);
  return {
    id: `EXL50U-SP-${String(index + 1).padStart(3, '0')}`,
    sourceIndex: index + 1,
    sourceKey,
    displayName: sourceKey,
    family,
    status: 'active',
    sourceTuple: { hMm, rMm, phiDeg },
    webMetres,
  };
});

if (JSON.stringify(familyCounts) !== JSON.stringify(EXPECTED_COUNTS)) {
  throw new Error(`sensor family counts drifted: ${JSON.stringify(familyCounts)}`);
}

const dataset = {
  schemaVersion: SCHEMA_VERSION,
  id: 'exl50u-host-sensor-points-v1',
  asOf: AS_OF,
  deviceId: 'EXL-50U',
  authority: 'user-provided-nominal-installation-points',
  source: {
    fileName: 'sensor_positions.json',
    bytes: sourceBytes.byteLength,
    sha256: sourceHash,
  },
  publication: {
    precisePointPublicationAuthorized: true,
    authorizedAt: AS_OF,
    publicDualEndpoint: true,
    sourceGeometryIncluded: false,
    browserMutationAuthoritative: false,
    engineeringUseAllowed: false,
  },
  coordinateSystem: {
    id: 'EXL50U_CYLINDRICAL_H_R_PHI_V1',
    sourceTuple: ['elevation_mm', 'radius_mm', 'toroidal_deg'],
    sourceUnits: ['millimetre', 'millimetre', 'degree'],
    elevationDatumMm: CAD_ELEVATION_DATUM_MM,
    sourceFrame: 'right-handed cylindrical; phi=0 along +X and increases toward +Y',
    webFrame: 'right-handed XYZ; Y vertical',
    sourceToWebPoint: '[H_mm, R_mm, phi_deg] -> [R*cos(phi), H-4805, -R*sin(phi)] / 1000',
    reviewStatus: 'cad-registered-provisional-not-surveyed',
    reviewBoundary: 'The source JSON omits field labels, units and datum. The published interpretation is registered against the supplied millimetre CAD mesh and remains non-survey, non-as-built visualization data.',
  },
  runtimeGeometry: {
    mode: 'marker-layer-on-existing-exl50u-model',
    geometryAssets: [],
    redundantObjOrStlLoaded: false,
  },
  recordCount: EXPECTED_RECORD_COUNT,
  familyCounts,
  records,
};

const datasetBytes = Buffer.from(`${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
const manifest = {
  schemaVersion: MANIFEST_SCHEMA_VERSION,
  id: 'exl50u-sensor-points-v1',
  asOf: AS_OF,
  deviceId: 'EXL-50U',
  authority: dataset.authority,
  dataset: {
    path: '/models/exl50u-sensor-points-v1/sensor-points.json',
    format: 'application/json',
    schemaVersion: SCHEMA_VERSION,
    bytes: datasetBytes.byteLength,
    sha256: sha256(datasetBytes),
    recordCount: EXPECTED_RECORD_COUNT,
    familyCounts,
  },
  coordinateReview: {
    sourceTuple: dataset.coordinateSystem.sourceTuple,
    sourceUnits: dataset.coordinateSystem.sourceUnits,
    elevationDatumMm: CAD_ELEVATION_DATUM_MM,
    pointCountInsideCadBounds: EXPECTED_RECORD_COUNT,
    cadBoundsMillimetres: EXPECTED_MODEL_BOUNDS_MM,
    status: dataset.coordinateSystem.reviewStatus,
  },
  publication: dataset.publication,
  delivery: {
    existingDeviceModelOnly: true,
    markerLayerOnly: true,
    objIncluded: false,
    stlIncluded: false,
  },
  generator: {
    path: 'scripts/exl50u/build_sensor_points.mjs',
    deterministic: true,
  },
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, datasetBytes);
await writeFile(manifestPath, manifestBytes);

console.log(JSON.stringify({
  outputPath,
  manifestPath,
  records: records.length,
  familyCounts,
  datasetBytes: datasetBytes.byteLength,
  datasetSha256: manifest.dataset.sha256,
}, null, 2));
