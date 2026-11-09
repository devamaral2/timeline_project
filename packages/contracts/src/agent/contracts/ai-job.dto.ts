import type { AgentChatErrorCode } from "./agent-chat.dto";

export type AiJobKind = "transcript-event" | "meal-note" | "hermes-turn";
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
  result?:
    | { eventId: string; kind: string }
    | { noteId: string; skipped?: boolean }
    | { text: string };
}
