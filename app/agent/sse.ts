import type {
  AgentCompletedMessage,
  AgentStreamEvent,
  AgentStreamEventName,
} from "./contracts";

export const AGENT_STREAM_LIMITS = Object.freeze({
  maxDeltaCharacters: 180,
  maxEventBytes: 768_000,
  maxStreamBytes: 1_500_000,
  maxEvents: 1_024,
});

const EVENT_NAMES = new Set<AgentStreamEventName>([
  "run.started",
  "message.delta",
  "message.completed",
  "run.completed",
  "run.failed",
]);
const textEncoder = new TextEncoder();

export class AgentStreamProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentStreamProtocolError";
  }
}

export function encodeAgentStreamEvent(event: AgentStreamEvent): Uint8Array {
  const block = `id: ${event.sequence}\nevent: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`;
  const encoded = textEncoder.encode(block);
  if (encoded.byteLength > AGENT_STREAM_LIMITS.maxEventBytes) {
    throw new AgentStreamProtocolError("Agent stream event exceeds the size limit");
  }
  return encoded;
}

export function splitVerifiedAnswer(answer: string): string[] {
  const characters = Array.from(answer);
  const chunks: string[] = [];
  for (let index = 0; index < characters.length; index += AGENT_STREAM_LIMITS.maxDeltaCharacters) {
    chunks.push(characters.slice(index, index + AGENT_STREAM_LIMITS.maxDeltaCharacters).join(""));
  }
  return chunks;
}

export class AgentEventStreamParser {
  private buffer = "";
  private totalBytes = 0;
  private eventCount = 0;
  private runId = "";
  private lastSequence = 0;
  private accumulatedAnswer = "";
  private phase: "initial" | "streaming" | "message-completed" | "terminal" = "initial";

  push(chunk: string): AgentStreamEvent[] {
    if (!chunk) return [];
    this.totalBytes += textEncoder.encode(chunk).byteLength;
    if (this.totalBytes > AGENT_STREAM_LIMITS.maxStreamBytes) {
      throw new AgentStreamProtocolError("Agent stream exceeds the size limit");
    }
    if (this.phase === "terminal" && chunk.trim()) {
      throw new AgentStreamProtocolError("Agent stream continued after a terminal event");
    }

    this.buffer += chunk;
    const events: AgentStreamEvent[] = [];
    let boundary = findBoundary(this.buffer);
    while (boundary) {
      const block = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary.length);
      if (textEncoder.encode(block).byteLength > AGENT_STREAM_LIMITS.maxEventBytes) {
        throw new AgentStreamProtocolError("Agent stream event exceeds the size limit");
      }
      if (block.trim()) events.push(this.accept(parseEventBlock(block)));
      boundary = findBoundary(this.buffer);
    }
    if (textEncoder.encode(this.buffer).byteLength > AGENT_STREAM_LIMITS.maxEventBytes) {
      throw new AgentStreamProtocolError("Agent stream event buffer exceeds the size limit");
    }
    return events;
  }

  finish(): AgentStreamEvent[] {
    const trailing = this.buffer.trim();
    this.buffer = "";
    if (trailing) throw new AgentStreamProtocolError("Agent stream ended with an incomplete event");
    if (this.phase !== "terminal") throw new AgentStreamProtocolError("Agent stream ended without a terminal event");
    return [];
  }

  private accept(event: AgentStreamEvent): AgentStreamEvent {
    this.eventCount += 1;
    if (this.eventCount > AGENT_STREAM_LIMITS.maxEvents) {
      throw new AgentStreamProtocolError("Agent stream contains too many events");
    }
    if (event.sequence !== this.lastSequence + 1) {
      throw new AgentStreamProtocolError("Agent stream sequence is not monotonic");
    }

    if (this.phase === "initial") {
      if (event.event !== "run.started" || event.sequence !== 1) {
        throw new AgentStreamProtocolError("Agent stream must start with run.started");
      }
      this.runId = event.runId;
      this.phase = "streaming";
    } else {
      if (event.runId !== this.runId) throw new AgentStreamProtocolError("Agent stream run id changed");
      if (this.phase === "terminal") throw new AgentStreamProtocolError("Agent stream continued after a terminal event");
      if (event.event === "run.started") throw new AgentStreamProtocolError("Agent stream contains duplicate run.started events");
      if (event.event === "message.delta") {
        if (this.phase !== "streaming") throw new AgentStreamProtocolError("Message delta arrived after completion");
        this.accumulatedAnswer += event.delta;
      } else if (event.event === "message.completed") {
        if (this.phase !== "streaming") throw new AgentStreamProtocolError("Message completed more than once");
        if (event.message.answer !== this.accumulatedAnswer) {
          throw new AgentStreamProtocolError("Agent message deltas do not match the completed answer");
        }
        this.phase = "message-completed";
      } else if (event.event === "run.completed") {
        if (this.phase !== "message-completed") throw new AgentStreamProtocolError("Run completed before the message");
        this.phase = "terminal";
      } else if (event.event === "run.failed") {
        if (this.phase === "message-completed") throw new AgentStreamProtocolError("Run failed after a completed message");
        this.phase = "terminal";
      }
    }
    this.lastSequence = event.sequence;
    return event;
  }
}

