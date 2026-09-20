import assert from 'node:assert/strict';
import test from 'node:test';
import { SiteActionRuntime, waitForSiteCondition, type SiteActionAdapter } from '../app/agent/site-action-runtime.ts';
import type { SiteAction, SiteActionPlan, SiteActionReceipt } from '../app/agent/site-actions.ts';

const plan = (...actions: SiteAction[]): SiteActionPlan => ({ version: 1, actions });
const signal = () => new AbortController().signal;
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function harness(initial = '/') {
  const locations: string[] = [];
  const runtime = new SiteActionRuntime((href) => { locations.push(href); runtime.setLocation(href); }, () => 'en');
  runtime.setLocation(initial);
  return { runtime, locations };
}

function viewer(execute?: SiteActionAdapter['execute'], id = 'viewer-one') {
  const state = { view: 'iso', revision: 0, rotating: false };
  const calls: SiteAction[] = [];
  const adapter: SiteActionAdapter = {
    id,
    path: '/',
    capabilities: ['cad.open', 'cad.set_view', 'cad.set_rotation'],
    getContext: () => ({ viewer: { viewerId: id, deviceId: 'exl-50u', ready: true, revision: state.revision,
      view: state.view, parts: [], selectedPartIds: [] } }),
    execute: async (action, options) => {
      calls.push(action);
      if (execute) return execute(action, options);
      const before = { ...state };
      if (action.type === 'cad.set_view') state.view = action.view;
      if (action.type === 'cad.set_rotation') state.rotating = action.enabled;
      state.revision += 1;
      return { message: `Committed ${action.type}`, undo: async (undoSignal) => {
        undoSignal.throwIfAborted();
        Object.assign(state, before);
        state.revision += 1;
      } };
    },
  };
  return { adapter, calls, state };
}

test('navigation and adapter actions run in order, and receipts follow actual completion', async () => {
  const { runtime, locations } = harness('/fusion-data');
  const entered = deferred<void>();
  const finish = deferred<void>();
  const committed: string[] = [];
  const fake = viewer(async (action) => {
    if (action.type === 'cad.set_view') { entered.resolve(); await finish.promise; }
    committed.push(action.type);
    return { message: `Renderer committed ${action.type}` };
  });
  runtime.register(fake.adapter);
  const receipts: SiteActionReceipt[] = [];
  const pending = runtime.execute(plan(
    { type: 'site.navigate', path: '/digital-prototype' },
    { type: 'cad.set_view', view: 'front' },
    { type: 'cad.set_rotation', enabled: true },
  ), { runId: 'sequence', expected: runtime.getContext(), signal: signal(), onReceipt: (receipt) => receipts.push(receipt) });
  await entered.promise;
  assert.deepEqual(locations, ['/#prototype-workspace']);
  assert.deepEqual(fake.calls.map(({ type }) => type), ['cad.set_view']);
  assert.deepEqual(receipts.map(({ type }) => type), ['site.navigate']);
  assert.deepEqual(committed, []);
  finish.resolve();
  const result = await pending;
  assert.deepEqual(committed, ['cad.set_view', 'cad.set_rotation']);
  assert.deepEqual(result.map(({ status }) => status), ['applied', 'applied', 'applied']);
  assert.deepEqual(result.map(({ path }) => path), ['/', '/', '/']);
  assert.equal(result[1].message, 'Renderer committed cad.set_view');
  assert.equal(result[2].actionId, 'sequence-2');
  assert.deepEqual(receipts, result);
});

test('opening CAD waits for the home pathname before applying the model and follow-up view', async () => {
  const navigated = deferred<string>();
  const runtime = new SiteActionRuntime(href => navigated.resolve(href), () => 'en');
  runtime.setLocation('/search?q=EXL-50U');
  const fake = viewer();
  runtime.register(fake.adapter);
  const pending = runtime.execute(plan(
    { type: 'cad.open', deviceId: 'exl50u-general-assembly-20260630' },
    { type: 'cad.set_view', view: 'top' },
  ), { runId: 'open-home-cad', expected: runtime.getContext(), signal: signal() });
  assert.equal(await navigated.promise, '/#prototype-workspace');
  assert.equal(fake.calls.length, 0, 'an adapter registered on another page must not run before navigation completes');
  // The real provider reports pathname and query, without the anchor.
  runtime.setLocation('/');
  const receipts = await pending;
  assert.deepEqual(receipts.map(receipt => receipt.status), ['applied', 'applied']);
  assert.deepEqual(receipts.map(receipt => receipt.path), ['/', '/']);
  assert.deepEqual(fake.calls.map(action => action.type), ['cad.open', 'cad.set_view']);
  assert.equal(fake.state.view, 'top');
});

