import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DoubleSide,
  Group,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';
import {
  buildEhl2GeqdskFluxSurfaceContours,
  createEhl2DiagnosticThreeOverlay,
  type Ehl2DiagnosticOverlayOptions,
  type Ehl2DiagnosticPlasmaContext,
} from '../app/components/device-viewer/Ehl2DiagnosticThreeOverlay.ts';

const PLASMA_GROUP = 'EHL2_DIAGVIEW2_GEQDSK_PLASMA_CONTEXT';
const LCFS_SURFACE = `${PLASMA_GROUP}_LCFS_SURFACE`;
const MAGNETIC_AXIS_RING = `${PLASMA_GROUP}_MAGNETIC_AXIS_RING`;

function approx(actual: number, expected: number, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

function options(plasmaContext?: Ehl2DiagnosticPlasmaContext): Ehl2DiagnosticOverlayOptions {
  return {
    kind: 'diagview2-workbench',
    labelLocale: 'en',
    designId: 'plasma-context-test',
    designName: 'plasma-context-test',
    diagnosticType: 'CAMERA',
    previewRays: [],
    rayResults: [],
    depthMode: 'physical',
    showRays: false,
    showLabels: false,
    showHitMarkers: false,
    laserDiameterMm: 0,
    opacity: 0.6,
    color: 0x61d6a7,
    colorCss: '#61d6a7',
    plasmaContext,
  };
}

function denseLcfs(pointCount = 512): readonly (readonly [number, number])[] {
  return Array.from({ length: pointCount + 1 }, (_, index) => {
    const angle = index * Math.PI * 2 / pointCount;
    return [1.5 + 0.35 * Math.cos(angle), 0.1 + 0.6 * Math.sin(angle)] as const;
  });
}

function renderResources(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  root.traverse((node) => {
    const renderable = node as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      (Array.isArray(renderable.material) ? renderable.material : [renderable.material])
        .forEach((material) => materials.add(material));
    }
  });
  return { geometries, materials };
}

function plasmaGroups(root: Object3D) {
  const groups: Object3D[] = [];
  root.traverse((node) => {
    if (node.userData.kind === 'ehl2-diagview2-plasma-context') groups.push(node);
  });
  return groups;
}

function syntheticFluxGrid(nw = 65, nh = 65) {
  const rM = Float64Array.from({ length: nw }, (_, index) => 1 + index / (nw - 1));
  const zM = Float64Array.from({ length: nh }, (_, index) => -0.8 + 1.6 * index / (nh - 1));
  const psiNorm = new Float64Array(nw * nh);
  for (let rIndex = 0; rIndex < nw; rIndex += 1) {
    for (let zIndex = 0; zIndex < nh; zIndex += 1) {
      psiNorm[rIndex * nh + zIndex] = ((rM[rIndex] - 1.5) / 0.4) ** 2 + (zM[zIndex] / 0.6) ** 2;
    }
  }
  return { nw, nh, rM, zM, psiNorm };
}

test('bounded GEQDSK contour extraction reproduces nine nested psi surfaces for ten visible layers with LCFS', () => {
  const surfaces = buildEhl2GeqdskFluxSurfaceContours(syntheticFluxGrid());
  assert.equal(surfaces.length, 9);
  assert.deepEqual(surfaces.map((surface) => surface.normalizedFlux), [.1, .2, .3, .4, .5, .6, .7, .8, .9]);
  surfaces.forEach((surface) => {
    assert.ok(surface.boundaryRZMetres.length >= 80 && surface.boundaryRZMetres.length <= 96);
    const radii = surface.boundaryRZMetres.map(([radius]) => radius);
    approx(Math.min(...radii), 1.5 - 0.4 * Math.sqrt(surface.normalizedFlux), .004);
    approx(Math.max(...radii), 1.5 + 0.4 * Math.sqrt(surface.normalizedFlux), .004);
  });
  assert.deepEqual(buildEhl2GeqdskFluxSurfaceContours({
    nw: 1001,
    nh: 1000,
    rM: { length: 1001 } as ArrayLike<number>,
    zM: { length: 1000 } as ArrayLike<number>,
    psiNorm: { length: 1_001_000 } as ArrayLike<number>,
  }), [], 'oversized grids fail closed before allocation or contouring');
});

