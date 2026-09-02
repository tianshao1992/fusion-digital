import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseDeviceManifest } from '../app/components/deviceManifest';
import {
  ANALYTIC_PLASMA_POLOIDAL_SEGMENTS,
  ANALYTIC_PLASMA_TOROIDAL_SEGMENTS,
  buildAnalyticPlasmaGeometry,
  millerPointToWeb,
} from '../app/components/device-viewer/analyticPlasma';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const iterManifestEndpoint = '/models/iter-public-simplified/model-manifest.json';
const iterManifestPath = fileURLToPath(new URL('../public/models/iter-public-simplified/model-manifest.json', import.meta.url));

const iterPartIds = [
  'cs', 'pf1', 'pf2', 'pf3', 'pf4', 'pf5', 'pf6', 'tf-a', 'tf-b',
  'cryostat-base', 'cryostat-lower', 'cryostat-top', 'cryostat-upper',
  'divertor', 'vv1', 'vv2', 'vv3', 'vv4',
] as const;

function candidateManifest() {
  const components = iterPartIds.map((id, index) => {
    const sha256 = (index + 1).toString(16).padStart(64, '0');
    return ({
    partId: `ITER-${id.toUpperCase()}`,
    nodeName: `ITER_PART__${id}`,
    path: `/device-assets/iter-high-detail/v1/${id}.${sha256}.high.meshopt.glb`,
    format: 'glTF 2.0 binary + EXT_meshopt_compression + KHR_mesh_quantization; POSITION normalized Int16 per mesh; NORMAL normalized Int8 (8-bit)',
    sha256,
    bytes: 5_000_000,
    triangles: 400_000,
    vertices: 600_000,
    sceneDrawTriangles: 420_000,
    sceneDrawVertices: 630_000,
    meshInstances: 20,
    decodedGpuBytes: 10_000_000,
    boundsMetres: { min: [-15, -15, -15] as [number, number, number], max: [15, 15, 15] as [number, number, number] },
    });
  });
  return {
    $schema: '/models/device-manifest.schema.json',
    schemaVersion: '1.3',
    id: 'iter-public-simplified-v1',
    title: 'ITER public simplified browser visualization derivative',
    asOf: '2026-08-15',
    devicePackage: {
      kind: 'public-simplified-derivative',
      deviceClass: 'ITER educational full-device visualization derivative',
      authority: 'illustrative',
      replacementContract: [
        'project-owner authorization for a public simplified visualization derivative',
        'one high-detail component bundle with eighteen stable selectable component nodes',
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
      componentBundles: [{
        id: 'iter-education-high-v1',
        label: '高精度分片',
        quality: 'high',
        delivery: 'components',
        format: components[0].format,
        bytes: components.reduce((sum, asset) => sum + asset.bytes, 0),
        triangles: components.reduce((sum, asset) => sum + asset.triangles, 0),
        vertices: components.reduce((sum, asset) => sum + asset.vertices, 0),
        sceneDrawTriangles: components.reduce((sum, asset) => sum + asset.sceneDrawTriangles, 0),
        sceneDrawVertices: components.reduce((sum, asset) => sum + asset.sceneDrawVertices, 0),
        meshInstances: components.reduce((sum, asset) => sum + asset.meshInstances, 0),
        decodedGpuBytes: components.reduce((sum, asset) => sum + asset.decodedGpuBytes, 0),
        boundsMetres: { min: [-15, -15, -15], max: [15, 15, 15] },
        components,
      }],
    },
    visualizations: {
      analyticPlasma: {
        kind: 'analytic-design-proxy',
        label: 'ITER 名义设计参数解析等离子体',
        sourceLabel: 'IAEA ITER EDA Documentation Series No. 22, Table 2.1-1',
        sourceUrl: 'https://www-pub.iaea.org/MTCD/Publications/PDF/ITER-EDA-DS-22.pdf',
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
        topologyReference: 'single-null',
        geometryOnly: true,
        hasPsiGrid: false,
        hasXPoint: false,
        hasDiagnostics: false,
        isEfit: false,
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
        description: 'Stable top-level node in the reviewed high-detail component bundle.',
        engineeringTag: `ITER.WEB.${id.replaceAll('-', '_').toUpperCase()}`,
      }],
    })),
    generator: {
      name: 'FusionDigital controlled visualization derivative builder',
      version: '1.0.0',
      repository: 'private controlled conversion pipeline',
      license: 'Project-owner-authorized public simplified visualization derivative',
      licenseUrl: '/licenses/ITER-PUBLIC-VISUALIZATION-DERIVATIVE.txt',
      conversion: {
        pipeline: 'reviewed component transforms -> sharded high-detail web models',
        converter: 'FusionDigital ITER shard builder',
        converterVersion: '1.0.0',
        highLodAbsoluteDeflectionMillimetres: 75,
        highLodAngularDeflectionRadians: 0.25,
        highLodSharpEdgeNormals: true,
      },
    },
    disclaimer: 'Illustrative browser visualization only; not an authoritative ITER engineering model and not for manufacturing, CAE, metrology or safety decisions.',
  };
}

