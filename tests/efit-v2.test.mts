import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { gzipSync } from 'node:zlib';

import { createEfitHybridDataSource, normalizeEfitHybridCatalog } from '../app/components/efit/hybrid-data-source.ts';
import { efitXPointMarkerRole } from '../app/components/device-viewer/EfitThreeOverlay.ts';
import { deriveVerifiedDivertorGraphRegion } from '../app/components/efit/divertor-region.ts';
import { validateEfitTopologyGraphFrame } from '../app/components/efit/topology-graph-runtime.ts';

const LEGACY_INDEX_URL = '/device-data/exl50u-efit/index.json';
const V2_INDEX_URL = '/device-data/exl50u-efit-v2/index.json';
const CHUNK_URL = '/device-data/exl50u-efit-v2/shot-20289-part-000.jsonl.gz';
const RECONSTRUCTION_DIGEST = 'a'.repeat(64);
const RECONSTRUCTION_ID = `exl-50u:efit:020289:${RECONSTRUCTION_DIGEST.slice(0, 20)}`;

const legacyIndex = JSON.parse(await readFile(new URL('../public/data/exl50u-efit/index.json', import.meta.url), 'utf8'));

function f64LeHash(points: readonly number[]): string {
  const bytes = Buffer.alloc(points.length * 8);
  points.forEach((point, index) => bytes.writeDoubleLE(point, index * 8));
  return createHash('sha256').update(bytes).digest('hex');
}

function evidence() {
  return { source: 'synthetic-reviewed-test', state: 'derived', confidence: 'bounded-derived', flags: ['TEST_ONLY'] };
}

function graphFrame(geometryId: string) {
  return {
    frameId: 'EXL-50U:shot:020289/frame/000000',
    shotId: 'EXL-50U:shot:020289',
    reconstructionId: RECONSTRUCTION_ID,
    timeMs: 110,
    geometryId,
    quality: {
      validity: 'usable',
      flags: [],
      positionUncertaintyFloorM: 0.01,
      sourceGrid: { nr: 129, nz: 129, rMinM: 0.2, rMaxM: 2.2, zMinM: -1.899999975, zMaxM: 1.899999975 },
      algorithmVersion: '2.0.0-test',
    },
    scalars: {
      currentA: 321_000,
      rAxisM: 0.75,
      zAxisM: 0,
      bcentrT: 0.86,
      psiAxisWbPerRad: -0.1,
      psiBoundaryWbPerRad: 0,
      q95: 4.2,
      efitError: null,
      iconvr: 2,
    },
    closedFluxSurfaces: [{
      surfaceId: 'psi-0.9000-loop-0',
      source: 'derived-contour',
      psiN: 0.9,
      closed: true,
      containsMagneticAxis: true,
      areaM2: 0.5,
      // Closed surfaces intentionally publish unique samples; the closing
      // edge from the last point to the first is implicit.
      pointsRzM: [0.5, -0.5, 1, -0.5, 1, 0.5, 0.5, 0.5],
      evidence: evidence(),
    }, {
      surfaceId: 'source-lcfs',
      source: 'g-eqdsk-boundary-polyline',
      psiN: 1,
      closed: true,
      containsMagneticAxis: true,
      areaM2: 0.84,
      pointsRzM: [0.4, -0.6, 1.1, -0.6, 1.1, 0.6, 0.4, 0.6],
      evidence: {
        source: 'g-eqdsk-boundary-polyline',
        state: 'source-derived',
        confidence: 'source-record',
        flags: ['RESAMPLED', 'EXPLICITLY_CLOSED'],
      },
    }],
    topologyGraph: {
      canonicalRepresentation: {
        kind: 'node-edge-region-topology-graph',
        schemaVersion: 'fusion.efit.topology-graph.v2',
        coordinateSpace: 'EFIT cylindrical R-Z plane in metres',
        geometryId,
      },
      nodes: [{ nodeId: 'axis', kind: 'magnetic-axis', rM: 0.75, zM: 0 }],
      edges: [],
      wallArcs: [],
      regions: [{
        regionId: 'closed-0',
        kind: 'closed-flux-region',
        state: 'derived',
        psiN: 0.9,
        containsMagneticAxis: true,
        areaM2: 0.5,
        boundary: [{ order: 0, referenceKind: 'closed-surface', referenceId: 'psi-0.9000-loop-0', direction: 'counter-clockwise' }],
        evidence: evidence(),
      }],
      unresolvedArms: [],
      unresolvedRegions: [],
      features: {
        xPointCount: 0,
        activeXPointCount: 0,
        candidateXPointCount: 0,
        boundaryXPointCount: 0,
        nearBoundaryXPointCount: 0,
        wallIntersectionCount: 0,
        resolvedBranchCount: 0,
        unresolvedArmCount: 0,
        nullClusters: [],
        extendedLegCandidateEdgeIds: [],
      },
    },
  };
}

