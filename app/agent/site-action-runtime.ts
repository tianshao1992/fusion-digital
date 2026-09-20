import {
  isSiteActionPlan, SITE_ROUTES, boundSiteActionContext,
  type SiteAction, type SiteActionContext, type SiteActionPlan, type SiteActionReceipt, type SiteActionType, type SitePageSnapshot,
} from './site-actions';

export type SiteActionAdapter = {
  id: string;
  path: string;
  capabilities: SiteActionType[];
  getContext: () => Partial<Pick<SiteActionContext, 'viewer' | 'data'>>;
  execute: (action: SiteAction, options: { signal: AbortSignal }) => Promise<{
    message: string;
    undo?: (signal: AbortSignal) => Promise<void>;
  }>;
};

export type SitePageSurface = {
  getSnapshot: () => SitePageSnapshot;
  execute: (action: Extract<SiteAction, { type: `page.${string}` }>, options: {
    signal: AbortSignal; navigate: (href: string, signal: AbortSignal) => Promise<void>;
  }) => Promise<{ message: string; undo?: (signal: AbortSignal) => Promise<void> }>;
};

const abortError = () => new DOMException('Operation cancelled', 'AbortError');
export async function waitForSiteCondition(predicate: () => boolean, signal: AbortSignal, timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (true) {
    if (signal.aborted) throw abortError();
    if (predicate()) return;
    if (Date.now() - start >= timeoutMs) throw new Error('页面尚未准备好，请稍后重试。 / The page is not ready. Try again.');
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(abortError()); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 32);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
    });
  }
}

type UndoEntry = { location?: string; adapter?: SiteActionAdapter; surface?: SitePageSurface; undo: (signal: AbortSignal) => Promise<void> };
const CAD_WORKSPACE_PATH = '/';
const CAD_WORKSPACE_HREF = '/#prototype-workspace';
const routeOf = (location: string) => location.split('?')[0];
// Match useSearchParams().toString(): %20 and + encode the same space, while
// %2B remains a literal plus. Encoding-only changes are not page transitions.
function normalizeLocation(location: string): string {
  // The mounted page and usePathname are unchanged by an in-page anchor.
  location = location.split('#')[0];
  const separator = location.indexOf('?');
  if (separator < 0) return location;
  const query = new URLSearchParams(location.slice(separator + 1)).toString();
  return `${location.slice(0, separator)}${query ? `?${query}` : ''}`;
}

/** Browser-only display operations. It never executes scripts or authorizes server writes. */
export class SiteActionRuntime {
  private location = '/';
  private page = 0;
  private revision = 0;
  private fingerprint = '';
  private adapters = new Map<string, SiteActionAdapter>();
  private undoStack: UndoEntry[] = [];
  private active: AbortController | null = null;
  private navigatingTo: string | null = null;
  private completed = new Map<string, { plan: string; receipts: SiteActionReceipt[] }>();
  private pageSurface: SitePageSurface | null = null;

  constructor(private navigate: (href: string) => void, private locale: () => string = () => 'zh-CN') {}

  setLocale(locale: string): void { this.locale = () => locale; }

  setLocation(location: string): void {
    location = normalizeLocation(location);
    if (this.location === location) return;
    // Explicit agent navigation may continue its sequence; manual navigation cancels it.
    if (this.navigatingTo !== location) this.active?.abort();
    this.location = location;
    this.page += 1;
  }

  register(adapter: SiteActionAdapter): () => void {
    this.adapters.set(adapter.id, adapter);
    return () => { if (this.adapters.get(adapter.id) === adapter) this.adapters.delete(adapter.id); };
  }

  setPageSurface(surface: SitePageSurface): () => void {
    this.pageSurface = surface;
    return () => { if (this.pageSurface === surface) { this.active?.abort(); this.pageSurface = null; } };
  }

  getContext(): SiteActionContext {
    const path = routeOf(this.location);
    const pageAdapters = [...this.adapters.values()].filter(adapter => adapter.path === path);
    const details = Object.assign({}, ...pageAdapters.map(adapter => adapter.getContext()));
    const page = this.pageSurface?.getSnapshot();
    const capabilities = [...new Set<SiteActionType>([
      'site.navigate', 'site.search', 'site.read_context', 'site.undo', 'cad.open',
      ...pageAdapters.flatMap(adapter => adapter.capabilities),
      ...(page ? ['page.click', 'page.fill', 'page.select', 'page.scroll'] as SiteActionType[] : []),
    ])];
    const context = boundSiteActionContext({ path, pageInstanceId: `page-${this.page}`, revision: this.revision,
      capabilities, ...details, ...(page ? { page } : {}) });
    const fingerprint = JSON.stringify({ location: this.location, ...context, revision: 0 });
    if (fingerprint !== this.fingerprint) { this.fingerprint = fingerprint; this.revision += 1; }
    return { ...context, revision: this.revision };
  }

