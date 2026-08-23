import type { SearchHit } from "@/app/search/search-core";

export type AgentTurnMode = "assistant-chat" | "ai-grounded" | "retrieval-only" | "assistant-direct";

export const AGENT_CANVAS_LIMITS = Object.freeze({
  maxTitleCharacters: 120,
  maxContentCharacters: 8_000,
});

export type AgentCanvasArtifact = {
  kind: "markdown";
  title: string;
  content: string;
};

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
  canvas?: AgentCanvasArtifact | null;
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
