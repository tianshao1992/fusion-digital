import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  Scene,
  Vector2,
  Vector3,
  Vector4,
  type Camera,
  type WebGLRenderer,
} from 'three';

import {
  computeFrustumSnapshotPlan,
  createEhl2DiagnosticRuntime,
  type Ehl2DiagnosticRuntimeContext,
  type Ehl2TraceRequest,
} from '../app/components/device-viewer/ehl2DiagnosticRuntime.ts';

const TEST_RUNTIME_PROVENANCE = {
  schema: 'fusiondigital.ehl2-public-cad-v1',
  deviceId: 'ehl-2-runtime-fixture',
  assetId: 'fixture-monolithic-cad',
  modelPath: '/models/ehl2-runtime-fixture/fixture.glb',
  modelSha256: 'A'.repeat(64),
  coordinateFrame: 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1',
  engine: 'three-mesh-bvh-v1',
} as const;

function approximate(actual: number | null, expected: number, epsilon = 1e-7) {
  assert.notEqual(actual, null);
  assert.ok(Math.abs((actual as number) - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
}

function fixture(options: { displayTransform?: boolean; deferredBlob?: boolean; pixelRatio?: number } = {}) {
  const scene = new Scene();
  const root = new Group();
  root.name = 'PHYSICAL_WEB_METRES_ROOT';
  if (options.displayTransform) {
    root.position.set(7, -3, 4);
    root.scale.setScalar(2.75);
  }
  const geometry = new BoxGeometry(2, 2, 2);
  const mesh = new Mesh(geometry, new MeshBasicMaterial());
  mesh.name = 'VESSEL_MESH';
  root.add(mesh);
  scene.add(root);
  root.updateWorldMatrix(true, true);

  let basePlanes: Plane[] = [];
  let diagnosticPlanes: Plane[] = [];
  let renderCount = 0;
  let renderedCamera: Camera | null = null;
  let diagnosticOverlayVisibleAtRender: boolean | null = null;
  let diagnosticOverlayNodeVisibilityAtRender: Readonly<Record<string, boolean>> | null = null;
  let pendingBlobCallback: BlobCallback | null = null;
  let logicalWidth = 640;
  let logicalHeight = 360;
  let pixelRatio = options.pixelRatio ?? 1;
  let renderedCanvasSize: readonly [number, number] | null = null;
  const drawingBufferSizes: Array<readonly [number, number, number]> = [];
  const viewport = new Vector4(11, 12, 300, 200);
  const scissor = new Vector4(13, 14, 250, 150);
  let scissorTest = true;
  const initialRenderTarget = { name: 'fixture-target' } as unknown as ReturnType<WebGLRenderer['getRenderTarget']>;
  let renderTarget = initialRenderTarget;
  const canvas = {
    width: Math.floor(logicalWidth * pixelRatio),
    height: Math.floor(logicalHeight * pixelRatio),
    toBlob(callback: BlobCallback, mimeType?: string) {
      if (options.deferredBlob) {
        pendingBlobCallback = callback;
        return;
      }
      callback(new Blob(['png'], { type: mimeType ?? 'image/png' }));
    },
  } as unknown as HTMLCanvasElement;
  const renderer = {
    domElement: canvas,
    render(_scene: Scene, renderCamera: Camera) {
      renderCount += 1;
      renderedCamera = renderCamera;
      renderedCanvasSize = [canvas.width, canvas.height];
      const diagnosticOverlay = _scene.getObjectByName('EHL2_DIAGNOSTIC_FOV_OVERLAY');
      diagnosticOverlayVisibleAtRender = diagnosticOverlay?.visible ?? null;
      if (diagnosticOverlay) {
        const visibility: Record<string, boolean> = {};
        diagnosticOverlay.traverse((node) => {
          if (node.name) visibility[node.name] = node.visible;
        });
        diagnosticOverlayNodeVisibilityAtRender = visibility;
      } else {
        diagnosticOverlayNodeVisibilityAtRender = null;
      }
    },
    getViewport(target: Vector4) { return target.copy(viewport); },
    setViewport(value: number | Vector4, y?: number, width?: number, height?: number) {
      if (value instanceof Vector4) viewport.copy(value);
      else viewport.set(value, y ?? 0, width ?? 0, height ?? 0);
    },
    getScissor(target: Vector4) { return target.copy(scissor); },
    setScissor(value: number | Vector4, y?: number, width?: number, height?: number) {
      if (value instanceof Vector4) scissor.copy(value);
      else scissor.set(value, y ?? 0, width ?? 0, height ?? 0);
    },
    getScissorTest() { return scissorTest; },
    setScissorTest(value: boolean) { scissorTest = value; },
    getRenderTarget() { return renderTarget; },
    setRenderTarget(value: ReturnType<WebGLRenderer['getRenderTarget']>) { renderTarget = value; },
    getSize(target: Vector2) { return target.set(logicalWidth, logicalHeight); },
    getPixelRatio() { return pixelRatio; },
    setDrawingBufferSize(width: number, height: number, nextPixelRatio: number) {
      logicalWidth = width;
      logicalHeight = height;
      pixelRatio = nextPixelRatio;
      canvas.width = Math.floor(width * nextPixelRatio);
      canvas.height = Math.floor(height * nextPixelRatio);
      drawingBufferSizes.push([width, height, nextPixelRatio]);
    },
  } as unknown as Ehl2DiagnosticRuntimeContext['renderer'];
  const camera = new PerspectiveCamera();
  camera.position.set(21, 22, 23);
  camera.rotation.set(0.1, 0.2, 0.3);
  const runtime = createEhl2DiagnosticRuntime({
    provenance: TEST_RUNTIME_PROVENANCE,
    physicalWebMetresRoot: root,
    meshes: [{ mesh, partId: 'vacuum-vessel', model: 'EHL2_VESSEL' }],
    renderer,
    scene,
    camera,
    getActiveClippingPlanes: () => [...basePlanes, ...diagnosticPlanes],
    setDiagnosticClippingPlanes: (planes) => { diagnosticPlanes = [...planes]; },
  });
  return {
    runtime,
    scene,
    root,
    mesh,
    geometry,
    setBasePlanes(planes: Plane[]) { basePlanes = planes; },
    getDiagnosticPlanes: () => diagnosticPlanes,
    getRenderCount: () => renderCount,
    getRenderedCamera: () => renderedCamera,
    getRenderedCanvasSize: () => renderedCanvasSize,
    getDrawingBufferSizes: () => drawingBufferSizes,
    getCanvasState: () => ({
      logicalSize: [logicalWidth, logicalHeight],
      drawingBufferSize: [canvas.width, canvas.height],
      pixelRatio,
    }),
    getDiagnosticOverlayVisibleAtRender: () => diagnosticOverlayVisibleAtRender,
    getDiagnosticOverlayNodeVisibilityAtRender: () => diagnosticOverlayNodeVisibilityAtRender,
    getRendererState: () => ({
      viewport: viewport.toArray(),
      scissor: scissor.toArray(),
      scissorTest,
      renderTarget,
    }),
    initialRenderTarget,
    releaseBlob(value: Blob | null = new Blob(['png'], { type: 'image/png' })) {
      const callback = pendingBlobCallback;
      pendingBlobCallback = null;
      if (!callback) throw new Error('No PNG encoding callback is pending.');
      callback(value);
    },
    camera,
  };
}

function request(rays: Ehl2TraceRequest['rays'], revision: number | string = 1): Ehl2TraceRequest {
  return { requestId: `request-${revision}`, revision, rays };
}

const HIT_RAY = {
  rayId: 'hit',
  originWebMetres: [-3, 0, 0] as const,
  directionWeb: [1, 0, 0] as const,
  defaultLengthMetres: 10,
};

const DIAGNOSTIC_VIEW = {
  designId: 'capture camera 诊断',
  originWebMetres: [1, 2, 3] as const,
  directionWeb: [1, 0, 0] as const,
  upWeb: [0, 0, 1] as const,
  hStartDeg: -10,
  hEndDeg: 30,
  vStartDeg: -5,
  vEndDeg: 15,
  nearMetres: 0.01,
  farMetres: 5,
};

function addCaptureOverlay(scene: Scene) {
  const overlay = new Group();
  overlay.name = 'EHL2_DIAGNOSTIC_FOV_OVERLAY';
  const content = new Group();
  content.name = 'DIAGNOSTIC_OVERLAY_CONTENT';
  overlay.add(content);
  scene.add(overlay);

  const active = new Group();
  active.name = 'EHL2_DIAGVIEW2_WORKBENCH_CAPTURE-CAMERA';
  active.userData = {
    kind: 'ehl2-diagview2-workbench-overlay',
    designId: DIAGNOSTIC_VIEW.designId,
    captureRole: 'active',
  };
  const child = (name: string) => {
    const node = new Group();
    node.name = name;
    active.add(node);
    return node;
  };
  const activeRays = child(`${active.name}_RAYS`);
  const activeFrustum = child(`${active.name}_FINITE_FRUSTUM`);
  const activeOpticalCentre = child(`${active.name}_OPTICAL_CENTRE`);
  const activeLabel = child(`${active.name}_LABEL`);
  const activeHit = child(`${active.name}_optical_axis_HIT`);
  content.add(active);

  const frozen = new Group();
  frozen.name = 'EHL2_DIAGVIEW2_WORKBENCH_FROZEN-CAMERA';
  frozen.userData = {
    kind: 'ehl2-diagview2-workbench-overlay',
    designId: DIAGNOSTIC_VIEW.designId,
    captureRole: 'frozen',
  };
  const frozenRays = new Group();
  frozenRays.name = `${frozen.name}_RAYS`;
  frozen.add(frozenRays);
  content.add(frozen);

  const otherActive = new Group();
  otherActive.name = 'EHL2_DIAGVIEW2_WORKBENCH_OTHER-CAMERA';
  otherActive.userData = {
    kind: 'ehl2-diagview2-workbench-overlay',
    designId: 'other-camera',
    captureRole: 'active',
  };
  const otherRays = new Group();
  otherRays.name = `${otherActive.name}_RAYS`;
  otherActive.add(otherRays);
  content.add(otherActive);

  const plasma = new Group();
  plasma.name = 'EHL2_DIAGVIEW2_GEQDSK_PLASMA_CONTEXT';
  content.add(plasma);
  const ports = new Group();
  ports.name = 'EHL2_DIAGVIEW2_REVIEWED_PORT_MARKERS';
  content.add(ports);
  return {
    overlay,
    active,
    activeRays,
    activeFrustum,
    activeOpticalCentre,
    activeLabel,
    activeHit,
    frozen,
    frozenRays,
    otherActive,
    otherRays,
    plasma,
    ports,
  };
}

test('plans DiagView2-compatible asymmetric snapshot pixels from tangent-angle bounds', () => {
  const defaultPlan = computeFrustumSnapshotPlan(-20, 20, -10, 20);
  assert.equal(defaultPlan.renderWidth, 1920);
  assert.equal(defaultPlan.renderHeight, 1920);
  assert.deepEqual(defaultPlan.cropBox, [0, 0, 1920, 1426]);
  assert.equal(defaultPlan.outputWidth, 1920);
  assert.equal(defaultPlan.outputHeight, 1426);
  approximate(defaultPlan.fovRad * 180 / Math.PI, 40);
  approximate(
    defaultPlan.outputWidth / defaultPlan.outputHeight,
    (Math.tan(20 * Math.PI / 180) - Math.tan(-20 * Math.PI / 180))
      / (Math.tan(20 * Math.PI / 180) - Math.tan(-10 * Math.PI / 180)),
    2e-3,
  );

  const offAxisPlan = computeFrustumSnapshotPlan(5, 20, -10, 20);
  assert.equal(offAxisPlan.cropBox[0] > 0, true);
  assert.equal(offAxisPlan.cropBox[2], offAxisPlan.renderWidth);
  assert.ok(Math.max(offAxisPlan.renderWidth, offAxisPlan.renderHeight) <= 4096);
});

test('traces closest CAD hits in physical Web metres and preserves ray order', async () => {
  const { runtime } = fixture({ displayTransform: true });
  assert.deepEqual(runtime.provenance, TEST_RUNTIME_PROVENANCE,
    'runtime analysis results must expose the exact immutable public-CAD provenance');
  const result = await runtime.traceRays(request([
    HIT_RAY,
    {
      rayId: 'miss',
      originWebMetres: [-3, 3, 0],
      directionWeb: [1, 0, 0],
      defaultLengthMetres: 10,
    },
  ]));

  assert.equal(result.status, 'completed');
  assert.equal(result.authority, 'render-cad-bvh-derived');
  assert.deepEqual(result.results.map(({ rayId }) => rayId), ['hit', 'miss']);
  const hit = result.results[0];
  assert.equal(hit.state, 'hit');
  assert.equal(hit.partId, 'vacuum-vessel');
  assert.equal(hit.model, 'EHL2_VESSEL');
  approximate(hit.distanceMetres, 2);
  approximate(hit.hitPointWebMetres?.[0] ?? null, -1);
  approximate(hit.hitPointWebMetres?.[1] ?? null, 0);
  approximate(hit.hitPointWebMetres?.[2] ?? null, 0);
  assert.equal(typeof hit.triangleIndex, 'number');
  approximate(hit.incidenceAngleDeg, 0, 1e-5);
  assert.equal(result.results[1].state, 'miss');
  assert.equal(runtime.status, 'ready');
  runtime.dispose();
});

test('invalid, aborted and failed ray states can never be mistaken for scientific misses', async () => {
  const { runtime } = fixture();
  const invalid = await runtime.traceRays(request([{
    ...HIT_RAY,
    rayId: 'invalid-zero-direction',
    directionWeb: [0, 0, 0],
  }], 'invalid'));

  assert.equal(invalid.status, 'completed');
  assert.equal(invalid.results[0].state, 'invalid');
  assert.notEqual(invalid.results[0].state, 'miss');
  assert.match(invalid.results[0].error ?? '', /non-zero/i);

  runtime.dispose();
  const disposed = await runtime.traceRays(request([HIT_RAY], 'disposed'));
  assert.equal(disposed.status, 'aborted');
  assert.equal(disposed.results[0].state, 'aborted');
  assert.notEqual(disposed.results[0].state, 'miss');

  const { runtime: failedRuntime } = fixture();
  (failedRuntime as unknown as { buildOnce: () => Promise<void> }).buildOnce = async () => {
    throw new Error('synthetic BVH failure');
  };
  const failed = await failedRuntime.traceRays(request([HIT_RAY], 'failed'));
  assert.equal(failed.status, 'failed');
  assert.match(failed.error ?? '', /synthetic BVH failure/);
  assert.equal(failed.results[0].state, 'error');
  assert.notEqual(failed.results[0].state, 'miss');
  failedRuntime.dispose();
});

test('respects current part visibility and optionally filters rendered clipping planes', async () => {
  const { runtime, mesh, setBasePlanes } = fixture();
  setBasePlanes([new Plane(new Vector3(1, 0, 0), 0)]); // retain x >= 0

  const clipped = await runtime.traceRays(request([HIT_RAY], 'clipped'));
  assert.equal(clipped.results[0].state, 'hit');
  approximate(clipped.results[0].distanceMetres, 4);
  approximate(clipped.results[0].hitPointWebMetres?.[0] ?? null, 1);

  const unfiltered = await runtime.traceRays({
    ...request([HIT_RAY], 'unfiltered'),
    respectClipping: false,
  });
  approximate(unfiltered.results[0].distanceMetres, 2);

  mesh.visible = false;
  const hidden = await runtime.traceRays(request([HIT_RAY], 'hidden'));
  assert.equal(hidden.results[0].state, 'miss');
  const sourceCompatible = await runtime.traceRays({
    ...request([HIT_RAY], 'source-compatible'),
    respectClipping: false,
    respectVisibility: false,
  });
  assert.equal(sourceCompatible.results[0].state, 'hit');
  approximate(sourceCompatible.results[0].distanceMetres, 2);

  runtime.applyDiagnosticSlice({ kind: 'xz', offsetWebMetres: 0, keepSide: 'positive' });
  const sourceCompatibleWithRenderSlice = await runtime.traceRays({
    ...request([HIT_RAY], 'source-compatible-render-slice'),
    respectClipping: false,
    respectVisibility: false,
  });
  assert.equal(sourceCompatibleWithRenderSlice.results[0].state, 'hit');
  approximate(sourceCompatibleWithRenderSlice.results[0].distanceMetres, 2);
  runtime.dispose();
});

test('builds BVHs lazily, reuses them, and does not patch Three.js prototypes or source geometry', async () => {
  const { runtime, geometry } = fixture();
  const originalRaycast = Mesh.prototype.raycast;
  const originalIndex = geometry.index;
  assert.equal(runtime.status, 'idle');

  assert.equal(await runtime.ready(), 'ready');
  assert.equal(await runtime.ready(), 'ready');
  assert.equal(Mesh.prototype.raycast, originalRaycast);
  assert.equal(geometry.index, originalIndex);
  assert.equal(geometry.boundsTree, undefined);
  runtime.dispose();
  assert.equal(runtime.status, 'disposed');
});

test('aborts stale revisions without returning a stale completed trace', async () => {
  const { runtime } = fixture();
  await runtime.ready();
  const manyRays = Array.from({ length: 24 }, (_, index) => ({ ...HIT_RAY, rayId: `old-${index}` }));
  const oldPromise = runtime.traceRays(request(manyRays, 10));
  const latestPromise = runtime.traceRays(request([{ ...HIT_RAY, rayId: 'latest' }], 11));
  const [oldResult, latestResult] = await Promise.all([oldPromise, latestPromise]);

  assert.equal(oldResult.status, 'aborted');
  assert.equal(oldResult.revision, 10);
  assert.equal(oldResult.results.length, manyRays.length);
  assert.equal(latestResult.status, 'completed');
  assert.equal(latestResult.revision, 11);
  assert.equal(latestResult.results[0].state, 'hit');

  const controller = new AbortController();
  controller.abort();
  const aborted = await runtime.traceRays(request([HIT_RAY], 12), controller.signal);
  assert.equal(aborted.status, 'aborted');
  assert.equal(aborted.results.length, 1);
  assert.equal(aborted.results[0].state, 'aborted');
  runtime.dispose();
});

test('applies explicitly render-only XY, XZ, array and six-plane camera slices', () => {
  const { runtime, getDiagnosticPlanes } = fixture({ displayTransform: true });
  const xy = runtime.applyDiagnosticSlice({ kind: 'xy', offsetWebMetres: 0.25 });
  assert.equal(xy.authority, 'render-only-three-clipping');
  assert.equal(xy.planeCount, 1);
  assert.match(xy.note, /Render-only slice/);
  assert.equal(getDiagnosticPlanes().length, 1);

  const xz = runtime.applyDiagnosticSlice({ kind: 'xz', offsetWebMetres: -0.5, keepSide: 'negative' });
  assert.equal(xz.kind, 'xz');
  assert.equal(getDiagnosticPlanes().length, 1);

  const array = runtime.applyDiagnosticSlice({
    kind: 'array-plane',
    plane: { pointWebMetres: [0, 0, 0], normalWeb: [1, 1, 0] },
  });
  assert.equal(array.kind, 'array-plane');
  assert.equal(array.planeCount, 1);

  assert.throws(() => runtime.applyDiagnosticSlice({
    kind: 'camera-six-plane',
    planes: [{ pointWebMetres: [0, 0, 0], normalWeb: [1, 0, 0] }],
  }), /exactly six planes/);
  const camera = runtime.applyDiagnosticSlice({
    kind: 'camera-six-plane',
    planes: [
      { pointWebMetres: [-1, 0, 0], normalWeb: [1, 0, 0] },
      { pointWebMetres: [1, 0, 0], normalWeb: [-1, 0, 0] },
      { pointWebMetres: [0, -1, 0], normalWeb: [0, 1, 0] },
      { pointWebMetres: [0, 1, 0], normalWeb: [0, -1, 0] },
      { pointWebMetres: [0, 0, -1], normalWeb: [0, 0, 1] },
      { pointWebMetres: [0, 0, 1], normalWeb: [0, 0, -1] },
    ],
  });
  assert.equal(camera.planeCount, 6);
  assert.equal(getDiagnosticPlanes().length, 6);
  assert.equal(runtime.clearDiagnosticSlice().status, 'cleared');
  assert.equal(getDiagnosticPlanes().length, 0);
  runtime.dispose();
});

test('captures a PNG from the current renderer and observes aborts', async () => {
  const { runtime, getRenderCount } = fixture();
  const capture = await runtime.capturePng();
  assert.equal(capture.authority, 'render-capture');
  assert.equal(capture.blob.type, 'image/png');
  assert.equal(capture.width, 640);
  assert.equal(capture.height, 360);
  assert.equal(getRenderCount(), 1);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runtime.capturePng(controller.signal), { name: 'AbortError' });
  runtime.dispose();
});

test('captures an uncalibrated optical-centre view with asymmetric FOV and restores all renderer state', async () => {
  const {
    runtime,
    scene,
    camera,
    getRenderedCamera,
    getRenderedCanvasSize,
    getDrawingBufferSizes,
    getRendererState,
    getDiagnosticOverlayVisibleAtRender,
    getDiagnosticOverlayNodeVisibilityAtRender,
    initialRenderTarget,
  } = fixture({ displayTransform: true });
  const overlay = addCaptureOverlay(scene);
  const originalCameraPosition = camera.position.clone();
  const originalCameraQuaternion = camera.quaternion.clone();
  const originalProjection = camera.projectionMatrix.clone();

  const capture = await runtime.captureDiagnosticViewPng(DIAGNOSTIC_VIEW);
  assert.equal(capture.authority, 'virtual-render-capture');
  assert.equal(capture.projection, 'off-axis-perspective');
  assert.equal(capture.calibration, 'uncalibrated');
  assert.match(capture.note, /not a detector image/);
  assert.equal(capture.blob.type, 'image/png');
  assert.equal(capture.width, 1922);
  assert.equal(capture.height, 907);
  assert.deepEqual(getRenderedCanvasSize(), [1922, 907]);
  assert.deepEqual(getDrawingBufferSizes(), [
    [1922, 907, 1],
    [640, 360, 1],
  ]);

  const viewCamera = getRenderedCamera();
  assert.ok(viewCamera instanceof PerspectiveCamera);
  assert.notEqual(viewCamera, camera);
  approximate(viewCamera.position.x, 9.75);
  approximate(viewCamera.position.y, 2.5);
  approximate(viewCamera.position.z, 12.25);
  const renderedDirection = viewCamera.getWorldDirection(new Vector3());
  approximate(renderedDirection.x, 1);
  approximate(renderedDirection.y, 0);
  approximate(renderedDirection.z, 0);

  const hLeft = Math.tan(DIAGNOSTIC_VIEW.hStartDeg * Math.PI / 180);
  const hRight = Math.tan(DIAGNOSTIC_VIEW.hEndDeg * Math.PI / 180);
  const vBottom = Math.tan(DIAGNOSTIC_VIEW.vStartDeg * Math.PI / 180);
  const vTop = Math.tan(DIAGNOSTIC_VIEW.vEndDeg * Math.PI / 180);
  const opticalAxisNdc = viewCamera.position.clone()
    .add(renderedDirection)
    .project(viewCamera);
  approximate(opticalAxisNdc.x, -(hRight + hLeft) / (hRight - hLeft));
  approximate(opticalAxisNdc.y, -(vTop + vBottom) / (vTop - vBottom));

  assert.equal(getDiagnosticOverlayVisibleAtRender(), true,
    'optical-centre capture must keep the overlay root visible');
  const captureVisibility = getDiagnosticOverlayNodeVisibilityAtRender();
  assert.ok(captureVisibility);
  for (const node of [overlay.activeRays, overlay.activeFrustum, overlay.activeOpticalCentre, overlay.activeLabel]) {
    assert.equal(captureVisibility[node.name], false, `${node.name} must be hidden only during capture`);
    assert.equal(node.visible, true, `${node.name} must be restored after successful encoding`);
  }
  for (const node of [overlay.active, overlay.activeHit, overlay.frozen, overlay.frozenRays, overlay.otherActive, overlay.otherRays, overlay.plasma, overlay.ports]) {
    assert.equal(captureVisibility[node.name], true, `${node.name} must remain visible in the optical-centre image`);
    assert.equal(node.visible, true);
  }
  assert.equal(overlay.overlay.visible, true);
  assert.deepEqual(camera.position.toArray(), originalCameraPosition.toArray());
  assert.deepEqual(camera.quaternion.toArray(), originalCameraQuaternion.toArray());
  assert.deepEqual(camera.projectionMatrix.toArray(), originalProjection.toArray());
  assert.deepEqual(getRendererState(), {
    viewport: [11, 12, 300, 200],
    scissor: [13, 14, 250, 150],
    scissorTest: true,
    renderTarget: initialRenderTarget,
  });
  runtime.dispose();
});

test('restores viewport, render target, scissor and overlay visibility when diagnostic capture aborts', async () => {
  const {
    runtime,
    scene,
    getRendererState,
    getDiagnosticOverlayVisibleAtRender,
    getDiagnosticOverlayNodeVisibilityAtRender,
    initialRenderTarget,
    releaseBlob,
    getCanvasState,
  } = fixture({ deferredBlob: true, pixelRatio: 2 });
  const overlay = addCaptureOverlay(scene);
  const controller = new AbortController();
  const capturePromise = runtime.captureDiagnosticViewPng(DIAGNOSTIC_VIEW, controller.signal);
  controller.abort();
  await assert.rejects(capturePromise, { name: 'AbortError' });

  assert.equal(getDiagnosticOverlayVisibleAtRender(), true);
  const captureVisibility = getDiagnosticOverlayNodeVisibilityAtRender();
  assert.ok(captureVisibility);
  assert.equal(captureVisibility[overlay.activeRays.name], false);
  assert.equal(captureVisibility[overlay.activeHit.name], true);
  assert.equal(captureVisibility[overlay.plasma.name], true);
  assert.equal(captureVisibility[overlay.ports.name], true);
  assert.equal(captureVisibility[overlay.frozenRays.name], true);
  assert.ok([overlay.activeRays, overlay.activeFrustum, overlay.activeOpticalCentre, overlay.activeLabel]
    .every((node) => node.visible), 'abort must restore every temporarily hidden active construction aid');
  assert.deepEqual(getRendererState(), {
    viewport: [11, 12, 300, 200],
    scissor: [13, 14, 250, 150],
    scissorTest: true,
    renderTarget: initialRenderTarget,
  });
  assert.deepEqual(getCanvasState(), {
    logicalSize: [640, 360],
    drawingBufferSize: [1280, 720],
    pixelRatio: 2,
  });
  releaseBlob();
  runtime.dispose();
});

test('restores renderer and overlay state when diagnostic PNG encoding fails', async () => {
  const {
    runtime,
    scene,
    getRendererState,
    getCanvasState,
    getDiagnosticOverlayNodeVisibilityAtRender,
    initialRenderTarget,
    releaseBlob,
  } = fixture({ deferredBlob: true, pixelRatio: 1.5 });
  const overlay = addCaptureOverlay(scene);
  overlay.activeLabel.visible = false;
  const capturePromise = runtime.captureDiagnosticViewPng(DIAGNOSTIC_VIEW);
  releaseBlob(null);
  await assert.rejects(capturePromise, /could not be encoded as PNG/);
  const captureVisibility = getDiagnosticOverlayNodeVisibilityAtRender();
  assert.ok(captureVisibility);
  assert.equal(captureVisibility[overlay.activeRays.name], false);
  assert.equal(captureVisibility[overlay.activeHit.name], true);
  assert.equal(captureVisibility[overlay.plasma.name], true);
  assert.equal(captureVisibility[overlay.ports.name], true);
  assert.equal(overlay.overlay.visible, true);
  assert.equal(overlay.activeRays.visible, true);
  assert.equal(overlay.activeFrustum.visible, true);
  assert.equal(overlay.activeOpticalCentre.visible, true);
  assert.equal(overlay.activeLabel.visible, false,
    'encode errors must restore a target that was already hidden to its original state');
  assert.deepEqual(getRendererState(), {
    viewport: [11, 12, 300, 200],
    scissor: [13, 14, 250, 150],
    scissorTest: true,
    renderTarget: initialRenderTarget,
  });
  assert.deepEqual(getCanvasState(), {
    logicalSize: [640, 360],
    drawingBufferSize: [960, 540],
    pixelRatio: 1.5,
  });
  runtime.dispose();
});

test('rejects invalid diagnostic-view geometry and FOV boundaries before rendering', async () => {
  const { runtime, getRenderCount } = fixture();
  const invalid = [
    { ...DIAGNOSTIC_VIEW, designId: '' },
    { ...DIAGNOSTIC_VIEW, designId: ' camera-with-leading-space' },
    { ...DIAGNOSTIC_VIEW, designId: 'x'.repeat(161) },
    { ...DIAGNOSTIC_VIEW, directionWeb: [0, 0, 0] as const },
    { ...DIAGNOSTIC_VIEW, upWeb: [2, 0, 0] as const },
    { ...DIAGNOSTIC_VIEW, hStartDeg: 10, hEndDeg: 10 },
    { ...DIAGNOSTIC_VIEW, hStartDeg: -90 },
    { ...DIAGNOSTIC_VIEW, vStartDeg: 20, vEndDeg: -20 },
    { ...DIAGNOSTIC_VIEW, nearMetres: 0 },
    { ...DIAGNOSTIC_VIEW, nearMetres: 2, farMetres: 2 },
  ];
  for (const spec of invalid) {
    await assert.rejects(runtime.captureDiagnosticViewPng(spec));
  }
  assert.equal(getRenderCount(), 0);

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runtime.captureDiagnosticViewPng(DIAGNOSTIC_VIEW, controller.signal), { name: 'AbortError' });
  assert.equal(getRenderCount(), 0);
  runtime.dispose();
});

test('Tokamak viewer publishes the runtime callback without coupling it to CAD reload dependencies', async () => {
  const source = await readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8');
  assert.match(source, /onDiagnosticRuntimeReady\?: \(runtime: Ehl2DiagnosticRuntime \| null\) => void/);
  assert.match(source, /createEhl2DiagnosticRuntime\(\{/);
  assert.match(source, /diagnosticRuntimeReadyRef\.current\?\.\(localDiagnosticRuntime\)/);
  const initialiseEffect = source.match(/useEffect\(\(\) => \{\s+if \(!activated[\s\S]+?\}, \[activated,[^\]]+\]\);/);
  assert.ok(initialiseEffect, 'expected to locate the CAD initialization effect');
  const dependencies = initialiseEffect[0].match(/\}, \[([^\]]+)\]\);$/)?.[1] ?? '';
  assert.doesNotMatch(dependencies, /onDiagnosticRuntimeReady/);
  assert.doesNotMatch(dependencies, /diagnosticOverlayOptions/);
});