test('same-page CAD navigation reveals the section without changing page identity or adding undo', async () => {
  const { runtime, locations } = harness('/');
  const before = runtime.getContext();
  const result = await runtime.execute(plan({ type: 'site.navigate', path: '/digital-prototype' }),
    { runId: 'reveal-home-cad', expected: before, signal: signal() });
  assert.equal(result[0].status, 'applied');
  assert.deepEqual(locations, ['/#prototype-workspace']);
  assert.deepEqual(runtime.getContext(), before);
  const undo = await runtime.execute(plan({ type: 'site.undo' }),
    { runId: 'no-anchor-undo', expected: before, signal: signal() });
  assert.equal(undo[0].status, 'rejected');

  const fake = viewer();
  runtime.register(fake.adapter);
  const opened = await runtime.execute(plan({ type: 'cad.open', deviceId: 'exl50u-general-assembly-20260630' }),
    { runId: 'same-home-open-cad', expected: runtime.getContext(), signal: signal() });
  assert.equal(opened[0].status, 'applied');
  assert.deepEqual(locations, ['/#prototype-workspace', '/#prototype-workspace']);
  assert.equal(fake.calls[0].type, 'cad.open');
  assert.equal(runtime.getContext().pageInstanceId, before.pageInstanceId);
});

test('a changed home anchor does not cancel a running CAD action', async () => {
  const { runtime } = harness('/#prototype-workspace');
  const entered = deferred<void>();
  const finish = deferred<void>();
  const fake = viewer(async (_action, options) => {
    entered.resolve();
    await finish.promise;
    options.signal.throwIfAborted();
    return { message: 'Committed the home viewer' };
  });
  runtime.register(fake.adapter);
  const before = runtime.getContext();
  const pending = runtime.execute(plan({ type: 'cad.set_view', view: 'top' }),
    { runId: 'home-anchor-change', expected: before, signal: signal() });
  await entered.promise;
  runtime.setLocation('/#another-section');
  assert.deepEqual(runtime.getContext(), before);
  finish.resolve();
  assert.equal((await pending)[0].status, 'applied');
});

test('a failed adapter stops subsequent actions and never reports an applied receipt', async () => {
  const { runtime } = harness();
  const fake = viewer(async () => { throw new Error('Geometry decode failed'); });
  runtime.register(fake.adapter);
  const receipts = await runtime.execute(plan({ type: 'cad.set_view', view: 'top' }, { type: 'cad.set_rotation', enabled: true }),
    { runId: 'decode-failed', expected: runtime.getContext(), signal: signal() });
  assert.equal(fake.calls.length, 1);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].status, 'rejected');
  assert.match(receipts[0].message, /Geometry decode failed/);
});

test('a changed viewer revision or a returned page instance rejects an old plan before execution', async () => {
  const { runtime } = harness();
  const fake = viewer();
  runtime.register(fake.adapter);
  const oldSelection = runtime.getContext();
  fake.state.revision += 1;
  const staleSelection = await runtime.execute(plan({ type: 'cad.set_view', view: 'top' }),
    { runId: 'old-selection', expected: oldSelection, signal: signal() });
  assert.equal(staleSelection[0].status, 'rejected');
  const oldPage = runtime.getContext();
  runtime.setLocation('/search');
  runtime.setLocation('/');
  const stalePage = await runtime.execute(plan({ type: 'cad.set_view', view: 'top' }),
    { runId: 'old-page', expected: oldPage, signal: signal() });
  assert.equal(stalePage[0].status, 'rejected');
  assert.equal(fake.calls.length, 0);
});