function fixture() {
  const legacyPoints = legacyIndex.geometry.limiterRzM as number[];
  const graphPoints = [0.3, -1, 1.2, -1, 1.2, 1, 0.3, 1, 0.3, -1];
  const graphGeometryId = `wall-${f64LeHash(graphPoints).slice(0, 20)}`;
  const frame = graphFrame(graphGeometryId);
  const compressed = gzipSync(Buffer.from(`${JSON.stringify(frame)}\n`, 'utf8'), { level: 9 });
  assert.deepEqual([...compressed.subarray(4, 8)], [0, 0, 0, 0], 'Node test gzip must use deterministic zero mtime');
  const legacyShot = legacyIndex.shots.find((shot: { shot: number }) => shot.shot === 18301);
  assert.ok(legacyShot);
  const catalog = {
    schemaVersion: 'fusion.efit.catalog.v2',
    device: { id: 'EXL-50U', displayName: 'EXL-50U', defaultGeometryId: graphGeometryId },
    gridExtentM: { r: [0.2, 2.2], z: [-1.899999975, 1.899999975] },
    distributionPolicy: {
      numericQuantization: {
        fractionDigits: 8,
        roundingMode: 'ROUND_HALF_EVEN',
        negativeZeroNormalized: true,
        maxAbsoluteErrorPerValue: 5e-9,
      },
    },
    geometries: [{
      id: `legacy-wall-${f64LeHash(legacyPoints).slice(0, 20)}`,
      kind: 'axisymmetric-wall-limiter-rz-polyline',
      contractKind: 'legacy-source-order-v1',
      closed: true,
      pointCount: legacyPoints.length / 2,
      segmentCount: legacyPoints.length / 2 - 1,
      limiterSha256F64LE: f64LeHash(legacyPoints),
      limiterRzM: legacyPoints,
    }, {
      id: graphGeometryId,
      kind: 'axisymmetric-wall-limiter-rz-polyline',
      contractKind: 'canonical-graph-v2',
      closed: true,
      sourcePointCount: 4,
      canonicalPointCount: 5,
      segmentCount: 4,
      sourceLimiterSha256F64LE: f64LeHash(graphPoints.slice(0, -2)),
      canonicalSha256F64LE: f64LeHash(graphPoints),
      orientation: 'counter-clockwise',
      startPointRule: 'lexicographic minimum (R,Z)',
      limiterRzM: graphPoints,
    }],
    datasets: [{ datasetId: 'test-dataset', label: '测试重建集' }],
    shots: [{
      shot: 18301,
      shotId: 'EXL-50U:shot:018301',
      sourceKind: 'legacy-contours-v1',
      geometryId: `legacy-wall-${f64LeHash(legacyPoints).slice(0, 20)}`,
      frameCount: legacyShot.frameCount,
      timeRangeMs: legacyShot.timeRangeMs,
      manifestUrl: LEGACY_INDEX_URL,
      manifestShot: 18301,
      baseBinaryUrl: legacyShot.binary.url,
      baseBinarySha256: legacyShot.binary.sha256,
      topologyBinaryUrl: null,
    }, {
      shot: 20289,
      shotId: 'EXL-50U:shot:020289',
      sourceKind: 'topology-graph-v2',
      datasetId: 'test-dataset',
      geometryId: graphGeometryId,
      reconstructionId: RECONSTRUCTION_ID,
      reconstructionDigest: RECONSTRUCTION_DIGEST,
      frameCount: 1,
      timeRangeMs: [110, 110],
      nominalCadenceMs: 10,
      availableTimesMs: [110],
      gaps: [],
      frames: [{
        timeMs: 110,
        currentA: 321_000,
        rAxisM: 0.75,
        zAxisM: 0,
        bcentrT: 0.86,
        q95: 4.2,
        lcfsRMinM: 0.4,
        lcfsRMaxM: 1.1,
        qualityValidity: 'usable',
        qualityFlags: [],
      }],
      qualitySummary: { validityFrameCounts: { usable: 1 }, flagFrameCounts: {} },
      frameAssets: [{
        chunkIndex: 0,
        frameStart: 0,
        frameCount: 1,
        timeRangeMs: [110, 110],
        availableTimesMs: [110],
        url: CHUNK_URL,
        contentType: 'application/gzip',
        uncompressedContentType: 'application/x-ndjson',
        compression: 'gzip-mtime-zero',
        httpContentEncoding: 'identity',
        byteLength: compressed.byteLength,
        sha256: createHash('sha256').update(compressed).digest('hex'),
      }],
    }],
  };
  return { catalog, compressed, graphGeometryId };
}

