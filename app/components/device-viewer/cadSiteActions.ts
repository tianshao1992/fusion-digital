import { isSiteAction, type SiteAction, type SiteActionType } from '../../agent/site-actions';
import type { Ehl2DiagnosticViewerState } from '../TokamakCadViewer';

export const CAD_VIEWER_ACTION_TYPES: SiteActionType[] = [
  'cad.set_view', 'cad.set_rotation', 'cad.set_clip', 'cad.set_opacity', 'cad.select_parts', 'cad.reset',
];

export type CadViewerAction = Extract<SiteAction, { type:
  'cad.set_view' | 'cad.set_rotation' | 'cad.set_clip' | 'cad.set_opacity' | 'cad.select_parts' | 'cad.reset'
}>;

type CadActionOptions = {
  partIds: ReadonlySet<string>;
  anonymous: boolean;
  defaults: Pick<Ehl2DiagnosticViewerState, 'clipping' | 'clipAxis' | 'clipOffset' | 'analyticPlasmaVisible'>;
};

type CadCameraView = NonNullable<Ehl2DiagnosticViewerState['cameraView']>;

export function isCadViewerAction(action: SiteAction): action is CadViewerAction {
  return isSiteAction(action) && CAD_VIEWER_ACTION_TYPES.includes(action.type);
}

/** A pure display transition. Source geometry, transport shards and physics state never change. */
export function resolveCadSiteAction(
  state: Ehl2DiagnosticViewerState,
  action: CadViewerAction,
  options: CadActionOptions,
): { state: Ehl2DiagnosticViewerState; message: string } {
  if (!isCadViewerAction(action)) throw new Error('CAD 操作参数无效。');
  const next = { ...structuredClone(state) };
  switch (action.type) {
    case 'cad.set_view':
      return { state: { ...next, activeView: action.view, cameraView: null }, message: `已切换到${{ iso: '立体', front: '正面', top: '顶部' }[action.view]}视角。` };
    case 'cad.set_rotation':
      return { state: { ...next, autoRotate: action.enabled }, message: action.enabled ? '已开启自动旋转。' : '已停止自动旋转。' };
    case 'cad.set_clip':
      return { state: { ...next, clipping: action.enabled, clipAxis: action.axis, clipOffset: action.offset }, message: action.enabled ? `已应用 ${action.axis.toUpperCase()} 轴显示剖切。` : '已关闭显示剖切。' };
    case 'cad.set_opacity':
      return { state: { ...next, globalOpacity: action.opacity }, message: `已将整体不透明度设为 ${Math.round(action.opacity * 100)}%。` };
    case 'cad.select_parts': {
      if (options.anonymous) throw new Error('当前总装只有匿名可视化根，尚无公开部件映射，无法选择、隔离或隐藏部件。');
      if (action.partIds.some(id => !options.partIds.has(id))) throw new Error('请求包含当前已加载模型中不存在的公开部件 ID。');
      const ids = new Set(action.partIds);
      if (action.mode === 'hide') {
        next.hiddenPartIds = [...new Set([...next.hiddenPartIds, ...ids])].sort();
        next.selectedPartIds = next.selectedPartIds.filter(id => !ids.has(id));
        next.isolatedPartIds = [];
      } else {
        next.selectedPartIds = [...ids].sort();
        next.hiddenPartIds = next.hiddenPartIds.filter(id => !ids.has(id));
        next.isolatedPartIds = action.mode === 'isolate' ? [...ids].sort() : [];
      }
      return { state: next, message: `已${{ select: '选择', isolate: '隔离显示', hide: '隐藏' }[action.mode]} ${ids.size} 个公开部件。` };
    }
    case 'cad.reset':
      return { state: { ...next, ...options.defaults, activeView: 'iso', cameraView: null, autoRotate: false,
        wireframe: false, globalOpacity: 1, selectedOpacity: 1, selectedPartIds: [], hiddenPartIds: [],
        isolatedPartIds: [], partOpacities: {} }, message: '已恢复模型的初始显示状态。' };
  }
}

/** Preserve the UI's preset/custom representation separately from the live camera pose.
 * A display-only action must not turn a preset into a custom view, or undoing it
 * would invalidate the earlier preset action's undo snapshot. */
export function prepareCadSiteAction(
  state: Ehl2DiagnosticViewerState,
  action: CadViewerAction,
  options: CadActionOptions,
  camera: CadCameraView,
) {
  const before = structuredClone(state);
  return {
    ...resolveCadSiteAction(before, action, options),
    before,
    beforeCamera: structuredClone(camera),
    cameraOverride: action.type === 'cad.set_view' || action.type === 'cad.reset' ? undefined : structuredClone(camera),
  };
}

export { siteActionAbortError as cadActionAbortError, renderSiteActionFrame as renderCadActionFrame } from '../site-action-frame';
