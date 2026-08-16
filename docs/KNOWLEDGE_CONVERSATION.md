# FusionDigital knowledge conversation

The evidence conversation is a reusable client surface backed by `POST /api/ask`.
It is currently mounted on `/search` and inside the knowledge-graph explorer.

## Page integration

```tsx
import KnowledgeChat from '@/app/components/knowledge-chat/KnowledgeChat';

<KnowledgeChat
  context={{
    path: '/physics',
    title: '物理模拟',
    focusId: selectedRecord?.id,
    focusLabel: selectedRecord?.title,
    focusDescription: selectedRecord?.summary,
  }}
/>
```

`context` helps resolve conversational references but is never treated as factual
evidence. Each turn performs a fresh deterministic search. Only retrieved records
with public source URLs may support model claims.

Conversation history is bounded and stored in browser local storage. It is sent
back as untrusted dialogue context rather than persisted in D1. The server keeps
all provider credentials private, reserves authenticated-user quota before a model call,
requests structured claim-level citations, validates every citation reference, and
falls back to a deterministic cited digest whenever the model path is unavailable.

The selector supports OpenAI, Anthropic Claude, DeepSeek and Kimi/Moonshot. It only
receives provider availability and the server-approved model name from
`GET /api/ask/providers`; API keys and upstream endpoints never enter browser state.
Each provider is configured with its server-side `*_API_KEY` and optional `*_MODEL`.
With no provider key, the same UI remains usable and labels its output as retrieval
fallback. See [LLM provider configuration](./LLM_PROVIDER_CONFIGURATION.md).
