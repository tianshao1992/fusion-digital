import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Plane,
  SphereGeometry,
  Vector3,
  type WebGLRenderer,
} from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';

type Vec3Tuple = readonly [number, number, number];

/**
 * Maps EFIT cylindrical metres into the GLB's web-metre frame. The default
 * basis maps (R, Z, phi) to (R cos(phi), Z, -R sin(phi)); callers should pass
 * the calibrated device contract whenever one is available.
 */
export type EfitAlignmentContract = {
  originWebMetres: Vec3Tuple;
  eRAtPhi0Web: Vec3Tuple;
  ePhiPositiveAtPhi0Web: Vec3Tuple;
  eZWeb: Vec3Tuple;
};

export type EfitRzCurve = {
  psiN?: number;
  kind?: 'surface' | 'lcfs' | string;
  closed?: boolean;
  rM?: ArrayLike<number>;
  zM?: ArrayLike<number>;
  rzM?: ArrayLike<number>;
  pointsRzM?: ArrayLike<number>;
  validPoints?: number;
};

export type EfitRenderableFrame = {
  shot?: number | string;
  index?: number;
  timeMs: number;
  quality?: { state?: 'good' | 'warning' | 'invalid' | 'missing' | string };
  rAxisM?: number;
  zAxisM?: number;
  magneticAxis?: { rM: number; zM: number };
  surfaces?: readonly (EfitRzCurve | ArrayLike<number>)[];
  lcfs?: EfitRzCurve | ArrayLike<number> | null;
  contours?: readonly EfitRzCurve[];
};

export type EfitStoreSnapshotLike = {
  currentFrame?: EfitRenderableFrame | null;
};

export type EfitStoreLike = {
  getSnapshot: () => EfitStoreSnapshotLike | EfitRenderableFrame | null;
  subscribe: (listener: () => void) => () => void;
};

export type EfitOverlayMode = 'physical' | 'xray';

export type EfitThreeOverlayOptions = {
  visible?: boolean;
  phiRadians?: number;
  mode?: EfitOverlayMode;
  showSection?: boolean;
  showSurface?: boolean;
  showMagneticAxis?: boolean;
  surfaceToroidalSegments?: number;
  maxPoloidalPoints?: number;
};

export type EfitThreeOverlayContext = {
  physicalWebMetresRoot: Object3D;
  renderer: WebGLRenderer;
  clippingPlane: Plane;
};

