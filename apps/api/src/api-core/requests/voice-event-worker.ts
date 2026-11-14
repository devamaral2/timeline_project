import type { CreateEventInput } from "@repo/contracts";
import type { EntityBatchWriter } from "../../domain/ports";
import { EVENT_TIME_ZONE, toEntityBatch, type CreateEventUseCase } from "../events/create-event.usecase";
import type { EventCommandParsingGateway } from "../events/gateways/event-command-parsing.gateway";
import { resolveEventSchedule } from "../events/services/event-schedule.service";
import type { RequestStore } from "./request-store";

export const MAX_TRANSCRIPT_LENGTH = 1000;

/**
 * A fala vira um evento de pessoa (ADR 0013): o modelo classifica a frase, o servidor resolve a janela e grava o
 * evento. Na mesma transacao o pedido ganha a relacao com o evento que gerou e termina. "Agora" e o instante em
 * que o pedido foi aceito: a espera na fila nao muda o horario do evento.
 */
export class VoiceEventWorker {
  constructor(
    private readonly deps: {
      store: RequestStore;
      parsing: EventCommandParsingGateway;
      createEvent: Pick<CreateEventUseCase, "prepare">;
      batchWriter: EntityBatchWriter;
    },
  ) {}

  async run(requestId: string): Promise<void> {
    const { store } = this.deps;
    const request = await store.find(requestId);
    if (request?.route !== "voice" || (request.status !== "queued" && request.status !== "running")) return;
    await store.markRunning(request.id);

    const parsed = await this.deps.parsing.parseCommand({ text: request.prompt });
    // A frase falada sempre vira a descricao, para o usuario saber o que foi entendido ao editar.
    const input: CreateEventInput = { ...parsed.input, description: request.prompt };
    const schedule = resolveEventSchedule(parsed.schedule, request.createdAt, EVENT_TIME_ZONE);
    const prepared = await this.deps.createEvent.prepare(input, { userId: request.userId }, schedule);
    await this.deps.batchWriter.commit({
      ...toEntityBatch(prepared),
      afterWrite: (tx) => store.completeVoice(tx, { requestId: request.id, eventId: prepared.event.id }),
    });
  }
}
