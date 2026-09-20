import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { prepareCadSiteAction, renderCadActionFrame, resolveCadSiteAction } from '../app/components/device-viewer/cadSiteActions.ts';
import { waitForSiteCondition as waitForCadCondition } from '../app/agent/site-action-runtime.ts';
import type { Ehl2DiagnosticViewerState } from '../app/components/TokamakCadViewer.tsx';

function state(): Ehl2DiagnosticViewerState {
  return { activeView: 'iso', cameraView: { position: [3, 2, 3], target: [0, 0, 0], up: [0, 1, 0] },
    autoRotate: false, wireframe: false, clipping: false, clipAxis: 'z', clipOffset: 0,
    globalOpacity: 1, selectedOpacity: 1, analyticPlasmaVisible: false,
    selectedPartIds: [], hiddenPartIds: [], isolatedPartIds: [], partOpacities: {} };
}
const options = { anonymous: false, partIds: new Set(['EXL-02', 'EXL-04']),
  defaults: { clipping: true, clipAxis: 'z' as const, clipOffset: 0.08, analyticPlasmaVisible: false } };

test('anonymous total assembly cannot acquire part semantics even if a caller supplies its root or shard id', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/models/exl50u-general-assembly-v1/model-manifest.json', import.meta.url), 'utf8'));
  const partId = manifest.systems[0].parts[0].id;
  for (const id of [partId, 'anonymous-shard-01', 'EXL-04']) {
    const input = state();
    const before = structuredClone(input);
    assert.throws(() => resolveCadSiteAction(input, { type: 'cad.select_parts', mode: 'isolate', partIds: [id] },
      { ...options, anonymous: true, partIds: new Set([id]) }), /匿名/);
    assert.deepEqual(input, before);
  }
});

test('mixed valid and unknown part selection is rejected atomically', () => {
  const input = state();
  const before = structuredClone(input);
  assert.throws(() => resolveCadSiteAction(input, { type: 'cad.select_parts', mode: 'hide', partIds: ['EXL-04', 'not-published'] }, options), /不存在/);
  assert.deepEqual(input, before);
});

test('isolation makes a previously hidden public target visible and a later hide clears isolation', () => {
  const input = { ...state(), hiddenPartIds: ['EXL-04'], selectedPartIds: ['EXL-02'] };
  const isolated = resolveCadSiteAction(input, { type: 'cad.select_parts', mode: 'isolate', partIds: ['EXL-04'] }, options).state;
  assert.deepEqual(isolated.hiddenPartIds, []);
  assert.deepEqual(isolated.selectedPartIds, ['EXL-04']);
  assert.deepEqual(isolated.isolatedPartIds, ['EXL-04']);
  const hidden = resolveCadSiteAction(isolated, { type: 'cad.select_parts', mode: 'hide', partIds: ['EXL-04'] }, options).state;
  assert.deepEqual(hidden.hiddenPartIds, ['EXL-04']);
  assert.deepEqual(hidden.isolatedPartIds, []);
  assert.deepEqual(hidden.selectedPartIds, []);
  assert.deepEqual(input.hiddenPartIds, ['EXL-04'], 'the undo snapshot is not mutated');
});

test('bounded display operations preserve exact supported endpoints and reset device defaults', () => {
  const clipped = resolveCadSiteAction(state(), { type: 'cad.set_clip', enabled: true, axis: 'x', offset: -0.9 }, options).state;
  assert.equal(clipped.clipOffset, -0.9);
  const translucent = resolveCadSiteAction(clipped, { type: 'cad.set_opacity', opacity: 0.15 }, options).state;
  assert.equal(translucent.globalOpacity, 0.15);
  assert.deepEqual(translucent.cameraView, state().cameraView, 'display controls preserve the live view');
  const reset = resolveCadSiteAction({ ...translucent, partOpacities: { 'EXL-04': 0.5 } }, { type: 'cad.reset' }, options).state;
  assert.equal(reset.cameraView, null);
  assert.equal(reset.clipping, true);
  assert.equal(reset.clipAxis, 'z');
  assert.equal(reset.clipOffset, 0.08);
  assert.equal(reset.globalOpacity, 1);
  assert.deepEqual(reset.partOpacities, {});
  assert.throws(() => resolveCadSiteAction(state(), { type: 'cad.set_opacity', opacity: Number.NaN }, options), /参数/);
  assert.throws(() => resolveCadSiteAction(state(), { type: 'cad.set_clip', enabled: true, axis: 'z', offset: 1.1 }, options), /参数/);
});

