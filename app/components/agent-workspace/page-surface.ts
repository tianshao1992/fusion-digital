import { isSiteRoute, type PageControl, type SiteAction, type SitePageSnapshot } from '@/app/agent/site-actions';
import type { SitePageSurface } from '@/app/agent/site-action-runtime';

type PageAction = Extract<SiteAction, { type: `page.${string}` }>;
type Target = { element: HTMLElement; identity: string; control: PageControl; href?: string };
const EXCLUDED = '.agentWorkspaceRoot, [data-agent-exclude], [inert], [hidden], [aria-hidden="true"], script, style, noscript, iframe';
const SENSITIVE = /password|passwd|secret|token|credential|api.?key|email|phone|address|credit|account|密码|密钥|令牌|邮箱|手机|账户|账号/i;
const clip = (value: string | null | undefined, size: number) => (value ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, size);

/** Route allowlist applies to observation too: account/admin/review content never enters model context. */
export function safePageHref(href: string, origin: string): string | null {
  if (!href || href.length > 600 || /[\u0000-\u0020\\]/.test(href)) return null;
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin || !isSiteRoute(url.pathname) || url.username || url.password) return null;
    if (url.hash && !/^#[A-Za-z0-9_-]{1,120}$/.test(url.hash)) return null;
    if (url.search) {
      if (url.pathname !== '/search' || [...url.searchParams.keys()].some(key => key !== 'q') || url.searchParams.getAll('q').length !== 1
        || (url.searchParams.get('q')?.length ?? 0) > 240) return null;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}

function excluded(element: Element): boolean {
  if (element.closest(EXCLUDED)) return true;
  if (element.matches('input,textarea,select')) {
    const metadata = ['type', 'name', 'id', 'autocomplete', 'aria-label', 'placeholder'].map(key => element.getAttribute(key) ?? '').join(' ');
    if (SENSITIVE.test(metadata)) return true;
    const type = (element.getAttribute('type') ?? 'text').toLowerCase();
    if (['password', 'email', 'tel', 'file', 'hidden'].includes(type)) return true;
  }
  return false;
}

function visible(element: HTMLElement, view: Window, viewport = true): boolean {
  if (!element.isConnected || excluded(element) || !element.getClientRects().length) return false;
  const style = view.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
  if (!viewport) return true;
  const rect = element.getBoundingClientRect();
  return rect.bottom > 0 && rect.right > 0 && rect.top < view.innerHeight && rect.left < view.innerWidth;
}

function controlLabel(element: HTMLElement): string {
  const input = element as HTMLInputElement;
  const labels = input.labels ? [...input.labels].map(label => label.textContent).join(' ') : '';
  return clip(element.getAttribute('data-agent-label') || element.getAttribute('aria-label') || labels
    || element.getAttribute('title') || element.textContent || element.getAttribute('placeholder'), 160);
}

function descriptor(element: HTMLElement, view: Window): Omit<Target, 'control'> & { control: Omit<PageControl, 'id'> } | null {
  if (!visible(element, view) || element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return null;
  const label = controlLabel(element);
  if (!label) return null;
  const tag = element.tagName.toLowerCase();
  const actions: PageControl['actions'] = [];
  const declared = element.getAttribute('data-agent-safe')?.split(' ') ?? [];
  const href = tag === 'a' && !element.hasAttribute('download') && !element.getAttribute('target')
    ? safePageHref(element.getAttribute('href') ?? '', view.location.origin) : null;
  if (href) actions.push('click');
  if (declared.includes('click') && (tag === 'button' || tag === 'summary' || (tag === 'input' && ['checkbox', 'radio'].includes((element as HTMLInputElement).type)))) {
    // Submit is allowed only on explicitly reviewed read-only search forms.
    const button = element as HTMLButtonElement;
    if (!(tag === 'button' && button.type === 'submit' && button.form && button.form.getAttribute('data-agent-readonly') !== 'true')) actions.push('click');
  }
  if (declared.includes('fill') && ((tag === 'input' && ['text', 'search', 'number', 'range'].includes((element as HTMLInputElement).type)) || tag === 'textarea')
    && !(element as HTMLInputElement).readOnly) actions.push('fill');
  if (declared.includes('select') && tag === 'select' && !(element as HTMLSelectElement).multiple) actions.push('select');
  if (!actions.length) return null;
  const role = element.getAttribute('role') || (tag === 'a' ? 'link' : tag === 'select' ? 'combobox' : tag === 'input' ? (element as HTMLInputElement).type : tag === 'textarea' ? 'textbox' : 'button');
  let value: string | undefined;
  if (tag === 'select' || tag === 'textarea' || tag === 'input') {
    const input = element as HTMLInputElement;
    value = ['checkbox', 'radio'].includes(input.type) ? String(input.checked) : input.value.slice(0, 600);
  } else value = element.getAttribute('aria-pressed') ?? element.getAttribute('aria-checked') ?? element.getAttribute('aria-expanded') ?? undefined;
  const options = tag === 'select' ? [...(element as HTMLSelectElement).options].filter(option => !option.disabled && !option.hidden && !(option.parentElement?.tagName === 'OPTGROUP' && (option.parentElement as HTMLOptGroupElement).disabled))
    .slice(0, 80).map(option => ({ value: option.value.slice(0, 600), label: clip(option.label, 160) })) : undefined;
  // Identity excludes mutable value, but includes destination, type and accessible label.
  const identity = JSON.stringify({ tag, role, label, href, actions, name: element.getAttribute('name'), type: element.getAttribute('type') });
  return { element, identity, ...(href ? { href } : {}), control: { role, label, actions, ...(value !== undefined ? { value } : {}), ...(options ? { options } : {}) } };
}

async function settled(view: Window, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  // Give React a chance to commit; use a timeout so background tabs cannot hang a run.
  await new Promise<void>((resolve, reject) => {
    let frame = 0;
    const finish = (error?: unknown) => { view.cancelAnimationFrame(frame); clearTimeout(timer); signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(); };
    const abort = () => finish(new DOMException('Operation cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(), 200);
    signal.addEventListener('abort', abort, { once: true });
    frame = view.requestAnimationFrame(() => { frame = view.requestAnimationFrame(() => finish()); });
  });
  signal.throwIfAborted();
}

/** Native UI tools address observed DOM nodes, never model-provided selectors or JavaScript. */
export class BrowserPageSurface implements SitePageSurface {
  private serial = 0;
  private identities = new WeakMap<HTMLElement, { identity: string; id: string }>();
  private targets = new Map<string, Target>();
  constructor(private document: Document, private view: Window) {}

  getSnapshot(): SitePageSnapshot {
    this.targets.clear();
    if (!isSiteRoute(this.view.location.pathname)) return { title: '', text: '', controls: [] };
    const controls: PageControl[] = [];
    for (const element of this.document.querySelectorAll<HTMLElement>('a[href], [data-agent-safe]')) {
      const target = descriptor(element, this.view);
      if (!target) continue;
      let entry = this.identities.get(element);
      if (!entry || entry.identity !== target.identity) {
        entry = { identity: target.identity, id: `control_${++this.serial}` };
        this.identities.set(element, entry);
      }
      const control = { id: entry.id, ...target.control };
      this.targets.set(entry.id, { ...target, control });
      controls.push(control);
      if (controls.length === 60) break;
    }
    const root = this.document.querySelector('main') ?? this.document.body;
    const chunks: string[] = [];
    let length = 0;
    const walker = this.document.createTreeWalker(root, 4 /* SHOW_TEXT */);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('input,textarea,select,button,a,script,style,noscript') || !visible(parent, this.view)) continue;
      const text = clip(node.textContent, 800);
      if (!text) continue;
      chunks.push(text); length += text.length + 1;
      if (length >= 6000) break;
    }
    return { title: clip(this.document.title, 240), text: chunks.join('\n').slice(0, 6000), controls };
  }

  async execute(action: PageAction, options: { signal: AbortSignal; navigate: (href: string, signal: AbortSignal) => Promise<void> }) {
    const { signal } = options;
    signal.throwIfAborted();
    if (!isSiteRoute(this.view.location.pathname)) throw new Error('此页面未开放智能体操作。 / This page is not available to the agent.');
    if (action.type === 'page.scroll') {
      const before = this.view.scrollY;
      this.view.scrollBy({ top: (action.direction === 'down' ? 1 : -1) * Math.max(300, this.view.innerHeight * 0.7), behavior: 'instant' });
      await settled(this.view, signal);
      return { message: this.view.scrollY === before ? '已到达页面滚动边界。 / Reached the page boundary.' : `已${action.direction === 'down' ? '向下' : '向上'}滚动页面。 / Page scrolled ${action.direction}.` };
    }
    const previous = this.targets.get(action.targetId);
    this.getSnapshot();
    const target = this.targets.get(action.targetId);
    if (!previous || !target || previous.element !== target.element || previous.identity !== target.identity) {
      throw new Error('页面控件已变化，请重新观察页面。 / The control changed; observe the page again.');
    }
    const operation = action.type.slice(5) as PageControl['actions'][number];
    if (!target.control.actions.includes(operation)) throw new Error('该控件不允许此操作。 / This operation is not allowed for the control.');
    const element = target.element;
    if (action.type === 'page.click') {
      if (target.href) {
        await options.navigate(target.href, signal);
      } else {
        element.click();
      }
      await settled(this.view, signal);
      return { message: `已激活控件：${target.control.label}。 / Activated ${target.control.label}.` };
    }
    const input = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const before = input.value;
    const write = (value: string) => {
      const latest = descriptor(element, this.view);
      if (!latest || latest.identity !== target.identity || !latest.control.actions.includes(operation)) throw new Error('原控件已不可用。 / The original control is no longer available.');
      if (action.type === 'page.select' && !latest.control.options?.some(option => option.value === value)) throw new Error('请选择当前控件提供的选项。 / Select an available option.');
      if (element.tagName === 'INPUT') {
        const numeric = element as HTMLInputElement;
        if (numeric.type === 'range' || numeric.type === 'number') {
          const number = Number(value);
          if (!value.trim() || !Number.isFinite(number) || (numeric.min !== '' && number < Number(numeric.min)) || (numeric.max !== '' && number > Number(numeric.max))) throw new Error('输入值超出该控件允许的范围。 / Value is outside the control range.');
        }
      }
      const maxLength = (input as HTMLInputElement).maxLength;
      if (maxLength >= 0 && value.length > maxLength) throw new Error('输入值超过该控件的长度限制。 / Value exceeds the control limit.');
      // Native prototype setter bypasses React's value tracker so its onChange sees the real edit.
      const prototype = Object.getPrototypeOf(element);
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (!setter) throw new Error('控件不支持安全编辑。 / The control does not support editing.');
      setter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    write(action.value);
    await settled(this.view, signal);
    if (!element.isConnected || input.value !== action.value) throw new Error('页面未保留请求的输入值。 / The page did not retain the requested value.');
    return { message: `已更新控件：${target.control.label}。 / Updated ${target.control.label}.`, undo: async (undoSignal: AbortSignal) => {
      undoSignal.throwIfAborted();
      if (input.value !== action.value) throw new Error('控件已再次变化，不能覆盖后续输入。 / The control changed again; the later input will not be overwritten.');
      write(before);
      await settled(this.view, undoSignal);
      if (!element.isConnected || input.value !== before) throw new Error('页面未恢复原输入值。 / The page did not restore the previous value.');
    } };
  }
}