test('GEQDSK flux layers and both plasma context kinds share render-only clipping and release all resources', () => {
  const fluxSurfacesRZMetres = buildEhl2GeqdskFluxSurfaceContours(syntheticFluxGrid());
  const parametric: Ehl2DiagnosticPlasmaContext = {
    id: 'parametric-clipped',
    sourceKind: 'parametric',
    lcfsBoundaryRZMetres: denseLcfs(48),
    magneticAxisRZMetres: [1.5, 0.1],
    opacity: .15,
  };
  const geqdsk: Ehl2DiagnosticPlasmaContext = {
    id: 'geqdsk-flux-clipped',
    sourceKind: 'geqdsk',
    lcfsBoundaryRZMetres: denseLcfs(64),
    magneticAxisRZMetres: [1.5, 0.1],
    fluxSurfacesRZMetres,
    opacity: .25,
  };
  const physicalWebMetresRoot = new Group();
  const clippedOptions: Ehl2DiagnosticOverlayOptions = {
    ...options(),
    plasmaContexts: [parametric, geqdsk],
    plasmaClippingPlanesWebMetres: [{ pointWebMetres: [0.2, 0, 0], normalWeb: [1, 0, 0], keepSide: 'positive' }],
  };
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot }, clippedOptions);
  const layers = plasmaGroups(physicalWebMetresRoot);
  assert.equal(layers.length, 2);
  assert.ok(layers.every((layer) => layer.userData.virtual === true));
  assert.equal(layers[0].userData.fluxSurfaceCount, 1);
  assert.equal(layers[1].userData.fluxSurfaceCount, 10);
  assert.deepEqual(layers[1].userData.normalizedFluxLevels, [.1, .2, .3, .4, .5, .6, .7, .8, .9, 1]);
  const geqdskSurfaces = layers[1].children.filter((child) => child.userData.kind === 'axisymmetric-flux-surface' || child.userData.kind === 'axisymmetric-lcfs-surface');
  assert.equal(geqdskSurfaces.length, 10);

  const resources = renderResources(physicalWebMetresRoot);
  assert.equal(resources.geometries.size, 13, 'one parametric surface + axis, ten GEQDSK surfaces + axis, and no unrelated renderables');
  resources.materials.forEach((material) => {
    assert.equal(material.clippingPlanes?.length, 1);
    assert.equal(material.clipIntersection, false);
    approx(material.clippingPlanes![0].normal.x, 1);
    approx(material.clippingPlanes![0].constant, -0.2);
  });
  const geometryDisposals = new Map<BufferGeometry, number>();
  const materialDisposals = new Map<Material, number>();
  resources.geometries.forEach((geometry) => {
    const original = geometry.dispose.bind(geometry);
    geometry.dispose = () => { geometryDisposals.set(geometry, (geometryDisposals.get(geometry) ?? 0) + 1); original(); };
  });
  resources.materials.forEach((material) => {
    const original = material.dispose.bind(material);
    material.dispose = () => { materialDisposals.set(material, (materialDisposals.get(material) ?? 0) + 1); original(); };
  });
  overlay.setOptions({ ...clippedOptions, plasmaContexts: [] });
  resources.geometries.forEach((geometry) => assert.equal(geometryDisposals.get(geometry), 1));
  resources.materials.forEach((material) => assert.equal(materialDisposals.get(material), 1));
  overlay.dispose();
});

