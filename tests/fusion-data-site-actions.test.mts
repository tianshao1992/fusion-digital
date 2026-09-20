import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publishedShotContextIds, publishedShotSelectionMessage, publishedShotViewReady, resolvePublishedPulse, resolvePublishedSignalSelection } from '../app/fusion-data/fusionDataSiteActions.ts';
import { normalizeSiteActionContext } from '../app/agent/site-actions.ts';

// Synthetic catalog exercises identity validation without creating observations.
const syntheticSignals = [
  { id: 'plasma-current', dataItem: 'magnetics' },
  { id: 'boundary-rmax', dataItem: 'equilibrium' },
  { id: 'boundary-kappa', dataItem: 'equilibrium' },
];

test('shot selection accepts only the exact published identifier, without permissive numeric coercion', () => {
  const records = [{ pulse: 18303 }, { pulse: 18304 }];
  assert.equal(resolvePublishedPulse(records, '18303'), 18303);
  for (const id of ['018303', '18303.0', '1.8303e4', '18303 ', '18305', '/private/18303']) {
    assert.throws(() => resolvePublishedPulse(records, id), /公开快照/);
  }
});

test('multi-signal selection retains every requested published signal across measurement and reconstruction groups', () => {
  const ids = ['plasma-current', 'boundary-kappa'];
  const resolved = resolvePublishedSignalSelection(syntheticSignals, ids);
  assert.deepEqual(resolved.signalIds, ids);
  assert.notEqual(resolved.signalIds, ids);
  assert.equal(resolved.focusedSignalId, 'plasma-current');
  assert.equal(resolved.signalGroup, 'diagnostics');
  assert.equal(resolvePublishedSignalSelection(syntheticSignals, ['boundary-rmax']).signalGroup, 'equilibrium');
});

test('unknown and duplicate signals reject the complete selection instead of silently selecting its first valid member', () => {
  const before = structuredClone(syntheticSignals);
  for (const ids of [[], ['plasma-current', 'missing'], ['boundary-rmax', 'boundary-rmax'], Array.from({ length: 9 }, (_, index) => `signal-${index}`)]) {
    assert.throws(() => resolvePublishedSignalSelection(syntheticSignals, ids));
    assert.deepEqual(syntheticSignals, before);
  }
});

test('large shot catalogs retain the current shot and filtered older rows with canonical IDs', () => {
  const records = Array.from({ length: 250 }, (_, index) => ({ pulse: 18000 + index }));
  const recent = publishedShotContextIds(records, 18000);
  assert.equal(recent.length, 100); assert.equal(recent[0], '18000'); assert.ok(recent.includes('18249'));
  const filtered = publishedShotContextIds(records, 18249, [records[0], records[1], { pulse: 99999 }]);
  assert.deepEqual(filtered.slice(0, 3), ['18249', '18000', '18001']); assert.equal(filtered.includes('99999'), false);
  assert.equal(new Set(filtered).size, filtered.length); assert.ok(filtered.length <= 100);
});

test('a verified empty-signal snapshot remains valid without inventing a selected signal', () => {
  const base = { path: '/fusion-data', pageInstanceId: 'empty-shot-page', revision: 3, capabilities: ['data.select_shot'],
    data: { shotIds: ['22000', '22001'], selectedShotId: '22001', signalIds: [], selectedSignalIds: [] } };
  assert.deepEqual(normalizeSiteActionContext(base), base);
  assert.equal(normalizeSiteActionContext({ ...base, data: { ...base.data, selectedSignalIds: ['plasma-current'] } }), null);
  assert.equal(normalizeSiteActionContext({ ...base, data: { ...base.data, selectedShotId: 'unknown' } }), null);
  assert.equal(normalizeSiteActionContext({ ...base, data: { ...base.data, signalIds: [17] } }), null);
});

test('empty-signal selection completes only after the correct empty record is displayed', () => {
  const root = (emptyPulse: number | null) => ({ querySelector: (selector: string) => selector === '.fusionEmptyShot' && emptyPulse !== null
    ? { dataset: { shot: String(emptyPulse) } } : null }) as unknown as Pick<Element, 'querySelector'>;
  assert.equal(publishedShotViewReady(root(null), 22001, 0), false);
  assert.equal(publishedShotViewReady(root(22000), 22001, 0), false);
  assert.equal(publishedShotViewReady(root(22001), 22001, 0), true);
  assert.equal(publishedShotViewReady(root(22001), 22001, 3), false);
  const receipt = publishedShotSelectionMessage({ pulse: 22001, signals: [] });
  assert.match(receipt, /22001/); assert.match(receipt, /暂无可发布信号/); assert.match(receipt, /未显示曲线或替代数据/);
  assert.doesNotMatch(publishedShotSelectionMessage({ pulse: 22000, signals: [{}] }), /暂无可发布信号/);
});

test('non-empty shots still require a ready rendered chart or an explicit empty signal group', () => {
  const root = (status: 'ready' | 'loading' | 'failed' | 'absent', svg: boolean, selectedIds = 'plasma-current') => ({ querySelector: (selector: string) => selector === '.fusionPulsePanel' ? {
    dataset: { shot: '22000', signalIds: selectedIds }, querySelector: () => status === 'absent' ? null : {
      classList: { contains: (name: string) => (name === 'isReady' && status === 'ready') || (name === 'hasFailed' && status === 'failed') },
      querySelector: () => svg ? {} : null,
    },
  } : null }) as unknown as Pick<Element, 'querySelector'>;
  assert.equal(publishedShotViewReady(root('loading', false), 22000, 1), false);
  assert.equal(publishedShotViewReady(root('ready', false), 22000, 1), false);
  assert.equal(publishedShotViewReady(root('ready', true), 22000, 1), true);
  assert.equal(publishedShotViewReady(root('absent', false), 22000, 1), false);
  assert.equal(publishedShotViewReady(root('absent', false, ''), 22000, 1), true);
  assert.throws(() => publishedShotViewReady(root('failed', false), 22000, 1), /图表加载失败/);
});
