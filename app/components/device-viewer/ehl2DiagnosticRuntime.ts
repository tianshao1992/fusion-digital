import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Matrix3,
  Matrix4,
  Plane,
  PerspectiveCamera,
  Ray,
  Vector2,
  Vector3,
  Vector4,
  type Camera,
  type Mesh,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';

export type Ehl2WebMetresVector = readonly [number, number, number];

export type Ehl2DiagnosticRuntimeStatus =
  | 'idle'
  | 'building'
  | 'ready'
  | 'error'
  | 'disposed';

export type Ehl2TraceRay = {
  rayId: string;
  originWebMetres: Ehl2WebMetresVector;
  directionWeb: Ehl2WebMetresVector;
  defaultLengthMetres: number;
};

export type Ehl2TraceRequest = {
  requestId: string;
  revision: string | number;
  rays: readonly Ehl2TraceRay[];
  /** Respect the currently rendered CAD and diagnostic clipping planes. Defaults to true. */
  respectClipping?: boolean;
  /**
   * Respect current mesh visibility. Defaults to true for generic viewer use.
   * The source-compatible DiagView2 path explicitly sets this false because
   * source CAD intersections are independent of display/isolation controls.
   */
  respectVisibility?: boolean;
};

export type Ehl2TraceRayResult = {
  rayId: string;
  state: 'hit' | 'miss' | 'invalid' | 'aborted' | 'error';
  partId: string | null;
  model: string | null;
  hitPointWebMetres: Ehl2WebMetresVector | null;
  effectiveEndpointWebMetres: Ehl2WebMetresVector | null;
  distanceMetres: number | null;
  triangleIndex: number | null;
  faceNormalWeb: Ehl2WebMetresVector | null;
  incidenceAngleDeg: number | null;
  error?: string;
};

export type Ehl2TraceResult = {
  requestId: string;
  revision: string | number;
  status: 'completed' | 'aborted' | 'failed';
  authority: 'render-cad-bvh-derived';
  results: readonly Ehl2TraceRayResult[];
  elapsedMs: number;
  error?: string;
};

export type Ehl2DiagnosticPlane = {
  pointWebMetres: Ehl2WebMetresVector;
  normalWeb: Ehl2WebMetresVector;
  /** The retained half-space. Defaults to positive. */
  keepSide?: 'positive' | 'negative';
};

export type Ehl2DiagnosticSliceSpec =
  | {
    kind: 'xy';
    offsetWebMetres?: number;
    keepSide?: 'positive' | 'negative';
  }
  | {
    kind: 'xz';
    offsetWebMetres?: number;
    keepSide?: 'positive' | 'negative';
  }
  | {
    kind: 'array-plane';
    plane: Ehl2DiagnosticPlane;
  }
  | {
    kind: 'camera-six-plane';
    planes: readonly Ehl2DiagnosticPlane[];
  };

export type Ehl2DiagnosticSliceResult = {
  status: 'applied' | 'cleared';
  kind: Ehl2DiagnosticSliceSpec['kind'] | null;
  planeCount: number;
  authority: 'render-only-three-clipping';
  note: string;
};

export type Ehl2DiagnosticCaptureResult = {
  blob: Blob;
  width: number;
  height: number;
  authority: 'render-capture';
};

/**
 * A render-only view through a DiagView2 camera optical centre. Angles are
 * signed offsets from the optical axis in the camera's local horizontal and
 * vertical planes. They intentionally remain asymmetric rather than being
 * collapsed to a single symmetric PerspectiveCamera FOV.
 */
export type Ehl2DiagnosticViewCaptureSpec = {
  /** Active CAMERA diagnostic whose own construction aids are omitted from this view. */
  designId: string;
  originWebMetres: Ehl2WebMetresVector;
  directionWeb: Ehl2WebMetresVector;
  upWeb: Ehl2WebMetresVector;
  hStartDeg: number;
  hEndDeg: number;
  vStartDeg: number;
  vEndDeg: number;
  nearMetres?: number;
  farMetres: number;
};

export type Ehl2DiagnosticViewCaptureResult = {
  blob: Blob;
  width: number;
  height: number;
  authority: 'virtual-render-capture';
  projection: 'off-axis-perspective';
  calibration: 'uncalibrated';
  note: string;
};

export type Ehl2DiagnosticRuntimeProvenance = Readonly<{
  schema: 'fusiondigital.ehl2-public-cad-v1';
  deviceId: string;
  assetId: string;
  modelPath: string;
  modelSha256: string;
  coordinateFrame: 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1';
  engine: 'three-mesh-bvh-v1';
}>;

export type Ehl2FrustumSnapshotPlan = {
  renderWidth: number;
  renderHeight: number;
  fovRad: number;
  cropBox: readonly [left: number, top: number, right: number, bottom: number];
  outputWidth: number;
  outputHeight: number;
  xBounds: readonly [number, number];
  yBounds: readonly [number, number];
};

