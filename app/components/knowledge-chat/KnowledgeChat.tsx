'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/app/i18n';
import type { SearchHit } from '@/app/search/search-core';
import {
  CHAT_LIMITS,
  KNOWLEDGE_CHAT_STORAGE_KEY,
  compactConversation,
  deserializeConversation,
  historyForRequest,
  newTurnId,
  serializeConversation,
  type ChatCitation,
  type ChatTurn,
} from './conversation';
import './knowledge-chat.css';

type AskResponse = {
  mode: 'ai-grounded' | 'retrieval-only';
  answer: string;
  caveats?: string[];
  citations: ChatCitation[];
  results: SearchHit[];
  notice?: string;
  conversationId?: string;
  error?: { message?: string };
};

export type KnowledgeChatContext = {
  path: string;
  title: string;
  domain?: string;
  focusId?: string;
  focusLabel?: string;
  focusDescription?: string;
};

type KnowledgeChatProps = {
  context: KnowledgeChatContext;
  filters?: { domain?: string; type?: string; device?: string; citedOnly?: boolean };
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
  filters,
  title,
  titleEn,
  eyebrow,
  prompts,
  draft,
  onDraftChange,
  onEvidenceResults,
}: KnowledgeChatProps) {
  const { locale, t } = useI18n();
  const [localDraft, setLocalDraft] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [restored, setRestored] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const currentDraft = draft ?? localDraft;
  const setDraft = onDraftChange ?? setLocalDraft;

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setTurns(deserializeConversation(window.localStorage.getItem(KNOWLEDGE_CHAT_STORAGE_KEY)));
        const storedId = window.localStorage.getItem(`${KNOWLEDGE_CHAT_STORAGE_KEY}.id`);
        setConversationId(storedId || newTurnId());
      } catch {
        setConversationId(newTurnId());
      }
      setRestored(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      window.localStorage.setItem(KNOWLEDGE_CHAT_STORAGE_KEY, serializeConversation(turns));
      if (conversationId) window.localStorage.setItem(`${KNOWLEDGE_CHAT_STORAGE_KEY}.id`, conversationId);
    } catch {
      // Conversation remains available for this page session when storage is blocked.
    }
  }, [conversationId, restored, turns]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [pending, turns]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const signInHref = useMemo(
    () => `/signin-with-chatgpt?return_to=${encodeURIComponent(context.path || '/knowledge-graph')}`,
    [context.path],
  );
  const activePrompts = prompts ?? [t('chat.promptEvidence'), t('chat.promptCompare'), t('chat.promptGaps')];
  const activeTitle = locale === 'en' ? (titleEn || t('chat.defaultTitle')) : (title || t('chat.defaultTitle'));

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
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ question, history, context, filters: { ...filters, citedOnly: true }, conversationId }),
        signal: controller.signal,
      });
      const payload = await response.json() as AskResponse;
      if (!response.ok && !payload.answer) throw new Error(payload.error?.message || '问答服务暂时不可用。');
      const assistantTurn: ChatTurn = {
        id: newTurnId(), role: 'assistant', content: payload.answer, createdAt: new Date().toISOString(),
        mode: payload.mode, citations: payload.citations, caveats: payload.caveats, notice: payload.notice,
      };
      setTurns((current) => compactConversation([...current, assistantTurn]));
      if (payload.conversationId) setConversationId(payload.conversationId);
      if (payload.results?.length) onEvidenceResults?.(payload.results);
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError(reason instanceof Error ? reason.message : '问答服务暂时不可用。');
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

  return <section className="knowledgeChat" aria-labelledby="knowledge-chat-title">
    <header className="knowledgeChatHeader">
      <div><p>{eyebrow || t('chat.eyebrow')}</p><h2 id="knowledge-chat-title">{activeTitle}</h2><span>{t('chat.persistence')}</span></div>
      <div><b>{turns.length}</b><span>{t('chat.messages')}</span><button type="button" onClick={newConversation} disabled={!turns.length && !pending}>{t('chat.new')}</button></div>
    </header>
    <div className="knowledgeChatContext" aria-live="polite">
      <span>{t('chat.context')}</span><b>{context.focusLabel || context.title}</b>
      {context.focusDescription && <p>{context.focusDescription}</p>}
    </div>
    <div className="knowledgeChatLog" ref={logRef} role="log" aria-live="polite" aria-label={t('chat.logAria')}>
      {!turns.length && <div className="knowledgeChatEmpty"><b>{t('chat.emptyTitle')}</b><p>{t('chat.emptyCopy')}</p><div>{activePrompts.map((prompt) => <button type="button" key={prompt} onClick={() => void submit(undefined, prompt)}>{prompt}</button>)}</div></div>}
      {turns.map((turn) => <article className={`knowledgeChatTurn is-${turn.role}`} key={turn.id}>
        <header><span>{turn.role === 'user' ? t('chat.user') : t('chat.assistant')}</span>{turn.role === 'assistant' && <b data-mode={turn.mode}>{turn.mode === 'ai-grounded' ? t('chat.aiMode') : t('chat.retrievalMode')}</b>}</header>
        <div>{turn.content.split(/\n{2,}/).map((paragraph, index) => <p key={`${turn.id}-${index}`}>{paragraph}</p>)}</div>
        {turn.notice && <p className="knowledgeChatNotice">{turn.notice}{turn.mode === 'retrieval-only' && /登录/.test(turn.notice) ? <> <Link href={signInHref}>{t('chat.signIn')}</Link></> : null}</p>}
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