  cancel(): void { this.active?.abort(); }

  async execute(plan: SiteActionPlan, options: {
    runId: string;
    expected: SiteActionContext;
    signal: AbortSignal;
    onReceipt?: (receipt: SiteActionReceipt) => void;
  }): Promise<SiteActionReceipt[]> {
    if (!isSiteActionPlan(plan)) throw new Error('Invalid operation plan');
    if (plan.actions.length > 1 && plan.actions.some(action => action.type.startsWith('page.'))) {
      throw new Error(this.say('通用页面操作需要逐步观察后执行。', 'Observe the page again between individual page operations.'));
    }
    const serialized = JSON.stringify(plan);
    const previous = this.completed.get(options.runId);
    if (previous) {
      if (previous.plan !== serialized) throw new Error('Conflicting operation ID');
      return previous.receipts;
    }
    if (this.active) throw new Error(this.say('正在执行上一项操作。', 'Another operation is running.'));
    const current = this.getContext();
    if (current.pageInstanceId !== options.expected.pageInstanceId || current.revision !== options.expected.revision) {
      return plan.actions.map((action, index) => ({ actionId: `${options.runId}-${index}`, type: action.type, status: 'rejected',
        message: this.say('页面或选择已变化，请重新发出指令。', 'The page or selection changed. Please try again.'), path: current.path }));
    }
    const controller = new AbortController();
    this.active = controller;
    const abort = () => controller.abort();
    options.signal.addEventListener('abort', abort, { once: true });
    if (options.signal.aborted) controller.abort();
    const receipts: SiteActionReceipt[] = [];
    try {
      for (const [index, action] of plan.actions.entries()) {
        let receipt: SiteActionReceipt;
        try {
          if (controller.signal.aborted) throw abortError();
          const message = await this.apply(action, controller.signal);
          if (controller.signal.aborted) throw abortError();
          receipt = { actionId: `${options.runId}-${index}`, type: action.type, status: 'applied', message, path: routeOf(this.location) };
        } catch (error) {
          const cancelled = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
          receipt = { actionId: `${options.runId}-${index}`, type: action.type,
            status: cancelled ? 'cancelled' : 'rejected',
            message: cancelled ? this.say('操作已停止，已完成的步骤保留。', 'Stopped. Completed steps remain applied.')
              : error instanceof Error ? error.message.slice(0, 400) : this.say('操作未完成。', 'Operation failed.'), path: routeOf(this.location) };
        }
        receipts.push(receipt);
        // Rendering/telemetry observers cannot invalidate execution or permit the action to replay.
        try { options.onReceipt?.(receipt); } catch { /* Execution receipts remain in the deduplication ledger. */ }
        if (receipt.status !== 'applied') break;
      }
      this.completed.set(options.runId, { plan: serialized, receipts });
      if (this.completed.size > 30) this.completed.delete(this.completed.keys().next().value!);
      return receipts;
    } finally {
      options.signal.removeEventListener('abort', abort);
      if (this.active === controller) this.active = null;
    }
  }

  private say(zh: string, en: string): string { return this.locale() === 'en' ? en : zh; }

  private async go(href: string, signal: AbortSignal): Promise<void> {
    const target = normalizeLocation(href);
    if (this.location === target) {
      // Even on the home page, an explicit CAD open must reveal its section.
      if (href.includes('#')) this.navigate(href);
      return;
    }
    this.navigatingTo = target;
    try {
      this.navigate(href);
      await waitForSiteCondition(() => this.location === target, signal);
    } finally { this.navigatingTo = null; }
  }

