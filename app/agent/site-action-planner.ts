import { SITE_ROUTES, isSiteActionPlan, isSiteRoute, type SiteAction, type SiteActionContext, type SiteActionPlan, type SiteActionType, type SiteRoute } from './site-actions';

export const CAD_OPERATION_DEVICES = [
  'paramak-full-device', 'exl-50u-2026-upgrade', 'exl50u-general-assembly-20260630',
  'ehl-2-preliminary', 'iter-educational-model',
] as const;
export type LocalSitePlan = { status: 'planned' | 'unsupported' | 'not-command' | 'unrecognized'; plan: SiteActionPlan; message: string };
const EMPTY_PLAN: SiteActionPlan = { version: 1, actions: [] };
const SAFE_CAD_FOLLOWUPS = new Set<SiteActionType>(['cad.set_view', 'cad.set_rotation', 'cad.set_clip', 'cad.set_opacity', 'cad.reset']);
const compact = (text: string) => text.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, '');
const routeAliases: [SiteRoute, string[]][] = [
  ['/', ['首页', '主页']], ['/digital-prototype', ['数字样机', 'cad', 'cad界面', '模型浏览']],
  ['/fusion-data', ['聚变数据', '数据工作区', '炮次数据']], ['/simulations', ['集成仿真', '仿真']],
  ['/search', ['知识检索', '检索页']], ['/knowledge-graph', ['知识图谱', '图谱']], ['/facilities', ['装置', '装置列表']],
  ['/physics', ['物理']], ['/engineering', ['工程']], ['/diagnostics', ['诊断']], ['/control', ['控制']], ['/ai', ['人工智能', 'ai']],
  ['/data-foundation', ['数据基座']], ['/platform', ['平台']], ['/roadmap', ['路线图']],
];

/** The context is display metadata. Every action is checked again by its registered client adapter. */
export function validateSiteActionPlanForContext(value: unknown, context: SiteActionContext): value is SiteActionPlan {
  if (!isSiteActionPlan(value)) return false;
  const capabilities = new Set(context.capabilities);
  let contextChanged = false;
  let openedCad = false;
  for (const action of value.actions) {
    const safeFollowup = openedCad && SAFE_CAD_FOLLOWUPS.has(action.type);
    if (!capabilities.has(action.type) && !safeFollowup) return false;
    if (contextChanged && (action.type === 'cad.select_parts' || action.type.startsWith('data.'))) return false;
    if (action.type.startsWith('cad.') && action.type !== 'cad.open' && !safeFollowup && (!context.viewer?.ready || contextChanged)) return false;
    if (action.type === 'cad.open' && !CAD_OPERATION_DEVICES.some(id => id === action.deviceId)) return false;
    if (action.type === 'cad.select_parts' && action.partIds.some(id => !context.viewer?.parts.some(part => part.id === id))) return false;
    if (action.type === 'data.select_shot' && !context.data?.shotIds.includes(action.shotId)) return false;
    if (action.type === 'data.select_signals' && action.signalIds.some(id => !context.data?.signalIds.includes(id))) return false;
    if (['site.navigate', 'site.search', 'cad.open', 'data.select_shot', 'site.undo'].includes(action.type)) {
      contextChanged = true;
      openedCad = action.type === 'cad.open' || (action.type === 'site.navigate' && action.path === '/digital-prototype');
    }
  }
  return true;
}

