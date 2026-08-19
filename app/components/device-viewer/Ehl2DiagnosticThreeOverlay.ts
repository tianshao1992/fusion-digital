import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Texture,
} from 'three';
import {
  EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT,
  buildEhl2DiagnosticScenarioGeometry,
  diagView2PointToEhl2Web,
  normalizeEhl2DiagnosticOverlayOptions,
  scenarioForId,
  scenarioIdsForMode,
  type Ehl2DiagnosticOverlayOptions,
  type Ehl2DiagnosticScenarioGeometry,
  type Vec3Tuple,
} from './ehl2DiagView2';

export type { Ehl2DiagnosticOverlayOptions } from './ehl2DiagView2';

export type Ehl2DiagnosticThreeOverlayContext = {
  /**
   * Identity model wrapper whose children are expressed in EHL-2 web metres.
   * The wrapper owns only the viewer fit, matching the EFIT overlay contract.
   */
  physicalWebMetresRoot: Object3D;
};

export type Ehl2DiagnosticThreeOverlay = {
  /** Undefined is an explicit disabled state; it does not select defaults. */
  setOptions: (options?: Ehl2DiagnosticOverlayOptions) => void;
  dispose: () => void;
};

type OverlayMaterial = Material & { map?: Texture | null };
type Segment = readonly [Vec3Tuple, Vec3Tuple];

const ROOT_NAME = 'EHL2_DIAGNOSTIC_FOV_OVERLAY';
const NOMINAL_BLIND_ZONE_MARKER_RADIUS_METRES = 2.48;
const NO_RAYCAST = () => undefined;

function vector(tuple: Vec3Tuple) {
  return new Vector3(tuple[0], tuple[1], tuple[2]);
}

function flattenPoints(points: readonly Vec3Tuple[]) {
  return new Float32Array(points.flatMap((point) => [point[0], point[1], point[2]]));
}

function suppressRaycast<T extends Object3D>(object: T): T {
  object.raycast = NO_RAYCAST;
  return object;
}

function disposeRenderTree(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<OverlayMaterial>();
  const textures = new Set<Texture>();

  root.traverse((node) => {
    const renderable = node as Object3D & {
      geometry?: BufferGeometry;
      material?: Material | Material[];
    };
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (!renderable.material) return;
    const candidates = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    candidates.forEach((material) => {
      const overlayMaterial = material as OverlayMaterial;
      materials.add(overlayMaterial);
      if (overlayMaterial.map) textures.add(overlayMaterial.map);
    });
  });

  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

function createLineSegments(
  name: string,
  segments: readonly Segment[],
  color: number,
  opacity: number,
  depthTest: boolean,
  renderOrder: number,
) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      flattenPoints(segments.flatMap((segment) => [segment[0], segment[1]])),
      3,
    ),
  );
  geometry.computeBoundingSphere();
  const material = new LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = suppressRaycast(new LineSegments(geometry, material));
  lines.name = name;
  lines.frustumCulled = false;
  lines.renderOrder = renderOrder;
  return lines;
}

function createSurface(
  name: string,
  points: readonly Vec3Tuple[],
  indices: readonly number[],
  color: number,
  opacity: number,
  depthTest: boolean,
  renderOrder: number,
) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(flattenPoints(points), 3));
  geometry.setIndex([...indices]);
  geometry.computeBoundingSphere();
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  });
  const surface = suppressRaycast(new Mesh(geometry, material));
  surface.name = name;
  surface.frustumCulled = false;
  surface.renderOrder = renderOrder;
  return surface;
}

function createMarker(
  name: string,
  position: Vec3Tuple,
  color: number,
  radius: number,
  opacity: number,
  depthTest: boolean,
  renderOrder: number,
) {
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest,
    depthWrite: false,
    toneMapped: false,
  });
  const marker = suppressRaycast(new Mesh(new SphereGeometry(radius, 12, 8), material));
  marker.name = name;
  marker.position.copy(vector(position));
  marker.frustumCulled = false;
  marker.renderOrder = renderOrder;
  return marker;
}

function createLabelTexture(title: string, detail: string, accent: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create EHL-2 diagnostic label canvas');

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(6, 18, 20, 0.88)';
  context.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
  context.strokeStyle = accent;
  context.lineWidth = 5;
  context.strokeRect(6.5, 6.5, canvas.width - 13, canvas.height - 13);
  const fontFamily = '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", ui-monospace, SFMono-Regular, Menlo, monospace';
  const drawFittedText = (
    text: string,
    y: number,
    weight: number,
    preferredSize: number,
    minimumSize: number,
  ) => {
    let size = preferredSize;
    context.font = `${weight} ${size}px ${fontFamily}`;
    while (size > minimumSize && context.measureText(text).width > canvas.width - 52) {
      size -= 1;
      context.font = `${weight} ${size}px ${fontFamily}`;
    }
    context.fillText(text, 26, y);
  };
  context.fillStyle = accent;
  drawFittedText(title, 52, 700, 38, 22);
  context.fillStyle = 'rgba(236, 246, 242, 0.94)';
  drawFittedText(detail, 94, 500, 25, 16);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createLabel(
  name: string,
  position: Vec3Tuple,
  title: string,
  detail: string,
  accent: string,
  depthTest: boolean,
  renderOrder: number,
) {
  const texture = createLabelTexture(title, detail, accent);
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0.98,
    depthTest,
    depthWrite: false,
    toneMapped: false,
  });
  const label = suppressRaycast(new Sprite(material));
  label.name = name;
  label.position.copy(vector(position)).add(new Vector3(0, 0.16, 0));
  label.scale.set(0.88, 0.22, 1);
  label.center.set(0.08, 0);
  label.frustumCulled = false;
  label.renderOrder = renderOrder;
  return label;
}