test('high-detail-only component bundle carries the complete 18-node ITER browser contract', () => {
  const manifest = parseDeviceManifest(candidateManifest(), { manifestUrl: iterManifestEndpoint });
  const parts = manifest.systems.flatMap((system) => system.parts);

  assert.equal(manifest.assets.webModels, undefined, 'ITER keeps monolithic LODs disabled');
  assert.equal(manifest.assets.componentBundles?.length, 1);
  assert.equal(manifest.assets.componentBundles?.[0]?.components.length, 18);
  assert.equal(manifest.assets.componentBundles?.[0]?.bytes, 90_000_000);
  assert.equal(manifest.assets.webModel, undefined);
  assert.equal(parts.length, 18);
  assert.equal(new Set(parts.map((part) => part.id)).size, 18);
  assert.equal(new Set(parts.map((part) => part.nodeName)).size, 18);
  assert.deepEqual(
    parts.map((part) => part.nodeName).sort(),
    iterPartIds.map((id) => `ITER_PART__${id}`).sort(),
  );
  assert.equal(manifest.assets.sourceCad, undefined);
  assert.equal(manifest.visualizations?.analyticPlasma?.isEfit, false);
  assert.equal(manifest.visualizations?.analyticPlasma?.hasXPoint, false);
});

test('manifest parsing fails closed on cross-package assets and invalid performance metadata', () => {
  const crossPackage = candidateManifest();
  crossPackage.assets.componentBundles[0].components[0].path = '/models/another-package/iter-high.glb';
  assert.throws(
    () => parseDeviceManifest(crossPackage, { manifestUrl: iterManifestEndpoint }),
    /部件身份/,
  );

  const invertedBounds = candidateManifest();
  invertedBounds.assets.componentBundles[0].components[0].boundsMetres = { min: [15, -15, -15], max: [-15, 15, 15] };
  assert.throws(() => parseDeviceManifest(invertedBounds, { manifestUrl: iterManifestEndpoint }), /(?:部件身份|无效部件)/);

  const invalidGpuBudget = candidateManifest();
  invalidGpuBudget.assets.componentBundles[0].components[0].decodedGpuBytes = 0;
  assert.throws(() => parseDeviceManifest(invalidGpuBudget, { manifestUrl: iterManifestEndpoint }), /(?:部件身份|无效部件)/);

  const mismatchedIdentity = candidateManifest();
  mismatchedIdentity.assets.componentBundles[0].components[0].nodeName = 'ITER_PART__pf1';
  assert.throws(() => parseDeviceManifest(mismatchedIdentity, { manifestUrl: iterManifestEndpoint }), /部件身份/);

  const wrongTotal = candidateManifest();
  wrongTotal.assets.componentBundles[0].bytes += 1;
  assert.throws(() => parseDeviceManifest(wrongTotal, { manifestUrl: iterManifestEndpoint }), /汇总预算/);

  const wrongUnionBounds = candidateManifest();
  wrongUnionBounds.assets.componentBundles[0].boundsMetres.max[0] += 1;
  assert.throws(() => parseDeviceManifest(wrongUnionBounds, { manifestUrl: iterManifestEndpoint }), /汇总预算/);

  const mismatchedComponentFormat = candidateManifest();
  mismatchedComponentFormat.assets.componentBundles[0].components[0].format = 'unreviewed format';
  assert.throws(() => parseDeviceManifest(mismatchedComponentFormat, { manifestUrl: iterManifestEndpoint }), /部件身份/);

  const emptyBundleFormat = candidateManifest();
  emptyBundleFormat.assets.componentBundles[0].format = '   ';
  emptyBundleFormat.assets.componentBundles[0].components.forEach((component) => {
    component.format = '   ';
  });
  assert.throws(() => parseDeviceManifest(emptyBundleFormat, { manifestUrl: iterManifestEndpoint }), /无效或重复/);

  const zeroMeshInstances = candidateManifest();
  zeroMeshInstances.assets.componentBundles[0].meshInstances -= 20;
  zeroMeshInstances.assets.componentBundles[0].components[0].meshInstances = 0;
  assert.throws(() => parseDeviceManifest(zeroMeshInstances, { manifestUrl: iterManifestEndpoint }), /部件身份/);

  const extraComponentField = candidateManifest() as ReturnType<typeof candidateManifest> & {
    assets: ReturnType<typeof candidateManifest>['assets'] & { componentBundles: Array<{ components: Array<Record<string, unknown>> }> };
  };
  extraComponentField.assets.componentBundles[0].components[0].privateSourcePath = 'D:/private/source.step';
  assert.throws(() => parseDeviceManifest(extraComponentField, { manifestUrl: iterManifestEndpoint }), /部件身份/);

  const collidingChoiceId = candidateManifest();
  collidingChoiceId.assets.componentBundles[0].id = 'Standard';
  assert.throws(() => parseDeviceManifest(collidingChoiceId, { manifestUrl: iterManifestEndpoint }), /无效或重复/);

  const fakeHighDefault = candidateManifest() as ReturnType<typeof candidateManifest> & {
    assets: ReturnType<typeof candidateManifest>['assets'] & { componentBundles: Array<Record<string, unknown>> };
  };
  fakeHighDefault.assets.componentBundles[0].default = true;
  assert.throws(() => parseDeviceManifest(fakeHighDefault, { manifestUrl: iterManifestEndpoint }), /无效或重复/);

  const oversizedDecodedBundle = candidateManifest();
  oversizedDecodedBundle.assets.componentBundles[0].decodedGpuBytes = 512 * 1024 * 1024 + 1;
  assert.throws(() => parseDeviceManifest(oversizedDecodedBundle, { manifestUrl: iterManifestEndpoint }), /无效或重复/);

  const legacyExtension = candidateManifest();
  legacyExtension.schemaVersion = '1.1';
  assert.throws(() => parseDeviceManifest(legacyExtension, { manifestUrl: iterManifestEndpoint }), /1\.1 不支持/);

  const legacyPreviewContract = candidateManifest();
  legacyPreviewContract.schemaVersion = '1.2';
  assert.throws(() => parseDeviceManifest(legacyPreviewContract, { manifestUrl: iterManifestEndpoint }), /必须使用 1\.3/);
});

