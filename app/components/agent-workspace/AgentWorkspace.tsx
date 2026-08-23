'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useI18n } from '@/app/i18n';
import { canPersistCanvasDraft, canvasStorageKey } from '@/app/agent/local-canvas';
import KnowledgeChat, {
  type KnowledgeChatContext,
  type KnowledgeChatFilters,
} from '@/app/components/knowledge-chat/KnowledgeChat';
import type { AgentCapabilities } from '@/app/agent/capabilities';
import type { SearchHit } from '@/app/search/search-core';
import './agent-workspace.css';

type AgentTab = 'chat' | 'context' | 'canvas';

type OpenAgentOptions = {
  context?: Partial<KnowledgeChatContext>;
  draft?: string;
  filters?: KnowledgeChatFilters;
  onEvidenceResults?: (results: SearchHit[]) => void;
  tab?: AgentTab;
};

type AgentWorkspaceApi = {
  open: (options?: OpenAgentOptions) => void;
  close: () => void;
  isOpen: boolean;
};

const WorkspaceContext = createContext<AgentWorkspaceApi | null>(null);

export function useAgentWorkspace(): AgentWorkspaceApi {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useAgentWorkspace must be used inside AgentWorkspaceProvider');
  return value;
}

export default function AgentWorkspaceProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() || '/';
  const { locale } = useI18n();
  const en = locale === 'en';
  const copy = en ? EN : ZH;
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AgentTab>('chat');
  const [draft, setDraft] = useState('');
  const [pageContext, setPageContext] = useState<KnowledgeChatContext>(() => ({
    path: pathname,
    title: en ? 'Current FusionDigital page' : '当前 FusionDigital 页面',
  }));
  const [capabilities, setCapabilities] = useState<AgentCapabilities | null>(null);
  const [sourceInput, setSourceInput] = useState('');
  const [sourceError, setSourceError] = useState('');
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const [canvas, setCanvas] = useState('');
  const [chatFilters, setChatFilters] = useState<KnowledgeChatFilters>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const evidenceResultsRef = useRef<((results: SearchHit[]) => void) | null>(null);
  const loadedCanvasKeyRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPageContext({
        path: pathname,
        title: document.title || (en ? 'Current FusionDigital page' : '当前 FusionDigital 页面'),
      });
    });
    return () => { cancelled = true; };
  }, [en, pathname]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/agent/capabilities', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('capabilities unavailable');
      return response.json() as Promise<AgentCapabilities>;
    }).then(setCapabilities).catch(() => { /* The chat itself still has a deterministic retrieval fallback. */ });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const storageKey = canvasStorageKey(locale);
    loadedCanvasKeyRef.current = null;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setCanvas(window.localStorage.getItem(storageKey) || '');
      } catch {
        setCanvas('');
      }
      loadedCanvasKeyRef.current = storageKey;
    });
    return () => { cancelled = true; };
  }, [locale]);

  useEffect(() => {
    const storageKey = canvasStorageKey(locale);
    if (!canPersistCanvasDraft(loadedCanvasKeyRef.current, storageKey)) return;
    try {
      window.localStorage.setItem(storageKey, canvas.slice(0, 20_000));
    } catch {
      // Local canvas remains available for this browser session.
    }
  }, [canvas, locale]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const openWorkspace = useCallback((options?: OpenAgentOptions) => {
    if (options?.context) {
      setPageContext((current) => ({
        ...current,
        ...options.context,
        path: options.context?.path || current.path,
        title: options.context?.title || current.title,
      }));
    }
    if (options?.draft !== undefined) setDraft(options.draft.slice(0, 600));
    setChatFilters(options?.filters ?? {});
    evidenceResultsRef.current = options?.onEvidenceResults ?? null;
    if (options?.tab) setTab(options.tab);
    setOpen(true);
  }, []);

  const closeWorkspace = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const api = useMemo<AgentWorkspaceApi>(() => ({
    open: openWorkspace,
    close: closeWorkspace,
    isOpen: open,
  }), [closeWorkspace, open, openWorkspace]);

  const chatContext = useMemo<KnowledgeChatContext>(() => ({
    ...pageContext,
    focusDescription: [
      pageContext.focusDescription,
      sourceUrls.length
        ? `${en ? 'User-selected reference links; link contents have not been read' : '用户选择的参考链接；系统尚未读取链接正文'}: ${sourceUrls.join(', ')}`
        : '',
    ].filter(Boolean).join('\n'),
  }), [en, pageContext, sourceUrls]);

  function addSourceUrl() {
    const normalized = safeHttpUrl(sourceInput);
    if (!normalized) {
      setSourceError(copy.invalidUrl);
      return;
    }
    setSourceUrls((current) => [...new Set([...current, normalized])].slice(-6));
    setSourceInput('');
    setSourceError('');
  }

  const sitesHref = capabilities?.authentication.authenticatedWorkspaceOrigin
    ? `${capabilities.authentication.authenticatedWorkspaceOrigin}${pathname}`
    : null;

  return <WorkspaceContext.Provider value={api}>
    {children}
    <div className="agentWorkspaceRoot" data-open={open ? 'true' : 'false'}>
      <button
        ref={triggerRef}
        className="agentWorkspaceTrigger"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="fusion-agent-workspace"
        tabIndex={open ? -1 : 0}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">✦</span><b>{copy.trigger}</b><small>{copy.triggerHint}</small>
      </button>
      {open ? <>
        <button className="agentWorkspaceBackdrop" type="button" aria-label={copy.close} onClick={closeWorkspace} />
        <aside id="fusion-agent-workspace" className="agentWorkspacePanel" role="dialog" aria-label={copy.title}>
          <header className="agentWorkspaceTopbar">
            <div><span>FUSIONDIGITAL</span><h2>{copy.title}</h2></div>
            <div className="agentWorkspaceTopbarActions">
              <span data-profile={capabilities?.profile || 'loading'}>{capabilities?.profile === 'standalone-public' ? copy.retrieval : capabilities ? copy.modelReady : copy.detecting}</span>
              <button ref={closeButtonRef} type="button" onClick={closeWorkspace} aria-label={copy.close}>×</button>
            </div>
          </header>
          <nav className="agentWorkspaceTabs" aria-label={copy.tabs}>
            {(['chat', 'context', 'canvas'] as const).map((item) => <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              data-active={tab === item ? 'true' : 'false'}
              onClick={() => setTab(item)}
            >{copy[item]}</button>)}
          </nav>

          {tab === 'chat' ? <div className="agentWorkspaceChat">
            {sitesHref ? <div className="agentWorkspaceBoundary" role="status">
              <b>{copy.hkBoundaryTitle}</b><span>{copy.hkBoundaryCopy}</span><a href={sitesHref} target="_blank" rel="noreferrer">{copy.openSites}</a>
            </div> : null}
            <KnowledgeChat
              presentation="dock"
              context={chatContext}
              title="持续对话"
              titleEn="Continuous conversation"
              draft={draft}
              onDraftChange={setDraft}
              filters={chatFilters}
              onEvidenceResults={(results) => evidenceResultsRef.current?.(results)}
            />
          </div> : null}

          {tab === 'context' ? <section className="agentWorkspaceContextPanel">
            <div className="agentWorkspaceSectionHeading"><span>01</span><div><b>{copy.pageContext}</b><small>{copy.pageContextHint}</small></div></div>
            <article className="agentWorkspacePageCard"><span>{pageContext.path}</span><b>{pageContext.focusLabel || pageContext.title}</b>{pageContext.focusDescription ? <p>{pageContext.focusDescription}</p> : null}<Link href={pageContext.path}>{copy.openCurrent}</Link></article>
            <div className="agentWorkspaceSectionHeading"><span>02</span><div><b>{copy.links}</b><small>{copy.linksHint}</small></div></div>
            <div className="agentWorkspaceSourceForm"><input type="url" value={sourceInput} onChange={(event) => setSourceInput(event.target.value.slice(0, 1_024))} placeholder="https://…" /><button type="button" onClick={addSourceUrl}>{copy.add}</button></div>
            {sourceError ? <p className="agentWorkspaceSourceError" role="alert">{sourceError}</p> : null}
            <div className="agentWorkspaceSourceList">{sourceUrls.map((url) => <div key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a><button type="button" onClick={() => setSourceUrls((current) => current.filter((item) => item !== url))} aria-label={copy.remove}>×</button></div>)}</div>
            <div className="agentWorkspaceCapabilityGrid">
              <article data-ready="true"><b>{copy.siteSearch}</b><span>{copy.available}</span></article>
              <article data-ready="true"><b>{copy.pageAware}</b><span>{copy.available}</span></article>
              <article data-ready="false"><b>{copy.multimodal}</b><span>{copy.gated}</span></article>
              <article data-ready="false"><b>{copy.webReader}</b><span>{copy.gated}</span></article>
            </div>
          </section> : null}

          {tab === 'canvas' ? <section className="agentWorkspaceCanvasPanel">
            <div className="agentWorkspaceSectionHeading"><span>CANVAS</span><div><b>{copy.canvasTitle}</b><small>{copy.canvasHint}</small></div></div>
            <textarea value={canvas} onChange={(event) => setCanvas(event.target.value.slice(0, 20_000))} placeholder={copy.canvasPlaceholder} aria-label={copy.canvasTitle} />
            <footer><span>{canvas.length} / 20,000</span><button type="button" onClick={() => setCanvas('')}>{copy.clearCanvas}</button></footer>
            <p>{copy.canvasBoundary}</p>
          </section> : null}
        </aside>
      </> : null}
    </div>
  </WorkspaceContext.Provider>;
}

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.username || url.password) return null;
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const ZH = {
  trigger: '智能体', triggerHint: '持续对话', title: '智能体工作区', close: '关闭智能体工作区', tabs: '智能体工作区视图',
  chat: '对话', context: '上下文', canvas: 'Canvas', detecting: '检测能力中', retrieval: '检索模式', modelReady: 'Sites AI 边界',
  hkBoundaryTitle: '当前站点保持匿名安全边界', hkBoundaryCopy: '这里可持续检索站内证据；登录与模型暂由 Sites 的可信身份边界提供。', openSites: '打开已认证 AI 工作区 ↗',
  pageContext: '当前页面', pageContextHint: '随页面切换更新，也可由图谱和检索工作区精确指定。', openCurrent: '打开页面 ↗',
  links: '参考链接', linksHint: '本切片仅把 URL 作为上下文标签，不会读取网页正文。', add: '加入', remove: '移除链接', invalidUrl: '请输入有效的 HTTP 或 HTTPS 链接。',
  siteSearch: '站内证据检索', pageAware: '页面上下文', multimodal: '图片与文件', webReader: '外部网页读取', available: '已启用', gated: '等待安全网关',
  canvasTitle: '本地思考画布', canvasHint: '跨页面保留的结构化草稿空间。', canvasPlaceholder: '记录假设、证据、待验证问题或分析步骤…', clearCanvas: '清空画布', canvasBoundary: '当前画布只保存在本浏览器，尚未同步到账户，也不会自动提交给模型。',
} as const;

