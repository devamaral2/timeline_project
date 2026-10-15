import type { AgentChatErrorCode } from "./agent-chat.dto";
import type { AgentScreenContext, RunAgentResponse } from "./agent-run.dto";

export type AiJobKind = "agent-turn" | "transcript-event" | "meal-note";
export type AiJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/** A durable operation. Reopening a client never resubmits an accepted job. */
export interface AiJobDto {
  id: string;
  kind: AiJobKind;
  status: AiJobStatus;
  userId: string;
  createdAt: string;
  updatedAt: string;
  progress?: string;
  errorCode?: AgentChatErrorCode;
  request?: {
    text: string;
    conversationId?: string;
    clientMessageId?: string;
  };
  result?: (RunAgentResponse & { conversationId?: string; assistantSeq?: number })
    | { eventId: string; kind: string }
    | { noteId: string; skipped?: boolean };
}

/** POST /api/ai/jobs. A stable clientMessageId makes submission idempotent. */
export interface SubmitAiJobRequest {
  userId: string;
  text: string;
  context?: AgentScreenContext;
  conversationId?: string;
  clientMessageId: string;
}
