'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/app/i18n';
import { isPublicAnonymousMode } from '@/app/deployment-mode';
import type { SearchHit } from '@/app/search/search-core';
import {
  CHAT_LIMITS,
  KNOWLEDGE_CHAT_STORAGE_KEY,
  compactConversation,
  deserializeConversation,
  historyForRequest,
  knowledgeChatStorageKey,
  newTurnId,
  serializeConversation,
  type ChatCitation,
  type ChatProviderId,
  type ChatTurn,
} from './conversation';
import './knowledge-chat.css';
import './provider-selector.css';

type AskResponse = {
  mode: 'ai-grounded' | 'retrieval-only' | 'assistant-direct';
  answer: string;
  caveats?: string[];
  citations: ChatCitation[];
  results: SearchHit[];
  notice?: string;
  conversationId?: string;
  provider?: ChatProviderId;
  model?: string;
  error?: { message?: string };
};

type ProviderOption = { id: ChatProviderId; label: string; model: string; available: boolean; source?: 'personal' | 'platform' | 'none' };
type ProviderEnvelope = { authenticated?: boolean; defaultProvider: ChatProviderId | 'retrieval' | null; providers: ProviderOption[] };

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
}: KnowledgeChatProps) {
  const headingId = useId();
  const publicAnonymousMode = isPublicAnonymousMode();
  const { locale, t } = useI18n();
  const [localDraft, setLocalDraft] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<ChatProviderId | 'retrieval'>('retrieval');
  const [providersLoaded, setProvidersLoaded] = useState(publicAnonymousMode);
  const [providerPreferencesEnabled, setProviderPreferencesEnabled] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const storageReadyRef = useRef(false);
  const currentDraft = draft ?? localDraft;
  const setDraft = onDraftChange ?? setLocalDraft;

  useEffect(() => {
    let cancelled = false;
    storageReadyRef.current = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setRestored(false);
      try {
        const storageKey = knowledgeChatStorageKey(locale);
        const legacyKey = locale === 'zh-CN' ? KNOWLEDGE_CHAT_STORAGE_KEY : '';
        setTurns(deserializeConversation(window.localStorage.getItem(storageKey) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null)));
        const storedId = window.localStorage.getItem(`${storageKey}.id`) ?? (legacyKey ? window.localStorage.getItem(`${legacyKey}.id`) : null);
        setConversationId(storedId || newTurnId());
      } catch {
        setConversationId(newTurnId());
      }
      storageReadyRef.current = true;
      setRestored(true);
    });
    return () => { cancelled = true; };
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
      setProviderPreferencesEnabled(payload.authenticated === true);
      const defaultAvailable = payload.defaultProvider === 'retrieval'
        || Boolean(payload.defaultProvider && safeProviders.some((provider) => provider.id === payload.defaultProvider && provider.available));
      setSelectedProvider(defaultAvailable ? payload.defaultProvider! : 'retrieval');
    }).catch((reason) => {
      if ((reason as Error).name !== 'AbortError') setSelectedProvider('retrieval');
    }).finally(() => {
      if (!controller.signal.aborted) setProvidersLoaded(true);
    });
    return () => controller.abort();
  }, [publicAnonymousMode]);

  useEffect(() => {
    if (!restored || !storageReadyRef.current) return;
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

  useEffect(() => () => abortRef.current?.abort(), []);

  const signInHref = useMemo(
    () => `/signin-with-chatgpt?return_to=${encodeURIComponent(context.path || '/knowledge-graph')}`,
    [context.path],
  );
  const activePrompts = prompts && (locale === 'zh-CN' || prompts.every((prompt) => !/[\u3400-\u9fff]/u.test(prompt)))
    ? prompts
    : [t('chat.promptEvidence'), t('chat.promptCompare'), t('chat.promptGaps')];
  const activeTitle = locale === 'en' ? (titleEn || t('chat.defaultTitle')) : (title || t('chat.defaultTitle'));
  const activeProvider = providers.find((provider) => provider.id === selectedProvider);

  function selectProvider(value: ChatProviderId | 'retrieval') {
    setSelectedProvider(value);
    if (!providerPreferencesEnabled) return;
    void fetch('/api/account/llm-credentials', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ defaultProvider: value }),
    }).catch(() => { /* The in-page selection remains usable if preference persistence is unavailable. */ });
  }

  async function submit(event?: FormEvent, suggested?: string) {
    event?.preventDefault();
    const question = (suggested ?? currentDraft).normalize('NFKC').trim().slice(0, CHAT_LIMITS.maxUserChars);
    if (question.length < 2 || pending) return;
    const history = historyForRequest(turns);
    const userTurn: ChatTurn = { id: newTurnId(), role: 'user', content: question, createdAt: new Date().toISOString() };
    setTurns((current) => compactConversation([...current, userTurn]));
    setDraft('');
    setPending(true);
    setError('');
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-FusionDigital-Locale': locale },
        body: JSON.stringify({ question, locale, history, context, filters: { ...filters, citedOnly: true }, conversationId, provider: selectedProvider }),
        signal: controller.signal,
      });
      const payload = await response.json() as AskResponse;
      if (!response.ok && !payload.answer) throw new Error(payload.error?.message || (locale === 'en' ? 'The Q&A service is temporarily unavailable.' : '问答服务暂时不可用。'));
      const assistantTurn: ChatTurn = {
        id: newTurnId(), role: 'assistant', content: payload.answer, createdAt: new Date().toISOString(),
        mode: payload.mode, citations: payload.citations, caveats: payload.caveats, notice: payload.notice,
        provider: payload.provider, model: payload.model,
      };
      setTurns((current) => compactConversation([...current, assistantTurn]));
      if (payload.conversationId) setConversationId(payload.conversationId);
      if (payload.results?.length) onEvidenceResults?.(payload.results);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError(reason instanceof Error ? reason.message : (locale === 'en' ? 'The Q&A service is temporarily unavailable.' : '问答服务暂时不可用。'));
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function newConversation() {
    abortRef.current?.abort();
    setPending(false);
    setTurns([]);
    setConversationId(newTurnId());
    setError('');
  }

  return <section className="knowledgeChat" data-presentation={presentation} aria-labelledby={headingId}>
    <header className="knowledgeChatHeader">
      <div><p>{eyebrow || t('chat.eyebrow')}</p><h2 id={headingId}>{activeTitle}</h2><span>{t('chat.persistence')}</span></div>
      <div className="knowledgeChatHeaderTools">
        {!publicAnonymousMode && <label className="knowledgeChatProvider"><span>{t('chat.provider')}</span><select value={selectedProvider} onChange={(event) => selectProvider(event.target.value as ChatProviderId | 'retrieval')} disabled={!providersLoaded || pending}>
          <option value="retrieval">{t('chat.providerRetrieval')}</option>
          {providers.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.available}>{provider.label} · {provider.available ? `${provider.model} · ${provider.source === 'personal' ? t('chat.providerPersonal') : t('chat.providerPlatform')}` : t('chat.providerUnavailable')}</option>)}
        </select><small>{activeProvider ? `${activeProvider.label} · ${activeProvider.model}` : t('chat.providerHint')} <Link href="/account#ai-models">{t('chat.providerManage')}</Link></small></label>}
        <div className="knowledgeChatStats"><b>{turns.length}</b><span>{t('chat.messages')}</span><button type="button" onClick={newConversation} disabled={!turns.length && !pending}>{t('chat.new')}</button></div>
      </div>
    </header>
    <div className="knowledgeChatContext" aria-live="polite">
      <span>{t('chat.context')}</span><b>{localizedContextText(context.focusLabel || context.title, locale, locale === 'en' ? 'Current knowledge record' : context.title)}</b>
      {context.focusDescription && (locale === 'zh-CN' || !/[\u3400-\u9fff]/u.test(context.focusDescription)) && <p>{context.focusDescription}</p>}
    </div>
    <div className="knowledgeChatLog" ref={logRef} role="log" aria-live="polite" aria-label={t('chat.logAria')}>
      {!turns.length && <div className="knowledgeChatEmpty"><b>{t('chat.emptyTitle')}</b><p>{t('chat.emptyCopy')}</p><div>{activePrompts.map((prompt) => <button type="button" key={prompt} onClick={() => void submit(undefined, prompt)}>{prompt}</button>)}</div></div>}
      {turns.map((turn) => <article className={`knowledgeChatTurn is-${turn.role}`} key={turn.id}>
        <header><span>{turn.role === 'user' ? t('chat.user') : t('chat.assistant')}</span>{turn.role === 'assistant' && <b data-mode={turn.mode}>{turn.mode === 'ai-grounded' ? t('chat.aiMode') : turn.mode === 'assistant-direct' ? t('chat.assistantMode') : t('chat.retrievalMode')}{turn.provider && turn.model ? <small>{turn.provider} · {turn.model}</small> : null}</b>}</header>
        <div>{turn.content.split(/\n{2,}/).map((paragraph, index) => <p key={`${turn.id}-${index}`}>{paragraph}</p>)}</div>
        {turn.notice && <p className="knowledgeChatNotice">{turn.notice}{!publicAnonymousMode && turn.mode === 'retrieval-only' && /登录/.test(turn.notice) ? <> <Link href={signInHref}>{t('chat.signIn')}</Link></> : null}</p>}
        {turn.citations?.length ? <div className="knowledgeChatCitations">{turn.citations.map((citation) => <a href={citation.url} target="_blank" rel="noreferrer" key={`${turn.id}-${citation.ref}-${citation.url}`}><b>{citation.ref}</b><span>{citation.label}</span><small>{citation.entryTitle}</small></a>)}</div> : null}
        {turn.caveats?.length ? <details><summary>{t('chat.caveats')}</summary><ul>{turn.caveats.map((item) => <li key={item}>{item}</li>)}</ul></details> : null}
      </article>)}
      {pending && <div className="knowledgeChatPending"><i /><span>{t('chat.pending')}</span><button type="button" onClick={() => { abortRef.current?.abort(); setPending(false); }}>{t('chat.stop')}</button></div>}
    </div>
    {error && <p className="knowledgeChatError" role="alert">{error}</p>}
    <form className="knowledgeChatComposer" onSubmit={(event) => void submit(event)}>
      <label><span>{t('chat.input')}</span><textarea rows={3} value={currentDraft} onChange={(event) => setDraft(event.target.value.slice(0, CHAT_LIMITS.maxUserChars))} placeholder={t('chat.placeholder')} /></label>
      <div><small>{currentDraft.length} / {CHAT_LIMITS.maxUserChars}</small><span>{t('chat.inputHint')}</span><button type="submit" disabled={pending || currentDraft.trim().length < 2}>{pending ? t('chat.composing') : t('chat.send')}</button></div>
    </form>
  </section>;
}

function localizedContextText(value: string, locale: 'zh-CN' | 'en', fallback: string) {
  return locale === 'en' && /[\u3400-\u9fff]/u.test(value) ? fallback : value;
}
