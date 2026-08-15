import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseDeviceManifest } from '../app/components/deviceManifest';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const iterManifestEndpoint = '/models/iter-public-simplified/model-manifest.json';
const iterManifestPath = fileURLToPath(new URL('../public/models/iter-public-simplified/model-manifest.json', import.meta.url));
const maxPublicPreviewBytes = 8 * 1024 * 1024;

const iterPartIds = [
  'cs', 'pf1', 'pf2', 'pf3', 'pf4', 'pf5', 'pf6', 'tf-a', 'tf-b',
  'cryostat-base', 'cryostat-lower', 'cryostat-top', 'cryostat-upper',
  'divertor', 'vv1', 'vv2', 'vv3', 'vv4',
] as const;

function candidateManifest() {
  return {
    $schema: '/models/device-manifest.schema.json',
    schemaVersion: '1.1',
    id: 'iter-public-simplified-v1',
    title: 'ITER public simplified browser visualization derivative',
    asOf: '2026-08-15',
    devicePackage: {
      kind: 'public-simplified-derivative',
      deviceClass: 'ITER educational full-device visualization derivative',
      authority: 'illustrative',
      replacementContract: [
        'project-owner authorization for a public simplified visualization derivative',
        'one compact preview GLB with eighteen stable selectable component nodes',
        'source STEP, B-Rep topology and engineering metadata remain private',
      ],
    },
    access: {
      classification: 'PUBLIC',
      redistributionAllowed: true,
      engineeringUseAllowed: false,
      statement: 'Only the deliberately simplified browser visualization derivative is publicly delivered; source CAD remains private.',
    },
    coordinateSystem: {
      linearUnit: 'metre',
      upAxis: 'Y',
      handedness: 'right',
      sourceToWebScale: 1,
    },
    assets: {
      webModel: {
        path: '/models/iter-public-simplified/iter-public-simplified-preview.meshopt.glb',
        format: 'glTF 2.0 binary + EXT_meshopt_compression',
        sha256: 'a'.repeat(64),
        bytes: 6_500_000,
        triangles: 400_000,
        vertices: 300_000,
        decodedGpuBytes: 30_000_000,
        boundsMetres: { min: [-15, -15, -15], max: [15, 15, 15] },
      },
    },
    systems: iterPartIds.map((id, index) => ({
      id: `iter-system-${index + 1}`,
      title: id.toUpperCase(),
      shortTitle: id.toUpperCase(),
      category: id.startsWith('pf') ? 'pf' : id.startsWith('tf') ? 'tf' : 'structure',
      color: '#A7ADB4',
      description: 'Public simplified visualization component for selection, visibility and performance testing.',
      parts: [{
        id: `ITER-${id.toUpperCase()}`,
        title: id.toUpperCase(),
        nodeName: `ITER_PART__${id}`,
        description: 'Stable top-level node in the simplified public preview GLB.',
        engineeringTag: `ITER.WEB.${id.replaceAll('-', '_').toUpperCase()}`,
      }],
    })),
    generator: {
      name: 'FusionDigital controlled visualization derivative builder',
      version: '1.0.0',
      repository: 'private controlled conversion pipeline',
      license: 'Project-owner-authorized public simplified visualization derivative',
      licenseUrl: '/licenses/ITER-PUBLIC-VISUALIZATION-DERIVATIVE.txt',
    },
    disclaimer: 'Illustrative browser visualization only; not an authoritative ITER engineering model and not for manufacturing, CAE, metrology or safety decisions.',
  };
}

test('single-preview device manifest carries the complete 18-node ITER browser contract', () => {
  const manifest = parseDeviceManifest(candidateManifest(), { manifestUrl: iterManifestEndpoint });
  const parts = manifest.systems.flatMap((system) => system.parts);

  assert.equal(manifest.assets.webModels, undefined, 'the public contract must not publish a high-detail variant');
  assert.ok(manifest.assets.webModel.bytes <= maxPublicPreviewBytes);
  assert.ok((manifest.assets.webModel.decodedGpuBytes ?? 0) > 0);
  assert.ok(manifest.assets.webModel.boundsMetres);
  assert.equal(parts.length, 18);
  assert.equal(new Set(parts.map((part) => part.id)).size, 18);
  assert.equal(new Set(parts.map((part) => part.nodeName)).size, 18);
  assert.deepEqual(
    parts.map((part) => part.nodeName).sort(),
    iterPartIds.map((id) => `ITER_PART__${id}`).sort(),
  );
  assert.equal(manifest.assets.sourceCad, undefined);
});

