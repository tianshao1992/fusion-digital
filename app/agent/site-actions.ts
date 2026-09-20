/** Shared, bounded public UI operations. Never accepts URLs, scripts or server writes. */
export const SITE_ROUTES = {
  '/': ['首页', 'Home'],
  '/digital-prototype': ['数字样机', 'Digital prototype'],
  '/fusion-data': ['聚变数据', 'Fusion data'],
  '/simulations': ['集成仿真', 'Simulations'],
  '/search': ['知识检索', 'Search'],
  '/knowledge-graph': ['知识图谱', 'Knowledge graph'],
  '/facilities': ['装置', 'Facilities'],
  '/physics': ['物理', 'Physics'],
  '/engineering': ['工程', 'Engineering'],
  '/diagnostics': ['诊断', 'Diagnostics'],
  '/control': ['控制', 'Control'],
  '/ai': ['人工智能', 'AI'],
  '/data-foundation': ['数据基座', 'Data foundation'],
  '/platform': ['平台', 'Platform'],
  '/roadmap': ['路线图', 'Roadmap'],
} as const;

export type SiteRoute = keyof typeof SITE_ROUTES;
export type SiteAction =
  | { type: 'site.navigate'; path: SiteRoute }
  | { type: 'site.search'; query: string }
  | { type: 'site.read_context' }
  | { type: 'site.undo' }
  | { type: 'page.click'; targetId: string }
  | { type: 'page.fill'; targetId: string; value: string }
  | { type: 'page.select'; targetId: string; value: string }
  | { type: 'page.scroll'; direction: 'up' | 'down' }
  | { type: 'cad.open'; deviceId: string }
  | { type: 'cad.set_view'; view: 'iso' | 'front' | 'top' }
  | { type: 'cad.set_rotation'; enabled: boolean }
  | { type: 'cad.set_clip'; enabled: boolean; axis: 'x' | 'y' | 'z'; offset: number }
  | { type: 'cad.set_opacity'; opacity: number }
  | { type: 'cad.select_parts'; partIds: string[]; mode: 'select' | 'isolate' | 'hide' }
  | { type: 'cad.reset' }
  | { type: 'data.select_shot'; shotId: string }
  | { type: 'data.select_signals'; signalIds: string[] };
export type SiteActionType = SiteAction['type'];
export type SiteActionPlan = { version: 1; actions: SiteAction[] };

export type PageControl = {
  id: string; role: string; label: string; value?: string;
  options?: { value: string; label: string }[];
  actions: ('click' | 'fill' | 'select')[];
};
export type SitePageSnapshot = { title: string; text: string; controls: PageControl[] };

export type SiteActionContext = {
  path: string;
  pageInstanceId: string;
  revision: number;
  capabilities: SiteActionType[];
  /** The displayed catalog is a bounded subset; omitted entries are not new capabilities. */
  observationTruncated?: boolean;
  page?: SitePageSnapshot;
  viewer?: {
    viewerId: string; deviceId: string; ready: boolean; revision?: number;
    parts: { id: string; label: string }[];
    selectedPartIds: string[];
    view: string;
  };
  data?: { shotIds: string[]; selectedShotId: string; signalIds: string[]; selectedSignalIds: string[] };
};

export type SiteActionReceipt = {
  actionId: string;
  type: SiteActionType;
  status: 'applied' | 'rejected' | 'cancelled';
  message: string;
  path: string;
};

const TYPES: readonly SiteActionType[] = [
  'site.navigate', 'site.search', 'site.read_context', 'site.undo',
  'page.click', 'page.fill', 'page.select', 'page.scroll',
  'cad.open', 'cad.set_view', 'cad.set_rotation', 'cad.set_clip',
  'cad.set_opacity', 'cad.select_parts', 'cad.reset', 'data.select_shot', 'data.select_signals',
];
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const boundedText = (value: unknown, max = 120): value is string => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);
const ids = (value: unknown, max = 32): value is string[] => Array.isArray(value) && value.length > 0 && value.length <= max && value.every(item => boundedText(item)) && new Set(value).size === value.length;
const range = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const targetId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(value);
const pageText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);

export function isSiteRoute(path: unknown): path is SiteRoute {
  return typeof path === 'string' && Object.hasOwn(SITE_ROUTES, path);
}

