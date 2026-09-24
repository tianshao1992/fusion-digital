import { DynamicDrawUsage, Group, type InterleavedBufferAttribute, type Object3D, type Plane, type WebGLRenderer } from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { FIELDLINE_COLORS, FIELDLINE_COPIES, type FieldlineView } from '../efit/fieldlines';

export type EfitFieldLineOverlay = ReturnType<typeof createEfitFieldLineOverlay>;
export const EMPTY_FIELDLINE_VIEW: FieldlineView = { frame: null, xray: true, clip: false };

/** Same physical metre root as CAD/antenna; no second model or centre-fit. */
export function fieldlineWebPoints(points: readonly number[], phiOffset = 0) {
  const xyz: number[] = [];
  for (let i = 0; i < points.length; i += 3) xyz.push(points[i] * Math.cos(points[i + 1] + phiOffset), points[i + 2], -points[i] * Math.sin(points[i + 1] + phiOffset));
  return xyz;
}

export function createEfitFieldLineOverlay(root: Object3D, renderer: WebGLRenderer, clippingPlane: Plane) {
  const group = new Group(); group.name = 'EFIT_IMAS_FIELDLINES'; group.visible = false; root.add(group);
  const layers = FIELDLINE_COLORS.map((color) => {
    const positions = new Float32Array(4094 * 8 * 6);
    const geometry = new LineSegmentsGeometry(); geometry.setPositions(positions); geometry.instanceCount = 0;
    (geometry.getAttribute('instanceStart') as InterleavedBufferAttribute).data.setUsage(DynamicDrawUsage);
    const outline = new LineMaterial({ color: '#101710', linewidth: 4.5, depthWrite: false, toneMapped: false });
    const material = new LineMaterial({ color, linewidth: 2.5, depthWrite: false, toneMapped: false });
    const halo = new LineSegments2(geometry, outline); const line = new LineSegments2(geometry, material);
    halo.frustumCulled = false; line.frustumCulled = false; halo.renderOrder = 31; line.renderOrder = 32;
    group.add(halo, line); return { positions, geometry, material, outline, halo, line };
  });
  let disposed = false; let identity = ''; let clipEnabled = false;
  let view: FieldlineView = EMPTY_FIELDLINE_VIEW;
  function applyMaterials() {
    for (const layer of layers) for (const material of [layer.outline, layer.material]) {
      material.depthTest = !view.xray;
      material.clippingPlanes = view.clip && clipEnabled ? [clippingPlane] : [];
      material.needsUpdate = true;
    }
  }
  const overlay = {
    setView(next: FieldlineView) {
      if (disposed) return;
      const materialChanged = next.xray !== view.xray || next.clip !== view.clip;
      view = next;
      if (materialChanged) applyMaterials();
      group.visible = !!next.frame && next.frame.state === 'valid';
      if (!group.visible) { identity = ''; return; }
      const copies = FIELDLINE_COPIES.find((n) => n === next.copies) ?? 2;
      const frame = next.frame!; const key = `${frame.shot}:${frame.sourceIndex}:${frame.timeMs}:${copies}`;
      if (key === identity) return; identity = key;
      layers.forEach((layer, index) => {
        const source = frame.lines[index]; layer.halo.visible = layer.line.visible = !!source;
        if (!source) return;
        let segment = 0;
        const points = fieldlineWebPoints(source.points);
        // Axisymmetry permits toroidal rotations as distinct seeds on the same flux surface.
        // Do not join separate traces or mistake denser vertices for more field lines.
        for (let copy = 0; copy < copies; copy++) {
          const phase = copy * 2 * Math.PI / copies;
          const cosine = Math.cos(phase); const sine = Math.sin(phase);
          for (let p = 0; p < points.length - 3; p += 3) {
            const offset = segment++ * 6;
            layer.positions[offset] = points[p] * cosine + points[p + 2] * sine;
            layer.positions[offset + 1] = points[p + 1];
            layer.positions[offset + 2] = points[p + 2] * cosine - points[p] * sine;
            layer.positions[offset + 3] = points[p + 3] * cosine + points[p + 5] * sine;
            layer.positions[offset + 4] = points[p + 4];
            layer.positions[offset + 5] = points[p + 5] * cosine - points[p + 3] * sine;
          }
        }
        layer.geometry.instanceCount = segment;
        // Reuse the same GPU buffer throughout playback, not new attributes every frame.
        const buffer = (layer.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute).data;
        buffer.clearUpdateRanges(); buffer.addUpdateRange(0, segment * 6);
        buffer.needsUpdate = true;
      });
    },
    resize(width: number, height: number) {
      if (!disposed) layers.forEach(({ material, outline }) => { material.resolution.set(width, height); outline.resolution.set(width, height); });
    },
    setClippingEnabled(enabled: boolean) { clipEnabled = enabled; if (!disposed) applyMaterials(); },
    dispose() {
      if (disposed) return; disposed = true; group.removeFromParent();
      layers.forEach(({ geometry, material, outline }) => { geometry.dispose(); material.dispose(); outline.dispose(); });
    },
  };
  applyMaterials(); const canvas = renderer.domElement; overlay.resize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);
  return overlay;
}
