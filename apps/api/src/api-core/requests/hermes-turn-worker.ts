import type { AgentTraceDto } from "@repo/contracts";
import { isInProgressAgentStatus } from "../../domain/agent-status";
import { hermesSessionId, type HermesChat } from "../../infrastructure/hermes/hermes.client";
import { isRetryableJobError, jobErrorCode } from "../../infrastructure/jobs/jobs.service";
import { requestErrorCode } from "./request-errors";
import type { RequestStore } from "./request-store";
import type { RequestProgress } from "./request-view";

const PROGRESS_INTERVAL_MS = 400;

/** O que o pedido responde quando chega ao Hermes com ele desligado (`AI_AUTOMATION`): pelo `/hermes` ou pelo fallback. */
export const HERMES_OFF_MESSAGE = "O Hermes está desligado neste ambiente (AI_AUTOMATION), e só ele atende o que os agentes da agenda não reconhecem.";

/**
 * Entrega a mensagem do pedido ao Hermes (ADR 004). Enquanto ele trabalha, o rastro vai para o progresso do job,
 * que e passageiro; quando termina, a resposta e o rastro viram entradas do pedido e sobrevivem ao job. A sessao
 * do Hermes e a do primeiro pedido: uma continuacao segue o mesmo assunto e a mesma memoria. Chegam aqui o
 * `/hermes` do chat e o fallback do pedido por passos (`RequestStore.handToHermes`).
 */
export class HermesTurnWorker {
  constructor(
    private readonly store: RequestStore,
    /** Ausente com o Hermes desligado (`AI_AUTOMATION`): o pedido falha com o aviso, sem tentar de novo. */
    private readonly hermes?: HermesChat,
  ) {}

  async run(
    requestId: string,
    context: { signal: AbortSignal; progress(value: RequestProgress): Promise<void> },
  ): Promise<void> {
    const request = await this.store.find(requestId);
    if (request?.route !== "hermes" || !isInProgressAgentStatus(request.status)) return;
    if (!this.hermes) {
      await this.store.finish(request.id, "failed", { errorCode: "unavailable", message: HERMES_OFF_MESSAGE });
      return;
    }
    const hermes = this.hermes;
    await this.store.markRunning(request.id);

    // Cada mudanca e uma escrita no banco: so uma por intervalo; o fim grava o rastro completo.
    let lastWrite = 0;
    let writes: Promise<unknown> = Promise.resolve();
    let latest: AgentTraceDto | undefined;
    try {
      const reply = await hermes.chat({
        text: request.prompt,
        sessionId: hermesSessionId(request.userId, request.sessionId ?? request.id),
        signal: context.signal,
        onTrace: (trace) => {
          latest = trace;
          const now = Date.now();
          if (now - lastWrite < PROGRESS_INTERVAL_MS) return;
          lastWrite = now;
          writes = writes.then(() => context.progress({ trace })).catch(() => {});
        },
      });
      await writes;
      await this.store.finish(request.id, "done", { message: reply.text, trace: reply.trace });
    } catch (error) {
      await writes;
      // Cancelado ou ainda com tentativa na fila: quem decide o fim do pedido nao e esta execucao.
      if (context.signal.aborted || isRetryableJobError(error)) throw error;
      await this.store.finish(request.id, "failed", {
        errorCode: requestErrorCode(jobErrorCode(error)), ...(latest ? { trace: latest } : {}),
      });
      throw error;
    }
  }
}
