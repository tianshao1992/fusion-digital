'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AgentCompletedMessage, AgentStreamEvent } from '@/app/agent/contracts';
import type { CanvasArtifactInput } from '@/app/agent/local-canvas';
import { AgentEventStreamParser } from '@/app/agent/sse';
import { useI18n } from '@/app/i18n';
import { isPublicAnonymousMode } from '@/app/deployment-mode';
import { useSiteOperations } from '@/app/components/agent-workspace/SiteOperations';
import type { SiteActionReceipt } from '@/app/agent/site-actions';
import type { SearchHit } from '@/app/search/search-core';
import {
  CHAT_LIMITS,
  KNOWLEDGE_CHAT_STORAGE_KEY,
  compactConversation,
  deserializeConversation,
  endOperationForLocaleChange,
  historyForRequest,
  knowledgeChatStorageKey,
  newTurnId,
  serializeConversation,
  type ChatProviderId,
  type ChatTurn,
  type ActiveOperationTurn,
} from './conversation';
import './knowledge-chat.css';
import './knowledge-chat-streaming.css';
import './provider-selector.css';

type ProviderOption = { id: ChatProviderId; label: string; model: string; available: boolean; source?: 'personal' | 'platform' | 'none' };
type ProviderEnvelope = { authenticated?: boolean; defaultProvider: ChatProviderId | 'retrieval' | null; providers: ProviderOption[] };
type ProviderSelection = ChatProviderId | 'retrieval' | 'auto';

export type KnowledgeChatContext = {
  path: string;
  title: string;
  domain?: string;
  focusId?: string;
  focusLabel?: string;
  focusDescription?: string;
};

export type KnowledgeChatFilters = {
  domain?: string;
  type?: string;
  device?: string;
  citedOnly?: boolean;
};

type KnowledgeChatProps = {
  context: KnowledgeChatContext;
  presentation?: 'inline' | 'dock';
  filters?: KnowledgeChatFilters;
  title?: string;
  titleEn?: string;
  eyebrow?: string;
  prompts?: string[];
  draft?: string;
  onDraftChange?: (value: string) => void;
  onEvidenceResults?: (results: SearchHit[]) => void;
  showContext?: boolean;
  onCanvasArtifact?: (artifact: CanvasArtifactInput) => void;
  onBusyChange?: (busy: boolean) => void;
};

