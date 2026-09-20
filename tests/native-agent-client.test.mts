import assert from 'node:assert/strict';
import test from 'node:test';
import { runNativeTask } from '../app/agent/native-client.ts';
import type { NativeAgentRequest, NativeAgentResponse } from '../app/agent/native-contracts.ts';
import type { SiteActionContext, SiteActionReceipt } from '../app/agent/site-actions.ts';

const snapshot = (revision = 1): SiteActionContext => ({ path: '/', pageInstanceId: 'page-0', revision,
  capabilities: ['site.read_context', 'site.navigate', 'site.undo'] });
const response = (extra: Partial<NativeAgentResponse> = {}): NativeAgentResponse => ({ runId: 'run-1', status: 'completed', round: 2,
  maxRounds: 12, answer: 'Done', provider: 'openai', model: 'fixture-model', ...extra });

test('native loop sends a fresh observation and actual result into the next model turn', async () => {
  let current = snapshot();
  const requests: NativeAgentRequest[] = [];
  let executed = 0;
  const result = await runNativeTask({ question: 'Inspect this page', locale: 'en', signal: new AbortController().signal,
    onEvent: () => {}, runtime: { getContext: () => current,
      execute: async (plan, options) => { executed++; current = snapshot(2);
        return [{ actionId: `${options.runId}-0`, type: plan.actions[0].type, status: 'applied', message: 'Current state', path: '/' }]; } },
    request: async body => { requests.push(body);
      if (body.intent === 'start') return response({ status: 'awaiting_tool', round: 1, expectedContext: current,
        toolCall: { id: 'call-1', name: 'site_read_context', action: { type: 'site.read_context' } } });
      assert.equal(body.intent, 'continue');
      if (body.intent === 'continue') { assert.equal(body.context.revision, 2); assert.equal(body.receipts[0].status, 'applied'); }
      return response();
    } });
  assert.equal(result.status, 'completed');
  assert.equal(executed, 1);
  assert.deepEqual(requests.map(item => item.intent), ['start', 'continue']);
});

test('manual navigation while the model responds stops before applying its tool', async () => {
  let current = snapshot(); let executed = false; let cancelled = false;
  await assert.rejects(runNativeTask({ question: 'Open data', locale: 'en', signal: new AbortController().signal, onEvent: () => {},
    runtime: { getContext: () => current, execute: async () => { executed = true; return []; } },
    request: async body => {
      if (body.intent === 'cancel') { cancelled = true; return response({ status: 'cancelled' }); }
      current = { ...snapshot(2), pageInstanceId: 'page-1', path: '/search' };
      return response({ status: 'awaiting_tool', round: 1, expectedContext: snapshot(1),
        toolCall: { id: 'call-1', name: 'site_navigate', action: { type: 'site.navigate', path: '/fusion-data' } } });
    } }), /page changed/);
  assert.equal(executed, false); assert.equal(cancelled, true);
});

test('cancellation during a model request cannot dispatch a late tool call', async () => {
  const controller = new AbortController(); let executed = false;
  await assert.rejects(runNativeTask({ question: 'Open data', locale: 'en', signal: controller.signal, onEvent: () => {},
    runtime: { getContext: snapshot, execute: async () => { executed = true; return []; } },
    request: async body => {
      if (body.intent === 'cancel') return response({ status: 'cancelled' });
      controller.abort();
      return response({ status: 'awaiting_tool', round: 1, expectedContext: snapshot(),
        toolCall: { id: 'call-1', name: 'site_navigate', action: { type: 'site.navigate', path: '/fusion-data' } } });
    } }), { name: 'AbortError' });
  assert.equal(executed, false);
});

test('deferred page rendering rejects an obsolete call and replans using the new observation', async () => {
  let current = snapshot(); let executed = false;
  const result = await runNativeTask({ question: 'Inspect the page', locale: 'en', signal: new AbortController().signal, onEvent: () => {},
    runtime: { getContext: () => current, execute: async () => { executed = true; return []; } },
    request: async body => {
      if (body.intent === 'start') {
        current = snapshot(2);
        return response({ status: 'awaiting_tool', round: 1, expectedContext: snapshot(1),
          toolCall: { id: 'call-1', name: 'site_read_context', action: { type: 'site.read_context' } } });
      }
      assert.equal(body.intent, 'continue');
      if (body.intent === 'continue') { assert.equal(body.receipts[0].status, 'rejected'); assert.equal(body.context.revision, 2); }
      return response({ answer: 'The current page is ready.' });
    } });
  assert.equal(executed, false); assert.equal(result.status, 'completed');
});

test('a repeated native tool id cannot replay a browser action', async () => {
  let executed = 0;
  await assert.rejects(runNativeTask({ question: 'Inspect this page', locale: 'en', signal: new AbortController().signal, onEvent: () => {},
    runtime: { getContext: snapshot, execute: async (plan, options) => { executed++;
      return [{ actionId: `${options.runId}-0`, type: plan.actions[0].type, status: 'applied', message: 'Read', path: '/' }]; } },
    request: async body => body.intent === 'cancel' ? response({ status: 'cancelled' }) : response({ status: 'awaiting_tool',
      round: body.intent === 'start' ? 1 : 2, expectedContext: snapshot(),
      toolCall: { id: 'call-1', name: 'site_read_context', action: { type: 'site.read_context' } } }),
  }), /repeated tool/);
  assert.equal(executed, 1);
});

test('rejected page actions are returned as failures for the model to assess', async () => {
  const rejected: SiteActionReceipt = { actionId: 'call-1-0', type: 'site.undo', status: 'rejected', message: 'Nothing to undo', path: '/' };
  const result = await runNativeTask({ question: 'Undo', locale: 'en', signal: new AbortController().signal, onEvent: () => {},
    runtime: { getContext: snapshot, execute: async () => [rejected] }, request: async body => {
      if (body.intent === 'start') return response({ status: 'awaiting_tool', round: 1, expectedContext: snapshot(),
        toolCall: { id: 'call-1', name: 'site_undo', action: { type: 'site.undo' } } });
      assert.equal(body.intent, 'continue');
      if (body.intent === 'continue') assert.deepEqual(body.receipts, [rejected]);
      return response({ answer: 'There was nothing to undo.' });
    } });
  assert.match(result.answer, /nothing to undo/);
});

test('transport failure after a tool result does not retry the mutation', async () => {
  let executed = 0;
  await assert.rejects(runNativeTask({ question: 'Inspect', locale: 'en', signal: new AbortController().signal, onEvent: () => {},
    runtime: { getContext: snapshot, execute: async () => { executed++;
      return [{ actionId: 'call-1-0', type: 'site.read_context', status: 'applied', message: 'Read', path: '/' }]; } },
    request: async body => {
      if (body.intent === 'start') return response({ status: 'awaiting_tool', round: 1, expectedContext: snapshot(),
        toolCall: { id: 'call-1', name: 'site_read_context', action: { type: 'site.read_context' } } });
      if (body.intent === 'cancel') return response({ status: 'cancelled' });
      throw new Error('Connection lost');
    } }), /Connection lost/);
  assert.equal(executed, 1);
});
