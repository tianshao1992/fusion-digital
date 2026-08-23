import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  LOCAL_CANVAS_LIMITS,
  appendCanvasArtifact,
  canPersistCanvasDraft,
  canvasPreviewBlocks,
  canvasStorageKey,
} from '../app/agent/local-canvas.ts';

const workspace = read('app/components/agent-workspace/AgentWorkspace.tsx');
const layout = read('app/layout.tsx');
const search = read('app/search/SearchWorkspace.tsx');
const graph = read('app/knowledge-graph/KnowledgeGraphExplorer.tsx');
const chat = read('app/components/knowledge-chat/KnowledgeChat.tsx');

test('the Agent Workspace is mounted once at the root and owns the single chat surface', () => {
  assert.match(layout, /<AgentWorkspaceProvider>\{children\}<\/AgentWorkspaceProvider>/);
  assert.match(workspace, /<KnowledgeChat/);
  assert.doesNotMatch(search, /<KnowledgeChat|from ["']@\/app\/components\/knowledge-chat/);
  assert.doesNotMatch(graph, /<KnowledgeChat|from ["']@\/app\/components\/knowledge-chat/);
  assert.match(search, /agentWorkspace\.open/);
  assert.match(graph, /agentWorkspace\.open/);
});

test('chat is the primary surface, Context is not a view, and Canvas opens only on demand', () => {
  assert.match(workspace, /<div className="agentWorkspaceBody">\s*<div className="agentWorkspaceChat">/);
  assert.match(workspace, /showContext=\{false\}/);
  assert.match(workspace, /onCanvasArtifact=\{acceptCanvasArtifact\}/);
  assert.match(chat, /if \(payload\.canvas\) onCanvasArtifact\?\.\(\{\s*\.\.\.payload\.canvas,\s*sourceTurnId: assistantTurn\.id,\s*citations: payload\.citations,/);
  assert.match(chat, /sendTurnToCanvas\(turn\)/);
  assert.match(chat, /sourceTurnId: turn\.id,\s*citations: turn\.citations \?\? \[\],/);
  assert.match(workspace, /\{canvasOpen \? <section id="fusion-agent-canvas"/);
  assert.match(workspace, /aria-controls="fusion-agent-canvas"/);
  assert.match(workspace, /aria-expanded=\{canvasOpen\}/);
  assert.doesNotMatch(workspace, /AgentTab|'context'|agentWorkspaceContextPanel|safeHttpUrl/);
  assert.doesNotMatch(workspace, /dangerouslySetInnerHTML|<iframe|FileReader|readAsDataURL/);
});

test('the authenticated assistant starts with automatic model routing instead of retrieval', () => {
  assert.match(chat, /publicAnonymousMode \? 'retrieval' : 'auto'/);
  assert.match(chat, /setSelectedProvider\(automaticProvider \? 'auto' : 'retrieval'\)/);
  assert.match(chat, /\.\.\.\(selectedProvider === 'auto' \? \{\} : \{ provider: selectedProvider \}\)/);
  assert.match(chat, /<option value="auto" disabled=\{!automaticProviderId\}>/);
});

test('Canvas accepts bounded structured markdown and renders only escaped React nodes', () => {
  const content = appendCanvasArtifact('', {
    kind: 'markdown',
    title: 'Plan',
    content: '# Result\n\n- first\n- second\n\n```ts\nconst safe = true;\n```\n\n<script>alert(1)</script>',
    sourceTurnId: 'preview-turn',
    citations: [],
  });
  const blocks = canvasPreviewBlocks(content);
  assert.ok(content.length <= LOCAL_CANVAS_LIMITS.maxChars);
  assert.ok(blocks.some((block) => block.kind === 'heading'));
  assert.ok(blocks.some((block) => block.kind === 'list'));
  assert.ok(blocks.some((block) => block.kind === 'code'));
  assert.ok(blocks.some((block) => block.kind === 'paragraph' && block.text.includes('<script>')));
  assert.match(workspace, /block\.kind === 'code'/);
  assert.doesNotMatch(workspace, /dangerouslySetInnerHTML/);
});

test('Canvas namespaces repeated citation refs per turn and persists a self-contained source appendix', () => {
  let content = appendCanvasArtifact('', {
    kind: 'markdown',
    title: 'First comparison',
    content: 'First result [S1](https://model.invalid/forged-first).',
    sourceTurnId: 'assistant-turn-one',
    citations: [{
      ref: 'S1',
      label: 'ITER source one',
      entryTitle: 'First official record',
      kind: 'official',
      url: 'https://www.iter.org/source-one',
    }],
  });
  content = appendCanvasArtifact(content, {
    kind: 'markdown',
    title: 'Second comparison',
    content: 'Second result [S1](https://model.invalid/forged-second).',
    sourceTurnId: 'assistant-turn-two',
    citations: [{
      ref: 'S1',
      label: 'Source two',
      entryTitle: 'Second research record',
      kind: 'paper',
      url: 'https://example.org/source-two',
    }],
  });

  assert.match(content, /First result \[turn:assistant-turn-one:S1\]/);
  assert.match(content, /Second result \[turn:assistant-turn-two:S1\]/);
  assert.match(content, /Sources \/ 来源 · turn:assistant-turn-one/);
  assert.match(content, /\[turn:assistant-turn-one:S1\] ITER source one \| First official record \| official \| https:\/\/www\.iter\.org\/source-one/);
  assert.match(content, /Sources \/ 来源 · turn:assistant-turn-two/);
  assert.match(content, /\[turn:assistant-turn-two:S1\] Source two \| Second research record \| paper \| https:\/\/example\.org\/source-two/);
  assert.doesNotMatch(content, /model\.invalid/);

  // Clearing chat state must not invalidate or mutate the separately persisted Canvas text.
  const retainedCanvas = content;
  const clearedTurns: unknown[] = [];
  assert.equal(clearedTurns.length, 0);
  assert.match(retainedCanvas, /turn:assistant-turn-one:S1/);
  assert.match(retainedCanvas, /turn:assistant-turn-two:S1/);
  const newConversation = chat.match(/function newConversation\(\) \{[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.doesNotMatch(newConversation, /Canvas|onCanvasArtifact|localStorage|setCanvas/i);
});

test('Canvas source URLs are bounded and accepted only from safe structured citations', () => {
  const content = appendCanvasArtifact('', {
    kind: 'markdown',
    title: 'URL boundary',
    content: 'Known [S1], credentials [S2], script [S3], oversized [S4], and unknown [S5](https://model.invalid/unknown).',
    sourceTurnId: 'url-turn',
    citations: [
      { ref: 'S1', label: 'Safe', entryTitle: 'Safe source', kind: 'official', url: 'https://example.org/path' },
      { ref: 'S2', label: 'Credentials', entryTitle: 'Rejected', kind: 'source', url: 'https://user:pass@example.org/private' },
      { ref: 'S3', label: 'Script', entryTitle: 'Rejected', kind: 'source', url: 'javascript:alert(1)' },
      { ref: 'S4', label: 'Oversized', entryTitle: 'Rejected', kind: 'source', url: `https://example.org/${'a'.repeat(LOCAL_CANVAS_LIMITS.maxCitationUrlChars)}` },
    ],
  });

  assert.match(content, /Known \[turn:url-turn:S1\]/);
  assert.match(content, /https:\/\/example\.org\/path/);
  assert.doesNotMatch(content, /user:pass|javascript:|Oversized|model\.invalid/);
  assert.match(content, /unknown \[S5\]/);
  assert.ok(content.length <= LOCAL_CANVAS_LIMITS.maxChars);
});

test('Canvas persistence waits for the active locale key to finish loading', () => {
  const zhKey = canvasStorageKey('zh-CN');
  const enKey = canvasStorageKey('en');
  assert.equal(canPersistCanvasDraft(null, zhKey), false);
  assert.equal(canPersistCanvasDraft(zhKey, enKey), false);
  assert.equal(canPersistCanvasDraft(enKey, enKey), true);
  assert.match(workspace, /loadedCanvasKeyRef\.current = null/);
  assert.match(workspace, /canPersistCanvasDraft\(loadedCanvasKeyRef\.current, storageKey\)/);
});

test('search keeps its structured evidence filters and result projection in the global dock', () => {
  assert.match(search, /filters: \{ domain: domain \|\| undefined, type: type \|\| undefined, citedOnly: true \}/);
  assert.match(search, /onEvidenceResults: setResults/);
  assert.match(workspace, /filters=\{chatFilters\}/);
  assert.match(workspace, /evidenceResultsRef\.current\?\.\(results\)/);
});

test('route changes clear search-scoped filters and result callbacks', () => {
  assert.match(workspace, /queueMicrotask\(\(\) => \{\s*if \(cancelled\) return;\s*setChatFilters\(\{\}\);\s*evidenceResultsRef\.current = null;/);
  assert.match(workspace, /\}, \[en, pathname\]\);/);
});

test('the non-modal dialog moves focus inside and removes its hidden trigger from tab order', () => {
  assert.match(workspace, /requestAnimationFrame\(\(\) => closeButtonRef\.current\?\.focus\(\)\)/);
  assert.match(workspace, /tabIndex=\{open \? -1 : 0\}/);
  assert.match(workspace, /ref=\{closeButtonRef\}/);
  assert.doesNotMatch(workspace, /aria-modal=/);
});

test('chat headings use unique React ids when rendered in reusable surfaces', () => {
  assert.match(chat, /const headingId = useId\(\)/);
  assert.match(chat, /aria-labelledby=\{headingId\}/);
  assert.match(chat, /<h2 id=\{headingId\}>/);
  assert.doesNotMatch(chat, /id=["']knowledge-chat-title["']/);
});

test('an active chat request owns every streamed and completed state update', () => {
  assert.match(chat, /const ownsRequest = \(\) => abortRef\.current === controller;/);
  assert.match(chat, /if \(ownsRequest\(\)\) \{\s*setPending\(true\);\s*setStreamedAnswer\(''\);\s*setError\(''\);/);
  assert.match(chat, /if \(ownsRequest\(\)\) \{\s*setStreamedAnswer\(\(current\) =>/);
  assert.match(chat, /if \(!ownsRequest\(\)\) return;\s*const assistantTurn:/);
  assert.match(chat, /if \(ownsRequest\(\) && \(reason as Error\)\.name !== 'AbortError'\)/);
  assert.match(chat, /finally \{\s*if \(ownsRequest\(\)\) \{\s*abortRef\.current = null;\s*setPending\(false\);\s*setStreamedAnswer\(''\);/);
});

test('Stop releases ownership synchronously so stale React state cannot block the next request', () => {
  assert.match(chat, /const activeController = abortRef\.current;\s*if \(question\.length < 2 \|\| \(activeController && !activeController\.signal\.aborted\)\) return;/);
  assert.doesNotMatch(chat, /if \(question\.length < 2 \|\| pending\) return;/);
  assert.match(chat, /function stopActiveTurn\(\) \{\s*const controller = abortRef\.current;\s*if \(!controller\) return;\s*controller\.abort\(\);\s*if \(abortRef\.current !== controller\) return;\s*abortRef\.current = null;/);
  assert.match(chat, /onClick=\{stopActiveTurn\}/);
});

test('New Conversation and unmount revoke old request ownership before clearing transient state', () => {
  assert.match(chat, /function newConversation\(\) \{\s*const controller = abortRef\.current;\s*controller\?\.abort\(\);\s*if \(abortRef\.current === controller\) abortRef\.current = null;\s*setPending\(false\);\s*setStreamedAnswer\(''\);\s*setTurns\(\[\]\);\s*setConversationId\(newTurnId\(\)\);\s*setDraft\(''\);\s*setError\(''\);/);
  assert.match(chat, /useEffect\(\(\) => \(\) => \{\s*const controller = abortRef\.current;\s*controller\?\.abort\(\);\s*if \(abortRef\.current === controller\) abortRef\.current = null;\s*\}, \[\]\);/);
});

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