function createScenarioGroup(
  geometry: Ehl2DiagnosticScenarioGeometry,
  options: Ehl2DiagnosticOverlayOptions,
  depthTest: boolean,
) {
  const { scenario } = geometry;
  const group = new Group();
  group.name = `EHL2_DIAGNOSTIC_${scenario.id.toUpperCase()}`;
  group.userData = {
    kind: 'ehl2-diagnostic-fov',
    scenarioId: scenario.id,
    diagnosticId: scenario.diagnosticId,
    authority: geometry.authority,
    azimuthDeg: scenario.azimuthDeg,
  };

  const active = scenario.id === options.activeScenarioId;
  const emphasis = options.mode === 'inspect' || active ? 1 : 0.72;
  const origin = geometry.originWebMetres;
  const [planarLeft, planarRight] = geometry.planarBoundaryEndsWebMetres;
  group.add(createSurface(
    `${group.name}_PLANAR_COVERAGE`,
    [origin, planarLeft, planarRight],
    [0, 1, 2],
    scenario.color,
    0.14 * emphasis,
    depthTest,
    30,
  ));

  if (geometry.frustumCornersWebMetres) {
    const corners = geometry.frustumCornersWebMetres;
    group.add(createSurface(
      `${group.name}_THREE_DIMENSIONAL_FRUSTUM`,
      [origin, ...corners],
      [
        0, 1, 2,
        0, 2, 3,
        0, 3, 4,
        0, 4, 1,
        1, 4, 3,
        1, 3, 2,
      ],
      scenario.color,
      0.1 * emphasis,
      depthTest,
      31,
    ));
  }

  group.add(createLineSegments(
    `${group.name}_OPTICAL_AXIS`,
    [[origin, geometry.opticalAxisEndWebMetres]],
    scenario.color,
    0.98 * emphasis,
    depthTest,
    34,
  ));

  if (options.showBoundaryRays) {
    const boundarySegments: Segment[] = geometry.frustumCornersWebMetres
      ? [
        ...geometry.frustumCornersWebMetres.map((corner) => [origin, corner] as const),
        ...geometry.frustumCornersWebMetres.map((corner, index, corners) => (
          [corner, corners[(index + 1) % corners.length]] as const
        )),
      ]
      : [
        [origin, planarLeft],
        [origin, planarRight],
        [planarLeft, planarRight],
      ];
    group.add(createLineSegments(
      `${group.name}_BOUNDARY_RAYS`,
      boundarySegments,
      scenario.color,
      0.82 * emphasis,
      depthTest,
      33,
    ));
  }

  group.add(createMarker(
    `${group.name}_OPTICAL_CENTRE`,
    origin,
    scenario.color,
    active ? 0.045 : 0.035,
    0.98 * emphasis,
    depthTest,
    35,
  ));

  if (options.showLabels) {
    const isChinese = options.labelLocale === 'zh-CN';
    const editableInspection = options.mode === 'inspect' && active;
    const horizontalHalfAngleDeg = editableInspection ? options.horizontalHalfAngleDeg : 50;
    const verticalHalfAngleDeg = editableInspection ? options.verticalHalfAngleDeg : 0;
    const fovLabel = verticalHalfAngleDeg > 0
      ? isChinese
        ? `水平半视场 ±${horizontalHalfAngleDeg}° · 垂直半视场 ±${verticalHalfAngleDeg}°`
        : `H HALF-FOV ±${horizontalHalfAngleDeg}° · V HALF-FOV ±${verticalHalfAngleDeg}°`
      : isChinese
        ? `平面半视场 ±${horizontalHalfAngleDeg}°`
        : `PLANAR HALF-FOV ±${horizontalHalfAngleDeg}°`;
    const authorityLabel = geometry.authority === 'user-assumption'
      ? isChinese ? '用户三维假设' : 'USER 3D ASSUMPTION'
      : isChinese ? 'PPT平面参考' : 'PPT PLANAR REFERENCE';
    group.add(createLabel(
      `${group.name}_LABEL`,
      origin,
      isChinese
        ? `${scenario.diagnosticId} · 环向角 ${scenario.azimuthDeg}°`
        : `${scenario.diagnosticId} · TOROIDAL ${scenario.azimuthDeg}°`,
      `${fovLabel} · ${authorityLabel}`,
      scenario.colorCss,
      depthTest,
      36,
    ));
  }
  return group;
}

