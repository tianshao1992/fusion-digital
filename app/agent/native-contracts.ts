import type { SiteAction, SiteActionContext, SiteActionReceipt } from './site-actions';

export type NativeAgentConnection = {
  available: boolean;
  connection: 'local' | 'account' | 'unavailable';
  providers: { id: string; label: string; model: string; available: boolean }[];
  defaultProvider: string | null;
  reason?: string;
};

export type NativeAgentRequest =
  | { intent: 'start'; question: string; locale: 'zh' | 'en'; provider?: string; context: SiteActionContext; history?: { role: 'user' | 'assistant'; content: string }[] }
  | { intent: 'continue'; runId: string; context: SiteActionContext; receipts: SiteActionReceipt[] }
  | { intent: 'cancel'; runId: string };

export type NativeAgentResponse = {
  runId: string;
  status: 'awaiting_tool' | 'completed' | 'failed' | 'cancelled';
  round: number;
  maxRounds: number;
  answer: string;
  provider: string;
  model: string;
  toolCall?: { id: string; name: string; action: SiteAction };
  expectedContext?: SiteActionContext;
  error?: { code: string; message: string };
};