export interface Ehl2DiagnosticRuntime {
  readonly status: Ehl2DiagnosticRuntimeStatus;
  readonly provenance: Ehl2DiagnosticRuntimeProvenance;
  /** Lazily build all CAD BVHs. traceRays calls this automatically. */
  ready(signal?: AbortSignal): Promise<Ehl2DiagnosticRuntimeStatus>;
  traceRays(request: Ehl2TraceRequest, signal?: AbortSignal): Promise<Ehl2TraceResult>;
  capturePng(signal?: AbortSignal): Promise<Ehl2DiagnosticCaptureResult>;
  captureDiagnosticViewPng(
    spec: Ehl2DiagnosticViewCaptureSpec,
    signal?: AbortSignal,
  ): Promise<Ehl2DiagnosticViewCaptureResult>;
  applyDiagnosticSlice(spec: Ehl2DiagnosticSliceSpec): Ehl2DiagnosticSliceResult;
  clearDiagnosticSlice(): Ehl2DiagnosticSliceResult;
  dispose(): void;
}

export type Ehl2DiagnosticRuntimeMesh = {
  mesh: Mesh;
  partId: string;
  model?: string;
};

export type Ehl2DiagnosticRuntimeContext = {
  provenance: Ehl2DiagnosticRuntimeProvenance;
  /** Root whose local coordinates are the published physical Web-metre frame. */
  physicalWebMetresRoot: Object3D;
  meshes: readonly Ehl2DiagnosticRuntimeMesh[];
  renderer: Pick<
    WebGLRenderer,
    | 'domElement'
    | 'render'
    | 'getViewport'
    | 'setViewport'
    | 'getScissor'
    | 'setScissor'
    | 'getScissorTest'
    | 'setScissorTest'
    | 'getRenderTarget'
    | 'setRenderTarget'
    | 'getSize'
    | 'getPixelRatio'
    | 'setDrawingBufferSize'
  >;
  scene: Scene;
  camera: Camera;
  /** Returns world-space planes currently applied to the CAD materials. */
  getActiveClippingPlanes: () => readonly Plane[];
  /** Replaces only the diagnostic portion of the renderer's clipping contract. */
  setDiagnosticClippingPlanes: (planes: readonly Plane[]) => void;
};

type MeshBvh = import('three-mesh-bvh').MeshBVH;
type GenerateMeshBvhWorker = import('three-mesh-bvh/worker').GenerateMeshBVHWorker;

type BvhRecord = {
  sourceGeometry: BufferGeometry;
  analysisGeometry: BufferGeometry;
  bvh: MeshBvh;
};

type TraceCandidate = {
  partId: string;
  model: string;
  point: Vector3;
  distanceMetres: number;
  triangleIndex: number | null;
  faceNormal: Vector3 | null;
  incidenceAngleDeg: number | null;
};

const RENDER_SLICE_NOTE = 'Render-only slice: Three.js clipping planes change the visible CAD surface; no mesh-section topology is generated.';
const CLIP_EPSILON = 1e-7;
const RAY_EPSILON = 1e-9;
const MAX_CAPTURE_ANGLE_DEG = 89;
const DEFAULT_CAPTURE_NEAR_METRES = 0.001;
const SNAPSHOT_TARGET_LONG_EDGE_PX = 1920;
const SNAPSHOT_MAX_RENDER_EDGE_PX = 4096;
const SNAPSHOT_MIN_RENDER_EDGE_PX = 64;
const DIAGNOSTIC_CAPTURE_NOTE = 'Uncalibrated virtual render from the diagnostic optical centre; it is not a detector image and does not model optics, PSF, throughput or sensor response.';
const DIAGNOSTIC_OVERLAY_NAME = 'EHL2_DIAGNOSTIC_FOV_OVERLAY';
const ACTIVE_WORKBENCH_CAPTURE_HIDDEN_SUFFIXES = [
  '_RAYS',
  '_FINITE_FRUSTUM',
  '_OPTICAL_CENTRE',
  '_LABEL',
] as const;

function boundedTanDeg(angleDeg: number) {
  const clamped = Math.max(-MAX_CAPTURE_ANGLE_DEG, Math.min(MAX_CAPTURE_ANGLE_DEG, angleDeg));
  return Math.tan(clamped * Math.PI / 180);
}

/**
 * Pixel planning compatible with DiagView2's compute_frustum_snapshot_plan.
 * The symmetric render dimensions and crop box are retained as provenance;
 * the browser renders the same tangent window directly with an off-axis
 * projection at outputWidth x outputHeight, avoiding a second lossy crop.
 */