function mockFetch(
  catalog: unknown,
  compressed: Buffer,
  options: { v2Status?: number; contentEncoding?: string; delayChunk?: boolean } = {},
) {
  let chunkRequests = 0;
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === V2_INDEX_URL) {
      return options.v2Status === 404
        ? new Response('not found', { status: 404 })
        : new Response(JSON.stringify(catalog), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (path === LEGACY_INDEX_URL) {
      return new Response(JSON.stringify(legacyIndex), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (path === CHUNK_URL) {
      chunkRequests += 1;
      if (options.delayChunk) {
        return new Promise((_resolve, reject) => {
          const signal = init.signal;
          if (signal?.aborted) return reject(signal.reason ?? new DOMException('aborted', 'AbortError'));
          signal?.addEventListener('abort', () => reject(signal.reason ?? new DOMException('aborted', 'AbortError')), { once: true });
        });
      }
      const headers: Record<string, string> = {
        'Content-Type': 'application/gzip',
        'Content-Length': String(compressed.byteLength),
      };
      if (options.contentEncoding) headers['Content-Encoding'] = options.contentEncoding;
      const body = compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength) as ArrayBuffer;
      return new Response(body, { status: 200, headers });
    }
    return new Response('not found', { status: 404 });
  };
  return { fetch, chunkRequests: () => chunkRequests };
}

function publicAssetFetch() {
  let chunkRequests = 0;
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const pathname = new URL(String(input), 'http://localhost').pathname;
    const match = /^\/device-data\/(exl50u-efit(?:-v2)?)\/([a-z0-9.-]+)$/.exec(pathname);
    if (!match) return new Response('not found', { status: 404 });
    let payload: Buffer;
    try {
      payload = await readFile(new URL(`../public/data/${match[1]}/${match[2]}`, import.meta.url));
    } catch {
      return new Response('not found', { status: 404 });
    }
    const range = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init.headers).get('range') ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = Math.min(payload.length - 1, Number(range[2]));
      const body = payload.buffer.slice(payload.byteOffset + start, payload.byteOffset + end + 1) as ArrayBuffer;
      return new Response(body, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${payload.length}`,
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(end - start + 1),
        },
      });
    }
    if (match[2].endsWith('.jsonl.gz')) chunkRequests += 1;
    const contentType = match[2].endsWith('.json')
      ? 'application/json'
      : match[2].endsWith('.jsonl.gz') ? 'application/gzip' : 'application/octet-stream';
    const body = payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength) as ArrayBuffer;
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Content-Length': String(payload.length) },
    });
  };
  return { fetch, chunkRequests: () => chunkRequests };
}

test('hybrid v2 source exposes legacy and graph shots, finite signal summaries, and a cached decoded frame', async () => {
  const { catalog, compressed } = fixture();
  const network = mockFetch(catalog, compressed);
  const source = createEfitHybridDataSource({ fetch: network.fetch });
  const manifest = await source.loadManifest();
  assert.deepEqual(manifest.shots.map((shot) => shot.shot), [18301, 20289]);
  assert.deepEqual(manifest.numericQuantization, {
    fractionDigits: 8,
    roundingMode: 'ROUND_HALF_EVEN',
    negativeZeroNormalized: true,
    maxAbsoluteErrorPerValue: 5e-9,
  });
  assert.match(manifest.shots[1]?.catalog?.reconstructionLabel ?? '', /aaaaaaaaaaaa/);
  const timeline = await source.loadTimeline(20289);
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].currentA, 321_000);
  assert.equal(timeline[0].rAxisM, 0.75);
  assert.equal(timeline[0].lcfsRMinM, 0.4);
  assert.equal(timeline[0].lcfsRMaxM, 1.1);
  assert.equal(timeline[0].quality.state, 'good');
  const frame = await source.loadFrame(20289, 0);
  assert.equal(frame.timeMs, 110);
  assert.equal(frame.topologyGraphPayload?.topologyGraph.nodes[0].kind, 'magnetic-axis');
  assert.equal(frame.contours[0].validPoints, 4);
  assert.equal(frame.contours[0].closed, true);
  assert.equal(frame.lcfsRMinM, 0.4);
  assert.equal(frame.lcfsRMaxM, 1.1);
  await source.loadFrame(20289, 0);
  assert.equal(network.chunkRequests(), 1, 'the verified chunk should be served from the bounded LRU');
});

test('hybrid v2 source shares one in-flight chunk across concurrent consumers', async () => {
  const fixtureValue = fixture();
  const network = mockFetch(fixtureValue.catalog, fixtureValue.compressed, { delayChunk: true });
  const source = createEfitHybridDataSource({ fetch: network.fetch });
  await source.loadManifest();
  const firstController = new AbortController();
  const secondController = new AbortController();
  const first = source.loadFrame(20289, 0, { signal: firstController.signal });
  const second = source.loadFrame(20289, 0, { signal: secondController.signal });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(network.chunkRequests(), 1, 'concurrent frame consumers must share one chunk request');
  firstController.abort();
  secondController.abort();
  const results = await Promise.allSettled([first, second]);
  assert.ok(results.every((result) => result.status === 'rejected' && result.reason?.name === 'AbortError'));
});

test('3D X-point marker semantics keep near-boundary evidence visually inactive', () => {
  assert.equal(efitXPointMarkerRole({ rM: 0.8, zM: 0.2, role: 'primary', evidenceRole: 'near-boundary' }), 'near-boundary-evidence');
  assert.equal(efitXPointMarkerRole({ rM: 0.8, zM: -0.2, role: 'secondary', evidenceOnly: true }), 'near-boundary-evidence');
  assert.equal(efitXPointMarkerRole({ rM: 0.8, zM: -0.2, role: 'secondary', evidenceRole: 'boundary' }), 'active-secondary');
  assert.equal(efitXPointMarkerRole({ rM: 0.8, zM: 0.2, role: 'primary', evidenceRole: 'boundary' }), 'active-primary');
});

test('empty topology graphs are accepted only for explicitly unavailable frames', () => {
  const geometryId = 'wall-00000000000000000000';
  const geometry = {
    geometryId,
    limiterRzM: { rM: [0.3, 1.2, 1.2, 0.3, 0.3], zM: [-1, -1, 1, 1, -1], validPoints: 5 },
    canonicalSegmentCount: 4,
    gridExtentM: [0.2, 2.2, -1.899999975, 1.899999975] as const,
  };
  const partial = graphFrame(geometryId);
  partial.topologyGraph.nodes = [];
  partial.quality.validity = 'partial';
  assert.throws(() => validateEfitTopologyGraphFrame(partial, { geometry }), /must publish at least one topology node/);
  const unavailable = structuredClone(partial);
  unavailable.quality.validity = 'unavailable';
  assert.equal(validateEfitTopologyGraphFrame(unavailable, { geometry }).topologyGraph.nodes.length, 0);
});

test('psiN derived consistency tolerance is bounded by the published quantization contract', () => {
  const geometryId = 'wall-00000000000000000000';
  const geometry = {
    geometryId,
    limiterRzM: { rM: [0.3, 1.2, 1.2, 0.3, 0.3], zM: [-1, -1, 1, 1, -1], validPoints: 5 },
    canonicalSegmentCount: 4,
    gridExtentM: [0.2, 2.2, -1.899999975, 1.899999975] as const,
  };
  const frame = graphFrame(geometryId);
  const nodes: unknown[] = frame.topologyGraph.nodes;
  nodes.push({
    nodeId: 'candidate-x',
    kind: 'x-point',
    role: 'near-boundary',
    activityRole: 'secondary',
    activeBranchEligible: false,
    evidenceOnly: true,
    evidence: evidence(),
    rM: 0.8,
    zM: -0.5,
    psiN: 0.99,
    absPsiNMinusOne: 0.01000001,
    gradientResidual: 0.001,
    fitRms: 0.001,
    lcfsDistanceM: 0.01,
    hessianEigenvaluesPerM2: [-1, 1],
    positionUncertaintyM: 0.01,
  });
  Object.assign(frame.topologyGraph.features, {
    xPointCount: 1,
    candidateXPointCount: 1,
    nearBoundaryXPointCount: 1,
  });
  assert.throws(() => validateEfitTopologyGraphFrame(frame, { geometry }), /psiN evidence is inconsistent/);
  assert.equal(validateEfitTopologyGraphFrame(frame, {
    geometry,
    numericQuantization: {
      fractionDigits: 8,
      roundingMode: 'ROUND_HALF_EVEN',
      negativeZeroNormalized: true,
      maxAbsoluteErrorPerValue: 5e-9,
    },
  }).topologyGraph.features.candidateXPointCount, 1);
});

test('hybrid v2 source rejects altered bytes, altered length, and transparent HTTP gzip', async () => {
  const fixtureValue = fixture();
  const badHash = structuredClone(fixtureValue.catalog);
  badHash.shots[1]!.frameAssets![0]!.sha256 = '0'.repeat(64);
  await assert.rejects(
    createEfitHybridDataSource({ fetch: mockFetch(badHash, fixtureValue.compressed).fetch }).loadFrame(20289, 0),
    /SHA-256 mismatch/,
  );

  const badLength = structuredClone(fixtureValue.catalog);
  badLength.shots[1]!.frameAssets![0]!.byteLength += 1;
  await assert.rejects(
    createEfitHybridDataSource({ fetch: mockFetch(badLength, fixtureValue.compressed).fetch }).loadFrame(20289, 0),
    /Content-Length mismatch|byte length mismatch/,
  );

  await assert.rejects(
    createEfitHybridDataSource({ fetch: mockFetch(fixtureValue.catalog, fixtureValue.compressed, { contentEncoding: 'gzip' }).fetch }).loadFrame(20289, 0),
    /raw gzip bytes/,
  );

  const mismatchedTimeline = structuredClone(fixtureValue.catalog);
  mismatchedTimeline.shots[1]!.frames![0]!.currentA += 1;
  await assert.rejects(
    createEfitHybridDataSource({ fetch: mockFetch(mismatchedTimeline, fixtureValue.compressed).fetch }).loadFrame(20289, 0),
    /currentA disagrees with its catalog timeline summary/,
  );
});

test('hybrid v2 source forwards AbortSignal and falls back only when the v2 index is 404', async () => {
  const fixtureValue = fixture();
  const delayed = mockFetch(fixtureValue.catalog, fixtureValue.compressed, { delayChunk: true });
  const delayedSource = createEfitHybridDataSource({ fetch: delayed.fetch });
  await delayedSource.loadManifest();
  const controller = new AbortController();
  const pending = delayedSource.loadFrame(20289, 0, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof Error && error.name === 'AbortError');

  const fallback = createEfitHybridDataSource({ fetch: mockFetch(fixtureValue.catalog, fixtureValue.compressed, { v2Status: 404 }).fetch });
  const manifest = await fallback.loadManifest();
  assert.deepEqual(manifest.shots.map((shot) => shot.shot), [18301, 18303, 18304, 18308]);
});

test('hybrid catalog rejects geometry lies, unknown geometry ids, and duplicate or fractional times', async () => {
  const fixtureValue = fixture();
  const legacyManifest = await createEfitHybridDataSource({
    fetch: mockFetch(fixtureValue.catalog, fixtureValue.compressed, { v2Status: 404 }).fetch,
  }).loadManifest();

  const badSegments = structuredClone(fixtureValue.catalog);
  badSegments.geometries[1].segmentCount = 3;
  assert.throws(() => normalizeEfitHybridCatalog(badSegments, legacyManifest), /segment count disagrees/);

  const unknownGeometry = structuredClone(fixtureValue.catalog);
  unknownGeometry.shots[1].geometryId = 'unknown-wall';
  assert.throws(() => normalizeEfitHybridCatalog(unknownGeometry, legacyManifest), /unknown geometry/);

  const unknownDataset = structuredClone(fixtureValue.catalog);
  unknownDataset.shots[1].datasetId = 'unknown-dataset';
  assert.throws(() => normalizeEfitHybridCatalog(unknownDataset, legacyManifest), /not present in the reviewed catalog/);

  const mismatchedReconstruction = structuredClone(fixtureValue.catalog);
  mismatchedReconstruction.shots[1].reconstructionDigest = 'b'.repeat(64);
  assert.throws(() => normalizeEfitHybridCatalog(mismatchedReconstruction, legacyManifest), /not bound to its published digest/);

  const uppercaseDigest = structuredClone(fixtureValue.catalog);
  uppercaseDigest.shots[1].reconstructionDigest = RECONSTRUCTION_DIGEST.toUpperCase();
  assert.throws(() => normalizeEfitHybridCatalog(uppercaseDigest, legacyManifest), /SHA-256 digest/);

  const unsupportedQuantization = structuredClone(fixtureValue.catalog);
  unsupportedQuantization.distributionPolicy.numericQuantization.fractionDigits = 7;
  assert.throws(() => normalizeEfitHybridCatalog(unsupportedQuantization, legacyManifest), /quantization contract is unsupported/);

  const fractionalTime = structuredClone(fixtureValue.catalog);
  fractionalTime.shots[1]!.availableTimesMs![0] = 110.5;
  assert.throws(() => normalizeEfitHybridCatalog(fractionalTime, legacyManifest), /integer in range/);

  const mismatchedSummary = structuredClone(fixtureValue.catalog);
  mismatchedSummary.shots[1]!.frames![0]!.timeMs = 111;
  assert.throws(() => normalizeEfitHybridCatalog(mismatchedSummary, legacyManifest), /misaligned/);

  const oddLimiter = structuredClone(fixtureValue.catalog);
  oddLimiter.geometries[1].limiterRzM.pop();
  assert.throws(() => normalizeEfitHybridCatalog(oddLimiter, legacyManifest), /complete bounded R-Z pairs/);
});

test('published shot 20708 conservatively closes its graph-v2 divertor display region at 172 ms', async () => {
  const source = createEfitHybridDataSource({ fetch: publicAssetFetch().fetch, maxCachedChunks: 2 });
  const manifest = await source.loadManifest();
  const shot = manifest.shots.find((candidate) => candidate.shot === 20708);
  assert.ok(shot);
  const frameIndex = shot.frames.findIndex((frame) => frame.timeMs === 172);
  assert.ok(frameIndex >= 0);
  const frame = await source.loadFrame(20708, frameIndex);
  const graph = frame.topologyGraphPayload?.topologyGraph;
  assert.ok(graph);

  const region = deriveVerifiedDivertorGraphRegion(graph, { rM: frame.rAxisM, zM: frame.zAxisM });
  assert.equal(region.state, 'filled');
  assert.equal(region.code, 'closed-published-graph-boundary');
  assert.ok(region.polygon.length > 100, 'the display region must preserve both 64-point branches and the published wall arc');
  assert.ok(region.limiterArc.length > 2, 'the region must use the published multi-segment wall arc, never a strike-point chord');

  const ambiguousEvidence = {
    ...graph,
    unresolvedRegions: [...graph.unresolvedRegions, structuredClone(graph.unresolvedRegions[0])],
  };
  const ambiguous = deriveVerifiedDivertorGraphRegion(ambiguousEvidence, { rM: frame.rAxisM, zM: frame.zAxisM });
  assert.equal(ambiguous.state, 'wireframe');
  assert.equal(ambiguous.code, 'partial-topology');

  const incompleteIndex = shot.frames.findIndex((candidate) => candidate.timeMs === 176);
  assert.ok(incompleteIndex >= 0);
  const incompleteFrame = await source.loadFrame(20708, incompleteIndex);
  const incompleteGraph = incompleteFrame.topologyGraphPayload?.topologyGraph;
  assert.ok(incompleteGraph);
  const rejected = deriveVerifiedDivertorGraphRegion(incompleteGraph, {
    rM: incompleteFrame.rAxisM,
    zM: incompleteFrame.zAxisM,
  });
  assert.equal(rejected.state, 'wireframe');
  assert.equal(rejected.code, 'partial-topology');
});

test('published 10-shot catalog and all 219 graph chunks decode through the production hybrid path', async () => {
  const network = publicAssetFetch();
  const source = createEfitHybridDataSource({ fetch: network.fetch, maxCachedChunks: 8 });
  const manifest = await source.loadManifest();
  assert.deepEqual(manifest.shots.map((shot) => shot.shot), [18301, 18303, 18304, 18308, 20213, 20289, 20666, 20669, 20707, 20708]);
  assert.equal(manifest.shots.reduce((total, shot) => total + shot.frameCount, 0), 5_804);
  assert.deepEqual(manifest.numericQuantization, {
    fractionDigits: 8,
    roundingMode: 'ROUND_HALF_EVEN',
    negativeZeroNormalized: true,
    maxAbsoluteErrorPerValue: 5e-9,
  });
  assert.deepEqual(new Set(manifest.shots.map((shot) => shot.geometryId)), new Set([
    'legacy-wall-670a93840d1354ae4c96',
    'wall-0a9a572a64f6f2e36ac2',
  ]));

  const totals = {
    frames: 0,
    lcfsAvailable: 0,
    lcfsUnavailable: 0,
    xPoints: 0,
    boundaryXPoints: 0,
    candidateXPoints: 0,
    edges: 0,
    wallIntersections: 0,
    regions: 0,
    unresolvedArms: 0,
    unresolvedRegions: 0,
    usable: 0,
    partial: 0,
    unavailable: 0,
  };
  for (const shot of manifest.shots) {
    const timeline = await source.loadTimeline(shot.shot);
    assert.equal(timeline.length, shot.frameCount);
    assert.ok(timeline.every((frame, index) => Number.isFinite(frame.currentA)
      && Number.isFinite(frame.rAxisM)
      && Number.isFinite(frame.zAxisM)
      && ((typeof frame.lcfsRMinM === 'number' && typeof frame.lcfsRMaxM === 'number')
        || (frame.lcfsRMinM === null && frame.lcfsRMaxM === null))
      && (index === 0 || frame.timeMs > timeline[index - 1]!.timeMs)));
    if (shot.sourceKind === 'legacy-contours-v1') {
      assert.ok(timeline.every((frame) => typeof frame.lcfsRMinM === 'number' && typeof frame.lcfsRMaxM === 'number'));
    }
    if (shot.sourceKind !== 'topology-graph-v2') continue;
    for (let frameIndex = 0; frameIndex < shot.frameCount; frameIndex += 1) {
      const frame = await source.loadFrame(shot.shot, frameIndex);
      const payload = frame.topologyGraphPayload;
      assert.ok(payload);
      assert.equal(frame.timeMs, timeline[frameIndex]!.timeMs);
      assert.equal(frame.lcfsRMinM, timeline[frameIndex]!.lcfsRMinM);
      assert.equal(frame.lcfsRMaxM, timeline[frameIndex]!.lcfsRMaxM);
      if (frame.lcfsRMinM === null) totals.lcfsUnavailable += 1;
      else totals.lcfsAvailable += 1;
      assert.equal(payload.geometryId, shot.geometryId);
      assert.equal(payload.quality.algorithmVersion, '2.0.0');
      const features = payload.topologyGraph.features;
      totals.frames += 1;
      totals.xPoints += features.xPointCount;
      totals.boundaryXPoints += features.boundaryXPointCount;
      totals.candidateXPoints += features.nearBoundaryXPointCount;
      totals.edges += features.resolvedBranchCount;
      totals.wallIntersections += features.wallIntersectionCount;
      totals.regions += payload.topologyGraph.regions.length;
      totals.unresolvedArms += payload.topologyGraph.unresolvedArms.length;
      totals.unresolvedRegions += payload.topologyGraph.unresolvedRegions.length;
      totals[payload.quality.validity] += 1;
    }
    const requestsBeforeCacheHit = network.chunkRequests();
    await source.loadFrame(shot.shot, shot.frameCount - 1);
    assert.equal(network.chunkRequests(), requestsBeforeCacheHit, 'the most recent verified chunk must remain in the LRU');
  }

  assert.deepEqual(totals, {
    frames: 3_446,
    lcfsAvailable: 3_338,
    lcfsUnavailable: 108,
    xPoints: 3_100,
    boundaryXPoints: 1_605,
    candidateXPoints: 1_495,
    edges: 3_606,
    wallIntersections: 2_420,
    regions: 33_382,
    unresolvedArms: 1_934,
    unresolvedRegions: 1_330,
    usable: 2_351,
    partial: 987,
    unavailable: 108,
  });
  assert.equal(network.chunkRequests(), 219);
});
