import { Group, MeshStandardMaterial, type Object3D, type Mesh, type Material } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { loadVerifiedMonolithicModel } from './componentModelLoader';
import { antennaPlacement, ICRF_MODEL, type IcrfAntennaOptions } from './icrfAntenna';

// Display colours only: distinguish the attachment from silver/copper host CAD.
// Low metalness and a small emissive floor retain detail in both scene themes.
export const ICRF_APPEARANCE = {
  body: { color: '#064bff', metalness: 0.05, roughness: 0.42, emissive: '#0634b8', emissiveIntensity: 0.18 },
  limiter: { color: '#fff2cc', metalness: 0, roughness: 0.58, emissive: '#ffe6a0', emissiveIntensity: 0.08 },
} as const;

export async function loadIcrfAntenna(signal: AbortSignal) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const mesh = await loadVerifiedMonolithicModel(ICRF_MODEL, { loader, signal });
  const root = new Group();
  root.name = 'EXL50U_ICRF_300_DEG';
  root.userData.icrfAntenna = true;
  root.matrixAutoUpdate = false;
  root.add(mesh);
  // Recolour materials, never the reviewed geometry or placement.
  // Host section planes/opacity/selection must not erase this independent attachment.
  const originals = new Set<Material>();
  const styled = new Map<Material, Partial<Record<keyof typeof ICRF_APPEARANCE, Material>>>();
  root.traverse((node) => {
    if (!(node as Mesh).isMesh) return;
    const part = node as Mesh;
    part.raycast = () => {};
    const kind = part.name.includes('限制器') ? 'limiter' : 'body';
    const recolour = (original: Material) => {
      originals.add(original);
      const variants = styled.get(original) ?? {};
      if (variants[kind]) return variants[kind];
      // Some body and limiter meshes share a source material. Isolate their styles.
      const material = original.clone();
      if (material instanceof MeshStandardMaterial) {
        const appearance = ICRF_APPEARANCE[kind];
        material.color.set(appearance.color);
        material.emissive.set(appearance.emissive);
        material.emissiveIntensity = appearance.emissiveIntensity;
        material.metalness = appearance.metalness;
        material.roughness = appearance.roughness;
      }
      material.transparent = false;
      material.opacity = 1;
      material.clippingPlanes = null;
      material.depthTest = true;
      material.depthWrite = true;
      variants[kind] = material;
      styled.set(original, variants);
      return material;
    };
    part.material = Array.isArray(part.material) ? part.material.map(recolour) : recolour(part.material);
  });
  originals.forEach((material) => material.dispose());
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