export function computeFrustumSnapshotPlan(
  hStartDeg: number,
  hEndDeg: number,
  vStartDeg: number,
  vEndDeg: number,
  options: {
    targetLongEdgePx?: number;
    maxRenderEdgePx?: number;
    minRenderEdgePx?: number;
  } = {},
): Ehl2FrustumSnapshotPlan {
  const x0 = boundedTanDeg(hStartDeg);
  const x1 = boundedTanDeg(hEndDeg);
  const y0 = boundedTanDeg(vStartDeg);
  const y1 = boundedTanDeg(vEndDeg);
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1);
  const yMax = Math.max(y0, y1);
  const epsilon = 1e-9;
  const xAbs = Math.max(Math.abs(xMin), Math.abs(xMax), epsilon);
  const yAbs = Math.max(Math.abs(yMin), Math.abs(yMax), epsilon);
  const xExtent = Math.max(xMax - xMin, epsilon);
  const yExtent = Math.max(yMax - yMin, epsilon);
  const renderAspect = xAbs / yAbs;
  const cropFractionX = Math.min(1, Math.max(epsilon, xExtent / (2 * xAbs)));
  const cropFractionY = Math.min(1, Math.max(epsilon, yExtent / (2 * yAbs)));
  const minRenderEdgePx = Math.max(1, Math.trunc(options.minRenderEdgePx ?? SNAPSHOT_MIN_RENDER_EDGE_PX));
  const targetLongEdgePx = Math.max(
    minRenderEdgePx,
    Math.trunc(options.targetLongEdgePx ?? SNAPSHOT_TARGET_LONG_EDGE_PX),
  );
  const maxRenderEdgePx = Math.max(
    minRenderEdgePx,
    Math.trunc(options.maxRenderEdgePx ?? SNAPSHOT_MAX_RENDER_EDGE_PX),
  );
  const cropLongFactor = Math.max(renderAspect * cropFractionX, cropFractionY, epsilon);
  let renderHeight = Math.ceil(targetLongEdgePx / cropLongFactor);
  let renderWidth = Math.ceil(renderHeight * renderAspect);
  const renderLongEdge = Math.max(renderWidth, renderHeight);
  if (renderLongEdge > maxRenderEdgePx) {
    const scale = maxRenderEdgePx / renderLongEdge;
    renderWidth = Math.max(minRenderEdgePx, Math.floor(renderWidth * scale));
    renderHeight = Math.max(minRenderEdgePx, Math.floor(renderHeight * scale));
  }
  renderWidth = Math.max(minRenderEdgePx, renderWidth);
  renderHeight = Math.max(minRenderEdgePx, renderHeight);

  let left = Math.floor((xMin + xAbs) / (2 * xAbs) * renderWidth);
  let right = Math.ceil((xMax + xAbs) / (2 * xAbs) * renderWidth);
  let top = Math.floor((yAbs - yMax) / (2 * yAbs) * renderHeight);
  let bottom = Math.ceil((yAbs - yMin) / (2 * yAbs) * renderHeight);
  left = Math.max(0, Math.min(renderWidth - 1, left));
  right = Math.max(left + 1, Math.min(renderWidth, right));
  top = Math.max(0, Math.min(renderHeight - 1, top));
  bottom = Math.max(top + 1, Math.min(renderHeight, bottom));

  return {
    renderWidth,
    renderHeight,
    fovRad: 2 * Math.atan(yAbs),
    cropBox: [left, top, right, bottom],
    outputWidth: right - left,
    outputHeight: bottom - top,
    xBounds: [xMin, xMax],
    yBounds: [yMin, yMax],
  };
}

function finiteVector(value: Ehl2WebMetresVector) {
  return value.length === 3 && value.every(Number.isFinite);
}

function tuple(vector: Vector3): Ehl2WebMetresVector {
  return [vector.x, vector.y, vector.z];
}

function abortedError() {
  return new DOMException('The diagnostic operation was aborted.', 'AbortError');
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortedError();
}

