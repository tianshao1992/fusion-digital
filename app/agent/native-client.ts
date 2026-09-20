import type { NativeAgentRequest, NativeAgentResponse } from './native-contracts';
import { isSiteAction, normalizeSiteActionContext, type SiteActionContext, type SiteActionReceipt } from './site-actions';
import type { SiteActionRuntime } from './site-action-runtime';

export type NativeTaskEvent =
  | { phase: 'thinking'; round: number }
  | { phase: 'executing'; response: NativeAgentResponse }
  | { phase: 'observed'; receipt: SiteActionReceipt; context: SiteActionContext }
  | { phase: 'finished'; response: NativeAgentResponse };

export async function nativeAgentRequest(body: NativeAgentRequest, signal?: AbortSignal): Promise<NativeAgentResponse> {
  const response = await fetch('/api/agent/native', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), signal,
  });
  const raw = await response.text();
  if (raw.length > 100_000) throw new Error('Agent response exceeded the limit. / 智能体响应超过限制。');
  let result: NativeAgentResponse;
  try { result = JSON.parse(raw); } catch { throw new Error('Agent service unavailable. / 智能体服务暂不可用。'); }
  if (!response.ok) throw new Error(result.error?.message || 'Agent connection failed. / 模型连接失败。');
  if (!result || typeof result.runId !== 'string' || !result.runId || !Number.isInteger(result.round)
    || result.round < 0 || result.round > 12 || !['awaiting_tool', 'completed', 'failed', 'cancelled'].includes(result.status)
    || typeof result.answer !== 'string' || typeof result.provider !== 'string' || typeof result.model !== 'string') {
    throw new Error('Invalid agent response. / 智能体响应格式无效。');
  }
  return result;
}

/** Every model turn receives a fresh observation after the previous real tool result. */
export async function runNativeTask(input: {
  question: string; locale: 'zh' | 'en'; provider?: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
  runtime: Pick<SiteActionRuntime, 'getContext' | 'execute'>;
  signal: AbortSignal;
  onEvent: (event: NativeTaskEvent) => void;
  request?: typeof nativeAgentRequest;
}): Promise<NativeAgentResponse> {
  const request = input.request ?? nativeAgentRequest;
  let body: NativeAgentRequest = { intent: 'start', question: input.question, locale: input.locale,
    ...(input.provider ? { provider: input.provider } : {}), history: input.history, context: input.runtime.getContext() };
  let runId: string | undefined;
  let terminal = false;
  let previousRound = 0;
  const executed = new Set<string>();
  const ensureActive = () => { if (input.signal.aborted) throw new DOMException('Stopped', 'AbortError'); };
  try {
    for (let iteration = 0; iteration <= 12; iteration += 1) {
      ensureActive();
      input.onEvent({ phase: 'thinking', round: iteration + 1 });
      const result = await request(body, input.signal);
      if (runId && result.runId !== runId) throw new Error('Agent task identity changed. / 智能体任务身份已变化。');
      runId = result.runId;
      ensureActive();
      if (result.status !== 'awaiting_tool') {
        terminal = true;
        input.onEvent({ phase: 'finished', response: result });
        return result;
      }
      const call = result.toolCall;
      const expected = normalizeSiteActionContext(result.expectedContext);
      if (!call || typeof call.id !== 'string' || !/^[\w-]{1,160}$/.test(call.id) || !isSiteAction(call.action)
        || !expected || result.round <= previousRound || executed.has(call.id)) {
        throw new Error('Invalid or repeated tool call. / 工具调用无效或重复。');
      }
      const observed = 'context' in body ? body.context : null;
      const current = input.runtime.getContext();
      if (!observed || expected.pageInstanceId !== observed.pageInstanceId || expected.revision !== observed.revision
        || current.pageInstanceId !== expected.pageInstanceId) {
        throw new Error(input.locale === 'en' ? 'The page changed while the model was planning. Start a new task from the current page.' : '模型规划期间页面或选择已改变。请基于当前页面重新发起任务。');
      }
      previousRound = result.round;
      executed.add(call.id);
      if (current.revision !== expected.revision) {
        // Loading and deferred rendering can change a page without a user action.
        // Reject the obsolete call and let the model observe the new controls.
        const receipt: SiteActionReceipt = { actionId: `${call.id}-0`, type: call.action.type, status: 'rejected', path: current.path,
          message: input.locale === 'en' ? 'Page state changed; this tool was not executed. Observe the latest state and plan again.' : '页面状态已更新，此工具未执行；将依据最新页面重新规划。' };
        input.onEvent({ phase: 'observed', receipt, context: current });
        body = { intent: 'continue', runId, receipts: [receipt], context: current };
        continue;
      }
      input.onEvent({ phase: 'executing', response: result });
      const receipts = await input.runtime.execute({ version: 1, actions: [call.action] }, {
        runId: call.id, expected, signal: input.signal,
        onReceipt: receipt => input.onEvent({ phase: 'observed', receipt, context: input.runtime.getContext() }),
      });
      ensureActive();
      if (receipts.length !== 1 || receipts[0].actionId !== `${call.id}-0` || receipts[0].type !== call.action.type) {
        throw new Error('Missing tool result. / 未收到完整工具执行结果。');
      }
      body = { intent: 'continue', runId, receipts, context: input.runtime.getContext() };
    }
    throw new Error('Task step limit reached. / 已达到本轮任务步数上限。');
  } finally {
    if (runId && !terminal) {
      // Never retry a browser mutation. Cancellation only closes the server-side task.
      await request({ intent: 'cancel', runId }, AbortSignal.timeout(3_000)).catch(() => undefined);
    }
  }
}