test('GEQDSK context is safely decimated, revolved in the source frame and mapped into physical Web Y-up metres', () => {
  const physicalWebMetresRoot = new Group();
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot }, options({
    lcfsBoundaryRZMetres: denseLcfs(),
    magneticAxisRZMetres: [1.5, 0.1],
    opacity: 0.22,
    visible: true,
  }));

  const overlayRoot = physicalWebMetresRoot.getObjectByName('EHL2_DIAGNOSTIC_FOV_OVERLAY');
  const plasma = overlayRoot?.getObjectByName(PLASMA_GROUP);
  assert.ok(plasma);
  assert.equal(plasma.parent?.name, 'EHL2_DIAGNOSTIC_FOV_OVERLAY_CONTENT');
  assert.equal(plasma.userData.kind, 'ehl2-diagview2-plasma-context');
  assert.equal(plasma.userData.authority, 'virtual-geqdsk-context-not-experimental-or-calibrated');
  assert.equal(plasma.userData.coordinateFrame, 'DiagView2 cylindrical R/Z metres revolved about +Z, mapped to EHL2 web Y-up');
  assert.equal(plasma.userData.inputBoundaryPointCount, 512, 'the repeated closing point is removed before decimation');
  assert.ok(plasma.userData.renderedBoundaryPointCount <= 96);
  assert.equal(plasma.userData.toroidalSegments, 64);

  const surface = plasma.getObjectByName(LCFS_SURFACE) as Object3D & {
    geometry: BufferGeometry;
    material: Material & { opacity: number; depthTest: boolean; depthWrite: boolean; side: number };
  };
  const axisRing = plasma.getObjectByName(MAGNETIC_AXIS_RING) as Object3D & {
    geometry: BufferGeometry;
    material: Material;
  };
  assert.ok(surface);
  assert.ok(axisRing);
  const renderedBoundaryPointCount = plasma.userData.renderedBoundaryPointCount as number;
  const positions = surface.geometry.getAttribute('position');
  assert.equal(positions.count, renderedBoundaryPointCount * 64);
  assert.equal(surface.geometry.getIndex()?.count, renderedBoundaryPointCount * 64 * 6);
  assert.equal(surface.material.opacity, 0.22);
  assert.equal(surface.material.depthTest, true);
  assert.equal(surface.material.depthWrite, false);
  assert.equal(surface.material.side, DoubleSide);

  // Source [R cos(phi), R sin(phi), Z] maps to Web [X, Z, -Y].
  approx(positions.getX(0), 1.85);
  approx(positions.getY(0), 0.1);
  approx(positions.getZ(0), 0);
  approx(positions.getX(16), 0);
  approx(positions.getY(16), 0.1);
  approx(positions.getZ(16), -1.85);

  const retainedRadii: number[] = [];
  const retainedZ: number[] = [];
  for (let boundaryIndex = 0; boundaryIndex < renderedBoundaryPointCount; boundaryIndex += 1) {
    const vertexIndex = boundaryIndex * 64;
    retainedRadii.push(Math.hypot(positions.getX(vertexIndex), positions.getZ(vertexIndex)));
    retainedZ.push(positions.getY(vertexIndex));
  }
  approx(Math.min(...retainedRadii), 1.15, 2e-4);
  approx(Math.max(...retainedRadii), 1.85, 2e-4);
  approx(Math.min(...retainedZ), -0.5, 2e-4);
  approx(Math.max(...retainedZ), 0.7, 2e-4);

  const axisPositions = axisRing.geometry.getAttribute('position');
  assert.equal(axisPositions.count, 128, 'the 64-segment magnetic-axis ring has two endpoints per segment');
  approx(axisPositions.getX(0), 1.5);
  approx(axisPositions.getY(0), 0.1);
  approx(axisPositions.getZ(0), 0);
  for (const node of [plasma, surface, axisRing]) {
    assert.equal((node.raycast as unknown as () => unknown)(), undefined, `${node.name} must not intercept viewer picking`);
  }

  overlay.dispose();
  assert.equal(physicalWebMetresRoot.getObjectByName('EHL2_DIAGNOSTIC_FOV_OVERLAY'), undefined);
});

test('replacing or disposing the plasma context releases every generated geometry and material exactly once', () => {
  const physicalWebMetresRoot = new Group();
  const plasmaContext: Ehl2DiagnosticPlasmaContext = {
    lcfsBoundaryRZMetres: denseLcfs(48),
    magneticAxisRZMetres: [1.5, 0.1],
    opacity: 0.18,
  };
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot }, options(plasmaContext));
  const plasma = physicalWebMetresRoot.getObjectByName(PLASMA_GROUP);
  assert.ok(plasma);
  const resources: { geometry: BufferGeometry; material: Material }[] = [];
  plasma.traverse((node) => {
    const renderable = node as Object3D & { geometry?: BufferGeometry; material?: Material | Material[] };
    if (!renderable.geometry || !renderable.material) return;
    const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
    materials.forEach((material) => resources.push({ geometry: renderable.geometry!, material }));
  });
  assert.equal(resources.length, 2, 'LCFS surface and magnetic-axis ring each own one geometry/material pair');

  const geometryDisposals = new Map<BufferGeometry, number>();
  const materialDisposals = new Map<Material, number>();
  resources.forEach(({ geometry, material }) => {
    const disposeGeometry = geometry.dispose.bind(geometry);
    geometry.dispose = () => { geometryDisposals.set(geometry, (geometryDisposals.get(geometry) ?? 0) + 1); disposeGeometry(); };
    const disposeMaterial = material.dispose.bind(material);
    material.dispose = () => { materialDisposals.set(material, (materialDisposals.get(material) ?? 0) + 1); disposeMaterial(); };
  });

  overlay.setOptions(options({ ...plasmaContext, visible: false }));
  assert.equal(physicalWebMetresRoot.getObjectByName(PLASMA_GROUP), undefined);
  resources.forEach(({ geometry, material }) => {
    assert.equal(geometryDisposals.get(geometry), 1);
    assert.equal(materialDisposals.get(material), 1);
  });
  overlay.dispose();
  overlay.dispose();
  resources.forEach(({ geometry, material }) => {
    assert.equal(geometryDisposals.get(geometry), 1, 'replacement resources are not double-disposed');
    assert.equal(materialDisposals.get(material), 1, 'replacement resources are not double-disposed');
  });
});

