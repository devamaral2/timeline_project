import type { AiJobDto, AgentChatErrorCode } from "@repo/contracts";
import type { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";

type Job = Awaited<ReturnType<AiJobsService["get"]>>;
const errorCodes = new Set<AgentChatErrorCode>([
  "conflict", "conversation_gone", "invalid_input", "limit_reached", "unavailable", "forbidden", "internal",
]);

/** Excludes actor snapshots, provider inputs, leases and private error messages. */
export function toAiJobDto(job: Job): AiJobDto {
  const payload = job.payload as {
    mode?: string;
    clientMessageId?: string;
    input?: { text: string; conversationId?: string };
    transcript?: string;
    requestId?: string;
  };
  const request = payload.mode === "chat" && payload.input
    ? { text: payload.input.text, conversationId: payload.input.conversationId, clientMessageId: payload.clientMessageId }
    : payload.transcript ? { text: payload.transcript, clientMessageId: payload.requestId } : undefined;
  return {
    id: job.id, kind: job.kind, status: job.status, userId: job.userId,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
    progress: typeof job.progress === "string" ? job.progress : undefined,
    errorCode: job.status === "cancelled" ? "cancelled" : job.status === "failed"
      ? job.error && errorCodes.has(job.error as AgentChatErrorCode) ? job.error as AgentChatErrorCode : "unavailable"
      : undefined,
    request,
    result: job.result as AiJobDto["result"],
  };
}
