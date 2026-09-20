import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { settleAskStrict, type AskAccess, type StrictAskSettlementRuntime } from '../app/api/ask/access.ts';
import { createNativeAgentHandler } from '../app/api/agent/native-runtime.ts';
import type { Principal } from '../db/accounts.ts';
import type { ProviderToolTurn } from '../app/api/ask/provider-tool-adapters.ts';

const access: AskAccess = { authenticated: true, userId: 'user_settlement', requestId: 'reservation_1', reserved: true, quotaPolicy: 'database-ledger-v1' };
const result = { status: 'succeeded' as const, inputTokens: 120, outputTokens: 30, provider: 'openai', model: 'test' };

test('strict settlement forwards exact identity and usage and waits for ledger confirmation', async () => {
  const settlements: Parameters<StrictAskSettlementRuntime['settleUsage']>[0][] = [];
  const audits: Parameters<StrictAskSettlementRuntime['audit']>[0][] = [];
  await settleAskStrict(access, result, { settleUsage: async input => { settlements.push(input); return true; }, audit: async input => { audits.push(input); } });
  assert.deepEqual(settlements, [{ userId: 'user_settlement', requestId: 'reservation_1', status: 'succeeded', inputTokens: 120, outputTokens: 30 }]);
  assert.equal(audits[0].outcome, 'success');
  assert.equal(audits[0].actorUserId, access.userId);
});

test('strict settlement rejects a false ledger outcome and preserves a thrown database error', async () => {
  const audits: string[] = [];
  await assert.rejects(settleAskStrict(access, result, { settleUsage: async () => false, audit: async input => { audits.push(input.outcome); } }), /not confirmed/);
  assert.deepEqual(audits, ['failure']);
  const databaseError = new Error('test database unavailable');
  await assert.rejects(settleAskStrict(access, result, { settleUsage: async () => { throw databaseError; }, audit: async () => assert.fail('no success audit after database failure') }), error => error === databaseError);
});

test('strict settlement rejects unreserved or anonymous access before touching the ledger', async () => {
  for (const invalid of [{ ...access, reserved: false }, { ...access, authenticated: false }, { ...access, userId: null }, { ...access, quotaPolicy: 'anonymous-retrieval-only' as const }]) {
    await assert.rejects(settleAskStrict(invalid, result, { settleUsage: async () => { assert.fail('no ledger access'); }, audit: async () => assert.fail('no audit access') }), /authenticated reservation/);
  }
});

test('native runtime with the real strict helper suppresses tools and closes runs on ledger false or error', async () => {
  const context = { path: '/', pageInstanceId: 'page-1', revision: 1, capabilities: ['site.read_context'] };
  const principal = { user: { id: access.userId, status: 'active' } } as Principal;
  const toolResult = { outputText: '', inputTokens: 120, outputTokens: 30,
    toolCalls: [{ id: 'call_1', name: 'site__read_context', arguments: {} }],
    state: { protocol: 'openai-responses', transcript: [] } } satisfies ProviderToolTurn;
  const request = (body: object) => new Request('https://workspace.example/api/agent/native', { method: 'POST', headers: { Origin: 'https://workspace.example', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  for (const failsByThrowing of [false, true]) {
    let modelCalls = 0;
    let ledgerCalls = 0;
    const handle = createNativeAgentHandler({
      env: () => ({ FUSIONDIGITAL_IDENTITY_TRUST_PROFILE: 'sites-siwc' }), principal: async () => principal,
      resolve: async () => ({ status: 'selected', provider: { id: 'openai', label: 'OpenAI', model: 'test', available: true, protocol: 'openai-responses', endpoint: 'https://api.openai.com/v1/responses', apiKey: 'test-only-not-sent' } }),
      authorize: async () => access,
      settle: (reservation, usage) => settleAskStrict(reservation, usage, { settleUsage: async () => { ledgerCalls++; if (failsByThrowing) throw new Error('private ledger diagnostic'); return false; }, audit: async () => undefined }),
      requestProvider: async () => { modelCalls++; return toolResult; },
    });
    const response = await handle(request({ intent: 'start', question: 'Read this page', context }));
    const payload = await response.json();
    assert.equal(payload.status, 'failed');
    assert.equal(payload.error.code, 'usage_settlement_failed');
    assert.equal(payload.toolCall, undefined);
    assert.equal(JSON.stringify(payload).includes('private ledger'), false);
    assert.equal(modelCalls, 1);
    assert.equal(ledgerCalls, 2, 'successful-turn settlement and failure cleanup both go through the strict helper');
    assert.equal((await handle(request({ intent: 'continue', runId: payload.runId, context, receipts: [] }))).status, 404);
    assert.equal(modelCalls, 1, 'a failed run cannot start another model turn');
  }
});

test('the production native default uses strict settlement while legacy answer settlement stays available', async () => {
  const source = await readFile(new URL('../app/api/agent/native-runtime.ts', import.meta.url), 'utf8');
  assert.match(source, /settle: async \(access, input\) => \(await import\('@\/app\/api\/ask\/access'\)\)\.settleAskStrict\(access, input\)/);
  const { settleAsk } = await import('../app/api/ask/access.ts');
  await assert.doesNotReject(settleAsk({ ...access, reserved: false }, result));
});