test('parametric and GEQDSK plasma layers render simultaneously with independent identity, style, visibility and cleanup', () => {
  const parametric: Ehl2DiagnosticPlasmaContext = {
    id: 'parametric-plasma',
    label: 'Parametric plasma surface',
    sourceKind: 'parametric',
    lcfsBoundaryRZMetres: denseLcfs(32).map(([r, z]) => [r - 0.08, z * 0.9] as const),
    magneticAxisRZMetres: [1.42, 0.08],
    color: 0x3cc8ff,
    opacity: 0.1,
  };
  const geqdsk: Ehl2DiagnosticPlasmaContext = {
    id: 'geqdsk-lcfs',
    label: 'Imported GEQDSK LCFS',
    sourceKind: 'geqdsk',
    lcfsBoundaryRZMetres: denseLcfs(128),
    magneticAxisRZMetres: [1.5, 0.1],
    color: 0xff7c62,
    opacity: 0.24,
  };
  const layeredOptions: Ehl2DiagnosticOverlayOptions = {
    ...options(),
    plasmaContexts: [parametric, geqdsk],
  };
  const physicalWebMetresRoot = new Group();
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot }, layeredOptions);
  const initialLayers = plasmaGroups(physicalWebMetresRoot);
  assert.equal(initialLayers.length, 2);
  assert.deepEqual(initialLayers.map((layer) => layer.userData.layerId), ['parametric-plasma', 'geqdsk-lcfs']);
  assert.deepEqual(initialLayers.map((layer) => layer.userData.label), ['Parametric plasma surface', 'Imported GEQDSK LCFS']);
  assert.deepEqual(initialLayers.map((layer) => layer.userData.sourceKind), ['parametric', 'geqdsk']);
  assert.equal(initialLayers[0].userData.authority, 'virtual-parametric-plasma-context-not-experimental-or-calibrated');
  assert.equal(initialLayers[1].userData.authority, 'virtual-geqdsk-context-not-experimental-or-calibrated');
  initialLayers.forEach((layer, index) => {
    const surface = layer.children.find((child) => child.userData.kind === 'axisymmetric-lcfs-surface') as Object3D & {
      material: Material & { color: { getHex: () => number }; opacity: number };
    };
    assert.ok(surface);
    assert.equal(surface.material.color.getHex(), index === 0 ? 0x3cc8ff : 0xff7c62);
    assert.equal(surface.material.opacity, index === 0 ? 0.1 : 0.24);
  });

  const initialResources = renderResources(physicalWebMetresRoot);
  assert.equal(initialResources.geometries.size, 4);
  assert.equal(initialResources.materials.size, 4);
  const geometryDisposals = new Map<BufferGeometry, number>();
  const materialDisposals = new Map<Material, number>();
  initialResources.geometries.forEach((geometry) => {
    const original = geometry.dispose.bind(geometry);
    geometry.dispose = () => { geometryDisposals.set(geometry, (geometryDisposals.get(geometry) ?? 0) + 1); original(); };
  });
  initialResources.materials.forEach((material) => {
    const original = material.dispose.bind(material);
    material.dispose = () => { materialDisposals.set(material, (materialDisposals.get(material) ?? 0) + 1); original(); };
  });

  overlay.setOptions({
    ...options(),
    plasmaContexts: [{ ...parametric, visible: false }, geqdsk],
  });
  const remainingLayers = plasmaGroups(physicalWebMetresRoot);
  assert.equal(remainingLayers.length, 1);
  assert.equal(remainingLayers[0].userData.layerId, 'geqdsk-lcfs');
  initialResources.geometries.forEach((geometry) => assert.equal(geometryDisposals.get(geometry), 1));
  initialResources.materials.forEach((material) => assert.equal(materialDisposals.get(material), 1));

  const replacementResources = renderResources(remainingLayers[0]);
  const replacementGeometryDisposals = new Map<BufferGeometry, number>();
  const replacementMaterialDisposals = new Map<Material, number>();
  replacementResources.geometries.forEach((geometry) => {
    const original = geometry.dispose.bind(geometry);
    geometry.dispose = () => { replacementGeometryDisposals.set(geometry, (replacementGeometryDisposals.get(geometry) ?? 0) + 1); original(); };
  });
  replacementResources.materials.forEach((material) => {
    const original = material.dispose.bind(material);
    material.dispose = () => { replacementMaterialDisposals.set(material, (replacementMaterialDisposals.get(material) ?? 0) + 1); original(); };
  });
  overlay.dispose();
  replacementResources.geometries.forEach((geometry) => assert.equal(replacementGeometryDisposals.get(geometry), 1));
  replacementResources.materials.forEach((material) => assert.equal(replacementMaterialDisposals.get(material), 1));
});

