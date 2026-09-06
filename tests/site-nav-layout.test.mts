import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import { SITES_WORKSPACE_ORIGIN } from '../app/agent/capabilities.ts';
import SiteNav, { closeOpenDisclosuresOutside } from '../app/components/SiteNav.tsx';
import { selectVisibleNavigationKeys } from '../app/components/site-nav-layout.ts';
import { ThemeProvider } from '../app/components/theme/index.ts';

const items = [
  { key: 'home', priority: 0, width: 80 },
  { key: 'physics', priority: 1, width: 80 },
  { key: 'engineering', priority: 1, width: 110 },
  { key: 'knowledge', priority: 3, width: 100 },
  { key: 'roadmap', priority: 5, width: 90 },
] as const;

test('knowledge disclosures close only when the interaction moves outside them', () => {
  const desktopInside = {};
  const mobileInside = {};
  const outside = {};
  const desktop = { open: true, contains: (target: object) => target === desktopInside };
  const mobile = { open: true, contains: (target: object) => target === mobileInside };

  closeOpenDisclosuresOutside(desktopInside, [desktop, mobile]);
  assert.equal(desktop.open, true, 'the disclosure containing the target must remain open');
  assert.equal(mobile.open, false, 'another open disclosure should close');

  mobile.open = true;
  closeOpenDisclosuresOutside(outside, [desktop, mobile]);
  assert.equal(desktop.open, false);
  assert.equal(mobile.open, false);
});

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

test('public-anonymous rendered navigation exposes the fixed Sites account bridge on desktop and mobile', () => {
  const html = renderSiteNav('public-anonymous');
  const externalHref = `href="${SITES_WORKSPACE_ORIGIN}/account"`;
  assert.equal(html.split(externalHref).length - 1, 2);
  assert.equal(html.split('登录 / AI 工作区 ↗').length - 1, 2);
  assert.match(html, /class="siteAccountAccess siteAccountAccess--external"/);
  assert.equal(html.split('target="_blank" rel="noreferrer"').length - 1, 2);
  assert.doesNotMatch(html, /href="\/account"|signin-with-chatgpt/);
});

test('identity-aware rendered navigation retains the local account destination', () => {
  const html = renderSiteNav('sites');
  assert.equal(html.split('href="/account"').length - 1, 2);
  assert.doesNotMatch(html, new RegExp(`${SITES_WORKSPACE_ORIGIN.replaceAll('.', '\\.')}/account`));
  assert.doesNotMatch(html, /signin-with-chatgpt/);
});

function renderSiteNav(mode: string) {
  const previousMode = process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
  process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE = mode;
  try {
    return renderToStaticMarkup(createElement(ThemeProvider, null, createElement(SiteNav)));
  } finally {
    if (previousMode === undefined) delete process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE;
    else process.env.NEXT_PUBLIC_FUSIONDIGITAL_MODE = previousMode;
  }
}
