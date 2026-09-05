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

test('high-only anonymous viewer exposes exactly one shard choice and gates only constrained clients', () => {
  const manifest = manifestWithAssets({
    shardBundles: [anonymousHigh as unknown as NonNullable<DeviceManifest['assets']['shardBundles']>[number]],
  });
  const choices = viewerModelChoices(manifest);
  assert.deepEqual(choices.map(({ id, delivery }) => [id, delivery]), [['anonymous-high', 'shards']]);

  const capable = initialViewerModelChoice(choices, false);
  assert.equal(capable.model?.id, 'anonymous-high');
  assert.equal(capable.anonymousHighOnly, true);
  assert.equal(capable.anonymousHighDetailRequiresExplicitAction, false);

  const constrained = initialViewerModelChoice(choices, true);
  assert.equal(constrained.model?.id, 'anonymous-high');
  assert.equal(constrained.anonymousHighOnly, true);
  assert.equal(constrained.anonymousHighDetailRequiresExplicitAction, true);
  assert.equal(requestedAnonymousQuality(choices[0], false), 'preview');
  assert.equal(requestedAnonymousQuality(choices[0], true), 'high');
});

test('legacy anonymous preview contracts remain fail-safe without becoming the active 1.5 shape', () => {
  const choices = viewerModelChoices(manifestWithAssets({
    webModel: preview,
    webModels: [{ ...preview, default: true }],
    shardBundles: [anonymousHigh as unknown as NonNullable<DeviceManifest['assets']['shardBundles']>[number]],
  }));
  const initial = initialViewerModelChoice(choices, false);
  assert.equal(initial.model?.id, 'preview');
  assert.equal(initial.anonymousHighOnly, false);
  assert.equal(initial.anonymousHighDetailRequiresExplicitAction, true);
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

test('viewer wires direct fail-closed high-only loading, accessible shard progress and semantic-free presentation', async () => {
  const source = await readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../app/components/tokamak-cad-viewer.css', import.meta.url), 'utf8');
  const messages = await readFile(new URL('../app/i18n/messages.ts', import.meta.url), 'utf8');
  assert.match(
    source,
    /if \(!preview\) \{[\s\S]*?resolvedLoadQuality = 'high';[\s\S]*?return loadVerifiedAnonymousShardBundle\(anonymousBundle/,
    'the active high-only manifest must bypass every preview/fallback loader',
  );
  assert.match(source, /setAnonymousShardProgress\(nextProgress\)/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /!anonymousVisualization && <aside className="tokamakCadTree"/);
  assert.match(source, /!anonymousVisualization && <aside className="tokamakCadProperties"/);
  assert.match(source, /!anonymousVisualization && <div className="tokamakCadLegend"/);
  assert.match(source, /availableModels\.length > 1 && <fieldset className="tokamakCadLodSelector"/,
    'the sole high-detail choice must not render a misleading standard/high selector');
  assert.match(styles, /\.tokamakCadShell--anonymous \.tokamakCadWorkspace\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(messages, /'viewer\.shardProgress': '匿名分片 \{current\}\/\{total\} · \{phase\}'/);
});

test('high-only catalog activation auto-starts on capable desktops and remains explicit on constrained clients', async () => {
  const source = await readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8');
  assert.match(source, /const preferPreview = shouldPreferPreview\(\);/);
  assert.match(
    source,
    /const autoLoadAnonymousModel = initialChoice\.anonymousHighOnly && !preferPreview;/,
    'only the active high-only contract may auto-start, and constrained clients must not auto-download the 271 MB bundle',
  );
  assert.match(
    source,
    /if \(initialChoice\.anonymousHighOnly && autoLoadAnonymousModel\) \{[\s\S]*?anonymousHighDetailIntentRef\.current = true;[\s\S]*?if \(autoLoadAnonymousModel\) \{[\s\S]*?setActivated\(true\);[\s\S]*?setStatus\('loading'\);/,
    'capable desktops must auto-start the sole reviewed high-detail choice',
  );
  assert.match(source, /anonymousHighDetailIntentRef\.current = isAnonymousShardChoice\(next\)/);
});

test('anonymous high-detail retry reloads only the model and does not refetch the manifest', async () => {
  const source = await readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8');
  assert.match(source, /const \[manifestAttempt, setManifestAttempt\] = useState\(0\)/);
  assert.match(source, /const \[modelAttempt, setModelAttempt\] = useState\(0\)/);
  assert.match(source, /\}, \[manifestAttempt, manifestUrl\]\);/);
  assert.match(source, /if \(retryAnonymousHigh\) setModelAttempt\(\(value\) => value \+ 1\)/);
  assert.doesNotMatch(source, /if \(retryAnonymousHigh\) setManifestAttempt/);
  assert.match(source, /if \(manifest && isAnonymousVisualizationManifest\(manifest\)\) \{\s*setModelAttempt[\s\S]*?\} else \{\s*setManifestAttempt/,
    'generic device retries must still refresh their no-store manifest while anonymous retries reuse the immutable manifest');
});

test('legacy preview compatibility cannot weaken the active high-only path', async () => {
  const source = await readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8');
  assert.match(source, /const anonymousBundle = loadedManifest\.assets\.shardBundles\?\.\[0\]/);
  assert.match(source, /if \(anonymousBundle\)[\s\S]*if \(!preview\)[\s\S]*loadVerifiedAnonymousShardBundle\(anonymousBundle/);
  assert.match(source, /if \(!preview\)[\s\S]*return loadVerifiedAnonymousShardBundle[\s\S]*?const userInitiatedHighDetail/);
  assert.match(source, /const userInitiatedHighDetail = isAnonymousShardChoice\(loadedModel\)[\s\S]*&& anonymousHighDetailIntentRef\.current/);
  assert.match(source, /loadAnonymousDeviceModelWithFallback\(preview, anonymousBundle/,
    'schema 1.4 compatibility may still use the audited fallback helper after the high-only branch returns');
});

test('EXL-50U total assembly receives the reviewed colour preset and deep inspection camera without reset on fullscreen', async () => {
  const [source, workspace, appearance] = await Promise.all([
    readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/digital-prototype/MultiDeviceWorkspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/components/device-viewer/industrialAppearance.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(workspace, /device\.id === 'exl50u-general-assembly-20260630'[\s\S]*?\? 'assembly-color-v1'/);
  assert.match(workspace, /device\.id === 'exl50u-general-assembly-20260630'[\s\S]*?\? 'close-inspection'/);
  for (const material of ['foundation-slate', 'architectural-stone', 'pipework-teal', 'equipment-blue', 'electrical-brass']) {
    assert.match(appearance, new RegExp(`'${material}'`), `${material} must remain in the presentation-only palette`);
  }
  assert.match(appearance, /Presentation-only spatial\/shape styling/);
  assert.match(source, /appearancePreset === 'industrial-silver-v1'[\s\S]*?\|\| appearancePreset === 'assembly-color-v1'[\s\S]*?RoomEnvironment\.js/,
    'the assembly colour preset must retain the same polished studio environment as the original EXL page');
  assert.match(source, /controls\.zoomToCursor = closeInspection/);
  assert.match(source, /controls\.screenSpacePanning = closeInspection/);
  assert.match(source, /Math\.max\(0\.0005, modelRadius \* 0\.00035\)/);
  assert.match(source, /modelRadius \* \(closeInspection \? 0\.025 : 1\.2\)/);
  assert.match(source, /controls\.addEventListener\('end', \(\) => \{[\s\S]*?preserveViewOnResize = true;[\s\S]*?cameraViewRef\.current = snapshot/,
    'manual orbit, pan and zoom must mark the close-up view for preservation across resize');
  assert.match(source, /const onFullscreenChange = \(\) => \{[\s\S]*?viewerRef\.current\?\.resize\(false\)[\s\S]*?addEventListener\('fullscreenchange'/,
    'fullscreen must preserve the current close-up target instead of fitting the whole assembly again');
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