test('41 reviewed Web-metre port centres render without raycasting and emphasize the selected port', () => {
  const pointsWebMetres = Array.from({ length: 41 }, (_, index) => {
    const phi = index * Math.PI * 2 / 41;
    return {
      id: `PORT-${String(index + 1).padStart(2, '0')}`,
      label: `Reviewed port ${index + 1}`,
      positionWebMetres: [2.5 * Math.cos(phi), (index % 5 - 2) * 0.08, -2.5 * Math.sin(phi)] as const,
    };
  });
  const selectedId = 'PORT-17';
  const physicalWebMetresRoot = new Group();
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot }, {
    ...options(),
    portMarkers: {
      pointsWebMetres,
      opacity: 0.64,
      selectedId,
      color: 0x70dfca,
      selectedColor: 0xff845f,
    },
  });
  const ports = physicalWebMetresRoot.getObjectByName('EHL2_DIAGVIEW2_REVIEWED_PORT_MARKERS');
  assert.ok(ports);
  assert.equal(ports.userData.kind, 'ehl2-diagview2-reviewed-port-centres');
  assert.equal(ports.userData.authority, 'reviewed-design-port-context-not-as-built-survey');
  assert.equal(ports.userData.coordinateFrame, 'EHL2 web Y-up metres');
  assert.equal(ports.userData.pointCount, 41);
  assert.equal(ports.userData.selectedId, selectedId);
  assert.equal(ports.children.length, 41);

  const selected = ports.children.find((child) => child.userData.portId === selectedId) as Object3D & {
    geometry: BufferGeometry & { parameters: { radius: number } };
    material: Material & { color: { getHex: () => number }; opacity: number };
  };
  const ordinary = ports.children.find((child) => child.userData.portId === 'PORT-01') as typeof selected;
  assert.ok(selected);
  assert.ok(ordinary);
  assert.equal(selected.userData.selected, true);
  assert.equal(selected.userData.label, 'Reviewed port 17');
  assert.equal(selected.geometry.parameters.radius, 0.052);
  assert.equal(selected.material.color.getHex(), 0xff845f);
  assert.equal(selected.material.opacity, 0.92);
  assert.equal(ordinary.userData.selected, false);
  assert.equal(ordinary.geometry.parameters.radius, 0.025);
  assert.equal(ordinary.material.color.getHex(), 0x70dfca);
  assert.equal(ordinary.material.opacity, 0.64);
  ports.traverse((node) => assert.equal((node.raycast as unknown as () => unknown)(), undefined));

  const resources = renderResources(ports);
  assert.equal(resources.geometries.size, 41);
  assert.equal(resources.materials.size, 41);
  const disposedGeometries = new Set<BufferGeometry>();
  const disposedMaterials = new Set<Material>();
  resources.geometries.forEach((geometry) => {
    const original = geometry.dispose.bind(geometry);
    geometry.dispose = () => { disposedGeometries.add(geometry); original(); };
  });
  resources.materials.forEach((material) => {
    const original = material.dispose.bind(material);
    material.dispose = () => { disposedMaterials.add(material); original(); };
  });
  overlay.setOptions({ ...options(), portMarkers: { pointsWebMetres, visible: false } });
  assert.equal(physicalWebMetresRoot.getObjectByName('EHL2_DIAGVIEW2_REVIEWED_PORT_MARKERS'), undefined);
  assert.equal(disposedGeometries.size, 41);
  assert.equal(disposedMaterials.size, 41);
  overlay.dispose();
});

