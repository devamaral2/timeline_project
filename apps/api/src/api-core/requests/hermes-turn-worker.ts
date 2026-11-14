import type { AgentTraceDto } from "@repo/contracts";
import { HermesRequestError, hermesSessionId, type HermesChat } from "../../infrastructure/hermes/hermes.client";
import { isRetryableJobError, jobErrorCode } from "../../infrastructure/jobs/jobs.service";
import { requestErrorCode } from "./request-errors";
import type { RequestStore } from "./request-store";
import type { RequestProgress } from "./request-view";

const PROGRESS_INTERVAL_MS = 400;

/**
 * Entrega a mensagem do pedido ao Hermes (ADR 004). Enquanto ele trabalha, o rastro vai para o progresso do job,
 * que e passageiro; quando termina, a resposta e o rastro viram entradas do pedido e sobrevivem ao job. A sessao
 * do Hermes e a do primeiro pedido: uma continuacao segue o mesmo assunto e a mesma memoria.
 */
export class HermesTurnWorker {
  constructor(
    private readonly store: RequestStore,
    /** Ausente quando o servidor nao configura o Hermes: o pedido falha sem tentar de novo. */
    private readonly hermes?: HermesChat,
  ) {}

  async run(
    requestId: string,
    context: { signal: AbortSignal; progress(value: RequestProgress): Promise<void> },
  ): Promise<void> {
    const request = await this.store.find(requestId);
    if (request?.route !== "hermes" || (request.status !== "queued" && request.status !== "running")) return;
    await this.store.markRunning(request.id);

    // Cada mudanca e uma escrita no banco: so uma por intervalo; o fim grava o rastro completo.
    let lastWrite = 0;
    let writes: Promise<unknown> = Promise.resolve();
    let latest: AgentTraceDto | undefined;
    try {
      if (!this.hermes) throw new HermesRequestError("Hermes is not configured");
      const reply = await this.hermes.chat({
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
