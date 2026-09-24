import { DynamicDrawUsage, Group, type InterleavedBufferAttribute, type Object3D, type WebGLRenderer } from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { FIELDLINE_COLORS, FIELDLINE_COPIES } from '../components/efit/fieldlines';

/** The EFIT five-colour visual language, without coupling simulation data to an EFIT shot. */
export const SIMULATION_FIELDLINE_COLORS = FIELDLINE_COLORS;
export const SIMULATION_FIELDLINE_COPIES = FIELDLINE_COPIES;

export type SimulationFieldLine = {
  psiNorm: number;
  /** Consecutive R (metres), phi (radians), Z (metres) samples. */
  pointsRphiZ: readonly number[];
};

export type SimulationFieldLineView = {
  /** A stable, source-bound identity; changes when the result or time slice changes. */
  identity: string;
  lines: readonly SimulationFieldLine[] | null;
  copies: number;
  xray: boolean;
};

const MAX_POINTS_PER_LINE = 4095;

function validateLines(lines: readonly SimulationFieldLine[]) {
  if (lines.length > SIMULATION_FIELDLINE_COLORS.length) throw new Error('FIELDLINE_DISPLAY_BUDGET');
  for (const line of lines) {
    const points = line.pointsRphiZ;
    if (!Number.isFinite(line.psiNorm) || line.psiNorm <= 0 || line.psiNorm >= 1
      || !Array.isArray(points) || points.length < 6 || points.length > MAX_POINTS_PER_LINE * 3
      || points.length % 3 !== 0) throw new Error('INVALID_FIELDLINE_DISPLAY');
    for (let i = 0; i < points.length; i += 3) {
      if (!Number.isFinite(points[i]) || points[i] <= 0 || points[i] > 1000
        || !Number.isFinite(points[i + 1]) || Math.abs(points[i + 1]) > 100_000
        || !Number.isFinite(points[i + 2]) || Math.abs(points[i + 2]) > 1000) {
        throw new Error('INVALID_FIELDLINE_DISPLAY');
      }
    }
  }
}

/** Display only: the caller owns numerical tracing, scientific validation and provenance. */
export function createSimulationFieldLineOverlay(root: Object3D, renderer: WebGLRenderer) {
  const group = new Group();
  group.name = 'SIMULATION_FIELDLINES';
  group.visible = false;
  root.add(group);
  const layers = SIMULATION_FIELDLINE_COLORS.map((color) => {
    const positions = new Float32Array((MAX_POINTS_PER_LINE - 1) * 8 * 6);
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(positions);
    geometry.instanceCount = 0;
    (geometry.getAttribute('instanceStart') as InterleavedBufferAttribute).data.setUsage(DynamicDrawUsage);
    const outline = new LineMaterial({ color: '#101710', linewidth: 4.5, depthWrite: false, toneMapped: false });
    const material = new LineMaterial({ color, linewidth: 2.5, depthWrite: false, toneMapped: false });
    const halo = new LineSegments2(geometry, outline);
    const line = new LineSegments2(geometry, material);
    halo.frustumCulled = false;
    line.frustumCulled = false;
    halo.renderOrder = 31;
    line.renderOrder = 32;
    group.add(halo, line);
    return { positions, geometry, material, outline, halo, line };
  });
  let disposed = false;
  let current: SimulationFieldLineView | null = null;
  let geometryIdentity = '';
  let geometryLines: readonly SimulationFieldLine[] | null = null;

  function hide() {
    group.visible = false;
    geometryIdentity = '';
    geometryLines = null;
    for (const layer of layers) layer.geometry.instanceCount = 0;
  }

  const overlay = {
    setView(next: SimulationFieldLineView) {
      if (disposed) return;
      const lines = next.lines ?? [];
      if (lines.length === 0) { hide(); current = next; return; }
      try { validateLines(lines); }
      catch (error) { hide(); throw error; }
      const copies = SIMULATION_FIELDLINE_COPIES.find((n) => n === next.copies) ?? 2;
      if (!current || next.xray !== current.xray) {
        for (const layer of layers) for (const material of [layer.outline, layer.material]) {
          material.depthTest = !next.xray;
          material.needsUpdate = true;
        }
      }
      current = next;
      group.visible = true;
      const identity = `${next.identity}:${copies}`;
      if (identity === geometryIdentity && lines === geometryLines) return;
      geometryIdentity = identity;
      geometryLines = lines;
      layers.forEach((layer, index) => {
        const source = lines[index];
        layer.halo.visible = layer.line.visible = Boolean(source);
        if (!source) { layer.geometry.instanceCount = 0; return; }
        const points = source.pointsRphiZ;
        const count = points.length / 3;
        let segment = 0;
        for (let copy = 0; copy < copies; copy++) {
          const phase = copy * 2 * Math.PI / copies;
          for (let p = 0; p < count - 1; p++) {
            const a = p * 3, b = a + 3, offset = segment++ * 6;
            const phiA = points[a + 1] + phase, phiB = points[b + 1] + phase;
            layer.positions[offset] = points[a] * Math.cos(phiA);
            layer.positions[offset + 1] = points[a + 2];
            layer.positions[offset + 2] = -points[a] * Math.sin(phiA);
            layer.positions[offset + 3] = points[b] * Math.cos(phiB);
            layer.positions[offset + 4] = points[b + 2];
            layer.positions[offset + 5] = -points[b] * Math.sin(phiB);
          }
        }
        layer.geometry.instanceCount = segment;
        // Geometry and attributes are fixed for the overlay lifetime; only active segments change.
        const buffer = (layer.geometry.getAttribute('instanceStart') as InterleavedBufferAttribute).data;
        buffer.clearUpdateRanges();
        buffer.addUpdateRange(0, segment * 6);
        buffer.needsUpdate = true;
      });
    },
    resize(width: number, height: number) {
      if (disposed || width <= 0 || height <= 0) return;
      layers.forEach(({ material, outline }) => {
        material.resolution.set(width, height);
        outline.resolution.set(width, height);
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      hide();
      group.removeFromParent();
      layers.forEach(({ geometry, material, outline }) => {
        geometry.dispose();
        material.dispose();
        outline.dispose();
      });
    },
  };
  const canvas = renderer.domElement;
  overlay.resize(canvas.clientWidth || canvas.width || 1, canvas.clientHeight || canvas.height || 1);
  return overlay;
}

export type SimulationFieldLineOverlay = ReturnType<typeof createSimulationFieldLineOverlay>;
