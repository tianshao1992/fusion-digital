export type ChatRole = 'user' | 'assistant';
export type ChatProviderId = 'openai' | 'anthropic' | 'deepseek' | 'kimi';

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
  mode?: 'assistant-chat' | 'ai-grounded' | 'retrieval-only' | 'assistant-direct';
  citations?: ChatCitation[];
  caveats?: string[];
  notice?: string;
  provider?: ChatProviderId;
  model?: string;
};

export type AskHistoryMessage = Pick<ChatTurn, 'role' | 'content'>;

export const KNOWLEDGE_CHAT_STORAGE_KEY = 'fusiondigital.knowledge-chat.v1';

export function knowledgeChatStorageKey(locale: 'zh-CN' | 'en') {
  return `${KNOWLEDGE_CHAT_STORAGE_KEY}.${locale === 'en' ? 'en' : 'zh-CN'}`;
}

export const CHAT_LIMITS = Object.freeze({
  maxStoredTurns: 24,
  maxRequestTurns: 10,
  maxRequestHistoryBytes: 28_000,
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
      mode: item.mode === 'assistant-chat' || item.mode === 'ai-grounded' || item.mode === 'retrieval-only' || item.mode === 'assistant-direct' ? item.mode : undefined,
      citations,
      caveats: Array.isArray(item.caveats) ? item.caveats.map((entry) => cleanText(entry, 500)).filter(Boolean).slice(0, 5) : undefined,
      notice: cleanText(item.notice, 500) || undefined,
      provider: isProviderId(item.provider) ? item.provider : undefined,
      model: cleanText(item.model, 120) || undefined,
    }];
  }).slice(-CHAT_LIMITS.maxStoredTurns);
}

export function historyForRequest(turns: ChatTurn[]): AskHistoryMessage[] {
  const candidates = compactConversation(turns).slice(-CHAT_LIMITS.maxRequestTurns);
  const selected: AskHistoryMessage[] = [];
  let encodedBytes = 2; // JSON array brackets.

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const { role, content } = candidates[index];
    const message = { role, content };
    const messageBytes = new TextEncoder().encode(JSON.stringify(message)).byteLength;
    const delimiterBytes = selected.length ? 1 : 0;
    if (encodedBytes + delimiterBytes + messageBytes > CHAT_LIMITS.maxRequestHistoryBytes) break;
    selected.unshift(message);
    encodedBytes += delimiterBytes + messageBytes;
  }

  return selected;
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

function isProviderId(value: unknown): value is ChatProviderId {
  return value === 'openai' || value === 'anthropic' || value === 'deepseek' || value === 'kimi';
}