test('view then opacity can undo twice without changing preset identity or losing exact camera poses', () => {
  const initial = state();
  const initialPose = structuredClone(initial.cameraView!);
  const view = prepareCadSiteAction(initial, { type: 'cad.set_view', view: 'front' }, options, initialPose);
  assert.equal(view.state.cameraView, null);
  assert.equal(view.cameraOverride, undefined, 'the view action asks the renderer to apply its preset');
  const frontPose = { position: [0, 0.25, 10], target: [0, 0, 0], up: [0, 1, 0] } as NonNullable<typeof initial.cameraView>;
  const opacity = prepareCadSiteAction(view.state, { type: 'cad.set_opacity', opacity: 0.5 }, options, frontPose);
  assert.deepEqual(opacity.cameraOverride, frontPose, 'display changes retain the live camera without moving it');
  assert.equal(opacity.state.cameraView, null, 'the UI still represents the same preset');
  const undoOpacity = { state: opacity.before, camera: opacity.beforeCamera };
  assert.deepEqual(undoOpacity.state, view.state, 'first undo restores the exact snapshot expected by the earlier action');
  assert.deepEqual(undoOpacity.camera, frontPose);
  const undoView = { state: view.before, camera: view.beforeCamera };
  assert.deepEqual(undoView.state, initial);
  assert.deepEqual(undoView.camera, initialPose);
  const manuallyMoved = { ...undoOpacity.state, cameraView: { ...frontPose, position: [1, 0.25, 10] } };
  assert.notDeepEqual(manuallyMoved, view.state, 'a real pointer-end custom pose still invalidates old undo');
  frontPose.position[0] = 2;
  initialPose.position[0] = 2;
  assert.equal(opacity.beforeCamera.position[0], 0, 'undo pose ownership is independent of live mutable arrays');
  assert.equal(view.beforeCamera.position[0], 3);
});

test('readiness waits reject cancellation, timeout and loader failure instead of claiming success', async () => {
  const controller = new AbortController();
  const pending = waitForCadCondition(() => false, controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(waitForCadCondition(() => false, new AbortController().signal, 0));
  await assert.rejects(waitForCadCondition(() => { throw new Error('decode failed'); }, new AbortController().signal), /decode failed/);
  let ready = false;
  const waiting = waitForCadCondition(() => ready, new AbortController().signal);
  ready = true;
  await waiting;
});

test('render receipt waits for the actual frame and cannot succeed after cancellation or renderer failure', async (t) => {
  const oldRequest = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const oldCancel = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  const frames = new Map<number, FrameRequestCallback>();
  let sequence = 0;
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback); return sequence;
  } });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: (id: number) => frames.delete(id) });
  t.after(() => {
    if (oldRequest) Object.defineProperty(globalThis, 'requestAnimationFrame', oldRequest); else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
    if (oldCancel) Object.defineProperty(globalThis, 'cancelAnimationFrame', oldCancel); else Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
  });
  let renderCount = 0;
  const pending = renderCadActionFrame(() => { renderCount++; }, new AbortController().signal);
  assert.equal(renderCount, 0);
  frames.get(sequence)!(0);
  await pending;
  assert.equal(renderCount, 1);
  const abort = new AbortController();
  const cancelled = renderCadActionFrame(() => { renderCount++; }, abort.signal);
  abort.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(frames.size, 0);
  assert.equal(renderCount, 1);
  const failed = renderCadActionFrame(() => { throw new Error('context lost'); }, new AbortController().signal);
  frames.get(sequence)!(0);
  await assert.rejects(failed, /context lost/);
});