function validateCaptureSpec(spec: Ehl2DiagnosticViewCaptureSpec) {
  if (typeof spec.designId !== 'string' || spec.designId.length === 0
    || spec.designId.length > 160 || spec.designId.trim() !== spec.designId) {
    return 'designId must identify one bounded diagnostic.';
  }
  if (!finiteVector(spec.originWebMetres)) return 'originWebMetres must contain three finite coordinates.';
  if (!finiteVector(spec.directionWeb)) return 'directionWeb must contain three finite coordinates.';
  if (!finiteVector(spec.upWeb)) return 'upWeb must contain three finite coordinates.';
  const direction = new Vector3(...spec.directionWeb);
  const up = new Vector3(...spec.upWeb);
  if (direction.lengthSq() <= RAY_EPSILON) return 'directionWeb must be non-zero.';
  if (up.lengthSq() <= RAY_EPSILON) return 'upWeb must be non-zero.';
  direction.normalize();
  up.normalize();
  if (Math.abs(direction.dot(up)) >= 1 - 1e-7) return 'upWeb must not be collinear with directionWeb.';
  const angles = [spec.hStartDeg, spec.hEndDeg, spec.vStartDeg, spec.vEndDeg];
  if (!angles.every(Number.isFinite)) return 'Diagnostic-view FOV angles must be finite.';
  if (angles.some((angle) => Math.abs(angle) > MAX_CAPTURE_ANGLE_DEG)) {
    return `Diagnostic-view FOV angles must stay within ±${MAX_CAPTURE_ANGLE_DEG}°.`;
  }
  if (spec.hStartDeg >= spec.hEndDeg) return 'hStartDeg must be smaller than hEndDeg.';
  if (spec.vStartDeg >= spec.vEndDeg) return 'vStartDeg must be smaller than vEndDeg.';
  const near = spec.nearMetres ?? DEFAULT_CAPTURE_NEAR_METRES;
  if (!Number.isFinite(near) || near <= 0) return 'nearMetres must be positive.';
  if (!Number.isFinite(spec.farMetres) || spec.farMetres <= near) {
    return 'farMetres must be greater than nearMetres.';
  }
  return null;
}

/**
 * Hide only the active diagnostic's construction aids for an optical-centre
 * capture. Hits, plasma, reviewed ports and frozen workbench groups remain in
 * the scene. Returning a restorer keeps success and every error path symmetric.
 */
function hideActiveWorkbenchCaptureArtifacts(scene: Scene, designId: string): () => void {
  const overlay = scene.getObjectByName(DIAGNOSTIC_OVERLAY_NAME);
  if (!overlay) return () => undefined;
  const candidates: Object3D[] = [];
  overlay.traverse((node) => {
    if (node.userData.kind === 'ehl2-diagview2-workbench-overlay'
      && node.userData.captureRole === 'active'
      && node.userData.designId === designId) candidates.push(node);
  });
  const activeWorkbench = candidates[0];
  if (!activeWorkbench) return () => undefined;
  const snapshots = ACTIVE_WORKBENCH_CAPTURE_HIDDEN_SUFFIXES.flatMap((suffix) => {
    const node = activeWorkbench.getObjectByName(`${activeWorkbench.name}${suffix}`);
    return node ? [{ node, visible: node.visible }] : [];
  });
  snapshots.forEach(({ node }) => { node.visible = false; });
  return () => snapshots.forEach(({ node, visible }) => { node.visible = visible; });
}

function waitForAbortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortedError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortedError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }
    setTimeout(resolve, 0);
  });
}

function isEffectivelyVisible(mesh: Object3D, root: Object3D) {
  let cursor: Object3D | null = mesh;
  while (cursor) {
    if (!cursor.visible) return false;
    if (cursor === root) return true;
    cursor = cursor.parent;
  }
  return false;
}

function emptyRayResult(ray: Ehl2TraceRay, state: Ehl2TraceRayResult['state'], error?: string): Ehl2TraceRayResult {
  const origin = finiteVector(ray.originWebMetres)
    ? new Vector3(...ray.originWebMetres)
    : null;
  const direction = finiteVector(ray.directionWeb)
    ? new Vector3(...ray.directionWeb)
    : null;
  const endpoint = origin && direction && direction.lengthSq() > RAY_EPSILON && Number.isFinite(ray.defaultLengthMetres)
    ? origin.clone().addScaledVector(direction.normalize(), Math.max(0, ray.defaultLengthMetres))
    : null;
  return {
    rayId: ray.rayId,
    state,
    partId: null,
    model: null,
    hitPointWebMetres: null,
    effectiveEndpointWebMetres: endpoint ? tuple(endpoint) : null,
    distanceMetres: null,
    triangleIndex: null,
    faceNormalWeb: null,
    incidenceAngleDeg: null,
    ...(error ? { error } : {}),
  };
}

function validateRay(ray: Ehl2TraceRay) {
  if (!ray.rayId) return 'rayId is required.';
  if (!finiteVector(ray.originWebMetres)) return 'originWebMetres must contain three finite coordinates.';
  if (!finiteVector(ray.directionWeb)) return 'directionWeb must contain three finite coordinates.';
  if (new Vector3(...ray.directionWeb).lengthSq() <= RAY_EPSILON) return 'directionWeb must be non-zero.';
  if (!Number.isFinite(ray.defaultLengthMetres) || ray.defaultLengthMetres <= 0) return 'defaultLengthMetres must be positive.';
  return null;
}

function physicalPlane(definition: Ehl2DiagnosticPlane) {
  if (!finiteVector(definition.pointWebMetres) || !finiteVector(definition.normalWeb)) {
    throw new Error('Diagnostic slice planes require finite physical Web-metre coordinates.');
  }
  const normal = new Vector3(...definition.normalWeb);
  if (normal.lengthSq() <= RAY_EPSILON) throw new Error('Diagnostic slice plane normals must be non-zero.');
  normal.normalize();
  if (definition.keepSide === 'negative') normal.multiplyScalar(-1);
  return new Plane().setFromNormalAndCoplanarPoint(normal, new Vector3(...definition.pointWebMetres));
}