test('ITER analytic plasma uses the published Miller-style design proxy without inventing X-point topology', () => {
  const definition = parseDeviceManifest(candidateManifest(), { manifestUrl: iterManifestEndpoint }).visualizations?.analyticPlasma;
  assert.ok(definition);
  assert.deepEqual(millerPointToWeb(6.2, 2, 1.7, 0.33, 0, 0), [8.2, 0, -0]);
  const top = millerPointToWeb(6.2, 2, 1.7, 0.33, Math.PI / 2, 0);
  assert.ok(Math.abs(top[0] - 5.54) < 1e-12);
  assert.ok(Math.abs(top[1] - 3.4) < 1e-12);
  const geometry = buildAnalyticPlasmaGeometry(definition);
  assert.equal(geometry.surface95.positions.length, ANALYTIC_PLASMA_POLOIDAL_SEGMENTS * ANALYTIC_PLASMA_TOROIDAL_SEGMENTS * 3);
  assert.equal(geometry.surface95.indices.length, ANALYTIC_PLASMA_POLOIDAL_SEGMENTS * ANALYTIC_PLASMA_TOROIDAL_SEGMENTS * 6);
  assert.ok(Array.from(geometry.surface95.positions).every(Number.isFinite));
  assert.equal(definition.geometryOnly, true);
  assert.equal(definition.hasPsiGrid, false);
  assert.equal(definition.hasXPoint, false);
  assert.equal(definition.isEfit, false);
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
  assert.equal(manifest.assets.webModels, undefined, 'ITER high detail is sharded, never a monolithic LOD');
  assert.equal(manifest.assets.componentBundles?.[0]?.components.length, 18);
  assert.equal(manifest.assets.webModel, undefined, 'ITER must not publish the invalid compact fallback model');
  assert.equal(manifest.assets.sourceCad, undefined);
});

