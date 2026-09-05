import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseVisualizationArtifact, type VisualizationArtifact } from '../app/visualization/contract.ts';
import { parseVisualizationContext } from '../app/visualization/context.ts';
import { routeVisualizationArtifact } from '../app/visualization/routing.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIB = 1024 ** 2;

function artifact(overrides: Partial<VisualizationArtifact> = {}): VisualizationArtifact {
  return {
    schema: 'fusiondigital.visualization-artifact.v2',
    artifactId: 'test.asset',
    version: '1',
    label: 'Test asset',
    sourceRecord: { kind: 'design-asset', id: 'source' },
    provenance: { authority: 'synthetic' },
    coordinates: { units: 'm', upAxis: 'Z', handedness: 'right' },
    complexity: { decodedBytes: 200 * MIB, triangles: 4_000_000 },
    access: { classification: 'internal', clientDownloadAllowed: true },
    deliveries: [{ profile: 'web-mesh', format: 'glb' }],
    ...overrides,
  };
}

test('artifact parser accepts the versioned contract and rejects unversioned input', () => {
  assert.equal(parseVisualizationArtifact(artifact()).artifactId, 'test.asset');
  assert.throws(() => parseVisualizationArtifact({ ...artifact(), schema: 'legacy' }), /schema/);
});

test('router keeps a bounded CAD mesh in Three.js', () => {
  const decision = routeVisualizationArtifact(artifact(), {
    client: { deviceMemoryGiB: 8 },
    availability: { paraViewRemote: true, omniverseStream: false },
    intent: 'inspect',
  });
  assert.equal(decision.renderer, 'three-web');
  assert.equal(decision.reason, 'web-mesh-fit-budget');
});

test('router accepts a huge total assembly when the streamed tile working set is bounded', () => {
  const decision = routeVisualizationArtifact(
    artifact({
      complexity: { decodedBytes: 14 * 1024 * MIB, workingSetBytes: 320 * MIB, triangles: 90_000_000 },
      deliveries: [{ profile: 'web-tiles', format: 'glb+manifest' }],
    }),
    {
      client: { deviceMemoryGiB: 8 },
      availability: { paraViewRemote: true, omniverseStream: false },
      intent: 'inspect',
    },
  );
  assert.equal(decision.reason, 'streamed-web-tiles-fit-budget');
});

test('router keeps restricted large CAE beside ParaView compute', () => {
  const decision = routeVisualizationArtifact(
    artifact({
      complexity: { decodedBytes: 70 * 1024 * MIB, workingSetBytes: 12 * 1024 * MIB, cells: 400_000_000 },
      access: { classification: 'restricted', clientDownloadAllowed: false },
      deliveries: [{ profile: 'paraview-remote', format: 'xdmf+hdf5' }],
    }),
    {
      client: { deviceMemoryGiB: 16 },
      availability: { paraViewRemote: true, omniverseStream: false },
      intent: 'analyze',
    },
  );
  assert.equal(decision.renderer, 'paraview-remote');
});

test('Omniverse remains an explicit optional immersive adapter', () => {
  const usd = artifact({
    access: { classification: 'internal', clientDownloadAllowed: false },
    deliveries: [{ profile: 'openusd', format: 'usdc' }],
  });
  const disabled = routeVisualizationArtifact(usd, {
    client: { deviceMemoryGiB: 16 },
    availability: { paraViewRemote: false, omniverseStream: false },
    intent: 'immersive',
  });
  const enabled = routeVisualizationArtifact(usd, {
    client: { deviceMemoryGiB: 16 },
    availability: { paraViewRemote: false, omniverseStream: true },
    intent: 'immersive',
  });
  assert.equal(disabled.renderer, 'metadata-only');
  assert.equal(enabled.renderer, 'omniverse-stream');
  assert.equal(enabled.openSourceCore, false);
});

test('context parser preserves record identity and rejects malformed messages', () => {
  const parsed = parseVisualizationContext({
    type: 'fusiondigital:set-context',
    version: 2,
    record: { kind: 'simulation-run', id: 'run-17', run: '17' },
    artifactId: 'field.temperature',
    timestep: 42,
    stablePartIds: ['vacuum-vessel'],
    intent: 'analyze',
  });
  assert.equal(parsed?.record.id, 'run-17');
  assert.equal(parseVisualizationContext({ type: 'fusiondigital:set-context', version: 1 }), null);
});

test('platform page mounts the planner without weakening the fusion-data evidence boundary', async () => {
  const [platform, workspace] = await Promise.all([
    readFile(resolve(root, 'app/platform/page.tsx'), 'utf8'),
    readFile(resolve(root, 'app/fusion-data/FusionDataWorkspace.tsx'), 'utf8'),
  ]);
  assert.match(platform, /VisualizationRoutePlanner/);
  assert.match(platform, /visualization/);
  assert.doesNotMatch(workspace, /mockFusionData|ParaViewEmbed/);
});