/** Deliberately bounded command grammar; no substring-triggered actions or arbitrary URL interpretation. */
export function planSiteActions(input: string, context: SiteActionContext): LocalSitePlan {
  const text = input.normalize('NFKC').trim();
  if (!text || text.length > 600 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return result('unsupported', '指令为空、过长或包含不支持的字符。');
  const command = text.replace(/^(?:请(?:你)?|麻烦你?|帮我|替我)\s*/u, '').replace(/^(?:帮我|替我)\s*/u, '').replace(/^please\s+/iu, '').replace(/[。！!]+$/u, '').trim();
  // Search terms are data: a quoted negative sentence in an explicit search is not a UI command.
  const search = /^(?:(?:搜索|检索|搜一下)(?:站内|本站)?|search(?:\s+for)?)\s*[:：]?\s+(.+)$|^(?:搜索|检索|搜一下)(?:站内|本站)?[“"「](.+)[”"」]$/iu.exec(command);
  if (search) return finish([{ type: 'site.search', query: (search[1] ?? search[2]).trim() }], context);
  if (/(?:不要|勿|别(?:再)?|不想|不需要|不用|不能|禁止|先不|暂不|不(?:打开|切换|选择|隐藏|旋转|搜索|执行))|[?？]|(?:吗|么|呢)$|(?:如何|怎么|怎样|为何|为什么|能否|可否|是否|能不能|可不可以|是什么|有没有)|\b(?:do\s+not|don['’]?t|never|not|no\s+need|avoid|how|why|whether)\b|^(?:what|where|when|can|could|would|should|may|will|is|are|do|does|did)\b/iu.test(command)) {
    return result('not-command', '这是一条疑问或否定表达，未生成操作。请用明确的操作指令，或切换到问答。');
  }
  if (/(?:爆炸|爆开|explode|explosion|爆破)/iu.test(command)) return result('unsupported', '第一阶段尚不支持装配爆炸效果；当前没有可执行的爆炸动作。');
  if (/(?:https?:\/\/|javascript:|<script|\beval\s*\(|删除|上传|发布|部署|执行代码|运行脚本)/iu.test(command)) return result('unsupported', '当前操作模式只支持白名单内的站内浏览与显示操作。');
  const simpleSearch = /^(?:搜索|检索|搜一下)(?:站内|本站)?\s*[:：]?\s*(.+)$/u.exec(command);
  if (simpleSearch) return finish([{ type: 'site.search', query: simpleSearch[1].trim() }], context);
  if (/(?:旋转|转动|俯仰|转向|rotate|rotation|turn).*(?:\d|度|°)/iu.test(command)) return result('unsupported', '第一阶段支持预设视角和自动旋转开关，尚不支持按任意角度旋转。');
  const clauses = command.replace(/[，,；;]\s*(?=然后|并且|并|接着|再|then\b|and\b)/giu, '').split(/\s*(?:然后|并且|并|接着|再(?=切换|打开|选择|设置|关闭|开启)|\b(?:then|and)\s+(?=open|set|switch|start|stop|enable|disable|read|undo|reset|select|hide|isolate|top|front|iso)|[，,；;](?=\s*(?:请|切换|打开|进入|关闭|开启|停止|暂停|选择|选中|设置|调整|读取|撤销|隐藏|隔离|只看|仅显示|俯视|正视|等轴测|open|set|switch|start|stop|enable|disable|read|undo|reset|select|hide|isolate|top|front|iso)))\s*/iu);
  if (clauses.length > 6 || clauses.some(clause => !clause)) return result('unsupported', '一次最多支持六项明确操作。');
  const actions: SiteAction[] = [];
  for (const clause of clauses) {
    const action = parseClause(clause, context);
    if (!action) return result('unrecognized', '本地指令规则尚不能确定这条操作；请明确页面、视角或当前部件名称。');
    actions.push(action);
  }
  return finish(actions, context);
}

function parseClause(clause: string, context: SiteActionContext): SiteAction | null {
  const text = compact(clause.replace(/\s+and\s+/giu, '、')).replace(/^(?:请|帮我)/u, '');
  if (/^(?:撤销|撤销上一步|退回上一步|undo|undolast(?:action|step))$/u.test(text)) return { type: 'site.undo' };
  if (/^(?:读取当前(?:页面|状态|上下文)?|读取上下文|查看当前(?:页面)?状态|当前页面状态|查看当前选择|read(?:current)?(?:page|context|state)|showcurrentstate)$/u.test(text)) return { type: 'site.read_context' };
  if (/^(?:重置cad|重置模型|重置视图|复位|复位模型|恢复初始视图|reset(?:cad|model|view)?)$/u.test(text)) return { type: 'cad.reset' };
  const englishView = /^(?:set(?:view)?to|switchto|view)?(top|front|iso|isometric)(?:view)?$/u.exec(text);
  if (englishView) return { type: 'cad.set_view', view: englishView[1] === 'top' ? 'top' : englishView[1] === 'front' ? 'front' : 'iso' };
  const view = /^(?:(?:切换|切换到|设置为|设为|从|查看))?(俯视|顶视|正视|前视|等轴测|轴测)(?:图|视图|角度|视角)?$/u.exec(text);
  if (view) return { type: 'cad.set_view', view: /俯|顶/u.test(view[1]) ? 'top' : /正|前/u.test(view[1]) ? 'front' : 'iso' };
  if (/^(?:开启|开始|打开|启用)?(?:自动旋转|自转)$|^(?:开启|开始|打开|启用)旋转$|^(?:start|enable|turnon)(?:auto)?rotation$/u.test(text)) return { type: 'cad.set_rotation', enabled: true };
  if (/^(?:停止|暂停|关闭|取消)(?:(?:自动)?旋转|自转)$|^(?:stop|pause|disable|turnoff)(?:auto)?rotation$/u.test(text)) return { type: 'cad.set_rotation', enabled: false };
  if (/^(?:关闭|取消|停止)剖切$/u.test(text)) return { type: 'cad.set_clip', enabled: false, axis: 'x', offset: 0 };
  const clip = /^(?:沿|开启|打开|启用)?([xyz])轴?剖切(?:(?:偏移|位置)(-?\d+(?:\.\d+)?))?$/u.exec(text);
  if (clip) return { type: 'cad.set_clip', enabled: true, axis: clip[1] as 'x' | 'y' | 'z', offset: clip[2] ? Number(clip[2]) : 0 };
  if (/^(?:开启|打开|启用)剖切$/u.test(text)) return { type: 'cad.set_clip', enabled: true, axis: 'x', offset: 0 };
  if (/^(?:设为|设置为|切换到)?半透明$/u.test(text)) return { type: 'cad.set_opacity', opacity: 0.5 };
  if (/^(?:恢复|设为|设置为)?(?:完全)?不透明$/u.test(text)) return { type: 'cad.set_opacity', opacity: 1 };
  const opacity = /^(?:设置|调整)?(不透明度|透明度)(?:设为|设置为|调整到|为|到)?(\d+(?:\.\d+)?)%$/u.exec(text);
  if (opacity) return { type: 'cad.set_opacity', opacity: opacity[1] === '透明度' ? 1 - Number(opacity[2]) / 100 : Number(opacity[2]) / 100 };
  const shot = /^(?:(?:切换到|切换|选择|打开)(?:炮号|炮次|炮)(?:为|到)?|(?:select|open|switchto)shot)#?(\d{1,10})$/u.exec(text);
  if (shot && context.data?.shotIds.includes(shot[1])) return { type: 'data.select_shot', shotId: shot[1] };
  const signals = /^(?:(?:选择|选中|显示)信号|(?:select|show)signals?)(.+)$/u.exec(text);
  if (signals) {
    const signalIds = resolveNames(signals[1], (context.data?.signalIds ?? []).map(id => ({ id, label: id })));
    return signalIds ? { type: 'data.select_signals', signalIds } : null;
  }
  const parts = /^(选择|选中|隐藏|隔离|仅显示|只显示|只看|select|hide|isolate|showonly)(?:部件|parts?)?(.+)$/u.exec(text);
  if (parts) {
    const partIds = resolveNames(parts[2], context.viewer?.parts ?? []);
    return partIds ? { type: 'cad.select_parts', partIds, mode: /^(隐藏|hide)$/u.test(parts[1]) ? 'hide' : /隔离|仅|只|isolate|showonly/u.test(parts[1]) ? 'isolate' : 'select' } : null;
  }
  const target = /^(?:打开|进入|切换到|跳转到|前往|浏览|查看|open|goto|navigateto|visit|enter)(.+)$/u.exec(text)?.[1];
  if (!target) return null;
  const device = deviceTarget(target);
  if (device) return { type: 'cad.open', deviceId: device };
  if (isSiteRoute(target)) return { type: 'site.navigate', path: target };
  const cleanTarget = target.replace(/(?:页面|工作区|页)$/u, '');
  for (const [path, aliases] of routeAliases) {
    if ([...aliases, ...SITE_ROUTES[path]].some(alias => compact(alias) === target || compact(alias) === cleanTarget)) return { type: 'site.navigate', path };
  }
  return null;
}

function deviceTarget(target: string): string | null {
  if (CAD_OPERATION_DEVICES.some(id => id === target)) return target;
  const text = target.replace(/模型$/u, '').replace(/exl-?50u/gu, 'exl50u');
  if (/^(?:exl50u)?(?:总装|全装置|完整装置|全装置总装|fullassembly|fullmodel|fulldevice|assembly)$/u.test(text) || text === 'exl50u') return 'exl50u-general-assembly-20260630';
  if (/^(?:exl50u)?(?:简化|简化版|12系统|十二系统|simplified|simplifiedmodel)$/u.test(text)) return 'exl-50u-2026-upgrade';
  if (/^(?:iter|iter教学|iter教学版)$/u.test(text)) return 'iter-educational-model';
  if (/^paramak(?:全装置)?$/u.test(text)) return 'paramak-full-device';
  if (/^ehl-?2(?:初步设计)?$/u.test(text)) return 'ehl-2-preliminary';
  return null;
}

function resolveNames(text: string, entries: { id: string; label: string }[]): string[] | null {
  const names = text.split(/(?:、|,|，|和|及|\+)/u).map(name => compact(name.replace(/^[“"「]|[”"」]$/gu, '')));
  const resolved: string[] = [];
  for (const name of names) {
    if (!name) return null;
    const matches = entries.filter(entry => compact(entry.id) === name || compact(entry.label) === name);
    if (matches.length !== 1) return null;
    resolved.push(matches[0].id);
  }
  return new Set(resolved).size === resolved.length ? resolved : null;
}

function finish(actions: SiteAction[], context: SiteActionContext): LocalSitePlan {
  const plan: SiteActionPlan = { version: 1, actions };
  if (!validateSiteActionPlanForContext(plan, context)) return result('unsupported', '当前页面尚未就绪、缺少所需操作能力，或目标不属于当前装配/炮次。请先打开对应页面并读取当前状态。');
  return { status: 'planned', plan, message: `将执行 ${actions.length} 项站内操作；执行结果以页面回执为准。` };
}
function result(status: LocalSitePlan['status'], message: string): LocalSitePlan {
  return { status, plan: { ...EMPTY_PLAN, actions: [] }, message };
}