  private async apply(action: SiteAction, signal: AbortSignal): Promise<string> {
    if (action.type === 'site.read_context') {
      const context = this.getContext();
      const title = SITE_ROUTES[context.path as keyof typeof SITE_ROUTES]?.[this.locale() === 'en' ? 1 : 0] ?? context.path;
      return [this.say(`当前页面：${title}`, `Current page: ${title}`),
        context.viewer && this.say(`装置：${context.viewer.deviceId}；${context.viewer.ready ? '已就绪' : '加载中'}；视角：${context.viewer.view}`, `Device: ${context.viewer.deviceId}; ${context.viewer.ready ? 'ready' : 'loading'}; view: ${context.viewer.view}`),
        context.data && this.say(`当前炮次：${context.data.selectedShotId}；信号：${context.data.selectedSignalIds.join(', ')}`, `Shot: ${context.data.selectedShotId}; signals: ${context.data.selectedSignalIds.join(', ')}`),
        context.page && this.say(`可操作页面控件：${context.page.controls.length}；${context.page.title}`, `Available page controls: ${context.page.controls.length}; ${context.page.title}`),
      ].filter(Boolean).join('\n').slice(0, 400);
    }
    if (action.type === 'site.undo') {
      const entry = this.undoStack.at(-1);
      if (!entry) throw new Error(this.say('没有可撤销的网站操作。', 'No website operation to undo.'));
      if (entry.adapter && (entry.location !== this.location || this.adapters.get(entry.adapter.id) !== entry.adapter)) {
        throw new Error(this.say('原页面已离开，无法撤销其中的操作。', 'The original page is no longer active.'));
      }
      if (entry.surface && (entry.location !== this.location || entry.surface !== this.pageSurface)) {
        throw new Error(this.say('原页面已离开，无法撤销其中的操作。', 'The original page is no longer active.'));
      }
      await entry.undo(signal);
      this.undoStack.pop();
      return this.say('已撤销上一项操作。', 'Undid the last operation.');
    }
    if (action.type === 'page.click' || action.type === 'page.fill' || action.type === 'page.select' || action.type === 'page.scroll') {
      const surface = this.pageSurface;
      if (!surface) throw new Error(this.say('页面观察尚未就绪。', 'Page observation is not ready.'));
      const result = await surface.execute(action, { signal, navigate: (href, navigationSignal) => this.go(href, navigationSignal) });
      if (result.undo) this.remember({ location: this.location, surface, undo: result.undo });
      return result.message.slice(0, 400);
    }
    if (action.type === 'site.navigate' || action.type === 'site.search') {
      const previous = this.location;
      const href = action.type === 'site.navigate'
        ? action.path === '/digital-prototype' ? CAD_WORKSPACE_HREF : action.path
        : `/search?q=${encodeURIComponent(action.query)}`;
      await this.go(href, signal);
      if (previous !== normalizeLocation(href)) this.remember({ undo: undoSignal => this.go(previous, undoSignal) });
      return action.type === 'site.search' ? this.say(`已打开检索：${action.query}`, `Opened search: ${action.query}`)
        : this.say(`已打开${SITE_ROUTES[action.path][0]}。`, `Opened ${SITE_ROUTES[action.path][1]}.`);
    }
    const path = action.type.startsWith('cad.') ? CAD_WORKSPACE_PATH : '/fusion-data';
    if (action.type === 'cad.open') {
      const previous = this.location;
      await this.go(CAD_WORKSPACE_HREF, signal);
      if (previous !== CAD_WORKSPACE_PATH) this.remember({ undo: undoSignal => this.go(previous, undoSignal) });
    } else if (routeOf(this.location) !== path) {
      // Only explicit open/shot actions can change page implicitly. A view or part refers to the current model.
      if (action.type !== 'data.select_shot') throw new Error(this.say('请先打开对应页面，再执行这项操作。', 'Open the target page first.'));
      const previous = this.location;
      await this.go(path, signal);
      this.remember({ undo: undoSignal => this.go(previous, undoSignal) });
    }
    let adapter: SiteActionAdapter | undefined;
    await waitForSiteCondition(() => {
      const matches = [...this.adapters.values()].filter(item => item.path === path && item.capabilities.includes(action.type));
      if (matches.length > 1) throw new Error(this.say('有多个可操作视图，请先选择目标。', 'Select a target viewer first.'));
      adapter = matches[0];
      return !!adapter;
    }, signal, 4_000);
    const target = adapter!;
    const deadline = new AbortController();
    const abort = () => deadline.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => deadline.abort(), action.type.startsWith('cad.') ? 60_000 : 30_000);
    try {
      if (signal.aborted) throw abortError();
      const result = await new Promise<Awaited<ReturnType<SiteActionAdapter['execute']>>>((resolve, reject) => {
        const stopped = () => reject(abortError());
        deadline.signal.addEventListener('abort', stopped, { once: true });
        target.execute(action, { signal: deadline.signal }).then(resolve, reject)
          .finally(() => deadline.signal.removeEventListener('abort', stopped));
        if (deadline.signal.aborted) stopped();
      });
      if (deadline.signal.aborted) throw new Error(this.say('操作已超时，请检查当前画面后重试。', 'Operation timed out. Check the current view before retrying.'));
      if (this.adapters.get(target.id) !== target || routeOf(this.location) !== path) throw new Error(this.say('目标页面已变化。', 'The target page changed.'));
      if (result.undo) this.remember({ location: this.location, adapter: target, undo: result.undo });
      return result.message.slice(0, 400);
    } catch (error) {
      if (deadline.signal.aborted && !signal.aborted) throw new Error(this.say('操作已超时，请检查当前画面后重试。', 'Operation timed out. Check the current view before retrying.'));
      throw error;
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
  }

  private remember(entry: UndoEntry): void { this.undoStack.push(entry); if (this.undoStack.length > 12) this.undoStack.shift(); }
}