function slicePlanes(spec: Ehl2DiagnosticSliceSpec) {
  if (spec.kind === 'camera-six-plane' && spec.planes.length !== 6) {
    throw new Error('A camera slice requires exactly six planes.');
  }
  if (spec.kind === 'camera-six-plane') return spec.planes.map(physicalPlane);
  if (spec.kind === 'array-plane') return [physicalPlane(spec.plane)];
  const offset = spec.offsetWebMetres ?? 0;
  if (!Number.isFinite(offset)) throw new Error('Diagnostic slice offsets must be finite.');
  return [physicalPlane({
    pointWebMetres: spec.kind === 'xy' ? [0, 0, offset] : [0, offset, 0],
    normalWeb: spec.kind === 'xy' ? [0, 0, 1] : [0, 1, 0],
    keepSide: spec.keepSide,
  })];
}

/**
 * Keep the acceleration copy lean and worker-safe. Meshopt GLBs can expose
 * interleaved render attributes; BVH tracing only needs positions, indices and
 * groups, and face normals are reconstructed from triangle positions.
 */
function cloneAnalysisGeometry(source: BufferGeometry) {
  const sourcePosition = source.getAttribute('position');
  if (!sourcePosition) throw new Error('A diagnostic CAD mesh is missing its position attribute.');
  const positions = new Float32Array(sourcePosition.count * 3);
  for (let index = 0; index < sourcePosition.count; index += 1) {
    const offset = index * 3;
    positions[offset] = sourcePosition.getX(index);
    positions[offset + 1] = sourcePosition.getY(index);
    positions[offset + 2] = sourcePosition.getZ(index);
  }
  const analysis = new BufferGeometry();
  analysis.setAttribute('position', new Float32BufferAttribute(positions, 3));
  if (source.index) analysis.setIndex(new BufferAttribute(source.index.array.slice(), 1, false));
  source.groups.forEach(({ start, count, materialIndex }) => analysis.addGroup(start, count, materialIndex));
  analysis.setDrawRange(source.drawRange.start, source.drawRange.count);
  return analysis;
}

class BrowserEhl2DiagnosticRuntime implements Ehl2DiagnosticRuntime {
  private runtimeStatus: Ehl2DiagnosticRuntimeStatus = 'idle';
  private buildPromise: Promise<void> | null = null;
  private records = new Map<BufferGeometry, BvhRecord>();
  private worker: GenerateMeshBvhWorker | null = null;
  private disposed = false;
  private traceGeneration = 0;
  private diagnosticWorldPlanes: Plane[] = [];

  constructor(private readonly context: Ehl2DiagnosticRuntimeContext) {}

  get provenance() {
    return this.context.provenance;
  }

  get status() {
    return this.runtimeStatus;
  }

  async ready(signal?: AbortSignal) {
    if (this.disposed) return this.runtimeStatus;
    try {
      await waitForAbortable(this.buildOnce(), signal);
      return this.runtimeStatus;
    } catch (error) {
      if (isAbortError(error)) return this.runtimeStatus;
      throw error;
    }
  }

  private buildOnce() {
    if (this.buildPromise) return this.buildPromise;
    this.runtimeStatus = 'building';
    this.buildPromise = this.buildAllBvhs()
      .then(() => {
        if (!this.disposed) this.runtimeStatus = 'ready';
      })
      .catch((error: unknown) => {
        if (!this.disposed) this.runtimeStatus = 'error';
        throw error;
      })
      .finally(() => {
        this.worker?.dispose();
        this.worker = null;
        if (this.disposed) this.releaseBvhs();
      });
    return this.buildPromise;
  }

  private async buildAllBvhs() {
    const { MeshBVH } = await import('three-mesh-bvh');
    const uniqueGeometries = [...new Set(this.context.meshes.map(({ mesh }) => mesh.geometry))];
    if (typeof Worker === 'function') {
      try {
        const { GenerateMeshBVHWorker } = await import('three-mesh-bvh/src/workers/GenerateMeshBVHWorker.js');
        this.worker = new GenerateMeshBVHWorker();
      } catch {
        this.worker = null;
      }
    }

    for (const sourceGeometry of uniqueGeometries) {
      if (this.disposed) return;
      let analysisGeometry = cloneAnalysisGeometry(sourceGeometry);
      let bvh: MeshBvh;
      if (this.worker) {
        try {
          bvh = await this.worker.generate(analysisGeometry, {
            indirect: true,
            targetLeafSize: 10,
            verbose: false,
          });
        } catch {
          this.worker.dispose();
          this.worker = null;
          analysisGeometry.dispose();
          analysisGeometry = cloneAnalysisGeometry(sourceGeometry);
          bvh = new MeshBVH(analysisGeometry, { indirect: true, targetLeafSize: 10, verbose: false });
        }
      } else {
        bvh = new MeshBVH(analysisGeometry, { indirect: true, targetLeafSize: 10, verbose: false });
      }
      if (this.disposed) {
        analysisGeometry.dispose();
        return;
      }
      this.records.set(sourceGeometry, { sourceGeometry, analysisGeometry, bvh });
      await yieldToBrowser();
    }
  }