export type EfitThreeOverlay = {
  setFrame: (frame: EfitRenderableFrame | null) => void;
  setAlignment: (alignment?: EfitAlignmentContract) => void;
  setOptions: (options?: EfitThreeOverlayOptions) => void;
  setClippingEnabled: (enabled: boolean) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

const DEFAULT_ALIGNMENT: EfitAlignmentContract = {
  originWebMetres: [0, 0, 0],
  eRAtPhi0Web: [1, 0, 0],
  ePhiPositiveAtPhi0Web: [0, 0, -1],
  eZWeb: [0, 1, 0],
};

const DEFAULT_OPTIONS: Required<EfitThreeOverlayOptions> = {
  visible: true,
  phiRadians: 0,
  mode: 'physical',
  showSection: true,
  showSurface: true,
  showMagneticAxis: true,
  surfaceToroidalSegments: 64,
  maxPoloidalPoints: 192,
};

type ResolvedAlignment = {
  origin: Vector3;
  eR0: Vector3;
  ePhi0: Vector3;
  eZ: Vector3;
};

type RzPoint = readonly [number, number];

function isFiniteTuple(value: Vec3Tuple) {
  return value.length === 3 && value.every(Number.isFinite);
}

function resolveAlignment(contract: EfitAlignmentContract): ResolvedAlignment {
  if (!isFiniteTuple(contract.originWebMetres)
    || !isFiniteTuple(contract.eRAtPhi0Web)
    || !isFiniteTuple(contract.ePhiPositiveAtPhi0Web)
    || !isFiniteTuple(contract.eZWeb)) {
    throw new Error('EFIT alignment contains non-finite values.');
  }
  const origin = new Vector3().fromArray([...contract.originWebMetres]);
  const eR0 = new Vector3().fromArray([...contract.eRAtPhi0Web]);
  const ePhi0 = new Vector3().fromArray([...contract.ePhiPositiveAtPhi0Web]);
  const eZ = new Vector3().fromArray([...contract.eZWeb]);
  const lengths = [eR0.length(), ePhi0.length(), eZ.length()];
  if (lengths.some((length) => length < 1e-8)) throw new Error('EFIT alignment basis contains a zero vector.');
  eR0.normalize();
  ePhi0.normalize();
  eZ.normalize();
  const handedness = new Vector3().crossVectors(eR0, ePhi0).dot(eZ);
  const orthogonality = Math.max(
    Math.abs(eR0.dot(ePhi0)),
    Math.abs(eR0.dot(eZ)),
    Math.abs(ePhi0.dot(eZ)),
  );
  if (handedness < 0.98 || orthogonality > 0.02) {
    throw new Error('EFIT alignment basis must be orthonormal and right-handed.');
  }
  return { origin, eR0, ePhi0, eZ };
}

function isNumericArrayLike(value: unknown): value is ArrayLike<number> {
  return Boolean(value && typeof value === 'object' && 'length' in value);
}

function curvePoints(curve: EfitRzCurve | ArrayLike<number> | null | undefined): RzPoint[] {
  if (!curve) return [];
  const points: RzPoint[] = [];
  if (isNumericArrayLike(curve) && !('rM' in curve) && !('rzM' in curve) && !('pointsRzM' in curve)) {
    for (let index = 0; index + 1 < curve.length; index += 2) {
      const r = Number(curve[index]);
      const z = Number(curve[index + 1]);
      if (Number.isFinite(r) && Number.isFinite(z) && r >= 0) points.push([r, z]);
    }
  } else {
    const structured = curve as EfitRzCurve;
    const flat = structured.pointsRzM ?? structured.rzM;
    if (flat) {
      const limit = Math.min(flat.length, (structured.validPoints ?? Number.POSITIVE_INFINITY) * 2);
      for (let index = 0; index + 1 < limit; index += 2) {
        const r = Number(flat[index]);
        const z = Number(flat[index + 1]);
        if (Number.isFinite(r) && Number.isFinite(z) && r >= 0) points.push([r, z]);
      }
    } else if (structured.rM && structured.zM) {
      const limit = Math.min(structured.rM.length, structured.zM.length, structured.validPoints ?? Number.POSITIVE_INFINITY);
      for (let index = 0; index < limit; index += 1) {
        const r = Number(structured.rM[index]);
        const z = Number(structured.zM[index]);
        if (Number.isFinite(r) && Number.isFinite(z) && r >= 0) points.push([r, z]);
      }
    }
  }
  return points.filter((point, index) => index === 0
    || Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]) > 1e-8);
}

function sampleCurve(points: RzPoint[], maxPoints: number) {
  const unique = points.length > 2
    && Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) < 1e-8
    ? points.slice(0, -1)
    : points;
  if (unique.length <= maxPoints) return unique;
  const sampled: RzPoint[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(unique[Math.floor((index * unique.length) / maxPoints)]);
  }
  return sampled;
}

