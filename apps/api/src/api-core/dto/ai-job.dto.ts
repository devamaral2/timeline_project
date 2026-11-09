import { NotFoundException } from "@nestjs/common";
import type { AiJobDto, AgentChatErrorCode } from "@repo/contracts";
import type { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import type { HermesStep } from "../../infrastructure/hermes/hermes-steps";

type Job = Awaited<ReturnType<AiJobsService["get"]>>;
const errorCodes = new Set<AgentChatErrorCode>([
  "conflict", "invalid_input", "limit_reached", "unavailable", "forbidden", "internal",
]);

/** Os passos que o Hermes deu: no resultado quando o turno terminou, no progresso enquanto ele trabalha. */
function hermesSteps(job: Job): HermesStep[] {
  const fromResult = (job.result as { steps?: unknown } | null)?.steps;
  const fromProgress = (job.progress as { steps?: unknown } | null)?.steps;
  const steps = Array.isArray(fromResult) ? fromResult : Array.isArray(fromProgress) ? fromProgress : [];
  return steps as HermesStep[];
}

/** Excludes actor snapshots, provider inputs, leases and private error messages. */
export function toAiJobDto(job: Job): AiJobDto & { steps?: HermesStep[] } {
  // Os jobs da rota por processo sao internos: o cliente acompanha o processo, nao as filas.
  if (job.kind.startsWith("process-")) throw new NotFoundException("AI job not found");
  const payload = job.payload as {
    mode?: string;
    clientMessageId?: string;
    input?: { text: string; conversationId?: string };
    transcript?: string;
    requestId?: string;
  };
  const request = (payload.mode === "chat" || payload.mode === "hermes") && payload.input
    ? { text: payload.input.text, conversationId: payload.input.conversationId, clientMessageId: payload.clientMessageId }
    : payload.transcript ? { text: payload.transcript, clientMessageId: payload.requestId } : undefined;
  return {
    id: job.id, kind: job.kind as AiJobDto["kind"], status: job.status, userId: job.userId,
    createdAt: new Date(job.createdAt).toISOString(),
    updatedAt: new Date(job.updatedAt).toISOString(),
    progress: typeof job.progress === "string" ? job.progress : undefined,
    errorCode: job.status === "cancelled" ? "cancelled" : job.status === "failed"
      ? job.error && errorCodes.has(job.error as AgentChatErrorCode) ? job.error as AgentChatErrorCode : "unavailable"
      : undefined,
    request,
    result: job.result as AiJobDto["result"],
    // So os jobs do Hermes (ADR 004): os demais clientes do contrato nao veem o campo.
    ...(job.kind === "hermes-turn" ? { steps: hermesSteps(job) } : {}),
  };
}