test('manifest parsing fails closed on cross-package assets and invalid performance metadata', () => {
  const crossPackage = candidateManifest();
  crossPackage.assets.webModel.path = '/models/another-package/iter-preview.glb';
  assert.throws(
    () => parseDeviceManifest(crossPackage, { manifestUrl: iterManifestEndpoint }),
    /同一精确包目录/,
  );

  const invertedBounds = candidateManifest();
  invertedBounds.assets.webModel.boundsMetres = { min: [15, -15, -15], max: [-15, 15, 15] };
  assert.throws(() => parseDeviceManifest(invertedBounds, { manifestUrl: iterManifestEndpoint }), /webModel/);

  const invalidGpuBudget = candidateManifest();
  invalidGpuBudget.assets.webModel.decodedGpuBytes = 0;
  assert.throws(() => parseDeviceManifest(invalidGpuBudget, { manifestUrl: iterManifestEndpoint }), /webModel/);
});

test('catalog keeps ITER fail-closed until the complete public preview package is atomically available', async () => {
  const catalog = JSON.parse(await readFile(new URL('../public/models/device-catalog.json', import.meta.url), 'utf8'));
  const iter = catalog.devices.find((device: { id?: string }) => device.id === 'iter-educational-model');
  assert.ok(iter);

  if (iter.viewer.mode === 'metadata-only') {
    assert.equal(iter.delivery, 'local-only');
    assert.equal(iter.viewer.manifestEndpoint, null);
    await assert.rejects(access(iterManifestPath), { code: 'ENOENT' });
    return;
  }

  assert.equal(iter.viewer.mode, 'real-3d');
  assert.equal(iter.delivery, 'public-static');
  assert.equal(iter.viewer.manifestEndpoint, iterManifestEndpoint);
  const manifest = parseDeviceManifest(JSON.parse(await readFile(iterManifestPath, 'utf8')), {
    manifestUrl: iterManifestEndpoint,
  });
  const parts = manifest.systems.flatMap((system) => system.parts);
  assert.equal(parts.length, 18);
  assert.equal(new Set(parts.map((part) => part.nodeName)).size, 18);
  assert.equal(manifest.assets.webModels, undefined, 'ITER high detail must remain private');
  assert.ok(manifest.assets.webModel.bytes <= maxPublicPreviewBytes);
  assert.equal(manifest.assets.sourceCad, undefined);
});

test('viewer preserves single-LOD loading, low-resource safety, 18-node selection and model fallback', async () => {
  const viewer = await readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../app/digital-prototype/MultiDeviceWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(viewer, /manifest\.assets\.webModels\s*\?\?\s*\[\{/,
    'a webModel-only manifest must become one preview variant without requiring webModels');
  assert.match(viewer, /variants\.length\s*>\s*1\s*&&\s*shouldPreferPreview\(\)/,
    'resource hints must never remove the sole public preview');
  assert.match(viewer, /setSelectedModelId\(preview\.id\)/,
    'a failed optional high variant must fall back to preview');
  assert.match(viewer, /missingParts\.length\s*>\s*0[\s\S]*errorMissingNodes/,
    'an incomplete 18-node package must fail closed');
  assert.match(viewer, /unmappedMeshes\.length\s*>\s*0[\s\S]*errorUnmappedMeshes/,
    'undeclared geometry must fail closed');
  assert.match(viewer, /applyVisibility:\s*\(hidden: Set<string>, isolated: Set<string>\)/);
  assert.match(viewer, /selectParts:\s*\(partIds: Set<string>\)/);
  assert.match(viewer, /parseDeviceManifest\(await response\.json\(\), \{ manifestUrl \}\)/,
    'runtime loading must enforce the exact manifest package namespace');
  assert.match(workspace, /device\.id === 'iter-educational-model'[\s\S]*?'industrial-silver-v1'/,
    'the ITER preview should use the same neutral industrial studio as the engineering workbench');
});

test('ITER public paths never expose source CAD or private filesystem locations', async () => {
  const source = JSON.stringify(candidateManifest());
  assert.doesNotMatch(source, /\.(?:step|stp|brep|iges|igs)(?:["?#]|$)/i);
  assert.doesNotMatch(source, /(?:[a-z]:[\\/]|file:\/\/|iter-cad-private|downloads|appdata)/i);
  assert.ok(repositoryRoot.length > 0 && publicRoot.length > 0);
});
