export type StoredAgentThread = {
  id: string;
  ownerSubject: string;
  createdAt: string;
  updatedAt: string;
};

export interface AgentRepository {
  readonly available: boolean;
  getThread(id: string, ownerSubject: string): Promise<StoredAgentThread | null>;
  saveThread(thread: StoredAgentThread): Promise<void>;
}

export class AgentRepositoryUnavailableError extends Error {
  readonly code = "AGENT_REPOSITORY_UNAVAILABLE";

  constructor() {
    super("Durable agent thread persistence is not configured");
    this.name = "AgentRepositoryUnavailableError";
  }
}

/**
 * Explicit unavailable port for the current browser-local delivery slice.
 * A future PostgreSQL adapter must be configured server-side before the
 * capability profile may advertise durable or resumable conversations.
 */
export class UnavailableAgentRepository implements AgentRepository {
  readonly available = false;

  async getThread(): Promise<null> {
    throw new AgentRepositoryUnavailableError();
  }

  async saveThread(): Promise<void> {
    throw new AgentRepositoryUnavailableError();
  }
}

export function createAgentRepository(): AgentRepository {
  return new UnavailableAgentRepository();
}
