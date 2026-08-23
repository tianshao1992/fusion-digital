import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  canPersistCanvasDraft,
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

test('the dock exposes chat, context and a bounded local Canvas without claiming unavailable tools', () => {
  assert.match(workspace, /\['chat', 'context', 'canvas'\]/);
  assert.match(workspace, /slice\(0, 20_000\)/);
  assert.match(workspace, /系统尚未读取链接正文/);
  assert.match(workspace, /等待安全网关/);
  assert.match(workspace, /url\.username \|\| url\.password/);
  assert.doesNotMatch(workspace, /dangerouslySetInnerHTML|<iframe|FileReader|readAsDataURL/);
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
