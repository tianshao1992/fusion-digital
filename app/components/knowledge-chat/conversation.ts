export type ChatRole = 'user' | 'assistant';

export type ChatCitation = {
  ref: string;
  label: string;
  url: string;
  kind: string;
  entryTitle: string;
};

export type ChatTurn = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  mode?: 'ai-grounded' | 'retrieval-only';
  citations?: ChatCitation[];
  caveats?: string[];
  notice?: string;
};

export type AskHistoryMessage = Pick<ChatTurn, 'role' | 'content'>;

export const KNOWLEDGE_CHAT_STORAGE_KEY = 'fusiondigital.knowledge-chat.v1';

export const CHAT_LIMITS = Object.freeze({
  maxStoredTurns: 24,
  maxRequestTurns: 10,
  maxUserChars: 600,
  maxAssistantChars: 4_000,
  maxStoredBytes: 56_000,
});

export function compactConversation(input: unknown): ChatTurn[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((value): ChatTurn[] => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Partial<ChatTurn>;
    if (item.role !== 'user' && item.role !== 'assistant') return [];
    const maxChars = item.role === 'user' ? CHAT_LIMITS.maxUserChars : CHAT_LIMITS.maxAssistantChars;
    const content = cleanText(item.content, maxChars);
    if (!content) return [];
    const citations = Array.isArray(item.citations)
      ? item.citations.flatMap((citation): ChatCitation[] => {
          if (!citation || typeof citation !== 'object') return [];
          const entry = citation as Partial<ChatCitation>;
          if (!/^S\d+$/.test(entry.ref ?? '') || !safeHttpUrl(entry.url)) return [];
          return [{
            ref: entry.ref!,
            label: cleanText(entry.label, 240),
            url: entry.url!,
            kind: cleanText(entry.kind, 80),
            entryTitle: cleanText(entry.entryTitle, 240),
          }];
        }).slice(0, 24)
      : undefined;
    return [{
      id: cleanText(item.id, 100) || newTurnId(),
      role: item.role,
      content,
      createdAt: validDate(item.createdAt) ? item.createdAt! : new Date().toISOString(),
      mode: item.mode === 'ai-grounded' || item.mode === 'retrieval-only' ? item.mode : undefined,
      citations,
      caveats: Array.isArray(item.caveats) ? item.caveats.map((entry) => cleanText(entry, 500)).filter(Boolean).slice(0, 5) : undefined,
      notice: cleanText(item.notice, 500) || undefined,
    }];
  }).slice(-CHAT_LIMITS.maxStoredTurns);
}

export function historyForRequest(turns: ChatTurn[]): AskHistoryMessage[] {
  return compactConversation(turns)
    .slice(-CHAT_LIMITS.maxRequestTurns)
    .map(({ role, content }) => ({ role, content }));
}

export function serializeConversation(turns: ChatTurn[]): string {
  const compact = compactConversation(turns);
  while (compact.length) {
    const serialized = JSON.stringify(compact);
    if (new TextEncoder().encode(serialized).byteLength <= CHAT_LIMITS.maxStoredBytes) return serialized;
    compact.shift();
  }
  return '[]';
}

export function deserializeConversation(raw: string | null): ChatTurn[] {
  if (!raw || new TextEncoder().encode(raw).byteLength > CHAT_LIMITS.maxStoredBytes) return [];
  try {
    return compactConversation(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function newTurnId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanText(value: unknown, maxChars: number) {
  return typeof value === 'string'
    ? value.normalize('NFKC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim().slice(0, maxChars)
    : '';
}

function safeHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}
