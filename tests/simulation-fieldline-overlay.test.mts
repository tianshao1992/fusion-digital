import test from 'node:test';
import assert from 'node:assert/strict';
import { DynamicDrawUsage, Group, type InterleavedBufferAttribute, type WebGLRenderer } from 'three';
import { FIELDLINE_COLORS } from '../app/components/efit/fieldlines.ts';
import {
  createSimulationFieldLineOverlay,
  SIMULATION_FIELDLINE_COLORS,
  SIMULATION_FIELDLINE_COPIES,
} from '../app/simulations/SimulationFieldLineOverlay.ts';

const source = [{ psiNorm: .25, pointsRphiZ: [1, 0, 0, 1, Math.PI / 2, .2, 1, Math.PI, .1] }];
const renderer = { domElement: { clientWidth: 800, clientHeight: 600 } } as WebGLRenderer;

test('simulation overlay keeps the EFIT palette but owns no EFIT shot or scientific qualification', () => {
  assert.deepEqual(SIMULATION_FIELDLINE_COLORS, FIELDLINE_COLORS);
  assert.deepEqual(SIMULATION_FIELDLINE_COPIES, [1, 2, 4, 8]);
  const root = new Group();
  const overlay = createSimulationFieldLineOverlay(root, renderer);
  const view = { identity: 'fuse-run-a:0', lines: source, copies: 2, xray: true };
  overlay.setView(view);
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].visible, true);
  assert.equal(root.children[0].children.length, 10);
  const layer = root.children[0].children[0] as Group & { geometry: { instanceCount: number; getAttribute: (name: string) => InterleavedBufferAttribute }; material: { depthTest: boolean; resolution: { x: number; y: number } } };
  const original = layer.geometry.getAttribute('instanceStart');
  assert.equal(original.data.usage, DynamicDrawUsage);
  assert.equal(layer.geometry.instanceCount, 4);
  assert.equal(layer.material.depthTest, false);
  assert.equal(layer.material.resolution.x, 800);
  assert.equal(layer.material.resolution.y, 600);

  overlay.setView({ ...view, identity: 'fuse-run-b:0', copies: 8, xray: false });
  assert.equal(layer.geometry.getAttribute('instanceStart'), original);
  assert.equal(layer.geometry.instanceCount, 16);
  assert.equal(layer.material.depthTest, true);
  assert.deepEqual(original.data.updateRanges, [{ start: 0, count: 96 }]);
  overlay.resize(1200, 700);
  assert.equal(layer.material.resolution.x, 1200);
  assert.equal(layer.material.resolution.y, 700);

  overlay.setView({ ...view, lines: [], copies: 1 });
  assert.equal(root.children[0].visible, false);
  assert.equal(layer.geometry.instanceCount, 0);
  overlay.dispose();
  overlay.dispose();
  assert.equal(root.children.length, 0);
});

test('invalid or oversized line data hides the prior view instead of keeping stale geometry', () => {
  const root = new Group();
  const overlay = createSimulationFieldLineOverlay(root, renderer);
  overlay.setView({ identity: 'valid', lines: source, copies: 1, xray: false });
  assert.throws(() => overlay.setView({ identity: 'bad', lines: [{ psiNorm: .5, pointsRphiZ: [0, 0, 0, 1, 0, 0] }], copies: 1, xray: false }), /INVALID_FIELDLINE_DISPLAY/);
  assert.equal(root.children[0].visible, false);
  overlay.dispose();
});