test('invalid or hidden port-marker collections fail closed while a stale selected id leaves valid markers visible', () => {
  const validPoints = Array.from({ length: 41 }, (_, index) => ({
    id: `P-${index}`,
    positionWebMetres: [index / 10, 0, 0] as const,
  }));
  const invalidPortMarkers = [
    { pointsWebMetres: [{ id: 'bad', positionWebMetres: [Number.NaN, 0, 0] }] },
    { pointsWebMetres: [{ id: 'duplicate', positionWebMetres: [0, 0, 0] }, { id: 'duplicate', positionWebMetres: [1, 0, 0] }] },
    { pointsWebMetres: Array.from({ length: 257 }, (_, index) => ({ id: `P-${index}`, positionWebMetres: [0, 0, 0] })) },
    { pointsWebMetres: validPoints, opacity: Number.POSITIVE_INFINITY },
    { pointsWebMetres: validPoints, color: '#ffffff' },
    { pointsWebMetres: validPoints, visible: false },
  ];
  const physicalWebMetresRoot = new Group();
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot });
  invalidPortMarkers.forEach((portMarkers) => {
    assert.doesNotThrow(() => overlay.setOptions({
      ...options(),
      portMarkers: portMarkers as never,
    }));
    assert.equal(physicalWebMetresRoot.getObjectByName('EHL2_DIAGVIEW2_REVIEWED_PORT_MARKERS'), undefined);
    assert.ok(physicalWebMetresRoot.getObjectByName('EHL2_DIAGVIEW2_WORKBENCH_PLASMA-CONTEXT-TEST'));
  });
  overlay.setOptions({
    ...options(),
    portMarkers: { pointsWebMetres: validPoints, selectedId: 'removed-port' },
  });
  const ports = physicalWebMetresRoot.getObjectByName('EHL2_DIAGVIEW2_REVIEWED_PORT_MARKERS');
  assert.ok(ports);
  assert.equal(ports.userData.selectedId, null);
  assert.equal(ports.children.length, 41);
  overlay.dispose();
});

test('invalid, degenerate, hidden or non-finite plasma inputs fail closed without suppressing the diagnostic overlay', () => {
  const validBoundary = denseLcfs(24);
  const invalidContexts = [
    { lcfsBoundaryRZMetres: [[Number.NaN, 0], [1, 1], [2, 0]], magneticAxisRZMetres: [1.5, 0] },
    { lcfsBoundaryRZMetres: [[1, 0], [2, Number.POSITIVE_INFINITY], [2, 1]], magneticAxisRZMetres: [1.5, 0] },
    { lcfsBoundaryRZMetres: [[1, 0], [2, 1]], magneticAxisRZMetres: [1.5, 0] },
    { lcfsBoundaryRZMetres: [[1, 0], [2, 0], [3, 0]], magneticAxisRZMetres: [1.5, 0] },
    { lcfsBoundaryRZMetres: validBoundary, magneticAxisRZMetres: [Number.NaN, 0] },
    { lcfsBoundaryRZMetres: validBoundary, magneticAxisRZMetres: [1.5, 0], opacity: 1.1 },
    { id: ' ', lcfsBoundaryRZMetres: validBoundary, magneticAxisRZMetres: [1.5, 0] },
    { color: 0x1000000, lcfsBoundaryRZMetres: validBoundary, magneticAxisRZMetres: [1.5, 0] },
    { sourceKind: 'measured', lcfsBoundaryRZMetres: validBoundary, magneticAxisRZMetres: [1.5, 0] },
    { lcfsBoundaryRZMetres: validBoundary, magneticAxisRZMetres: [1.5, 0], visible: false },
  ] as unknown as Ehl2DiagnosticPlasmaContext[];

  const physicalWebMetresRoot = new Group();
  const overlay = createEhl2DiagnosticThreeOverlay({ physicalWebMetresRoot });
  invalidContexts.forEach((plasmaContext) => {
    assert.doesNotThrow(() => overlay.setOptions(options(plasmaContext)));
    assert.equal(physicalWebMetresRoot.getObjectByName(PLASMA_GROUP), undefined);
    assert.ok(physicalWebMetresRoot.getObjectByName('EHL2_DIAGVIEW2_WORKBENCH_PLASMA-CONTEXT-TEST'));
  });
  overlay.dispose();
});