test('manual navigation aborts the running adapter and replay cannot resume its remaining steps', async () => {
  const { runtime } = harness();
  const entered = deferred<void>();
  let ready = false;
  let adapterSignal: AbortSignal | undefined;
  const fake = viewer(async (_action, options) => {
    adapterSignal = options.signal;
    entered.resolve();
    await waitForSiteCondition(() => ready, options.signal);
    return { message: 'Late renderer completion' };
  });
  runtime.register(fake.adapter);
  const request = plan({ type: 'cad.set_view', view: 'top' }, { type: 'cad.set_rotation', enabled: true });
  const expected = runtime.getContext();
  const pending = runtime.execute(request, { runId: 'manual-navigation', expected, signal: signal() });
  await entered.promise;
  runtime.setLocation('/search');
  const result = await pending;
  assert.equal(adapterSignal?.aborted, true);
  assert.deepEqual(result.map(({ status }) => status), ['cancelled']);
  assert.equal(result[0].path, '/search');
  ready = true;
  assert.deepEqual(await runtime.execute(request, { runId: 'manual-navigation', expected: runtime.getContext(), signal: signal() }), result);
  assert.equal(fake.calls.length, 1);
});

test('Stop propagates cancellation, retains completed steps, and releases the next operation', async () => {
  const { runtime } = harness();
  const entered = deferred<void>();
  let completionCount = 0;
  const fake = viewer(async (action, options) => {
    if (action.type === 'cad.set_rotation') { entered.resolve(); await waitForSiteCondition(() => false, options.signal); }
    completionCount += 1;
    return { message: `Completed ${action.type}` };
  });
  runtime.register(fake.adapter);
  const pending = runtime.execute(plan({ type: 'cad.set_view', view: 'front' }, { type: 'cad.set_rotation', enabled: true }),
    { runId: 'stop', expected: runtime.getContext(), signal: signal() });
  await entered.promise;
  runtime.cancel();
  assert.deepEqual((await pending).map(({ status }) => status), ['applied', 'cancelled']);
  assert.equal(completionCount, 1);
  const next = await runtime.execute(plan({ type: 'cad.set_view', view: 'top' }),
    { runId: 'after-stop', expected: runtime.getContext(), signal: signal() });
  assert.equal(next[0].status, 'applied');
  assert.equal(completionCount, 2);
});

test('completed run IDs are idempotent and cannot be reused for a different plan', async () => {
  const { runtime } = harness();
  const fake = viewer();
  runtime.register(fake.adapter);
  const request = plan({ type: 'cad.set_view', view: 'top' });
  let notifications = 0;
  const first = await runtime.execute(request,
    { runId: 'one-use', expected: runtime.getContext(), signal: signal(), onReceipt: () => { notifications++; } });
  const replay = await runtime.execute(request,
    { runId: 'one-use', expected: runtime.getContext(), signal: signal(), onReceipt: () => { notifications++; } });
  assert.deepEqual(replay, first);
  assert.equal(fake.calls.length, 1);
  assert.equal(notifications, 1);
  await assert.rejects(runtime.execute(plan({ type: 'cad.set_view', view: 'front' }),
    { runId: 'one-use', expected: runtime.getContext(), signal: signal() }), /Conflicting operation ID/);
  assert.equal(fake.calls.length, 1);
});

test('a duplicate in-flight run cannot invoke the adapter twice', async () => {
  const { runtime } = harness();
  const entered = deferred<void>();
  const finish = deferred<void>();
  const fake = viewer(async () => { entered.resolve(); await finish.promise; return { message: 'Committed once' }; });
  runtime.register(fake.adapter);
  const request = plan({ type: 'cad.set_view', view: 'top' });
  const expected = runtime.getContext();
  const pending = runtime.execute(request, { runId: 'in-flight', expected, signal: signal() });
  await entered.promise;
  await assert.rejects(runtime.execute(request, { runId: 'in-flight', expected, signal: signal() }), /running/i);
  assert.equal(fake.calls.length, 1);
  finish.resolve();
  assert.equal((await pending)[0].status, 'applied');
});