export function isAgentCompletedMessage(value: unknown): value is AgentCompletedMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return (message.mode === "ai-grounded" || message.mode === "retrieval-only" || message.mode === "assistant-direct")
    && typeof message.answer === "string"
    && message.answer.length > 0
    && Array.isArray(message.citations)
    && Array.isArray(message.results);
}

function parseEventBlock(block: string): AgentStreamEvent {
  let id = "";
  let eventName = "";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    const rawValue = separator === -1 ? "" : line.slice(separator + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "id") id = value;
    else if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
  }
  if (!/^\d+$/.test(id) || !EVENT_NAMES.has(eventName as AgentStreamEventName) || !dataLines.length) {
    throw new AgentStreamProtocolError("Agent stream event envelope is invalid");
  }

  let value: unknown;
  try {
    value = JSON.parse(dataLines.join("\n"));
  } catch {
    throw new AgentStreamProtocolError("Agent stream event data is not valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AgentStreamProtocolError("Agent stream event data is invalid");
  }
  const candidate = value as Record<string, unknown>;
  const sequence = Number(id);
  if (candidate.event !== eventName || candidate.sequence !== sequence || typeof candidate.runId !== "string" || !candidate.runId) {
    throw new AgentStreamProtocolError("Agent stream event metadata does not match its envelope");
  }

  if (eventName === "run.started" && candidate.delivery !== "verified-delivery") {
    throw new AgentStreamProtocolError("Agent stream delivery mode is invalid");
  }
  if (eventName === "message.delta" && (typeof candidate.delta !== "string" || !candidate.delta || Array.from(candidate.delta).length > AGENT_STREAM_LIMITS.maxDeltaCharacters)) {
    throw new AgentStreamProtocolError("Agent message delta is invalid");
  }
  if (eventName === "message.completed" && !isAgentCompletedMessage(candidate.message)) {
    throw new AgentStreamProtocolError("Agent completed message is invalid");
  }
  if (eventName === "run.completed" && candidate.status !== "completed") {
    throw new AgentStreamProtocolError("Agent completion status is invalid");
  }
  if (eventName === "run.failed") {
    const error = candidate.error;
    if (!error || typeof error !== "object" || Array.isArray(error)
      || typeof (error as Record<string, unknown>).code !== "string"
      || typeof (error as Record<string, unknown>).message !== "string") {
      throw new AgentStreamProtocolError("Agent failure payload is invalid");
    }
  }
  return candidate as unknown as AgentStreamEvent;
}

function findBoundary(value: string): { index: number; length: number } | null {
  const match = /\r?\n\r?\n/.exec(value);
  return match ? { index: match.index, length: match[0].length } : null;
}
