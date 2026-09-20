import assert from 'node:assert/strict';
import test from 'node:test';
import { SITE_ROUTES, type SiteActionContext, type SiteActionPlan } from '../app/agent/site-actions.ts';
import { planSiteActions, validateSiteActionPlanForContext } from '../app/agent/site-action-planner.ts';

const context: SiteActionContext = {
  path: '/digital-prototype', pageInstanceId: 'planner-test-page', revision: 7,
  capabilities: ['site.navigate', 'site.search', 'site.read_context', 'site.undo', 'cad.open', 'cad.set_view', 'cad.set_rotation', 'cad.set_clip', 'cad.set_opacity', 'cad.select_parts', 'cad.reset', 'data.select_shot', 'data.select_signals'],
  viewer: { viewerId: 'viewer-test', deviceId: 'exl-50u-2026-upgrade', ready: true, parts: [{ id: 'pf1', label: 'PF1' }, { id: 'pf2', label: 'PF2' }, { id: 'vessel', label: '真空室' }], selectedPartIds: [], view: 'iso' },
  data: { shotIds: ['21066', '21067'], selectedShotId: '21066', signalIds: ['ip', 'ne'], selectedSignalIds: ['ip'] },
};

test('explicit Chinese navigation covers all registered site pages and context/undo actions', () => {
  for (const [path, labels] of Object.entries(SITE_ROUTES)) {
    const result = planSiteActions(`打开${labels[0]}页面`, context);
    assert.equal(result.status, 'planned', labels[0]);
    assert.deepEqual(result.plan.actions, [{ type: 'site.navigate', path }]);
  }
  assert.deepEqual(planSiteActions('请读取当前页面', context).plan.actions, [{ type: 'site.read_context' }]);
  assert.deepEqual(planSiteActions('撤销上一步', context).plan.actions, [{ type: 'site.undo' }]);
});

test('CAD model aliases preserve full-assembly and simplified identities and allow open then view', () => {
  const models = [
    ['EXL-50U总装', 'exl50u-general-assembly-20260630'], ['EXL50U简化模型', 'exl-50u-2026-upgrade'],
    ['ITER', 'iter-educational-model'], ['Paramak', 'paramak-full-device'], ['EHL-2', 'ehl-2-preliminary'],
  ];
  for (const [label, deviceId] of models) assert.deepEqual(planSiteActions(`打开${label}`, context).plan.actions, [{ type: 'cad.open', deviceId }]);
  const home: SiteActionContext = { path: '/', pageInstanceId: 'home', revision: 0, capabilities: ['site.navigate', 'cad.open'] };
  assert.deepEqual(planSiteActions('请帮我打开EXL-50U总装并切换到俯视', home).plan.actions, [
    { type: 'cad.open', deviceId: 'exl50u-general-assembly-20260630' }, { type: 'cad.set_view', view: 'top' },
  ]);
  assert.equal(planSiteActions('切换到俯视', home).status, 'unsupported');
});

test('camera, rotation, clip and opacity commands use bounded and explicit display meanings', () => {
  assert.deepEqual(planSiteActions('切换到正视', context).plan.actions, [{ type: 'cad.set_view', view: 'front' }]);
  assert.deepEqual(planSiteActions('开启自动旋转，然后停止旋转', context).plan.actions, [{ type: 'cad.set_rotation', enabled: true }, { type: 'cad.set_rotation', enabled: false }]);
  assert.deepEqual(planSiteActions('沿Z轴剖切偏移0.25', context).plan.actions, [{ type: 'cad.set_clip', enabled: true, axis: 'z', offset: 0.25 }]);
  assert.deepEqual(planSiteActions('关闭剖切', context).plan.actions, [{ type: 'cad.set_clip', enabled: false, axis: 'x', offset: 0 }]);
  assert.deepEqual(planSiteActions('透明度设为30%', context).plan.actions, [{ type: 'cad.set_opacity', opacity: 0.7 }]);
  assert.deepEqual(planSiteActions('不透明度设为30%', context).plan.actions, [{ type: 'cad.set_opacity', opacity: 0.3 }]);
  for (const text of ['透明度设为100%', '沿X轴剖切偏移2']) assert.equal(planSiteActions(text, context).status, 'unsupported');
});

test('part and data selection resolves exact current IDs and does not reuse stale selection catalogs', () => {
  assert.deepEqual(planSiteActions('仅显示真空室', context).plan.actions, [{ type: 'cad.select_parts', partIds: ['vessel'], mode: 'isolate' }]);
  assert.deepEqual(planSiteActions('选择PF1、PF2', context).plan.actions, [{ type: 'cad.select_parts', partIds: ['pf1', 'pf2'], mode: 'select' }]);
  assert.deepEqual(planSiteActions('隐藏PF1', context).plan.actions, [{ type: 'cad.select_parts', partIds: ['pf1'], mode: 'hide' }]);
  assert.deepEqual(planSiteActions('选择信号ip,ne', context).plan.actions, [{ type: 'data.select_signals', signalIds: ['ip', 'ne'] }]);
  assert.deepEqual(planSiteActions('切换到炮号21067', context).plan.actions, [{ type: 'data.select_shot', shotId: '21067' }]);
  for (const text of ['打开ITER并隐藏PF1', '切换到炮号21067然后选择信号ip']) assert.equal(planSiteActions(text, context).status, 'unsupported');
  const duplicateLabels = { ...context, viewer: { ...context.viewer!, parts: [{ id: 'a', label: 'PF1' }, { id: 'b', label: 'PF1' }] } };
  assert.equal(planSiteActions('隐藏PF1', duplicateLabels).plan.actions.length, 0);
});