test('viewer supports a verified component-only model while preserving 18-node selection', async () => {
  const viewer = await readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8');
  const viewerChoices = await readFile(new URL('../app/components/device-viewer/viewerModelChoices.ts', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../app/digital-prototype/MultiDeviceWorkspace.tsx', import.meta.url), 'utf8');

  assert.match(viewerChoices, /const compatibilityModels = manifest\.assets\.webModel \?/,
    'the viewer must not synthesize a standard model when the manifest is component-only');
  assert.match(viewer, /initialViewerModelChoice\(variants, shouldPreferPreview\(\)\)/);
  assert.match(viewerChoices, /preferPreviewForConstrainedDevice[\s\S]*&& preview[\s\S]*&& declaredDefault/,
    'resource hints may constrain only manifests that actually publish a preview');
  assert.match(viewer, /disabled=\{status === 'loading' && selectedModel\?\.id === asset\.id\}/,
    'a user must be able to cancel a large in-flight LOD by selecting the other model');
  assert.match(viewer, /missingParts\.length\s*>\s*0[\s\S]*errorMissingNodes/,
    'an incomplete 18-node package must fail closed');
  assert.match(viewer, /unmappedMeshes\.length\s*>\s*0[\s\S]*errorUnmappedMeshes/,
    'undeclared geometry must fail closed');
  assert.match(viewer, /applyVisibility:\s*\(hidden: Set<string>, isolated: Set<string>\)/);
  assert.match(viewer, /selectParts:\s*\(partIds: Set<string>\)/);
  assert.match(viewer, /parseDeviceManifest\(await response\.json\(\), \{ manifestUrl \}\)/,
    'runtime loading must enforce the exact manifest package namespace');
  assert.match(viewer, /const globalModelDecodeGate = createSerialTaskGate\(\)/,
    'non-abortable GLB parsing must stay serialized across keyed viewer remounts');
  assert.doesNotMatch(viewer, /useRef\(createSerialTaskGate\(\)\)/,
    'a per-session gate would allow stale decoders to overlap after a keyed remount');
  assert.match(viewer, /globalModelDecodeGate\.run[\s\S]*loadVerifiedMonolithicModel/,
    'compact preview and component bundles must share the same verified decode lane');
  assert.match(workspace, /device\.id === 'iter-educational-model'[\s\S]*?'industrial-silver-v1'/,
    'the ITER preview should use the same neutral industrial studio as the engineering workbench');

  const loader = await readFile(new URL('../app/components/device-viewer/componentModelLoader.ts', import.meta.url), 'utf8');
  assert.match(loader, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(loader, /export async function loadVerifiedMonolithicModel/,
    'the compact fallback must use the reviewed byte and digest loader');
  assert.match(loader, /received\s*!==\s*asset\.bytes/);
  assert.match(loader, /received \+ value\.byteLength > asset\.bytes[\s\S]*reader\.cancel\(\)/,
    'streamed bytes must be rejected before an oversized response can exhaust memory');
  assert.match(loader, /contentLength !== asset\.bytes/,
    'a declared upstream length must match the reviewed component budget');
  assert.match(loader, /stableNodes\.length\s*!==\s*1/);
  assert.match(loader, /concurrency\s*\?\?\s*2/);
  assert.match(loader, /bundleSignal\.aborted[\s\S]*disposeParsedScene\(gltf\.scene\)/,
    'a late non-abortable parser must release its scene after bundle cancellation');
  assert.match(loader, /await Promise\.allSettled\(workers\)/,
    'bundle failure must wait for all in-flight parsers before final disposal');
});

test('ITER public paths never expose source CAD or private filesystem locations', async () => {
  const source = JSON.stringify(candidateManifest());
  assert.doesNotMatch(source, /\.(?:step|stp|brep|iges|igs)(?:["?#]|$)/i);
  assert.doesNotMatch(source, /(?:["'][a-z]:[\\/]|file:\/\/|iter-cad-private|downloads|appdata)/i);
  assert.ok(repositoryRoot.length > 0 && publicRoot.length > 0);
});