export function isSiteAction(value: unknown): value is SiteAction {
  if (!record(value) || !TYPES.includes(value.type as SiteActionType)) return false;
  let keys: string[];
  let valid: boolean;
  switch (value.type) {
    case 'site.navigate': keys = ['path']; valid = isSiteRoute(value.path); break;
    case 'site.search': keys = ['query']; valid = boundedText(value.query, 240); break;
    case 'page.click': keys = ['targetId']; valid = targetId(value.targetId); break;
    case 'page.fill': case 'page.select': keys = ['targetId', 'value']; valid = targetId(value.targetId) && pageText(value.value, 600); break;
    case 'page.scroll': keys = ['direction']; valid = value.direction === 'up' || value.direction === 'down'; break;
    case 'cad.open': keys = ['deviceId']; valid = boundedText(value.deviceId) && /^[a-z0-9-]+$/.test(value.deviceId); break;
    case 'cad.set_view': keys = ['view']; valid = ['iso', 'front', 'top'].includes(value.view as string); break;
    case 'cad.set_rotation': keys = ['enabled']; valid = typeof value.enabled === 'boolean'; break;
    case 'cad.set_clip': keys = ['enabled', 'axis', 'offset']; valid = typeof value.enabled === 'boolean' && ['x', 'y', 'z'].includes(value.axis as string) && range(value.offset, -0.9, 0.9); break;
    case 'cad.set_opacity': keys = ['opacity']; valid = range(value.opacity, 0.15, 1); break;
    case 'cad.select_parts': keys = ['partIds', 'mode']; valid = ids(value.partIds) && ['select', 'isolate', 'hide'].includes(value.mode as string); break;
    case 'data.select_shot': keys = ['shotId']; valid = boundedText(value.shotId, 40); break;
    case 'data.select_signals': keys = ['signalIds']; valid = ids(value.signalIds, 8); break;
    default: keys = []; valid = true;
  }
  return valid && Object.keys(value).length === keys.length + 1 && keys.every(key => Object.hasOwn(value, key));
}

export function isSiteActionPlan(value: unknown): value is SiteActionPlan {
  return record(value) && value.version === 1 && Object.keys(value).length === 2
    && Array.isArray(value.actions) && value.actions.length <= 6 && value.actions.every(isSiteAction);
}

/** Context is untrusted display metadata, never an authorization credential. */
export function normalizeSiteActionContext(value: unknown): SiteActionContext | null {
  if (!record(value) || !boundedText(value.path, 160) || !value.path.startsWith('/')
    || !boundedText(value.pageInstanceId) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 0
    || !Array.isArray(value.capabilities) || value.capabilities.length > TYPES.length
    || !value.capabilities.every(item => TYPES.includes(item))) return null;
  const context: SiteActionContext = { path: value.path, pageInstanceId: value.pageInstanceId, revision: Number(value.revision), capabilities: [...new Set(value.capabilities)] };
  if (value.observationTruncated !== undefined) {
    if (typeof value.observationTruncated !== 'boolean') return null;
    context.observationTruncated = value.observationTruncated;
  }
  if (value.page !== undefined) {
    const p = value.page;
    if (!record(p) || !pageText(p.title, 240) || !pageText(p.text, 6000) || !Array.isArray(p.controls) || p.controls.length > 60
      || !p.controls.every(c => record(c) && targetId(c.id) && boundedText(c.role, 40) && boundedText(c.label, 160)
        && (c.value === undefined || pageText(c.value, 600))
        && Array.isArray(c.actions) && c.actions.length > 0 && c.actions.length <= 3
        && c.actions.every(a => ['click', 'fill', 'select'].includes(a)) && new Set(c.actions).size === c.actions.length
        && (c.options === undefined || (Array.isArray(c.options) && c.options.length <= 80 && c.options.every(o => record(o) && pageText(o.value, 600) && pageText(o.label, 160)))))
      || new Set(p.controls.map(c => c.id)).size !== p.controls.length) return null;
    context.page = { title: p.title, text: p.text, controls: p.controls.map(c => ({ id: c.id, role: c.role, label: c.label, actions: [...c.actions],
      ...(c.value !== undefined ? { value: c.value } : {}), ...(c.options !== undefined ? { options: c.options.map((o: { value: string; label: string }) => ({ value: o.value, label: o.label })) } : {}) })) };
  }
  if (value.viewer !== undefined) {
    const v = value.viewer;
    if (!record(v) || !boundedText(v.viewerId) || !boundedText(v.deviceId) || typeof v.ready !== 'boolean'
      || !boundedText(v.view) || !Array.isArray(v.parts) || v.parts.length > 80
      || !v.parts.every(p => record(p) && boundedText(p.id) && boundedText(p.label, 160))
      || !Array.isArray(v.selectedPartIds) || v.selectedPartIds.length > 32 || !v.selectedPartIds.every(p => boundedText(p))
      || (v.revision !== undefined && (!Number.isSafeInteger(v.revision) || Number(v.revision) < 0))) return null;
    context.viewer = { viewerId: v.viewerId, deviceId: v.deviceId, ready: v.ready, view: v.view,
      parts: v.parts.map(p => ({ id: p.id, label: p.label })), selectedPartIds: [...v.selectedPartIds],
      ...(v.revision !== undefined ? { revision: Number(v.revision) } : {}) };
  }
  if (value.data !== undefined) {
    const d = value.data;
    if (!record(d)) return null;
    const signalIds = d.signalIds;
    if (!ids(d.shotIds, 100) || !boundedText(d.selectedShotId) || !d.shotIds.includes(d.selectedShotId)
      || !Array.isArray(signalIds) || (signalIds.length > 0 && !ids(signalIds, 100))
      || !Array.isArray(d.selectedSignalIds) || d.selectedSignalIds.length > 8
      || !d.selectedSignalIds.every(id => boundedText(id) && signalIds.includes(id))) return null;
    context.data = { shotIds: [...d.shotIds], selectedShotId: d.selectedShotId, signalIds: [...signalIds], selectedSignalIds: [...d.selectedSignalIds] };
  }
  return context;
}

