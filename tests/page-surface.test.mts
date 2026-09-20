import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { BrowserPageSurface, safePageHref } from '../app/components/agent-workspace/page-surface.ts';
import { isSiteAction, normalizeSiteActionContext } from '../app/agent/site-actions.ts';
import { SiteActionRuntime } from '../app/agent/site-action-runtime.ts';

// A small DOM boundary fixture. Browser integration separately exercises React's native events.
class ElementFixture {
  isConnected = true;
  disabled = false;
  readOnly = false;
  multiple = false;
  hidden = false;
  maxLength = -1;
  min = '';
  max = '';
  checked = false;
  form: ElementFixture | null = null;
  parentElement: ElementFixture | null = null;
  labels: ElementFixture[] = [];
  options: Array<{ value: string; label: string; disabled?: boolean; hidden?: boolean; parentElement?: ElementFixture }> = [];
  events: string[] = [];
  clicks = 0;
  private currentValue = '';
  private attrs = new Map<string, string>();
  constructor(readonly tagName: string, readonly textContent: string, attrs: Record<string, string> = {}) {
    Object.entries(attrs).forEach(([key, value]) => this.attrs.set(key, value));
  }
  get value() { return this.currentValue; }
  set value(value: string) { this.currentValue = value; }
  get type() { return this.getAttribute('type') || (this.tagName === 'BUTTON' ? 'submit' : 'text'); }
  getAttribute(name: string) { return this.attrs.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attrs.set(name, value); }
  hasAttribute(name: string) { return this.attrs.has(name); }
  matches(selector: string) {
    if (selector === ':disabled') return this.disabled;
    return selector.split(',').some(part => part.trim().toUpperCase() === this.tagName);
  }
  closest(selector: string): ElementFixture | null {
    if (selector.includes('.agentWorkspaceRoot')) {
      if (this.getAttribute('class') === 'agentWorkspaceRoot' || this.hasAttribute('data-agent-exclude') || this.hasAttribute('hidden')
        || this.hasAttribute('inert') || this.getAttribute('aria-hidden') === 'true' || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(this.tagName)) return this;
    } else if (this.matches(selector)) return this;
    return this.parentElement?.closest(selector) ?? null;
  }
  getClientRects() { return this.hidden ? [] : [this.getBoundingClientRect()]; }
  getBoundingClientRect() { return { top: 10, left: 10, bottom: 80, right: 200 }; }
  dispatchEvent(event: Event) { this.events.push(event.type); return true; }
  click() { this.clicks++; }
}

function harness(elements: ElementFixture[], path = '/search') {
  const textElements: ElementFixture[] = [];
  const view = {
    location: { origin: 'https://fusiondigital.club', pathname: path }, innerHeight: 900, innerWidth: 1400, scrollY: 0,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0),
    cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    scrollBy: ({ top }: { top: number }) => { view.scrollY = Math.max(0, view.scrollY + top); },
  };
  const document = {
    title: 'FusionDigital', body: {}, querySelectorAll: () => elements, querySelector: () => null,
    createTreeWalker: () => {
      let index = 0;
      return { nextNode: () => { const element = textElements[index++]; return element ? { parentElement: element, textContent: element.textContent } : null; } };
    },
  };
  const surface = new BrowserPageSurface(document as unknown as Document, view as unknown as Window);
  const locations: string[] = [];
  const executeOptions = { signal: new AbortController().signal, navigate: async (href: string) => { locations.push(href); } };
  return { elements, surface, executeOptions, locations, view, textElements };
}

test('links are constrained to public routes, bounded search and safe anchors', () => {
  const origin = 'https://fusiondigital.club';
  assert.equal(safePageHref('/#prototype-workspace', origin), '/#prototype-workspace');
  assert.equal(safePageHref('/search?q=EXL-50U', origin), '/search?q=EXL-50U');
  for (const href of ['//evil.example/search', 'javascript:alert(1)', '/api/jobs', '/account', '/admin/analytics', '/research-review', '/search?token=secret', '/search?q=a&q=b', '/search?q=' + 'x'.repeat(241), '/\\evil.example', '/#x onclick=evil']) {
    assert.equal(safePageHref(href, origin), null, href);
  }
});