test('questions, negations, unsupported explosion and angle requests never become partial actions', () => {
  for (const text of ['不要打开总装', '请勿隐藏PF1', '打开总装但不要旋转', '能打开总装吗', '如何切换到俯视', '打开总装后会怎样', '请打开总装？']) {
    assert.equal(planSiteActions(text, context).status, 'not-command', text);
    assert.deepEqual(planSiteActions(text, context).plan.actions, [], text);
  }
  for (const text of ['打开总装并爆炸', '旋转90度', '执行代码alert(1)', '打开https://example.com']) {
    assert.equal(planSiteActions(text, context).status, 'unsupported', text);
    assert.deepEqual(planSiteActions(text, context).plan.actions, [], text);
  }
  assert.deepEqual(planSiteActions('打开总装并做点别的', context).plan.actions, []);
});

test('explicit search terms remain query data rather than embedded UI commands', () => {
  assert.deepEqual(planSiteActions('搜索 托卡马克控制', context).plan.actions, [{ type: 'site.search', query: '托卡马克控制' }]);
  assert.deepEqual(planSiteActions('搜索“不要打开总装”', context).plan.actions, [{ type: 'site.search', query: '不要打开总装' }]);
  assert.deepEqual(planSiteActions('不要搜索总装', context).plan.actions, []);
});

test('English UI commands cover navigation, search, context, CAD, shot and signal controls', () => {
  assert.deepEqual(planSiteActions('Open digital prototype', context).plan.actions, [{ type: 'site.navigate', path: '/digital-prototype' }]);
  assert.deepEqual(planSiteActions('Open fusion data', context).plan.actions, [{ type: 'site.navigate', path: '/fusion-data' }]);
  assert.deepEqual(planSiteActions('Search EXL-50U', context).plan.actions, [{ type: 'site.search', query: 'EXL-50U' }]);
  assert.deepEqual(planSiteActions('Read current page', context).plan.actions, [{ type: 'site.read_context' }]);
  assert.deepEqual(planSiteActions('Please open EXL-50U full assembly and set view to top', context).plan.actions, [
    { type: 'cad.open', deviceId: 'exl50u-general-assembly-20260630' }, { type: 'cad.set_view', view: 'top' },
  ]);
  assert.deepEqual(planSiteActions('Stop rotation', context).plan.actions, [{ type: 'cad.set_rotation', enabled: false }]);
  assert.deepEqual(planSiteActions('Reset', context).plan.actions, [{ type: 'cad.reset' }]);
  assert.deepEqual(planSiteActions('Undo', context).plan.actions, [{ type: 'site.undo' }]);
  assert.deepEqual(planSiteActions('Select shot 21067', context).plan.actions, [{ type: 'data.select_shot', shotId: '21067' }]);
  assert.deepEqual(planSiteActions('Select signals ip and ne', context).plan.actions, [{ type: 'data.select_signals', signalIds: ['ip', 'ne'] }]);
  assert.deepEqual(planSiteActions('Hide part PF1', context).plan.actions, [{ type: 'cad.select_parts', partIds: ['pf1'], mode: 'hide' }]);
  for (const text of ['Do not open the model', "Don't open ITER", 'Can you open ITER', 'Tell me how to open ITER', 'Open ITER?', 'Never hide PF1']) {
    assert.equal(planSiteActions(text, context).status, 'not-command', text);
    assert.deepEqual(planSiteActions(text, context).plan.actions, []);
  }
});

test('model plans face the same ID, capability, argument and catalog validation as local plans', () => {
  const bad: unknown[] = [
    { version: 1, actions: [{ type: 'site.navigate', path: '//evil.example' }] },
    { version: 1, actions: [{ type: 'cad.open', deviceId: 'private-model' }] },
    { version: 1, actions: [{ type: 'cad.set_view', view: 'top', script: 'alert(1)' }] },
    { version: 1, actions: [{ type: 'cad.select_parts', partIds: ['invented'], mode: 'hide' }] },
    { version: 1, actions: [{ type: 'data.select_shot', shotId: '99999' }] },
    { version: 1, actions: [{ type: 'data.select_signals', signalIds: ['secret'] }] },
    { version: 1, actions: Array.from({ length: 7 }, () => ({ type: 'site.read_context' })) },
  ];
  for (const plan of bad) assert.equal(validateSiteActionPlanForContext(plan, context), false);
  const plan: SiteActionPlan = { version: 1, actions: [{ type: 'cad.set_view', view: 'top' }] };
  assert.equal(validateSiteActionPlanForContext(plan, { ...context, capabilities: [] }), false);
  assert.equal(validateSiteActionPlanForContext(plan, { ...context, viewer: { ...context.viewer!, ready: false } }), false);
});