export function createEfitThreeOverlay(
  context: EfitThreeOverlayContext,
  initialAlignment?: EfitAlignmentContract,
  initialOptions?: EfitThreeOverlayOptions,
): EfitThreeOverlay {
  const root = new Group();
  root.name = 'EFIT_PHYSICS_OVERLAY';
  root.renderOrder = 20;
  context.physicalWebMetresRoot.add(root);

  const sectionGeometry = new LineSegmentsGeometry();
  const sectionMaterial = new LineMaterial({
    color: 0x58e7dc,
    linewidth: 1.25,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const sectionLines = new LineSegments2(sectionGeometry, sectionMaterial);
  sectionLines.name = 'EFIT_FLUX_CONTOURS_RZ';
  sectionLines.frustumCulled = false;
  sectionLines.renderOrder = 21;
  root.add(sectionLines);
  sectionGeometry.setPositions(new Float32Array([0, 0, 0, 0, 0, 0]));

  const lcfsGeometry = new LineGeometry();
  const lcfsMaterial = new LineMaterial({
    color: 0xff8b4a,
    linewidth: 2.6,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  });
  const lcfsLine = new Line2(lcfsGeometry, lcfsMaterial);
  lcfsLine.name = 'EFIT_LCFS_RZ';
  lcfsLine.frustumCulled = false;
  lcfsLine.renderOrder = 23;
  root.add(lcfsLine);
  lcfsGeometry.setPositions([0, 0, 0, 0, 0, 0]);

  const axisGeometry = new LineGeometry();
  const axisMaterial = new LineMaterial({
    color: 0xffe38a,
    linewidth: 1.8,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const axisRing = new Line2(axisGeometry, axisMaterial);
  axisRing.name = 'EFIT_MAGNETIC_AXIS_RING';
  axisRing.frustumCulled = false;
  axisRing.renderOrder = 24;
  root.add(axisRing);
  axisGeometry.setPositions([0, 0, 0, 0, 0, 0]);

  const axisMarkerMaterial = new MeshBasicMaterial({ color: 0xffefad, depthWrite: false });
  const axisMarker = new Mesh(new SphereGeometry(0.018, 12, 8), axisMarkerMaterial);
  axisMarker.name = 'EFIT_MAGNETIC_AXIS_SECTION';
  axisMarker.renderOrder = 25;
  root.add(axisMarker);

  const surfaceGeometry = new BufferGeometry();
  const surfaceMaterial = new MeshBasicMaterial({
    color: 0xff7138,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: DoubleSide,
  });
  const lcfsSurface = new Mesh(surfaceGeometry, surfaceMaterial);
  lcfsSurface.name = 'EFIT_LCFS_REVOLVED_SURFACE';
  lcfsSurface.renderOrder = 22;
  root.add(lcfsSurface);

  let alignment: ResolvedAlignment;
  let alignmentValid = true;
  try {
    alignment = resolveAlignment(initialAlignment ?? DEFAULT_ALIGNMENT);
  } catch {
    alignment = resolveAlignment(DEFAULT_ALIGNMENT);
    alignmentValid = false;
  }
  let options = { ...DEFAULT_OPTIONS, ...initialOptions };
  let latestFrame: EfitRenderableFrame | null = null;
  let clippingEnabled = false;
  let disposed = false;

  const transformRz = (r: number, z: number, phi: number, target = new Vector3()) => {
    const cosine = Math.cos(phi);
    const sine = Math.sin(phi);
    return target.copy(alignment.origin)
      .addScaledVector(alignment.eR0, r * cosine)
      .addScaledVector(alignment.ePhi0, r * sine)
      .addScaledVector(alignment.eZ, z);
  };

  const setLineResolution = (width: number, height: number) => {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    sectionMaterial.resolution.set(safeWidth, safeHeight);
    lcfsMaterial.resolution.set(safeWidth, safeHeight);
    axisMaterial.resolution.set(safeWidth, safeHeight);
  };

  const setBufferAttribute = (name: 'position' | 'normal', values: Float32Array) => {
    const current = surfaceGeometry.getAttribute(name) as BufferAttribute | undefined;
    if (current && current.array.length === values.length) {
      (current.array as Float32Array).set(values);
      current.needsUpdate = true;
      return;
    }
    const attribute = new BufferAttribute(values, 3);
    attribute.setUsage(DynamicDrawUsage);
    surfaceGeometry.setAttribute(name, attribute);
  };

  const setSurfaceIndex = (values: Uint16Array | Uint32Array) => {
    const current = surfaceGeometry.getIndex();
    if (current && current.array.constructor === values.constructor && current.array.length === values.length) {
      (current.array as Uint16Array | Uint32Array).set(values);
      current.needsUpdate = true;
      return;
    }
    const attribute = new BufferAttribute(values, 1);
    attribute.setUsage(DynamicDrawUsage);
    surfaceGeometry.setIndex(attribute);
  };

  const updateSurface = (lcfs: RzPoint[]) => {
    const poloidal = sampleCurve(lcfs, MathUtils.clamp(Math.round(options.maxPoloidalPoints), 24, 384));
    if (poloidal.length < 3) {
      lcfsSurface.visible = false;
      return;
    }
    const toroidalSegments = MathUtils.clamp(Math.round(options.surfaceToroidalSegments), 12, 128);
    const ringSize = toroidalSegments + 1;
    const vertexCount = poloidal.length * ringSize;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const position = new Vector3();
    const radial = new Vector3();
    const normal = new Vector3();
    let offset = 0;
    for (let pointIndex = 0; pointIndex < poloidal.length; pointIndex += 1) {
      const point = poloidal[pointIndex];
      const previous = poloidal[(pointIndex - 1 + poloidal.length) % poloidal.length];
      const next = poloidal[(pointIndex + 1) % poloidal.length];
      const dR = next[0] - previous[0];
      const dZ = next[1] - previous[1];
      for (let toroidalIndex = 0; toroidalIndex <= toroidalSegments; toroidalIndex += 1) {
        const phi = (toroidalIndex / toroidalSegments) * Math.PI * 2;
        transformRz(point[0], point[1], phi, position);
        radial.copy(alignment.eR0).multiplyScalar(Math.cos(phi))
          .addScaledVector(alignment.ePhi0, Math.sin(phi));
        normal.copy(radial).multiplyScalar(dZ).addScaledVector(alignment.eZ, -dR);
        if (normal.lengthSq() < 1e-12) normal.copy(radial);
        normal.normalize();
        positions[offset] = position.x;
        positions[offset + 1] = position.y;
        positions[offset + 2] = position.z;
        normals[offset] = normal.x;
        normals[offset + 1] = normal.y;
        normals[offset + 2] = normal.z;
        offset += 3;
      }
    }
    const indexCount = poloidal.length * toroidalSegments * 6;
    const indices = vertexCount <= 65_535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
    let indexOffset = 0;
    for (let pointIndex = 0; pointIndex < poloidal.length; pointIndex += 1) {
      const nextPoint = (pointIndex + 1) % poloidal.length;
      for (let toroidalIndex = 0; toroidalIndex < toroidalSegments; toroidalIndex += 1) {
        const a = pointIndex * ringSize + toroidalIndex;
        const b = nextPoint * ringSize + toroidalIndex;
        const c = nextPoint * ringSize + toroidalIndex + 1;
        const d = pointIndex * ringSize + toroidalIndex + 1;
        indices[indexOffset] = a;
        indices[indexOffset + 1] = b;
        indices[indexOffset + 2] = d;
        indices[indexOffset + 3] = b;
        indices[indexOffset + 4] = c;
        indices[indexOffset + 5] = d;
        indexOffset += 6;
      }
    }
    setBufferAttribute('position', positions);
    setBufferAttribute('normal', normals);
    setSurfaceIndex(indices);
    surfaceGeometry.setDrawRange(0, indices.length);
    surfaceGeometry.computeBoundingSphere();
    lcfsSurface.visible = root.visible && options.showSurface;
  };

  const updateFrame = (frame: EfitRenderableFrame | null) => {
    latestFrame = frame;
    if (disposed) return;
    const frameUsable = Boolean(frame)
      && frame?.quality?.state !== 'invalid'
      && frame?.quality?.state !== 'missing'
      && alignmentValid;
    root.visible = options.visible && frameUsable;
    if (!frameUsable || !frame) {
      sectionLines.visible = false;
      lcfsLine.visible = false;
      lcfsSurface.visible = false;
      axisMarker.visible = false;
      axisRing.visible = false;
      return;
    }

    const contourInputs: readonly (EfitRzCurve | ArrayLike<number>)[] = frame.surfaces
      ?? frame.contours?.filter((curve) => curve.kind !== 'lcfs')
      ?? [];
    const phi = Number.isFinite(options.phiRadians) ? options.phiRadians : 0;
    const segmentPositions: number[] = [];
    const a = new Vector3();
    const b = new Vector3();
    contourInputs.forEach((input) => {
      const curve = curvePoints(input);
      const sampled = sampleCurve(curve, MathUtils.clamp(Math.round(options.maxPoloidalPoints), 24, 384));
      if (sampled.length < 2) return;
      const closeCurve = isNumericArrayLike(input) || ('closed' in input && input.closed === true);
      const segmentCount = closeCurve ? sampled.length : sampled.length - 1;
      for (let index = 0; index < segmentCount; index += 1) {
        const nextIndex = (index + 1) % sampled.length;
        transformRz(sampled[index][0], sampled[index][1], phi, a);
        transformRz(sampled[nextIndex][0], sampled[nextIndex][1], phi, b);
        segmentPositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    });
    if (segmentPositions.length > 0) sectionGeometry.setPositions(new Float32Array(segmentPositions));
    sectionLines.visible = options.showSection && segmentPositions.length > 0;

    const explicitLcfs = curvePoints(frame.lcfs);
    const contourLcfs = frame.contours?.find((curve) => curve.kind === 'lcfs');
    const lcfs = explicitLcfs.length > 0 ? explicitLcfs : curvePoints(contourLcfs);
    const sampledLcfs = sampleCurve(lcfs, MathUtils.clamp(Math.round(options.maxPoloidalPoints), 24, 384));
    if (sampledLcfs.length >= 3) {
      const linePositions: number[] = [];
      sampledLcfs.forEach(([r, z]) => {
        transformRz(r, z, phi, a);
        linePositions.push(a.x, a.y, a.z);
      });
      transformRz(sampledLcfs[0][0], sampledLcfs[0][1], phi, a);
      linePositions.push(a.x, a.y, a.z);
      lcfsGeometry.setPositions(linePositions);
      lcfsLine.computeLineDistances();
      lcfsLine.visible = options.showSection;
      updateSurface(sampledLcfs);
    } else {
      lcfsLine.visible = false;
      lcfsSurface.visible = false;
    }

    const rAxis = frame.rAxisM ?? frame.magneticAxis?.rM;
    const zAxis = frame.zAxisM ?? frame.magneticAxis?.zM;
    const hasAxis = Number.isFinite(rAxis) && Number.isFinite(zAxis) && Number(rAxis) >= 0;
    if (hasAxis) {
      transformRz(Number(rAxis), Number(zAxis), phi, a);
      axisMarker.position.copy(a);
      const ringPositions: number[] = [];
      for (let index = 0; index <= 72; index += 1) {
        transformRz(Number(rAxis), Number(zAxis), (index / 72) * Math.PI * 2, a);
        ringPositions.push(a.x, a.y, a.z);
      }
      axisGeometry.setPositions(ringPositions);
      axisRing.computeLineDistances();
    }
    axisMarker.visible = options.showMagneticAxis && hasAxis;
    axisRing.visible = options.showMagneticAxis && hasAxis;
  };

  const applyMode = () => {
    const depthTest = options.mode === 'physical';
    [sectionMaterial, lcfsMaterial, axisMaterial, axisMarkerMaterial, surfaceMaterial].forEach((material) => {
      material.depthTest = depthTest;
      material.needsUpdate = true;
    });
    surfaceMaterial.opacity = options.mode === 'xray' ? 0.25 : 0.16;
  };

  const applyClipping = () => {
    [sectionMaterial, lcfsMaterial, axisMaterial, axisMarkerMaterial, surfaceMaterial].forEach((material) => {
      material.clippingPlanes = clippingEnabled ? [context.clippingPlane] : null;
      material.needsUpdate = true;
    });
  };

  setLineResolution(context.renderer.domElement.clientWidth, context.renderer.domElement.clientHeight);
  applyMode();
  applyClipping();

  return {
    setFrame: updateFrame,
    setAlignment: (nextAlignment) => {
      try {
        alignment = resolveAlignment(nextAlignment ?? DEFAULT_ALIGNMENT);
        alignmentValid = true;
      } catch {
        alignmentValid = false;
      }
      updateFrame(latestFrame);
    },
    setOptions: (nextOptions) => {
      options = { ...DEFAULT_OPTIONS, ...nextOptions };
      applyMode();
      updateFrame(latestFrame);
    },
    setClippingEnabled: (enabled) => {
      clippingEnabled = enabled;
      applyClipping();
    },
    resize: setLineResolution,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      root.remove(sectionLines, lcfsLine, axisRing, axisMarker, lcfsSurface);
      root.removeFromParent();
      sectionGeometry.dispose();
      lcfsGeometry.dispose();
      axisGeometry.dispose();
      surfaceGeometry.dispose();
      axisMarker.geometry.dispose();
      sectionMaterial.dispose();
      lcfsMaterial.dispose();
      axisMaterial.dispose();
      axisMarkerMaterial.dispose();
      surfaceMaterial.dispose();
      root.clear();
    },
  };
}