test('undo restores an adapter snapshot once, and route undo navigates back', async () => {
  const { runtime, locations } = harness();
  const fake = viewer();
  runtime.register(fake.adapter);
  await runtime.execute(plan({ type: 'cad.set_view', view: 'top' }), { runId: 'change-view', expected: runtime.getContext(), signal: signal() });
  assert.equal(fake.state.view, 'top');
  const undone = await runtime.execute(plan({ type: 'site.undo' }), { runId: 'undo-view', expected: runtime.getContext(), signal: signal() });
  assert.equal(undone[0].status, 'applied');
  assert.equal(fake.state.view, 'iso');
  const empty = await runtime.execute(plan({ type: 'site.undo' }), { runId: 'empty-undo', expected: runtime.getContext(), signal: signal() });
  assert.equal(empty[0].status, 'rejected');
  await runtime.execute(plan({ type: 'site.navigate', path: '/search' }), { runId: 'navigate', expected: runtime.getContext(), signal: signal() });
  await runtime.execute(plan({ type: 'site.undo' }), { runId: 'undo-navigation', expected: runtime.getContext(), signal: signal() });
  assert.deepEqual(locations, ['/search', '/']);
});

test('viewer actions reject the wrong page and ambiguous targets without invoking adapters', async () => {
  const { runtime, locations } = harness('/fusion-data');
  const first = viewer();
  const second = viewer(undefined, 'viewer-two');
  runtime.register(first.adapter);
  runtime.register(second.adapter);
  const wrongPage = await runtime.execute(plan({ type: 'cad.set_view', view: 'top' }),
    { runId: 'wrong-page', expected: runtime.getContext(), signal: signal() });
  assert.equal(wrongPage[0].status, 'rejected');
  assert.deepEqual(locations, []);
  runtime.setLocation('/');
  const ambiguous = await runtime.execute(plan({ type: 'cad.set_view', view: 'top' }),
    { runId: 'ambiguous', expected: runtime.getContext(), signal: signal() });
  assert.equal(ambiguous[0].status, 'rejected');
  assert.equal(first.calls.length + second.calls.length, 0);
});

test('replacing a target during execution rejects its late completion and its undo', async () => {
  const { runtime } = harness();
  const entered = deferred<void>();
  const finish = deferred<void>();
  let undoCalls = 0;
  const first = viewer(async () => { entered.resolve(); await finish.promise; return { message: 'Old target completed', undo: async () => { undoCalls++; } }; });
  const unregister = runtime.register(first.adapter);
  const pending = runtime.execute(plan({ type: 'cad.set_view', view: 'top' }),
    { runId: 'replace-target', expected: runtime.getContext(), signal: signal() });
  await entered.promise;
  const replacement = viewer();
  runtime.register(replacement.adapter);
  unregister();
  finish.resolve();
  assert.equal((await pending)[0].status, 'rejected');
  const undo = await runtime.execute(plan({ type: 'site.undo' }), { runId: 'old-target-undo', expected: runtime.getContext(), signal: signal() });
  assert.equal(undo[0].status, 'rejected');
  assert.equal(undoCalls, 0);
  assert.ok(runtime.getContext().capabilities.includes('cad.set_view'), 'old unregister must not remove the replacement');
});

test('undo refuses to call a snapshot belonging to an adapter that was replaced', async () => {
  const { runtime } = harness();
  let undoCalls = 0;
  const first = viewer(async () => ({ message: 'Committed', undo: async () => { undoCalls++; } }));
  runtime.register(first.adapter);
  await runtime.execute(plan({ type: 'cad.set_view', view: 'top' }), { runId: 'before-replace', expected: runtime.getContext(), signal: signal() });
  runtime.register(viewer().adapter);
  const result = await runtime.execute(plan({ type: 'site.undo' }), { runId: 'stale-undo', expected: runtime.getContext(), signal: signal() });
  assert.equal(result[0].status, 'rejected');
  assert.equal(undoCalls, 0);
});

test('search navigation encodes the query and waits for the actual route transition', async () => {
  const navigated = deferred<string>();
  const runtime = new SiteActionRuntime((href) => navigated.resolve(href), () => 'en');
  const receipts: SiteActionReceipt[] = [];
  const pending = runtime.execute(plan({ type: 'site.search', query: 'DINA & MEQ' }),
    { runId: 'search-route', expected: runtime.getContext(), signal: signal(), onReceipt: (receipt) => receipts.push(receipt) });
  const href = await navigated.promise;
  assert.equal(href, '/search?q=DINA%20%26%20MEQ');
  assert.deepEqual(receipts, []);
  runtime.setLocation(href);
  const result = await pending;
  assert.equal(result[0].status, 'applied');
  assert.equal(result[0].path, '/search');
  assert.match(result[0].message, /Opened search/);
});