test('unreviewed, hidden, disabled, external, sensitive and assistant controls stay outside observation', () => {
  const button = new ElementFixture('BUTTON', 'Change view', { 'data-agent-safe': 'click', type: 'button' });
  const disabled = new ElementFixture('BUTTON', 'Disabled', { 'data-agent-safe': 'click' }); disabled.disabled = true;
  const hidden = new ElementFixture('INPUT', '', { 'data-agent-safe': 'fill', 'aria-label': 'Hidden', hidden: '' });
  const assistant = new ElementFixture('INPUT', '', { 'data-agent-safe': 'fill', 'aria-label': 'Chat' });
  assistant.parentElement = new ElementFixture('DIV', '', { class: 'agentWorkspaceRoot' });
  const submit = new ElementFixture('BUTTON', 'Create compute job', { 'data-agent-safe': 'click' }); submit.form = new ElementFixture('FORM', '');
  const h = harness([button, disabled, hidden, assistant, submit,
    new ElementFixture('BUTTON', 'Delete job'),
    new ElementFixture('INPUT', '', { 'data-agent-safe': 'fill', type: 'password', 'aria-label': 'Password' }),
    new ElementFixture('INPUT', '', { 'data-agent-safe': 'fill', name: 'apiKey', 'aria-label': 'Model configuration' }),
    new ElementFixture('A', 'External account', { href: 'https://example.com/account' }),
    new ElementFixture('A', 'Download', { href: '/search', download: '' }),
  ]);
  const secret = new ElementFixture('P', 'private conversation'); secret.parentElement = assistant.parentElement;
  h.textElements.push(secret, new ElementFixture('P', 'Public article'));
  assert.deepEqual(h.surface.getSnapshot().controls.map(control => control.label), ['Change view']);
  assert.equal(h.surface.getSnapshot().text, 'Public article');
  h.view.location.pathname = '/account';
  assert.deepEqual(h.surface.getSnapshot(), { title: '', text: '', controls: [] });
});

test('control IDs stay stable for value updates but never get reinterpreted after identity changes', async () => {
  const link = new ElementFixture('A', 'Search', { href: '/search' });
  const h = harness([link]);
  const id = h.surface.getSnapshot().controls[0].id;
  assert.equal(h.surface.getSnapshot().controls[0].id, id);
  link.setAttribute('href', '/fusion-data');
  await assert.rejects(h.surface.execute({ type: 'page.click', targetId: id }, h.executeOptions), /control changed/);
  const next = h.surface.getSnapshot().controls[0].id;
  assert.notEqual(next, id);
  await h.surface.execute({ type: 'page.click', targetId: next }, h.executeOptions);
  assert.deepEqual(h.locations, ['/fusion-data']);
  link.setAttribute('aria-disabled', 'true');
  await assert.rejects(h.surface.execute({ type: 'page.click', targetId: next }, h.executeOptions), /control changed/);
});

test('fill and select dispatch native events and undo without overwriting subsequent user input', async () => {
  const input = new ElementFixture('INPUT', '', { 'data-agent-safe': 'fill', 'aria-label': 'Search query', type: 'search' }); input.value = 'EXL';
  const select = new ElementFixture('SELECT', '', { 'data-agent-safe': 'select', 'aria-label': 'Domain' });
  select.options = [{ value: '', label: 'All' }, { value: 'physics', label: 'Physics' }, { value: 'hidden', label: 'Hidden', disabled: true }];
  const h = harness([input, select]);
  const [query, domain] = h.surface.getSnapshot().controls;
  const result = await h.surface.execute({ type: 'page.fill', targetId: query.id, value: 'ITER' }, h.executeOptions);
  assert.equal(input.value, 'ITER');
  assert.deepEqual(input.events, ['input', 'change']);
  assert.equal(h.surface.getSnapshot().controls[0].id, query.id);
  await result.undo!(h.executeOptions.signal);
  assert.equal(input.value, 'EXL');
  const changed = await h.surface.execute({ type: 'page.fill', targetId: query.id, value: 'ITER' }, h.executeOptions);
  input.value = 'user change';
  await assert.rejects(changed.undo!(h.executeOptions.signal), /later input/);
  await assert.rejects(h.surface.execute({ type: 'page.select', targetId: domain.id, value: 'hidden' }, h.executeOptions), /available option/);
  const selection = await h.surface.execute({ type: 'page.select', targetId: domain.id, value: 'physics' }, h.executeOptions);
  assert.equal(select.value, 'physics');
  await selection.undo!(h.executeOptions.signal);
  assert.equal(select.value, '');
});

test('unknown IDs and selector injection cannot address a control; click is not advertised as undoable', async () => {
  const button = new ElementFixture('BUTTON', 'Open panel', { 'data-agent-safe': 'click', type: 'button' });
  const h = harness([button]);
  const id = h.surface.getSnapshot().controls[0].id;
  for (const targetId of ['#delete', 'button[data-submit]', '../../account', 'control_999']) {
    await assert.rejects(h.surface.execute({ type: 'page.click', targetId }, h.executeOptions));
  }
  assert.equal(isSiteAction({ type: 'page.click', targetId: '#delete' }), false);
  assert.equal(isSiteAction({ type: 'page.fill', targetId: id, value: '', script: 'bad' }), false);
  const result = await h.surface.execute({ type: 'page.click', targetId: id }, h.executeOptions);
  assert.equal(result.undo, undefined);
  assert.equal(button.clicks, 1);
});