  async traceRays(request: Ehl2TraceRequest, signal?: AbortSignal): Promise<Ehl2TraceResult> {
    const startedAt = performance.now();
    const generation = ++this.traceGeneration;
    const initial = request.rays.map((ray) => emptyRayResult(ray, 'aborted'));
    const finish = (
      status: Ehl2TraceResult['status'],
      results: readonly Ehl2TraceRayResult[],
      error?: string,
    ): Ehl2TraceResult => ({
      requestId: request.requestId,
      revision: request.revision,
      status,
      authority: 'render-cad-bvh-derived',
      results,
      elapsedMs: Math.max(0, performance.now() - startedAt),
      ...(error ? { error } : {}),
    });
    const cancelled = () => this.disposed || signal?.aborted === true || generation !== this.traceGeneration;

    if (this.disposed) return finish('aborted', initial, 'Diagnostic runtime is disposed.');
    try {
      await waitForAbortable(this.buildOnce(), signal);
      if (cancelled()) return finish('aborted', initial, 'Diagnostic trace was aborted or superseded.');

      this.context.physicalWebMetresRoot.updateWorldMatrix(true, true);
      const clippingPlanes = request.respectClipping === false
        ? []
        : [...this.context.getActiveClippingPlanes()];
      const results = [...initial];

      for (let rayIndex = 0; rayIndex < request.rays.length; rayIndex += 1) {
        if (cancelled()) return finish('aborted', results, 'Diagnostic trace was aborted or superseded.');
        const ray = request.rays[rayIndex];
        const validationError = validateRay(ray);
        if (validationError) {
          results[rayIndex] = emptyRayResult(ray, 'invalid', validationError);
          continue;
        }
        results[rayIndex] = this.traceOne(
          ray,
          clippingPlanes,
          request.respectVisibility !== false,
        );
        if ((rayIndex + 1) % 8 === 0) await yieldToBrowser();
      }
      if (cancelled()) return finish('aborted', results, 'Diagnostic trace was aborted or superseded.');
      return finish('completed', results);
    } catch (error) {
      if (isAbortError(error) || cancelled()) {
        return finish('aborted', initial, 'Diagnostic trace was aborted or superseded.');
      }
      const message = error instanceof Error ? error.message : String(error);
      return finish('failed', request.rays.map((ray) => emptyRayResult(ray, 'error', message)), message);
    }
  }

  private traceOne(
    rayDefinition: Ehl2TraceRay,
    clippingPlanes: readonly Plane[],
    respectVisibility: boolean,
  ): Ehl2TraceRayResult {
    const physicalRoot = this.context.physicalWebMetresRoot;
    const physicalOrigin = new Vector3(...rayDefinition.originWebMetres);
    const physicalDirection = new Vector3(...rayDefinition.directionWeb).normalize();
    const physicalEndpoint = physicalOrigin.clone().addScaledVector(physicalDirection, rayDefinition.defaultLengthMetres);
    const rootWorld = physicalRoot.matrixWorld;
    const worldToRoot = rootWorld.clone().invert();
    let best: TraceCandidate | null = null;

    for (const entry of this.context.meshes) {
      if (respectVisibility && !isEffectivelyVisible(entry.mesh, physicalRoot)) continue;
      const record = this.records.get(entry.mesh.geometry);
      if (!record) continue;
      entry.mesh.updateWorldMatrix(true, false);
      const meshToRoot = new Matrix4().multiplyMatrices(worldToRoot, entry.mesh.matrixWorld);
      const rootToMesh = meshToRoot.clone().invert();
      const localOrigin = physicalOrigin.clone().applyMatrix4(rootToMesh);
      const localEndpoint = physicalEndpoint.clone().applyMatrix4(rootToMesh);
      const localDirection = localEndpoint.clone().sub(localOrigin);
      const localLength = localDirection.length();
      if (localLength <= RAY_EPSILON) continue;
      localDirection.multiplyScalar(1 / localLength);
      const localRay = new Ray(localOrigin, localDirection);
      const intersections = clippingPlanes.length === 0
        ? (() => {
          const first = record.bvh.raycastFirst(localRay, DoubleSide, 0, localLength + RAY_EPSILON);
          return first ? [first] : [];
        })()
        : record.bvh.raycast(localRay, DoubleSide, 0, localLength + RAY_EPSILON);

      for (const intersection of intersections) {
        const point = intersection.point.clone().applyMatrix4(meshToRoot);
        const distanceMetres = physicalOrigin.distanceTo(point);
        if (distanceMetres > rayDefinition.defaultLengthMetres + CLIP_EPSILON) continue;
        if (best && distanceMetres >= best.distanceMetres) continue;
        if (clippingPlanes.length > 0) {
          const worldPoint = point.clone().applyMatrix4(rootWorld);
          if (clippingPlanes.some((plane) => plane.distanceToPoint(worldPoint) < -CLIP_EPSILON)) continue;
        }
        const localNormal = intersection.face?.normal ?? null;
        const faceNormal = localNormal
          ? localNormal.clone().applyMatrix3(new Matrix3().getNormalMatrix(meshToRoot)).normalize()
          : null;
        const incidenceAngleDeg = faceNormal
          ? Math.acos(Math.min(1, Math.max(0, Math.abs(physicalDirection.clone().negate().dot(faceNormal))))) * 180 / Math.PI
          : null;
        best = {
          partId: entry.partId,
          model: entry.model ?? (entry.mesh.name || entry.partId),
          point,
          distanceMetres,
          triangleIndex: intersection.faceIndex ?? null,
          faceNormal,
          incidenceAngleDeg,
        };
      }
    }

    if (!best) return emptyRayResult(rayDefinition, 'miss');
    return {
      rayId: rayDefinition.rayId,
      state: 'hit',
      partId: best.partId,
      model: best.model,
      hitPointWebMetres: tuple(best.point),
      effectiveEndpointWebMetres: tuple(best.point),
      distanceMetres: best.distanceMetres,
      triangleIndex: best.triangleIndex,
      faceNormalWeb: best.faceNormal ? tuple(best.faceNormal) : null,
      incidenceAngleDeg: best.incidenceAngleDeg,
    };
  }

