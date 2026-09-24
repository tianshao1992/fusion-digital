import { Group, type Object3D, type Mesh, type Material } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { loadVerifiedMonolithicModel } from './componentModelLoader';
import { antennaPlacement, ICRF_MODEL, type IcrfAntennaOptions } from './icrfAntenna';

export async function loadIcrfAntenna(signal: AbortSignal) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const mesh = await loadVerifiedMonolithicModel(ICRF_MODEL, { loader, signal });
  const root = new Group();
  root.name = 'EXL50U_ICRF_300_DEG';
  root.userData.icrfAntenna = true;
  root.matrixAutoUpdate = false;
  root.add(mesh);
  // Preserve original CAD colours, opaque solid rendering and complete fine geometry.
  // Host section planes/opacity/selection must not erase this independent attachment.
  root.traverse((node) => {
    if (!(node as Mesh).isMesh) return;
    const part = node as Mesh;
    part.raycast = () => {};
    for (const material of Array.isArray(part.material) ? part.material : [part.material]) {
      material.transparent = false;
      material.opacity = 1;
      material.clippingPlanes = null;
    }
  });
  let disposed = false;
  return {
    root,
    setOptions(options: IcrfAntennaOptions) {
      if (disposed) return;
      root.visible = options.visible;
      root.matrix.fromArray(antennaPlacement(options.radiusMm).matrix);
      root.matrixWorldNeedsUpdate = true;
      root.userData.radiusMm = options.radiusMm;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      const geometries = new Set<Mesh['geometry']>();
      const materials = new Set<Material>();
      root.traverse((node: Object3D) => {
        if (!(node as Mesh).isMesh) return;
        const part = node as Mesh;
        geometries.add(part.geometry);
        for (const material of Array.isArray(part.material) ? part.material : [part.material]) materials.add(material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      root.clear();
    },
  };
}
export type IcrfAntennaOverlay = Awaited<ReturnType<typeof loadIcrfAntenna>>;
