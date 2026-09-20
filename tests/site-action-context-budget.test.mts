import assert from 'node:assert/strict';
import test from 'node:test';
import { boundSiteActionContext, normalizeSiteActionContext, SITE_ACTION_CONTEXT_BYTES, type SiteActionContext } from '../app/agent/site-actions.ts';
import { SiteActionRuntime } from '../app/agent/site-action-runtime.ts';

const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const base: SiteActionContext = { path: '/', pageInstanceId: 'page-budget', revision: 7, capabilities: ['site.read_context', 'page.click', 'page.select'] };
const largePage = () => ({ title: 'EXL总装', text: '装'.repeat(6000), controls: Array.from({ length: 60 }, (_, i) => ({ id: `control_${i}`, role: 'button', label: '部'.repeat(160), actions: ['click' as const] })) });

test('large Chinese page observations fit the byte budget without mutating IDs or source data', () => {
  const input = { ...base, page: largePage() }; const original = structuredClone(input);
  assert.ok(byteLength(input) > 50_000); assert.ok(normalizeSiteActionContext(input));
  const bounded = boundSiteActionContext(input);
  assert.ok(byteLength(bounded) <= SITE_ACTION_CONTEXT_BYTES); assert.equal(bounded.observationTruncated, true);
  assert.deepEqual(input, original); assert.equal(bounded.pageInstanceId, input.pageInstanceId); assert.equal(bounded.revision, input.revision);
  assert.deepEqual(normalizeSiteActionContext(bounded), bounded);
  for (const control of bounded.page!.controls) assert.ok(input.page.controls.some(candidate => candidate.id === control.id));
});

test('long select options keep exact dispatch values and selected options while bounding UTF-8 labels', () => {
  const options = Array.from({ length: 80 }, (_, i) => ({ value: `${i}_${'值'.repeat(180)}`, label: '标签'.repeat(80) }));
  const selected = options[79].value;
  const input: SiteActionContext = { ...base, page: { title: 'Select', text: '', controls: [{ id: 'select_1', role: 'combobox', label: '模型', value: selected, options, actions: ['select'] }] } };
  const bounded = boundSiteActionContext(input); const control = bounded.page!.controls[0];
  assert.ok(byteLength(bounded) <= SITE_ACTION_CONTEXT_BYTES); assert.equal(control.id, 'select_1'); assert.equal(control.value, selected);
  assert.ok(control.options!.some(option => option.value === selected));
  assert.ok(control.options!.every(option => options.some(original => original.value === option.value)));
  assert.ok(normalizeSiteActionContext(bounded));
});

test('large parts and data catalogs are bounded while selected IDs remain complete and unchanged', () => {
  const partIds = Array.from({ length: 80 }, (_, i) => `${i}_${'件'.repeat(110)}`);
  const signalIds = Array.from({ length: 100 }, (_, i) => `${i}_${'信'.repeat(110)}`);
  const input: SiteActionContext = { ...base, page: largePage(),
    viewer: { viewerId: 'v1', deviceId: 'd1', ready: true, revision: 18, view: 'top', parts: partIds.map(id => ({ id, label: '零件'.repeat(80) })), selectedPartIds: partIds.slice(-32) },
    data: { shotIds: ['21101', '21102'], selectedShotId: '21102', signalIds, selectedSignalIds: signalIds.slice(-8) } };
  assert.ok(normalizeSiteActionContext(input)); const bounded = boundSiteActionContext(input);
  assert.ok(byteLength(bounded) <= SITE_ACTION_CONTEXT_BYTES); assert.ok(normalizeSiteActionContext(bounded));
  assert.deepEqual(bounded.viewer!.selectedPartIds, input.viewer!.selectedPartIds); assert.equal(bounded.viewer!.revision, 18);
  assert.equal(bounded.data!.selectedShotId, '21102'); assert.deepEqual(bounded.data!.selectedSignalIds, input.data!.selectedSignalIds);
  assert.ok(bounded.viewer!.parts.every(part => partIds.includes(part.id))); assert.ok(bounded.data!.signalIds.every(id => signalIds.includes(id)));
});

test('runtime fingerprints the bounded observation and retains expected-context execution semantics', async () => {
  const page = largePage(); let executions = 0;
  const runtime = new SiteActionRuntime(() => undefined);
  runtime.setPageSurface({ getSnapshot: () => page, execute: async () => { executions++; return { message: 'Clicked' }; } });
  const before = runtime.getContext(); const repeat = runtime.getContext();
  assert.ok(byteLength(before) <= SITE_ACTION_CONTEXT_BYTES); assert.equal(before.revision, repeat.revision);
  page.text = `${page.text.slice(0, -1)}尾`; // only the omitted tail changes
  assert.equal(runtime.getContext().revision, before.revision);
  const receipts = await runtime.execute({ version: 1, actions: [{ type: 'page.click', targetId: before.page!.controls[0].id }] },
    { runId: 'budget-call', expected: before, signal: new AbortController().signal });
  assert.equal(receipts[0].status, 'applied'); assert.equal(executions, 1);
  page.controls[0].label = '新的控件';
  const changed = runtime.getContext(); assert.ok(changed.revision > before.revision); assert.equal(changed.pageInstanceId, before.pageInstanceId);
});

test('small observations preserve their full content and no truncation marker is invented', () => {
  const bounded = boundSiteActionContext(base); assert.deepEqual(bounded, base); assert.equal(bounded.observationTruncated, undefined);
});
