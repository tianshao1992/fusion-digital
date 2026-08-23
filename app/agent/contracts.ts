import type { SearchHit } from "@/app/search/search-core";

export type AgentTurnMode = "ai-grounded" | "retrieval-only" | "assistant-direct";

export type AgentTurnCitation = {
  ref: string;
  entryId: string;
  entryTitle: string;
  kind: string;
  label: string;
  url: string;
  detail?: string;
};

export type AgentCompletedMessage = {
  mode: AgentTurnMode;
  answer: string;
  caveats?: string[];
  citations: AgentTurnCitation[];
  results: SearchHit[];
  notice?: string;
  conversationId?: string;
  provider?: "openai" | "anthropic" | "deepseek" | "kimi";
  model?: string;
};

type AgentEventBase = {
  runId: string;
  sequence: number;
};

export type AgentRunStartedEvent = AgentEventBase & {
  event: "run.started";
  delivery: "verified-delivery";
};

export type AgentMessageDeltaEvent = AgentEventBase & {
  event: "message.delta";
  delta: string;
};

export type AgentMessageCompletedEvent = AgentEventBase & {
  event: "message.completed";
  message: AgentCompletedMessage;
};

export type AgentRunCompletedEvent = AgentEventBase & {
  event: "run.completed";
  status: "completed";
};

export type AgentRunFailedEvent = AgentEventBase & {
  event: "run.failed";
  error: {
    code: string;
    message: string;
  };
};

export type AgentStreamEvent =
  | AgentRunStartedEvent
  | AgentMessageDeltaEvent
  | AgentMessageCompletedEvent
  | AgentRunCompletedEvent
  | AgentRunFailedEvent;

export type AgentStreamEventName = AgentStreamEvent["event"];