/** Leave room below the server's 28 KB context limit for serialized round metadata. */
export const SITE_ACTION_CONTEXT_BYTES = 26_000;
const contextEncoder = new TextEncoder();
const contextBytes = (value: SiteActionContext) => contextEncoder.encode(JSON.stringify(value)).byteLength;
function textPrefix(value: string, budget: number): string {
  let result = ''; let used = 0;
  for (const character of value) {
    const size = contextEncoder.encode(character).byteLength;
    if (used + size > budget) break;
    result += character; used += size;
  }
  return result;
}

/** Bound display metadata without shortening any dispatch ID, option value or selection.
 * The runtime fingerprints this exact projection, so omitted text cannot invalidate a
 * tool selected from the retained catalog. Current semantic selection/revision survives. */
export function boundSiteActionContext(value: SiteActionContext): SiteActionContext {
  // Reserve the maximum numeric revision width for the runtime's next increment.
  const budget = SITE_ACTION_CONTEXT_BYTES - 16;
  if (contextBytes(value) <= budget) return value;
  const context = structuredClone(value);
  context.observationTruncated = true;
  const over = () => contextBytes(context) > budget;
  const page = context.page;
  if (page) {
    page.text = textPrefix(page.text, 3_000);
    for (const control of page.controls) {
      control.label = textPrefix(control.label, 120);
      if (control.options) {
        const selected = control.options.filter(option => option.value === control.value);
        const others = control.options.filter(option => option.value !== control.value);
        control.options = [...selected, ...others.slice(0, Math.max(0, 8 - selected.length))]
          .map(option => ({ ...option, label: textPrefix(option.label, 96) }));
      }
    }
    if (over()) for (const control of page.controls) {
      if (control.options?.length) control.options = [control.options.find(option => option.value === control.value) ?? control.options[0]];
    }
    while (over() && page.controls.length > 8) page.controls.pop();
  }
  const viewer = context.viewer;
  if (over() && viewer) {
    viewer.parts = viewer.parts.map(part => ({ ...part, label: textPrefix(part.label, 96) }));
    // Prefer retaining selected parts, but the immutable selectedPartIds remain
    // authoritative even when a very large catalog itself must be omitted.
    while (over() && viewer.parts.length) {
      const index = viewer.parts.findLastIndex(part => !viewer.selectedPartIds.includes(part.id));
      viewer.parts.splice(index >= 0 ? index : viewer.parts.length - 1, 1);
    }
  }
  const data = context.data;
  if (over() && data) {
    while (over() && (data.shotIds.length > 1 || data.signalIds.length > 1)) {
      const shot = data.shotIds.findLastIndex(id => id !== data.selectedShotId);
      const signal = data.signalIds.findLastIndex(id => !data.selectedSignalIds.includes(id));
      if (data.signalIds.length > 1 && signal >= 0) data.signalIds.splice(signal, 1);
      else if (data.shotIds.length > 1 && shot >= 0) data.shotIds.splice(shot, 1);
      else break;
    }
  }
  if (over() && page) {
    page.text = '';
    while (over() && page.controls.length) page.controls.pop();
  }
  // Valid schema-bounded contexts always fit after removing display catalogs.
  // If a future adapter violates that contract, do not corrupt identity/selection.
  if (over()) throw new Error('Essential page context exceeds the observation budget.');
  return context;
}

export function normalizeSiteActionReceipts(value: unknown): SiteActionReceipt[] | null {
  if (!Array.isArray(value) || value.length > 6) return null;
  if (!value.every(r => record(r) && boundedText(r.actionId) && TYPES.includes(r.type as SiteActionType)
    && ['applied', 'rejected', 'cancelled'].includes(r.status as string)
    && typeof r.message === 'string' && r.message.length > 0 && r.message.length <= 400 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(r.message)
    && boundedText(r.path, 160))) return null;
  return value.map(r => ({ actionId: r.actionId, type: r.type, status: r.status, message: r.message, path: r.path }));
}
