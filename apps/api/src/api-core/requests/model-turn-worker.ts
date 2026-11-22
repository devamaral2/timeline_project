import type { AgentTraceDto } from "@repo/contracts";
import type { ModelChat, ModelHistoryMessage } from "../../infrastructure/model-agent/model-agent";
import { isRetryableJobError, jobErrorCode } from "../../infrastructure/jobs/jobs.service";
import { formatNow, isoNow, TIME_ZONE } from "../agent/time";
import { requestErrorCode } from "./request-errors";
import type { RequestRecord, RequestStore } from "./request-store";
import type { RequestProgress } from "./request-view";

const PROGRESS_INTERVAL_MS = 400;
/** Quantas trocas anteriores da sessao o modelo recebe: o bastante para seguir o assunto sem pagar a conversa toda. */
const MAX_HISTORY_TURNS = 20;

/** O que o pedido responde quando chega ao modo modelo sem nenhuma chave de provedor neste ambiente. */
export const MODEL_OFF_MESSAGE = "O modo modelo está desligado neste ambiente.";

/**
 * Entrega a mensagem do pedido ao modelo escolhido (ADR 0019), como o `HermesTurnWorker` faz com o Hermes: enquanto
 * ele trabalha, o rastro vai para o progresso do job; quando termina, a resposta e o rastro viram entradas do pedido.
 * Nenhum provedor guarda a conversa, entao as trocas anteriores da sessao vao junto, so o texto: a pergunta e a
 * resposta de cada pedido, em qualquer modo e com qualquer modelo, porque para quem conversa e uma conversa so.
 */
export class ModelTurnWorker {
  constructor(
    private readonly store: RequestStore,
    /** Ausente sem nenhuma chave de provedor: o pedido falha com o aviso, sem tentar de novo. */
    private readonly agent?: ModelChat,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run(
    requestId: string,
    context: { signal: AbortSignal; progress(value: RequestProgress): Promise<void> },
  ): Promise<void> {
    const request = await this.store.find(requestId);
    if (request?.route !== "model" || (request.status !== "queued" && request.status !== "running")) return;
    if (!this.agent || !request.model) {
      await this.store.finish(request.id, "failed", { errorCode: "unavailable", message: MODEL_OFF_MESSAGE });
      return;
    }
    const agent = this.agent;
    const selection = request.model;
    await this.store.markRunning(request.id);
    const history = await this.historyOf(request);
    const now = this.clock();

    // Cada mudanca e uma escrita no banco: so uma por intervalo; o fim grava o rastro completo.
    let lastWrite = 0;
    let writes: Promise<unknown> = Promise.resolve();
    let latest: AgentTraceDto | undefined;
    try {
      const reply = await agent.chat({
        selection,
        text: request.prompt,
        history,
        context: `Agora: ${formatNow(now)} (${isoNow(now)}, fuso ${TIME_ZONE}).`,
        signal: context.signal,
        onTrace: (trace) => {
          latest = trace;
          const at = Date.now();
          if (at - lastWrite < PROGRESS_INTERVAL_MS) return;
          lastWrite = at;
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

  /** As trocas que vieram antes deste pedido na sessao, so as que tiveram resposta. */
  private async historyOf(request: RequestRecord): Promise<ModelHistoryMessage[]> {
    const sessionId = request.sessionId;
    if (!sessionId) return [];
    const turns = await this.store.sessionTurns(request.userId, sessionId, MAX_HISTORY_TURNS + 1);
    return turns
      .filter((turn) => turn.id < request.id && turn.prompt && turn.answer)
      .slice(-MAX_HISTORY_TURNS)
      .flatMap((turn): ModelHistoryMessage[] => [
        { role: "user", text: turn.prompt },
        { role: "assistant", text: turn.answer ?? "" },
      ]);
  }
}