const EN = {
  trigger: 'Agent', triggerHint: 'Continuous chat', title: 'Agent Workspace', close: 'Close Agent Workspace', tabs: 'Agent Workspace views',
  chat: 'Chat', context: 'Context', canvas: 'Canvas', detecting: 'Detecting capabilities', retrieval: 'Retrieval mode', modelReady: 'Sites AI boundary',
  hkBoundaryTitle: 'This host retains its anonymous security boundary', hkBoundaryCopy: 'You can continue evidence-grounded retrieval here. Trusted sign-in and model access currently remain on Sites.', openSites: 'Open authenticated AI workspace ↗',
  pageContext: 'Current page', pageContextHint: 'Updates across routes and can be refined by the graph and search workspaces.', openCurrent: 'Open page ↗',
  links: 'Reference links', linksHint: 'This slice adds URL labels to context but does not read page contents.', add: 'Add', remove: 'Remove link', invalidUrl: 'Enter a valid HTTP or HTTPS URL.',
  siteSearch: 'Site evidence search', pageAware: 'Page context', multimodal: 'Images and files', webReader: 'External page reader', available: 'Enabled', gated: 'Security gateway pending',
  canvasTitle: 'Local thinking canvas', canvasHint: 'A structured scratch space retained across pages.', canvasPlaceholder: 'Capture hypotheses, evidence, open questions, or analysis steps…', clearCanvas: 'Clear canvas', canvasBoundary: 'The canvas is stored only in this browser. It is not account-synced or automatically submitted to a model yet.',
} as const;