test('runtime rejects stale page observations and preserves page fill undo semantics', async () => {
  const input = new ElementFixture('INPUT', '', { 'data-agent-safe': 'fill', 'aria-label': 'Query' });
  const h = harness([input]);
  const runtime = new SiteActionRuntime(() => undefined, () => 'en');
  runtime.setLocation('/search'); runtime.setPageSurface(h.surface);
  const stale = runtime.getContext();
  input.value = 'manual change';
  const plan = { version: 1 as const, actions: [{ type: 'page.fill' as const, targetId: stale.page!.controls[0].id, value: 'ITER' }] };
  const rejected = await runtime.execute(plan, { runId: 'stale-page', expected: stale, signal: h.executeOptions.signal });
  assert.equal(rejected[0].status, 'rejected'); assert.equal(input.value, 'manual change');
  const applied = await runtime.execute(plan, { runId: 'fresh-page', expected: runtime.getContext(), signal: h.executeOptions.signal });
  assert.equal(applied[0].status, 'applied'); assert.equal(input.value, 'ITER');
  const undone = await runtime.execute({ version: 1, actions: [{ type: 'site.undo' }] }, { runId: 'undo-page', expected: runtime.getContext(), signal: h.executeOptions.signal });
  assert.equal(undone[0].status, 'applied'); assert.equal(input.value, 'manual change');
  await assert.rejects(runtime.execute({ version: 1, actions: [plan.actions[0], { type: 'page.scroll', direction: 'down' }] }, { runId: 'multi-page', expected: runtime.getContext(), signal: h.executeOptions.signal }), /Observe the page again/);
});

test('page context validation is bounded and rejects duplicate IDs and unsupported capabilities', () => {
  const h = harness([new ElementFixture('BUTTON', 'View', { 'data-agent-safe': 'click' })]);
  const context = { path: '/', pageInstanceId: 'page-1', revision: 1, capabilities: ['page.click'], page: h.surface.getSnapshot() };
  assert.ok(normalizeSiteActionContext(context));
  assert.equal(normalizeSiteActionContext({ ...context, page: { ...context.page, controls: [...context.page.controls, ...context.page.controls] } }), null);
  assert.equal(normalizeSiteActionContext({ ...context, page: { ...context.page, text: 'x'.repeat(6001) } }), null);
  assert.equal(normalizeSiteActionContext({ ...context, page: { ...context.page, controls: [{ ...context.page.controls[0], actions: ['submit'] }] } }), null);
});

test('cold CAD loading and retry controls are discoverable without opening other CAD buttons', async () => {
  const source = await readFile(new URL('../app/components/TokamakCadViewer.tsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('TokamakCadViewer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const buttons: ts.JsxOpeningElement[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(tree) === 'button') buttons.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const attribute = (button: ts.JsxOpeningElement, name: string) => button.attributes.properties.find((property): property is ts.JsxAttribute => ts.isJsxAttribute(property) && property.name.getText(tree) === name)?.initializer;
  const activateButtons = buttons.filter(button => attribute(button, 'onClick')?.getText(tree) === '{activate}');
  assert.equal(activateButtons.length, 2, 'the cold-load and retry actions are both covered');
  assert.equal(buttons.filter(button => attribute(button, 'data-agent-safe')).length, 2, 'other CAD buttons remain behind their semantic tools');
  const controls = activateButtons.map(button => {
    const safe = attribute(button, 'data-agent-safe');
    assert.ok(safe && ts.isStringLiteral(safe));
    assert.equal(safe.text, 'click');
    const label = attribute(button, 'aria-label');
    assert.ok(label && ts.isJsxExpression(label) && label.expression && ts.isCallExpression(label.expression));
    const key = label.expression.arguments[0];
    assert.ok(ts.isStringLiteral(key));
    assert.ok(['viewer.launch', 'viewer.reload'].includes(key.text));
    return new ElementFixture('BUTTON', '', { 'data-agent-safe': safe.text, type: 'button', 'aria-label': key.text });
  });
  const h = harness([controls[0]], '/');
  controls[0].disabled = true;
  assert.deepEqual(h.surface.getSnapshot().controls, [], 'missing model metadata still blocks activation');
  controls[0].disabled = false;
  const load = h.surface.getSnapshot().controls[0];
  assert.deepEqual(load.actions, ['click']);
  await h.surface.execute({ type: 'page.click', targetId: load.id }, h.executeOptions);
  assert.equal(controls[0].clicks, 1, 'a cold model can now request its existing activate handler');
  h.elements.splice(0, 1, controls[1]);
  assert.equal(h.surface.getSnapshot().controls[0].label, 'viewer.reload');
});
