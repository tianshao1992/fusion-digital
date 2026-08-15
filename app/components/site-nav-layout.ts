export type NavigationLayoutItem = {
  key: string;
  priority: number;
  width: number;
};

type SelectVisibleNavigationKeysOptions = {
  items: readonly NavigationLayoutItem[];
  availableWidth: number;
  gap: number;
  moreWidth: number;
  activeKey?: string;
};

function finiteSize(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function linksWidth(items: readonly NavigationLayoutItem[], gap: number) {
  if (items.length === 0) return 0;
  return items.reduce((sum, item) => sum + finiteSize(item.width), 0)
    + finiteSize(gap) * (items.length - 1);
}

/**
 * Keeps the highest-priority links that fit while reserving room for the More
 * menu. The current section is pinned so it never disappears without a visible
 * indication of where the visitor is.
 */
export function selectVisibleNavigationKeys({
  items,
  availableWidth,
  gap,
  moreWidth,
  activeKey,
}: SelectVisibleNavigationKeysOptions): string[] {
  if (items.length === 0) return [];

  const safeGap = finiteSize(gap);
  const safeAvailableWidth = finiteSize(availableWidth);
  if (linksWidth(items, safeGap) <= safeAvailableWidth) {
    return items.map((item) => item.key);
  }

  const indexedItems = items.map((item, index) => ({ ...item, index }));
  const rankedItems = [...indexedItems].sort((left, right) => {
    const leftIsActive = left.key === activeKey;
    const rightIsActive = right.key === activeKey;
    if (leftIsActive !== rightIsActive) return leftIsActive ? -1 : 1;
    return left.priority - right.priority || left.index - right.index;
  });
  const linkBudget = Math.max(0, safeAvailableWidth - finiteSize(moreWidth) - safeGap);
  const selected = new Set<string>();
  let usedWidth = 0;

  for (const item of rankedItems) {
    const addition = finiteSize(item.width) + (selected.size > 0 ? safeGap : 0);
    const mustKeep = item.key === activeKey || selected.size === 0;
    if (mustKeep || usedWidth + addition <= linkBudget) {
      selected.add(item.key);
      usedWidth += addition;
    } else {
      // Do not back-fill a small gap with a less important entry: once a
      // priority tier no longer fits, everything below it belongs in More.
      break;
    }
  }

  return indexedItems
    .filter((item) => selected.has(item.key))
    .map((item) => item.key);
}
