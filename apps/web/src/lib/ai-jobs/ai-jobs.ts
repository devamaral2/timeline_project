import { authedFetch } from "@/lib/api/authed-fetch";
import type { AgentChatErrorCode } from "@/lib/api/contracts";

/** HTTP wire shape shared by voice capture, meal generation and the Hermes turn. */
export interface AiJobDto {
  id: string;
  kind: "transcript-event" | "meal-note" | "hermes-turn";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  userId: string;
  createdAt: string;
  updatedAt: string;
  progress?: string;
  errorCode?: AgentChatErrorCode;
  request?: { text: string; conversationId?: string; clientMessageId?: string };
  result?: { eventId: string; kind: string }
    | { noteId: string; skipped?: boolean };
}

export const aiJobs = {
  list: () => authedFetch<AiJobDto[]>("/api/ai/jobs"),
  get: (id: string) => authedFetch<AiJobDto>(`/api/ai/jobs/${encodeURIComponent(id)}`),
  voice: (transcript: string, requestId: string) =>
    authedFetch<AiJobDto>("/api/events/voice/jobs", json({ transcript, requestId })),
  cancel: (id: string) => authedFetch<AiJobDto>(`/api/ai/jobs/${encodeURIComponent(id)}/cancel`, json({})),
};

function json(body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function isJobPending(job: AiJobDto): boolean {
  return job.status === "queued" || job.status === "running";
}

export function operationId(): string {
  return crypto.randomUUID();
}