function blindZonePosition(azimuthDeg: number, heightMetres = 0): Vec3Tuple {
  const phi = azimuthDeg * Math.PI / 180;
  return diagView2PointToEhl2Web([
    NOMINAL_BLIND_ZONE_MARKER_RADIUS_METRES * Math.cos(phi),
    NOMINAL_BLIND_ZONE_MARKER_RADIUS_METRES * Math.sin(phi),
    heightMetres,
  ]);
}

function createBlindZoneGroup(options: Ehl2DiagnosticOverlayOptions, depthTest: boolean) {
  const group = new Group();
  const isChinese = options.labelLocale === 'zh-CN';
  group.name = 'EHL2_DIAGNOSTIC_BLIND_ZONE_MARKERS';
  group.userData = {
    kind: 'ehl2-diagnostic-blind-zone-assessment',
    sourceSlides: EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.sourceSlides,
    coordinateAuthority: 'assessment-marker-not-calibrated-geometry',
  };

  EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.diagnosticWindowAzimuthsDeg.forEach((azimuthDeg) => {
    const position = blindZonePosition(azimuthDeg);
    group.add(createMarker(
      `EHL2_BLIND_ZONE_WINDOW_${String(azimuthDeg).replace('.', '_')}`,
      position,
      0xffbd59,
      0.052,
      0.94,
      depthTest,
      38,
    ));
    if (options.showLabels) {
      group.add(createLabel(
        `EHL2_BLIND_ZONE_WINDOW_${String(azimuthDeg).replace('.', '_')}_LABEL`,
        position,
        isChinese
          ? `评估窗口 · 环向角 ${azimuthDeg}°`
          : `ASSESSMENT WINDOW · TOROIDAL ${azimuthDeg}°`,
        isChinese ? '盲区评估位置' : 'BLIND-ZONE ASSESSMENT LOCATION',
        '#ffbd59',
        depthTest,
        39,
      ));
    }
  });

  const upperDivertorAzimuth = EHL2_DIAGNOSTIC_BLIND_ZONE_ASSESSMENT.upperDivertor.nearAzimuthDeg;
  const upperDivertorPosition = blindZonePosition(upperDivertorAzimuth, 1.35);
  group.add(createMarker(
    'EHL2_UPPER_DIVERTOR_PARTIAL_BLIND_ZONE',
    upperDivertorPosition,
    0xff6f5d,
    0.065,
    0.96,
    depthTest,
    38,
  ));
  if (options.showLabels) {
    group.add(createLabel(
      'EHL2_UPPER_DIVERTOR_PARTIAL_BLIND_ZONE_LABEL',
      upperDivertorPosition,
      isChinese ? '上偏滤器局部盲区' : 'UPPER DIVERTOR LOCAL BLIND ZONE',
      isChinese
        ? `近环向角 ${upperDivertorAzimuth}° · 仅作评估标记`
        : `NEAR TOROIDAL ${upperDivertorAzimuth}° · ASSESSMENT ONLY`,
      '#ff6f5d',
      depthTest,
      39,
    ));
  }
  return group;
}

export function createEhl2DiagnosticThreeOverlay(
  context: Ehl2DiagnosticThreeOverlayContext,
  initialOptions?: Ehl2DiagnosticOverlayOptions,
): Ehl2DiagnosticThreeOverlay {
  const root = new Group();
  root.name = ROOT_NAME;
  root.renderOrder = 30;
  root.visible = false;
  root.userData = {
    kind: 'ehl2-diagnostic-overlay',
    coordinateFrame: 'EHL2_WEB_METRES_PROVISIONAL_DIAGVIEW2_V1',
    raycast: false,
  };
  context.physicalWebMetresRoot.add(root);

  let disposed = false;
  let content: Group | null = null;

  const clearContent = () => {
    if (!content) return;
    content.removeFromParent();
    disposeRenderTree(content);
    content.clear();
    content = null;
  };

  const setOptions = (nextOptions?: Ehl2DiagnosticOverlayOptions) => {
    if (disposed) return;
    clearContent();
    if (!nextOptions) {
      root.visible = false;
      return;
    }

    const options = normalizeEhl2DiagnosticOverlayOptions(nextOptions);
    const nextContent = new Group();
    nextContent.name = `${ROOT_NAME}_CONTENT`;
    const depthTest = options.depthMode === 'physical';
    scenarioIdsForMode(options).forEach((scenarioId) => {
      const scenario = scenarioForId(scenarioId);
      const geometry = buildEhl2DiagnosticScenarioGeometry(scenario, options);
      nextContent.add(createScenarioGroup(geometry, options, depthTest));
    });
    if (options.showBlindZones) nextContent.add(createBlindZoneGroup(options, depthTest));
    root.add(nextContent);
    root.visible = true;
    content = nextContent;
  };

  setOptions(initialOptions);

  return {
    setOptions,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearContent();
      root.removeFromParent();
      root.clear();
    },
  };
}