test('browser query normalization preserves search completion, exact text and navigation undo', async () => {
  const locations: string[] = [];
  const observedQueries: string[] = [];
  const runtime = new SiteActionRuntime(href => {
    locations.push(href);
    const url = new URL(href, 'http://localhost');
    observedQueries.push(url.searchParams.get('q') ?? '');
    // SiteOperationsProvider reconstructs the location using this serialization.
    runtime.setLocation(`${url.pathname}?${url.searchParams.toString()}`);
  }, () => 'en');
  const originalQuery = '原查询 + source & CAD';
  runtime.setLocation(`/search?q=${encodeURIComponent(originalQuery)}`);
  const original = runtime.getContext();
  runtime.setLocation(`/search?${new URLSearchParams({ q: originalQuery })}`);
  assert.deepEqual(runtime.getContext(), original, 'an equivalent encoding must not invalidate a page snapshot');

  const query = 'EXL-50U 全装置 + DINA & MEQ';
  const search = plan({ type: 'site.search', query }, { type: 'site.read_context' });
  const result = await runtime.execute(search,
    { runId: 'normalized-search', expected: original, signal: signal() });
  assert.deepEqual(result.map(receipt => receipt.status), ['applied', 'applied']);
  assert.deepEqual(observedQueries, [query], 'literal plus, ampersand and non-ASCII characters must remain query data');
  assert.equal(locations[0], `/search?q=${encodeURIComponent(query)}`);
  const searched = runtime.getContext();

  const repeated = await runtime.execute(plan({ type: 'site.search', query }),
    { runId: 'same-search', expected: searched, signal: signal() });
  assert.equal(repeated[0].status, 'applied');
  assert.equal(locations.length, 1, 'the same decoded query must not navigate again');
  assert.deepEqual(runtime.getContext(), searched);

  const undo = await runtime.execute(plan({ type: 'site.undo' }),
    { runId: 'undo-normalized-search', expected: searched, signal: signal() });
  assert.equal(undo[0].status, 'applied');
  assert.deepEqual(observedQueries, [query, originalQuery], 'a no-op search must not add a spurious undo entry');
  const restored = runtime.getContext();
  runtime.setLocation(`/search?q=${encodeURIComponent(originalQuery)}`);
  assert.deepEqual(runtime.getContext(), restored, 'undo must retain the canonical location identity');
  const emptyUndo = await runtime.execute(plan({ type: 'site.undo' }),
    { runId: 'no-extra-search-undo', expected: restored, signal: signal() });
  assert.equal(emptyUndo[0].status, 'rejected');
});

test('a literal plus and a space remain distinct search locations', async () => {
  const { runtime, locations } = harness('/search?q=DINA+MEQ');
  const result = await runtime.execute(plan({ type: 'site.search', query: 'DINA+MEQ' }),
    { runId: 'literal-plus-search', expected: runtime.getContext(), signal: signal() });
  assert.equal(result[0].status, 'applied');
  assert.deepEqual(locations, ['/search?q=DINA%2BMEQ']);
});

test('adapter cancellation is reported as cancelled even when the outer request is still active', async () => {
  const { runtime } = harness();
  const fake = viewer(async () => { throw new DOMException('User changed the viewer selection', 'AbortError'); });
  runtime.register(fake.adapter);
  const result = await runtime.execute(plan({ type: 'cad.set_view', view: 'top' }),
    { runId: 'adapter-cancelled', expected: runtime.getContext(), signal: signal() });
  assert.equal(result[0].status, 'cancelled');
});

test('a receipt observer failure cannot make an applied run executable again', async () => {
  const { runtime } = harness();
  const fake = viewer();
  runtime.register(fake.adapter);
  const request = plan({ type: 'cad.set_view', view: 'top' });
  await runtime.execute(request, { runId: 'observer-failed', expected: runtime.getContext(), signal: signal(),
    onReceipt: () => { throw new Error('Consumer was unmounted'); } }).catch(() => undefined);
  assert.equal(fake.calls.length, 1);
  await runtime.execute(request, { runId: 'observer-failed', expected: runtime.getContext(), signal: signal() });
  assert.equal(fake.calls.length, 1, 'an already applied operation must never be replayed because reporting failed');
});