  async capturePng(signal?: AbortSignal): Promise<Ehl2DiagnosticCaptureResult> {
    if (this.disposed) throw new Error('Diagnostic runtime is disposed.');
    throwIfAborted(signal);
    this.context.renderer.render(this.context.scene, this.context.camera);
    const canvas = this.context.renderer.domElement;
    const blob = await waitForAbortable(new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error('The WebGL canvas could not be encoded as PNG.'));
      }, 'image/png');
    }), signal);
    return { blob, width: canvas.width, height: canvas.height, authority: 'render-capture' };
  }

  async captureDiagnosticViewPng(
    spec: Ehl2DiagnosticViewCaptureSpec,
    signal?: AbortSignal,
  ): Promise<Ehl2DiagnosticViewCaptureResult> {
    if (this.disposed) throw new Error('Diagnostic runtime is disposed.');
    throwIfAborted(signal);
    const validationError = validateCaptureSpec(spec);
    if (validationError) throw new Error(validationError);

    this.context.physicalWebMetresRoot.updateWorldMatrix(true, true);
    const rootWorld = this.context.physicalWebMetresRoot.matrixWorld;
    const physicalOrigin = new Vector3(...spec.originWebMetres);
    const physicalDirection = new Vector3(...spec.directionWeb).normalize();
    const physicalUp = new Vector3(...spec.upWeb).normalize();
    const worldOrigin = physicalOrigin.clone().applyMatrix4(rootWorld);
    const worldForwardStep = physicalOrigin.clone().add(physicalDirection).applyMatrix4(rootWorld).sub(worldOrigin);
    const worldUpStep = physicalOrigin.clone().add(physicalUp).applyMatrix4(rootWorld).sub(worldOrigin);
    const worldUnitsPerMetre = worldForwardStep.length();
    if (worldUnitsPerMetre <= RAY_EPSILON || worldUpStep.lengthSq() <= RAY_EPSILON) {
      throw new Error('The physical Web-metre root transform is singular for this diagnostic view.');
    }
    const worldDirection = worldForwardStep.normalize();
    const worldUp = worldUpStep
      .addScaledVector(worldDirection, -worldUpStep.dot(worldDirection));
    if (worldUp.lengthSq() <= RAY_EPSILON) {
      throw new Error('The transformed diagnostic up vector is collinear with its direction.');
    }
    worldUp.normalize();

    const nearMetres = spec.nearMetres ?? DEFAULT_CAPTURE_NEAR_METRES;
    const nearWorld = nearMetres * worldUnitsPerMetre;
    const farWorld = spec.farMetres * worldUnitsPerMetre;
    const toRadians = Math.PI / 180;
    const left = nearWorld * Math.tan(spec.hStartDeg * toRadians);
    const right = nearWorld * Math.tan(spec.hEndDeg * toRadians);
    const bottom = nearWorld * Math.tan(spec.vStartDeg * toRadians);
    const top = nearWorld * Math.tan(spec.vEndDeg * toRadians);
    const snapshotPlan = computeFrustumSnapshotPlan(
      spec.hStartDeg,
      spec.hEndDeg,
      spec.vStartDeg,
      spec.vEndDeg,
    );

    const viewCamera = new PerspectiveCamera();
    viewCamera.position.copy(worldOrigin);
    viewCamera.up.copy(worldUp);
    viewCamera.near = nearWorld;
    viewCamera.far = farWorld;
    viewCamera.lookAt(worldOrigin.clone().add(worldDirection));
    viewCamera.projectionMatrix.makePerspective(left, right, top, bottom, nearWorld, farWorld);
    viewCamera.projectionMatrixInverse.copy(viewCamera.projectionMatrix).invert();
    viewCamera.updateMatrixWorld(true);

    const renderer = this.context.renderer;
    const canvas = renderer.domElement;
    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error('The WebGL canvas must have positive pixel dimensions for capture.');
    }
    const previousLogicalSize = renderer.getSize(new Vector2());
    const previousPixelRatio = renderer.getPixelRatio();
    const previousRenderTarget = renderer.getRenderTarget();
    const previousViewport = renderer.getViewport(new Vector4());
    const previousScissor = renderer.getScissor(new Vector4());
    const previousScissorTest = renderer.getScissorTest();
    let restoreCaptureArtifacts: () => void = () => undefined;

    try {
      throwIfAborted(signal);
      restoreCaptureArtifacts = hideActiveWorkbenchCaptureArtifacts(this.context.scene, spec.designId);
      renderer.setRenderTarget(null);
      renderer.setDrawingBufferSize(snapshotPlan.outputWidth, snapshotPlan.outputHeight, 1);
      renderer.setViewport(0, 0, snapshotPlan.outputWidth, snapshotPlan.outputHeight);
      renderer.setScissor(0, 0, snapshotPlan.outputWidth, snapshotPlan.outputHeight);
      renderer.setScissorTest(false);
      renderer.render(this.context.scene, viewCamera);
      throwIfAborted(signal);
      const blob = await waitForAbortable(new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((value) => {
          if (value) resolve(value);
          else reject(new Error('The diagnostic-view WebGL canvas could not be encoded as PNG.'));
        }, 'image/png');
      }), signal);
      return {
        blob,
        width: snapshotPlan.outputWidth,
        height: snapshotPlan.outputHeight,
        authority: 'virtual-render-capture',
        projection: 'off-axis-perspective',
        calibration: 'uncalibrated',
        note: DIAGNOSTIC_CAPTURE_NOTE,
      };
    } finally {
      restoreCaptureArtifacts();
      renderer.setDrawingBufferSize(previousLogicalSize.x, previousLogicalSize.y, previousPixelRatio);
      renderer.setRenderTarget(previousRenderTarget);
      renderer.setViewport(previousViewport);
      renderer.setScissor(previousScissor);
      renderer.setScissorTest(previousScissorTest);
    }
  }

  applyDiagnosticSlice(spec: Ehl2DiagnosticSliceSpec): Ehl2DiagnosticSliceResult {
    if (this.disposed) throw new Error('Diagnostic runtime is disposed.');
    this.context.physicalWebMetresRoot.updateWorldMatrix(true, false);
    const rootWorld = this.context.physicalWebMetresRoot.matrixWorld;
    this.diagnosticWorldPlanes = slicePlanes(spec).map((plane) => plane.applyMatrix4(rootWorld));
    this.context.setDiagnosticClippingPlanes(this.diagnosticWorldPlanes);
    return {
      status: 'applied',
      kind: spec.kind,
      planeCount: this.diagnosticWorldPlanes.length,
      authority: 'render-only-three-clipping',
      note: RENDER_SLICE_NOTE,
    };
  }

  clearDiagnosticSlice(): Ehl2DiagnosticSliceResult {
    this.diagnosticWorldPlanes = [];
    this.context.setDiagnosticClippingPlanes([]);
    return {
      status: 'cleared',
      kind: null,
      planeCount: 0,
      authority: 'render-only-three-clipping',
      note: RENDER_SLICE_NOTE,
    };
  }

  dispose() {
    if (this.disposed) return;
    const buildWasPending = this.runtimeStatus === 'building';
    this.disposed = true;
    this.runtimeStatus = 'disposed';
    this.traceGeneration += 1;
    this.clearDiagnosticSlice();
    if (!buildWasPending) {
      this.worker?.dispose();
      this.worker = null;
      this.releaseBvhs();
    }
  }

  private releaseBvhs() {
    this.records.forEach(({ analysisGeometry }) => analysisGeometry.dispose());
    this.records.clear();
  }
}

export function createEhl2DiagnosticRuntime(context: Ehl2DiagnosticRuntimeContext): Ehl2DiagnosticRuntime {
  return new BrowserEhl2DiagnosticRuntime(context);
}