export default function KnowledgeChat({
  context,
  presentation = 'inline',
  filters,
  title,
  titleEn,
  eyebrow,
  prompts,
  draft,
  onDraftChange,
  onEvidenceResults,
  showContext = true,
  onCanvasArtifact,
  onBusyChange,
}: KnowledgeChatProps) {
  const headingId = useId();
  const publicAnonymousMode = isPublicAnonymousMode();
  const { locale, t } = useI18n();
  const operations = useSiteOperations();
  const [dialogueMode, setDialogueMode] = useState<'operate' | 'ask'>(presentation === 'dock' ? 'operate' : 'ask');
  const operationTurnRef = useRef<string | null>(null);
  const activeOperationRef = useRef<ActiveOperationTurn | null>(null);
  const conversationEpochRef = useRef(0);
  const loadedConversationLocaleRef = useRef<typeof locale | null>(null);
  const [localDraft, setLocalDraft] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => { onBusyChange?.(pending); }, [pending, onBusyChange]);
  const [streamedAnswer, setStreamedAnswer] = useState('');
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ProviderSelection>(publicAnonymousMode ? 'retrieval' : 'auto');
  const [automaticProviderId, setAutomaticProviderId] = useState<ChatProviderId | null>(null);
  const [providersLoaded, setProvidersLoaded] = useState(publicAnonymousMode);
  const [authenticated, setAuthenticated] = useState<boolean | null>(publicAnonymousMode ? false : null);
  const [providerPreferencesEnabled, setProviderPreferencesEnabled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const storageReadyRef = useRef(false);
  const currentDraft = draft ?? localDraft;
  const setDraft = onDraftChange ?? setLocalDraft;

  useEffect(() => {
    let cancelled = false;
    const previousLocale = loadedConversationLocaleRef.current;
    storageReadyRef.current = false;
    loadedConversationLocaleRef.current = null;
    conversationEpochRef.current += 1;
    // Revoke ownership before abort dispatches any completion callbacks.
    const controller = abortRef.current;
    abortRef.current = null;
    controller?.abort();
    const leavingOperation = activeOperationRef.current;
    activeOperationRef.current = null;
    operationTurnRef.current = null;
    if (previousLocale && previousLocale !== locale) {
      try {
        const previousKey = knowledgeChatStorageKey(previousLocale);
        window.localStorage.setItem(previousKey, serializeConversation(endOperationForLocaleChange(turns, leavingOperation, previousLocale)));
        if (conversationId) window.localStorage.setItem(`${previousKey}.id`, conversationId);
      } catch { /* A blocked storage area must not move this history into another language. */ }
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setPending(false);
      setStreamedAnswer('');
      setError('');
      setRestored(false);
      setTurns([]);
      try {
        const storageKey = knowledgeChatStorageKey(locale);
        const legacyKey = locale === 'zh-CN' ? KNOWLEDGE_CHAT_STORAGE_KEY : '';
        setTurns(deserializeConversation(window.localStorage.getItem(storageKey) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null)));
        const storedId = window.localStorage.getItem(`${storageKey}.id`) ?? (legacyKey ? window.localStorage.getItem(`${legacyKey}.id`) : null);
        setConversationId(storedId || newTurnId());
      } catch {
        setConversationId(newTurnId());
      }
      loadedConversationLocaleRef.current = locale;
      storageReadyRef.current = true;
      setRestored(true);
    });
    return () => { cancelled = true; };
    // This boundary snapshots the departing render once; ordinary turn changes must not reload history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  useEffect(() => {
    if (publicAnonymousMode) return;
    const controller = new AbortController();
    void fetch('/api/ask/providers', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Unable to load model providers');
      return response.json() as Promise<ProviderEnvelope>;
    }).then((payload) => {
      const safeProviders = Array.isArray(payload.providers)
        ? payload.providers.filter((provider) => provider && typeof provider.id === 'string' && typeof provider.label === 'string' && typeof provider.model === 'string')
        : [];
      setProviders(safeProviders);
      setAuthenticated(payload.authenticated === true);
      setProviderPreferencesEnabled(payload.authenticated === true);
      const explicitRetrieval = payload.defaultProvider === 'retrieval';
      const defaultAvailable = !explicitRetrieval
        ? safeProviders.find((provider) => provider.id === payload.defaultProvider && provider.available)
        : undefined;
      const automaticProvider = explicitRetrieval ? undefined : (defaultAvailable ?? safeProviders.find((provider) => provider.available));
      setAutomaticProviderId(automaticProvider?.id ?? null);
      setSelectedProvider(automaticProvider ? 'auto' : 'retrieval');
    }).catch((reason) => {
      if ((reason as Error).name !== 'AbortError') setSelectedProvider('retrieval');
    }).finally(() => {
      if (!controller.signal.aborted) setProvidersLoaded(true);
    });
    return () => controller.abort();
  }, [publicAnonymousMode]);

  useEffect(() => {
    if (!restored || !storageReadyRef.current || loadedConversationLocaleRef.current !== locale) return;
    try {
      const storageKey = knowledgeChatStorageKey(locale);
      window.localStorage.setItem(storageKey, serializeConversation(turns));
      if (conversationId) window.localStorage.setItem(`${storageKey}.id`, conversationId);
    } catch {
      // Conversation remains available for this page session when storage is blocked.
    }
  }, [conversationId, locale, restored, turns]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [pending, turns]);

  useEffect(() => () => {
    const controller = abortRef.current;
    controller?.abort();
    if (abortRef.current === controller) abortRef.current = null;
  }, []);

  const signInHref = useMemo(
    () => `/signin-with-chatgpt?return_to=${encodeURIComponent(context.path || '/knowledge-graph')}`,
    [context.path],
  );
  const activePrompts = dialogueMode === 'operate'
    ? (locale === 'en' ? ['Open digital prototype', 'Open fusion data', 'Search EXL-50U', 'Read current page'] : ['打开数字样机', '打开聚变数据', '搜索 EXL-50U', '读取当前页面'])
    : prompts && (locale === 'zh-CN' || prompts.every((prompt) => !/[\u3400-\u9fff]/u.test(prompt)))
    ? prompts
    : [t('chat.promptEvidence'), t('chat.promptCompare'), t('chat.promptGaps')];
  const activeTitle = locale === 'en' ? (titleEn || t('chat.defaultTitle')) : (title || t('chat.defaultTitle'));
  const activeProvider = providers.find((provider) => provider.id === (selectedProvider === 'auto' ? automaticProviderId : selectedProvider));
  const signInRequired = !publicAnonymousMode && providersLoaded && authenticated === false;

  function selectProvider(value: ProviderSelection) {
    setSelectedProvider(value);
    if (!providerPreferencesEnabled || value === 'auto') return;
    void fetch('/api/account/llm-credentials', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ defaultProvider: value }),
    }).catch(() => { /* The in-page selection remains usable if preference persistence is unavailable. */ });
  }

  async function submit(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const question = (suggested ?? currentDraft).normalize('NFKC').trim().slice(0, CHAT_LIMITS.maxUserChars);
    const activeController = abortRef.current;
    if (question.length < 2 || (activeController && !activeController.signal.aborted)) return;
    activeController?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const ownsRequest = () => abortRef.current === controller;
    const requestEpoch = conversationEpochRef.current;
    const history = historyForRequest(turns);
    const currentOperationContext = dialogueMode === 'operate' ? operations?.getContext() : undefined;
    // Legacy shortcuts use semantic state only; full page observations belong to native tasks.
    const actionContext = currentOperationContext ? { ...currentOperationContext, page: undefined } : undefined;
    const userTurn: ChatTurn = { id: newTurnId(), role: 'user', content: question, createdAt: new Date().toISOString() };
    setTurns((current) => compactConversation([...current, userTurn]));
    setDraft('');
    if (ownsRequest()) {
      setPending(true);
      setStreamedAnswer('');
      setError('');
    }
    try {
      const response = await fetch('/api/agent/turns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-FusionDigital-Locale': locale },
        body: JSON.stringify({
          question,
          locale,
          history,
          context,
          filters: { ...filters, citedOnly: true },
          conversationId,
          ...(dialogueMode === 'operate' ? { mode: 'operate', actionContext } : {}),
          ...(selectedProvider === 'auto' ? {} : { provider: selectedProvider }),
        }),
        signal: controller.signal,
      });
      const payload = await readAgentTurnStream(response, controller.signal, (delta) => {
        if (ownsRequest()) {
          setStreamedAnswer((current) => `${current}${delta}`.slice(0, CHAT_LIMITS.maxAssistantChars));
        }
      });
      if (!ownsRequest()) return;
      if (dialogueMode === 'operate' && payload.actionPlan?.actions.length) {
        if (!operations || !actionContext) throw new Error(locale === 'en' ? 'This page cannot execute site operations.' : '当前页面未连接操作执行器。');
        const operationTurnId = newTurnId();
        operationTurnRef.current = operationTurnId;
        const operationTurn: ChatTurn = { id: operationTurnId, role: 'assistant', mode: 'site-operation',
          content: locale === 'en' ? 'Executing website operations…' : '正在执行网站操作…', createdAt: new Date().toISOString(), provider: payload.provider, model: payload.model };
        const activeOperation: ActiveOperationTurn = { turn: operationTurn, receipts: [] };
        activeOperationRef.current = activeOperation;
        setTurns(current => compactConversation([...current, operationTurn]));
        setStreamedAnswer(locale === 'en' ? 'Waiting for the page to apply changes…' : '正在等待页面应用操作…');
        const receipts = await operations.execute(payload.actionPlan, {
          runId: operationTurnId, expected: actionContext, signal: controller.signal,
          onReceipt: receipt => {
            if (conversationEpochRef.current !== requestEpoch) return;
            activeOperation.receipts.push(receipt);
            setTurns(current => conversationEpochRef.current !== requestEpoch ? current : compactConversation(current.map(turn => turn.id === operationTurnId ? {
              ...turn, content: locale === 'en' ? 'Website operation results' : '网站操作结果', actionReceipts: [...(turn.actionReceipts ?? []), receipt],
            } : turn)));
          },
        });
        if (!ownsRequest() || controller.signal.aborted) return;
        const success = receipts.length === payload.actionPlan.actions.length && receipts.every(receipt => receipt.status === 'applied');
        const summary = success ? (locale === 'en' ? 'Website operations completed.' : '网站操作已完成。') : (locale === 'en' ? 'Some operations were not completed. See the results below.' : '部分操作未完成，请查看下面的结果。');
        setTurns(current => compactConversation(current.map(turn => turn.id === operationTurnId ? { ...turn, content: summary, actionReceipts: receipts } : turn)));
        // Return actual browser receipts to the agent. This response is explanatory only and cannot execute another plan.
        try {
          const feedback = await fetch('/api/agent/turns', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-FusionDigital-Locale': locale },
            body: JSON.stringify({ question, locale, mode: 'operate', context, history, conversationId,
              actionContext: { ...operations.getContext(), page: undefined }, actionReceipts: receipts,
              ...(selectedProvider === 'auto' ? {} : { provider: selectedProvider }),
            }), signal: controller.signal,
          });
          const result = await readAgentTurnStream(feedback, controller.signal, () => {});
          if (ownsRequest() && !controller.signal.aborted && !result.actionPlan?.actions.length) {
            setTurns(current => compactConversation(current.map(turn => turn.id === operationTurnId ? { ...turn, content: result.answer, notice: result.notice } : turn)));
          }
        } catch { /* The real execution receipts remain available if the explanation service fails. */ }
        if (ownsRequest()) {
          operationTurnRef.current = null;
          activeOperationRef.current = null;
        }
        return;
      }
      if (!ownsRequest()) return;
      const assistantTurn: ChatTurn = {
        id: newTurnId(), role: 'assistant', content: payload.answer, createdAt: new Date().toISOString(),
        mode: payload.mode, citations: payload.citations, caveats: payload.caveats, notice: payload.notice,
        provider: payload.provider, model: payload.model,
      };
      setTurns((current) => compactConversation([...current, assistantTurn]));
      if (payload.conversationId) setConversationId(payload.conversationId);
      if (payload.results?.length) onEvidenceResults?.(payload.results);
      if (payload.canvas) onCanvasArtifact?.({
        ...payload.canvas,
        sourceTurnId: assistantTurn.id,
        citations: payload.citations,
      });
    } catch (reason) {
      if (ownsRequest() && (reason as Error).name !== 'AbortError') {
        setError(reason instanceof Error ? reason.message : (locale === 'en' ? 'The Q&A service is temporarily unavailable.' : '问答服务暂时不可用。'));
      }
    } finally {
      if (ownsRequest()) {
        abortRef.current = null;
        setPending(false);
        setStreamedAnswer('');
      }
    }
  }

  function stopActiveTurn() {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    if (abortRef.current !== controller) return;
    abortRef.current = null;
    operations?.cancel();
    const operationTurnId = operationTurnRef.current;
    if (operationTurnId) setTurns(current => compactConversation(current.map(turn => turn.id === operationTurnId ? {
      ...turn, content: locale === 'en' ? 'Stopped. Completed steps remain applied.' : '操作已停止，已完成的步骤保留。',
    } : turn)));
    operationTurnRef.current = null;
    activeOperationRef.current = null;
    setPending(false);
    setStreamedAnswer('');
  }

  function newConversation() {
    const controller = abortRef.current;
    controller?.abort();
    if (abortRef.current === controller) abortRef.current = null;
    setPending(false);
    setStreamedAnswer('');
    setTurns([]);
    setConversationId(newTurnId());
    setDraft('');
    setError('');
    operations?.cancel();
    operationTurnRef.current = null;
    activeOperationRef.current = null;
    conversationEpochRef.current += 1;
  }

  function sendTurnToCanvas(turn: ChatTurn) {
    if (turn.role !== 'assistant' || !onCanvasArtifact) return;
    onCanvasArtifact({
      kind: 'markdown',
      title: locale === 'en' ? 'Assistant response' : '助手回复',
      content: turn.content,
      sourceTurnId: turn.id,
      citations: turn.citations ?? [],
    });
  }

  return <section className="knowledgeChat" data-presentation={presentation} aria-labelledby={headingId}>
    <header className="knowledgeChatHeader">
      <div><p>{eyebrow || t('chat.eyebrow')}</p><h2 id={headingId}>{activeTitle}</h2><span>{t('chat.persistence')}</span></div>
      <div className="knowledgeChatHeaderTools">
        {!publicAnonymousMode && <label className="knowledgeChatProvider"><span>{t('chat.provider')}</span><select value={selectedProvider} onChange={(event) => selectProvider(event.target.value as ProviderSelection)} disabled={!providersLoaded || pending}>
          <option value="auto" disabled={!automaticProviderId}>{t('chat.providerAuto')}</option>
          <option value="retrieval">{t('chat.providerRetrieval')}</option>
          {providers.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.available}>{provider.label} · {provider.available ? `${provider.model} · ${provider.source === 'personal' ? t('chat.providerPersonal') : t('chat.providerPlatform')}` : t('chat.providerUnavailable')}</option>)}
        </select><small>{activeProvider ? `${activeProvider.label} · ${activeProvider.model}` : t('chat.providerHint')} <Link href="/account#ai-models">{t('chat.providerManage')}</Link></small></label>}
        {signInRequired && <Link className="knowledgeChatSignIn" href={signInHref}>{t('chat.signInForModels')}</Link>}
        <div className="knowledgeChatStats"><b>{turns.length}</b><span>{t('chat.messages')}</span><button type="button" onClick={newConversation} disabled={!turns.length && !pending}>{t('chat.new')}</button></div>
      </div>
    </header>
    {operations && <div className="knowledgeChatModeBar">
      <div role="group" aria-label={locale === 'en' ? 'Conversation mode' : '对话模式'}>
        <button type="button" aria-pressed={dialogueMode === 'operate'} disabled={pending} onClick={() => setDialogueMode('operate')}>{locale === 'en' ? 'Operate website' : '操作网站'}</button>
        <button type="button" aria-pressed={dialogueMode === 'ask'} disabled={pending} onClick={() => setDialogueMode('ask')}>{locale === 'en' ? 'Ask and research' : '问答与检索'}</button>
      </div>
      <p>{dialogueMode === 'operate'
        ? (locale === 'en' ? 'Changes apply to this website. You can stop or undo them. Folding the assistant keeps the task running.' : '直接操作当前网站，支持停止和撤销。收起助手后任务继续。')
        : (locale === 'en' ? 'Discuss the topic and find supporting sources.' : '讨论问题，查找相关资料与来源。')}</p>
      {dialogueMode === 'operate' && <span>{locale === 'en' ? 'Current page: ' : '当前页面：'}{context.path}</span>}
    </div>}
    {showContext && <div className="knowledgeChatContext" aria-live="polite">
      <span>{t('chat.context')}</span><b>{localizedContextText(context.focusLabel || context.title, locale, locale === 'en' ? 'Current knowledge record' : context.title)}</b>
      {context.focusDescription && (locale === 'zh-CN' || !/[\u3400-\u9fff]/u.test(context.focusDescription)) && <p>{context.focusDescription}</p>}
    </div>}
    <div className="knowledgeChatLog" ref={logRef} role="log" aria-live="polite" aria-label={t('chat.logAria')}>
      {!turns.length && <div className="knowledgeChatEmpty"><b>{dialogueMode === 'operate' ? (locale === 'en' ? 'What would you like to do?' : '你想在网站上做什么？') : t('chat.emptyTitle')}</b><p>{dialogueMode === 'operate' ? (locale === 'en' ? 'Open a page, change a CAD view, or select a shot. Try a command below.' : '可以打开页面、切换 CAD 视角、选择炮次。试试下面的指令。') : t('chat.emptyCopy')}</p><div>{activePrompts.map((prompt) => <button type="button" key={prompt} onClick={() => void submit(undefined, prompt)}>{prompt}</button>)}</div></div>}
      {turns.map((turn) => <article className={`knowledgeChatTurn is-${turn.role}`} key={turn.id}>
        <header><span>{turn.role === 'user' ? t('chat.user') : t('chat.assistant')}</span>{turn.role === 'assistant' && <div className="knowledgeChatTurnActions"><b data-mode={turn.mode}>{turn.mode === 'site-operation' ? (locale === 'en' ? 'Site operation' : '网站操作') : turn.mode === 'assistant-chat' ? t('chat.chatMode') : turn.mode === 'ai-grounded' ? t('chat.aiMode') : turn.mode === 'assistant-direct' ? t('chat.assistantMode') : t('chat.retrievalMode')}{turn.provider && turn.model ? <small>{turn.provider} · {turn.model}</small> : null}</b>{onCanvasArtifact && <button type="button" onClick={() => sendTurnToCanvas(turn)}>{t('chat.toCanvas')}</button>}</div>}</header>
        <div>{turn.content.split(/\n{2,}/).map((paragraph, index) => <p key={`${turn.id}-${index}`}>{paragraph}</p>)}</div>
        {turn.actionReceipts?.length ? <OperationReceipts receipts={turn.actionReceipts} locale={locale} /> : null}
        {turn.notice && <p className="knowledgeChatNotice">{turn.notice}{signInRequired && turn.mode === 'retrieval-only' ? <> <Link href={signInHref}>{t('chat.signIn')}</Link></> : null}</p>}
        {turn.citations?.length ? <div className="knowledgeChatCitations">{turn.citations.map((citation) => <a href={citation.url} target="_blank" rel="noreferrer" key={`${turn.id}-${citation.ref}-${citation.url}`}><b>{citation.ref}</b><span>{citation.label}</span><small>{citation.entryTitle}</small></a>)}</div> : null}
        {turn.caveats?.length ? <details><summary>{t('chat.caveats')}</summary><ul>{turn.caveats.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
      </article>)}
      {pending && <div className="knowledgeChatPending"><i /><span>{streamedAnswer || t('chat.pending')}</span><button type="button" onClick={stopActiveTurn}>{t('chat.stop')}</button></div>}
    </div>
    {error && <p className="knowledgeChatError" role="alert">{error}</p>}
    <form className="knowledgeChatComposer" onSubmit={(event) => void submit(event)}>
      <label><span>{dialogueMode === 'operate' ? (locale === 'en' ? 'Website instruction' : '网站操作指令') : t('chat.input')}</span><textarea rows={3} value={currentDraft} onChange={(event) => setDraft(event.target.value.slice(0, CHAT_LIMITS.maxUserChars))} placeholder={dialogueMode === 'operate' ? (locale === 'en' ? 'Open EXL-50U assembly, then switch to top view' : '打开 EXL-50U 总装，然后切换到俯视图') : t('chat.placeholder')} /></label>
      <div><small>{currentDraft.length} / {CHAT_LIMITS.maxUserChars}</small><span>{t('chat.inputHint')}</span><button type="submit" disabled={pending || currentDraft.trim().length < 2}>{pending ? t('chat.composing') : dialogueMode === 'operate' ? (locale === 'en' ? 'Execute' : '执行') : t('chat.send')}</button></div>
    </form>
  </section>;
}

function OperationReceipts({ receipts, locale }: { receipts: SiteActionReceipt[]; locale: string }) {
  return <ol className="knowledgeChatReceipts" aria-label={locale === 'en' ? 'Operation results' : '操作结果'}>
    {receipts.map(receipt => <li key={receipt.actionId} data-status={receipt.status}>
      <b>{receipt.status === 'applied' ? (locale === 'en' ? 'Done' : '已完成') : receipt.status === 'cancelled' ? (locale === 'en' ? 'Stopped' : '已停止') : (locale === 'en' ? 'Not applied' : '未执行')}</b>
      <span>{receipt.message}</span>
    </li>)}
  </ol>;
}

function localizedContextText(value: string, locale: 'zh-CN' | 'en', fallback: string) {
  return locale === 'en' && /[\u3400-\u9fff]/u.test(value) ? fallback : value;
}

async function readAgentTurnStream(
  response: Response,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
): Promise<AgentCompletedMessage> {
  if (!response.ok || !response.body || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
    throw new Error('The agent stream is temporarily unavailable.');
  }
  const parser = new AgentEventStreamParser();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let completed: AgentCompletedMessage | null = null;
  let streamFinished = false;

  const accept = (events: AgentStreamEvent[]) => {
    for (const event of events) {
      if (event.event === 'message.delta') onDelta(event.delta);
      else if (event.event === 'message.completed') completed = event.message;
      else if (event.event === 'run.failed') throw new Error(event.error.message);
    }
  };

  try {
    while (true) {
      if (signal.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      accept(parser.push(decoder.decode(value, { stream: true })));
    }
    accept(parser.push(decoder.decode()));
    parser.finish();
    streamFinished = true;
  } finally {
    if (!streamFinished) {
      try {
        await reader.cancel(new DOMException('Agent stream abandoned', 'AbortError'));
      } catch {
        // The transport may already have closed after a terminal failure.
      }
    }
    reader.releaseLock();
  }
  if (!completed) throw new Error('The agent stream ended without a completed message.');
  return completed;
}
