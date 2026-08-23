'use client';

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
import {
  LOCAL_CANVAS_LIMITS,
  appendCanvasArtifact,
  canPersistCanvasDraft,
  canvasPreviewBlocks,
  canvasStorageKey,
  type CanvasArtifactInput,
} from '@/app/agent/local-canvas';
import KnowledgeChat, {
  type KnowledgeChatContext,
  type KnowledgeChatFilters,
} from '@/app/components/knowledge-chat/KnowledgeChat';
import type { AgentCapabilities } from '@/app/agent/capabilities';
import type { SearchHit } from '@/app/search/search-core';
import './agent-workspace.css';

type AgentSurface = 'chat' | 'canvas';
type CanvasView = 'preview' | 'edit';

type OpenAgentOptions = {
  context?: Partial<KnowledgeChatContext>;
  draft?: string;
  filters?: KnowledgeChatFilters;
  onEvidenceResults?: (results: SearchHit[]) => void;
  tab?: AgentSurface;
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
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasView, setCanvasView] = useState<CanvasView>('preview');
  const [draft, setDraft] = useState('');
  const [pageContext, setPageContext] = useState<KnowledgeChatContext>(() => ({
    path: pathname,
    title: en ? 'Current FusionDigital page' : '当前 FusionDigital 页面',
  }));
  const [capabilities, setCapabilities] = useState<AgentCapabilities | null>(null);
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
      setChatFilters({});
      evidenceResultsRef.current = null;
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
        setCanvas((window.localStorage.getItem(storageKey) || '').slice(0, LOCAL_CANVAS_LIMITS.maxChars));
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
      window.localStorage.setItem(storageKey, canvas.slice(0, LOCAL_CANVAS_LIMITS.maxChars));
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
    if (options?.tab === 'canvas') setCanvasOpen(true);
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

  const chatContext = useMemo<KnowledgeChatContext>(() => ({ ...pageContext }), [pageContext]);

  const acceptCanvasArtifact = useCallback((artifact: CanvasArtifactInput) => {
    setCanvas((current) => appendCanvasArtifact(current, artifact));
    setCanvasView('preview');
    setCanvasOpen(true);
  }, []);

  const sitesHref = capabilities?.authentication.authenticatedWorkspaceOrigin
    ? `${capabilities.authentication.authenticatedWorkspaceOrigin}/account`
    : null;

  return <WorkspaceContext.Provider value={api}>
    {children}
    <div className="agentWorkspaceRoot" data-open={open ? 'true' : 'false'} data-canvas={canvasOpen ? 'true' : 'false'}>
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
              <button
                className="agentWorkspaceCanvasToggle"
                type="button"
                aria-controls="fusion-agent-canvas"
                aria-expanded={canvasOpen}
                aria-pressed={canvasOpen}
                onClick={() => setCanvasOpen((value) => !value)}
              ><span aria-hidden="true">▤</span>{copy.canvas}</button>
              <span data-profile={capabilities?.profile || 'loading'}>{capabilities?.profile === 'standalone-public' ? copy.retrieval : capabilities ? copy.modelReady : copy.detecting}</span>
              <button ref={closeButtonRef} type="button" onClick={closeWorkspace} aria-label={copy.close}>×</button>
            </div>
          </header>
          <div className="agentWorkspaceBody">
            <div className="agentWorkspaceChat">
              {sitesHref ? <div className="agentWorkspaceBoundary" role="status">
                <b>{copy.hkBoundaryTitle}</b><span>{copy.hkBoundaryCopy}</span><a href={sitesHref} target="_blank" rel="noreferrer">{copy.openSites}</a>
              </div> : null}
              <KnowledgeChat
                presentation="dock"
                context={chatContext}
                title={copy.conversationTitle}
                titleEn={copy.conversationTitle}
                prompts={[...copy.prompts]}
                draft={draft}
                onDraftChange={setDraft}
                filters={chatFilters}
                showContext={false}
                onCanvasArtifact={acceptCanvasArtifact}
                onEvidenceResults={(results) => evidenceResultsRef.current?.(results)}
              />
            </div>

            {canvasOpen ? <section id="fusion-agent-canvas" className="agentWorkspaceCanvasPanel" aria-labelledby="fusion-agent-canvas-title">
              <header className="agentWorkspaceCanvasHeader">
                <div><span>CANVAS</span><b id="fusion-agent-canvas-title">{copy.canvasTitle}</b><small>{copy.canvasHint}</small></div>
                <div>
                  <button type="button" data-active={canvasView === 'preview'} aria-pressed={canvasView === 'preview'} onClick={() => setCanvasView('preview')}>{copy.previewCanvas}</button>
                  <button type="button" data-active={canvasView === 'edit'} aria-pressed={canvasView === 'edit'} onClick={() => setCanvasView('edit')}>{copy.editCanvas}</button>
                  <button type="button" onClick={() => setCanvasOpen(false)} aria-label={copy.closeCanvas}>×</button>
                </div>
              </header>
              {canvasView === 'preview'
                ? <CanvasPreview content={canvas} emptyCopy={copy.canvasEmpty} />
                : <textarea value={canvas} onChange={(event) => setCanvas(event.target.value.slice(0, LOCAL_CANVAS_LIMITS.maxChars))} placeholder={copy.canvasPlaceholder} aria-label={copy.canvasTitle} />}
              <footer><span>{canvas.length} / {LOCAL_CANVAS_LIMITS.maxChars.toLocaleString('en-US')}</span><button type="button" onClick={() => setCanvas('')} disabled={!canvas}>{copy.clearCanvas}</button></footer>
              <p>{copy.canvasBoundary}</p>
            </section> : null}
          </div>
        </aside>
      </> : null}
    </div>
  </WorkspaceContext.Provider>;
}

