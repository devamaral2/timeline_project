import { authedFetch } from "@/lib/api/authed-fetch";
import type { AgentChatErrorCode, AgentChatServerFrame, AgentScreenContext } from "@/lib/api/contracts";

type RunAgentResponse = Pick<Extract<AgentChatServerFrame, { type: "reply" }>,
  "agentResponse" | "entities" | "createdEntities" | "updatedEntities" | "deletedEntities">;

/** HTTP wire shape shared by chat, voice capture and meal generation. */
export interface AiJobDto {
  id: string;
  kind: "agent-turn" | "transcript-event" | "meal-note";
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  userId: string;
  createdAt: string;
  updatedAt: string;
  progress?: string;
  errorCode?: AgentChatErrorCode;
  request?: { text: string; conversationId?: string; clientMessageId?: string };
  result?: (RunAgentResponse & { conversationId?: string; assistantSeq?: number })
    | { eventId: string; kind: string }
    | { noteId: string; skipped?: boolean };
}

export interface SubmitAiJobRequest {
  userId: string;
  text: string;
  context?: AgentScreenContext;
  conversationId?: string;
  clientMessageId: string;
}

export const aiJobs = {
  list: () => authedFetch<AiJobDto[]>("/api/ai/jobs"),
  get: (id: string) => authedFetch<AiJobDto>(`/api/ai/jobs/${encodeURIComponent(id)}`),
  submit: (request: SubmitAiJobRequest) => authedFetch<AiJobDto>("/api/ai/jobs", json(request)),
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
