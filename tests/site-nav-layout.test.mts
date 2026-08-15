import assert from 'node:assert/strict';
import test from 'node:test';
import { selectVisibleNavigationKeys } from '../app/components/site-nav-layout.ts';

const items = [
  { key: 'home', priority: 0, width: 80 },
  { key: 'physics', priority: 1, width: 80 },
  { key: 'engineering', priority: 1, width: 110 },
  { key: 'knowledge', priority: 3, width: 100 },
  { key: 'roadmap', priority: 5, width: 90 },
] as const;

test('all navigation entries stay visible when they fit', () => {
  assert.deepEqual(selectVisibleNavigationKeys({
    items,
    availableWidth: 520,
    gap: 10,
    moreWidth: 70,
    activeKey: 'home',
  }), items.map(({ key }) => key));
});

test('lower-priority navigation entries move to More as width contracts', () => {
  assert.deepEqual(selectVisibleNavigationKeys({
    items,
    availableWidth: 360,
    gap: 10,
    moreWidth: 70,
    activeKey: 'home',
  }), ['home', 'physics']);
});

test('the active navigation entry remains visible even when it has low priority', () => {
  assert.deepEqual(selectVisibleNavigationKeys({
    items,
    availableWidth: 360,
    gap: 10,
    moreWidth: 70,
    activeKey: 'roadmap',
  }), ['home', 'physics', 'roadmap']);
});