function CanvasPreview({ content, emptyCopy }: { content: string; emptyCopy: string }) {
  const blocks = canvasPreviewBlocks(content);
  if (!blocks.length) return <div className="agentWorkspaceCanvasEmpty"><span aria-hidden="true">▤</span><p>{emptyCopy}</p></div>;
  return <div className="agentWorkspaceCanvasPreview">
    {blocks.map((block, index) => {
      const key = `${block.kind}-${index}`;
      if (block.kind === 'heading') {
        if (block.level === 1) return <h2 key={key}>{block.text}</h2>;
        if (block.level === 2) return <h3 key={key}>{block.text}</h3>;
        return <h4 key={key}>{block.text}</h4>;
      }
      if (block.kind === 'list') return <ul key={key}>{block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{item}</li>)}</ul>;
      if (block.kind === 'code') return <pre key={key}><code>{block.text}</code></pre>;
      return <p key={key}>{block.text}</p>;
    })}
  </div>;
}

const ZH = {
  trigger: 'AI 助手', triggerHint: '持续对话', title: 'FusionDigital 助手', close: '关闭 FusionDigital 助手',
  canvas: 'Canvas', detecting: '检测能力中', retrieval: '检索模式', modelReady: 'Sites AI 边界',
  hkBoundaryTitle: '当前站点保持匿名安全边界', hkBoundaryCopy: '这里可持续检索站内证据；前往 Sites 登录后使用任意模型对话（以该工作区已配置且可用的模型为准）。', openSites: '登录 / AI 工作区 ↗',
  conversationTitle: '和 FusionDigital 助手对话',
  prompts: ['介绍你能如何协助我的聚变项目', '围绕当前页面主题，从站内已索引知识说明可探索方向', '结合站内已索引知识，和我讨论聚变数据与数字孪生方案'],
  canvasTitle: '按需 Canvas', canvasHint: '仅在你打开或助手返回结构化内容时显示。', canvasPlaceholder: '记录假设、方案、代码、证据或待验证问题…', canvasEmpty: 'Canvas 目前为空。你可以切换到编辑模式，或把一条助手回复发送到这里。', previewCanvas: '渲染', editCanvas: '编辑', closeCanvas: '关闭 Canvas', clearCanvas: '清空', canvasBoundary: 'Canvas 使用安全的轻量 Markdown 渲染并只保存在本浏览器；它不会执行 HTML，也不会自动提交给模型。',
} as const;

const EN = {
  trigger: 'AI Assistant', triggerHint: 'Continuous chat', title: 'FusionDigital Assistant', close: 'Close FusionDigital Assistant',
  canvas: 'Canvas', detecting: 'Detecting capabilities', retrieval: 'Retrieval mode', modelReady: 'Sites AI boundary',
  hkBoundaryTitle: 'This host retains its anonymous security boundary', hkBoundaryCopy: 'You can continue evidence-grounded retrieval here. On Sites, sign in to chat with any model available to that workspace.', openSites: 'Sign in / AI workspace ↗',
  conversationTitle: 'Chat with the FusionDigital Assistant',
  prompts: ['Tell me how you can help with my fusion project', 'Use indexed site knowledge to explain what to explore around this page topic', 'Use indexed site knowledge to discuss fusion data and digital twins with me'],
  canvasTitle: 'On-demand Canvas', canvasHint: 'Shown only when you open it or the assistant returns structured content.', canvasPlaceholder: 'Capture hypotheses, plans, code, evidence, or open questions…', canvasEmpty: 'The Canvas is empty. Switch to Edit, or send an assistant response here.', previewCanvas: 'Render', editCanvas: 'Edit', closeCanvas: 'Close Canvas', clearCanvas: 'Clear', canvasBoundary: 'Canvas uses a safe, limited Markdown renderer and stays in this browser. It never executes HTML or submits itself to the model.',
} as const;
