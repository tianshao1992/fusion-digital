import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { DeviceManifest } from '../app/components/deviceManifest';
import { localizeContent } from '../app/i18n/content';
import {
  initialViewerModelChoice,
  requestedAnonymousQuality,
  viewerModelChoices,
} from '../app/components/device-viewer/viewerModelChoices';

async function readOptionalJson(url: URL): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(url, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

const preview = {
  id: 'preview',
  label: 'Anonymous preview',
  quality: 'preview' as const,
  path: '/device-assets/exl50u-general-assembly/v1/device.preview.digest.meshopt.glb',
  format: 'fixture',
  sha256: '0'.repeat(64),
  bytes: 1_000,
};

const anonymousHigh = {
  id: 'anonymous-high',
  label: 'Anonymous high detail',
  quality: 'high' as const,
  delivery: 'shards' as const,
  format: 'fixture',
  rootNodeName: 'EXL50U_GA_VISUALIZATION',
  extensionsRequired: ['EXT_mesh_gpu_instancing', 'EXT_meshopt_compression'],
  grouping: {
    kind: 'anonymous-transport',
    engineeringSemantic: false,
    engineeringUseAllowed: false,
    representsBom: false,
    representsEngineeringSystems: false,
    representsAssemblyTree: false,
  },
  bytes: 20_000,
  uniqueGeometryMeshes: 20,
  uniqueGeometryTriangles: 2_000,
  uniqueGeometryVertices: 6_000,
  placementInstances: 40,
  drawCalls: 20,
  sceneDrawTriangles: 4_000,
  decodedGpuBytes: 40_000,
  boundsMetres: { min: [-1, -1, -1], max: [1, 1, 1] },
  shards: [],
};

function manifestWithAssets(assets: DeviceManifest['assets']): DeviceManifest {
  return {
    schemaVersion: 'fixture',
    id: 'fixture',
    title: 'Fixture',
    asOf: '2026-09-02',
    devicePackage: {
      kind: 'public-simplified-derivative',
      deviceClass: 'fixture',
      authority: 'illustrative',
      replacementContract: ['fixture only'],
    },
    access: {
      classification: 'PUBLIC',
      redistributionAllowed: true,
      engineeringUseAllowed: false,
      statement: 'Fixture-only public visualization statement.',
    },
    coordinateSystem: {
      linearUnit: 'metre',
      upAxis: 'Y',
      handedness: 'right',
      sourceToWebScale: 1,
    },
    assets,
    systems: [],
    generator: {
      name: 'fixture',
      version: '1',
      repository: 'fixture',
      license: 'fixture',
      licenseUrl: 'fixture',
    },
    disclaimer: 'Fixture-only disclaimer that is not a production publication statement.',
  };
}

test('anonymous shard viewer choices force preview initially and require an explicit high-detail action', () => {
  const manifest = manifestWithAssets({
    webModel: preview,
    webModels: [{ ...preview, default: true }],
    shardBundles: [anonymousHigh as unknown as NonNullable<DeviceManifest['assets']['shardBundles']>[number]],
  });
  const choices = viewerModelChoices(manifest);
  assert.deepEqual(choices.map(({ id, delivery }) => [id, delivery]), [
    ['preview', 'monolithic'],
    ['anonymous-high', 'shards'],
  ]);
  const initial = initialViewerModelChoice(choices, false);
  assert.equal(initial.model?.id, 'preview');
  assert.equal(initial.anonymousHighDetailRequiresExplicitAction, true);
  assert.equal(requestedAnonymousQuality(choices[1], false), 'preview');
  assert.equal(requestedAnonymousQuality(choices[1], true), 'high');
});

test('non-anonymous device packages preserve declared high default and constrained-device preview selection', () => {
  const manifest = manifestWithAssets({
    webModel: preview,
    webModels: [
      { ...preview, default: false },
      { ...preview, id: 'reviewed-high', label: 'Reviewed high', quality: 'high', default: true },
    ],
  });
  const choices = viewerModelChoices(manifest);
  assert.equal(initialViewerModelChoice(choices, false).model?.id, 'reviewed-high');
  const constrained = initialViewerModelChoice(choices, true);
  assert.equal(constrained.model?.id, 'preview');
  assert.equal(constrained.autoPreviewApplied, true);
  assert.equal(constrained.anonymousHighDetailRequiresExplicitAction, false);
});

test('viewer wires serial anonymous loading, accessible shard progress and semantic-free presentation', async () => {
  const source = await readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../app/components/tokamak-cad-viewer.css', import.meta.url), 'utf8');
  const messages = await readFile(new URL('../app/i18n/messages.ts', import.meta.url), 'utf8');
  assert.match(source, /loadAnonymousDeviceModelWithFallback\(preview, anonymousBundle/);
  assert.match(source, /requestedQuality:\s*isAnonymousShardChoice\(loadedModel\)[\s\S]*?requestedAnonymousQuality\(loadedModel, userInitiatedHighDetail\)/);
  assert.match(source, /setAnonymousShardProgress\(nextProgress\)/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /!anonymousVisualization && <aside className="tokamakCadTree"/);
  assert.match(source, /!anonymousVisualization && <aside className="tokamakCadProperties"/);
  assert.match(source, /!anonymousVisualization && <div className="tokamakCadLegend"/);
  assert.match(styles, /\.tokamakCadShell--anonymous \.tokamakCadWorkspace\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(messages, /'viewer\.shardProgress': '匿名分片 \{current\}\/\{total\} · \{phase\}'/);
});

test('anonymous preview is routed through the strict anonymous loader and cannot bypass root validation', async () => {
  const source = await readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8');
  assert.match(source, /const anonymousBundle = loadedManifest\.assets\.shardBundles\?\.\[0\]/);
  assert.match(source, /if \(anonymousBundle\)[\s\S]*loadAnonymousDeviceModelWithFallback\(preview, anonymousBundle/);
  assert.match(source, /requestedQuality:\s*isAnonymousShardChoice\(loadedModel\)[\s\S]*:\s*'preview'/);
  assert.match(source, /const userInitiatedHighDetail = isAnonymousShardChoice\(loadedModel\)[\s\S]*&& anonymousHighDetailIntentRef\.current/);
  assert.match(source, /requestedQuality:[\s\S]*:\s*'preview',[\s\S]*userInitiatedHighDetail,/,
    'a monolithic preview choice must pass preview quality with a false high-detail intent');
});

test('general assembly catalog matches formal-manifest activation state', async () => {
  const [catalog, formalManifest] = await Promise.all([
    readFile(new URL('../public/models/device-catalog.json', import.meta.url), 'utf8').then(JSON.parse),
    readOptionalJson(new URL('../public/models/exl50u-general-assembly-v1/model-manifest.json', import.meta.url)),
  ]);
  const entry = catalog.devices.find(({ id }: { id: string }) => id === 'exl50u-general-assembly-20260630');
  assert.ok(entry);
  if (formalManifest && formalManifest.reviewCandidate === undefined) {
    assert.equal(entry.availability, 'online-public-simplified');
    assert.equal(entry.delivery, 'public-static');
    assert.equal(entry.viewer.mode, 'real-3d');
    assert.equal(entry.viewer.manifestEndpoint, '/models/exl50u-general-assembly-v1/model-manifest.json');
    assert.doesNotMatch(entry.fileSummary, /当前无可加载 GLB/);
  } else {
    assert.equal(entry.viewer.mode, 'metadata-only');
    assert.equal(entry.viewer.manifestEndpoint, null);
    assert.match(entry.fileSummary, /当前无可加载 GLB/);
  }
});

test('catalog activation copy has a complete reviewed English presentation mapping', async () => {
  const activation = JSON.parse(await readFile(
    new URL('../scripts/assets/exl50u-general-assembly-catalog-activation-contract.json', import.meta.url),
    'utf8',
  ));
  const replacement = activation.replacement as {
    state: string;
    facts: string[];
    deviceOverview: string;
    fileSummary: string;
    copy: string;
  };
  const presentation = [
    replacement.state,
    ...replacement.facts,
    replacement.deviceOverview,
    replacement.fileSummary,
    replacement.copy,
  ];
  for (const source of presentation) {
    const english = localizeContent('en', source);
    if (/[\u3400-\u9fff]/u.test(source)) {
      assert.notEqual(english, source, `missing reviewed English mapping for: ${source}`);
    }
    assert.doesNotMatch(english, /[\u3400-\u9fff]/u, `English mapping retains CJK copy: ${source}`);
  }
});
