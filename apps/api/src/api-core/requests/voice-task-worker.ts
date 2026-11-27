import type { CreateTaskInput } from "@repo/contracts";
import type { EntityBatchWriter } from "../../domain/ports";
import { isInProgressAgentStatus } from "../../domain/agent-status";
import { TASK_TIME_ZONE, toEntityBatch, type CreateTaskUseCase } from "../tasks/create-task.usecase";
import type { TaskCommandParsingGateway } from "../tasks/gateways/task-command-parsing.gateway";
import { resolveTaskSchedule } from "../tasks/services/task-schedule.service";
import type { PlaceResolver } from "../tasks/services/place-resolver.service";
import type { RequestStore } from "./request-store";

export const MAX_TRANSCRIPT_LENGTH = 1000;

/**
 * A fala vira uma tarefa de pessoa (ADR 0013): o modelo classifica a frase, o servidor resolve a janela e grava o
 * tarefa. Na mesma transacao o pedido ganha a relacao com a tarefa que gerou e termina. "Agora" e o instante em
 * que o pedido foi aceito: a espera na fila nao muda o horario da tarefa.
 */
export class VoiceTaskWorker {
  constructor(
    private readonly deps: {
      store: RequestStore;
      parsing: TaskCommandParsingGateway;
      createTask: Pick<CreateTaskUseCase, "prepare">;
      batchWriter: EntityBatchWriter;
      /** Troca o lugar dito pelo endereco de um lugar que existe. Sem ele, o local fica como foi dito. */
      places?: Pick<PlaceResolver, "resolve">;
    },
  ) {}

  async run(requestId: string): Promise<void> {
    const { store } = this.deps;
    const request = await store.find(requestId);
    if (request?.route !== "voice" || !isInProgressAgentStatus(request.status)) return;
    await store.markRunning(request.id);

    const parsed = await this.deps.parsing.parseCommand({ text: request.prompt });
    // O lugar citado na fala e procurado no mapa; sem lugar citado, a tarefa nasce sem local.
    const said = parsed.place?.trim();
    const location = said ? await (this.deps.places?.resolve(said) ?? said) : undefined;
    // A frase falada sempre vira a descricao, para o usuario saber o que foi entendido ao editar.
    const input: CreateTaskInput = {
      ...parsed.input, description: request.prompt,
      ...(location ? { location } : {}),
    };
    const schedule = resolveTaskSchedule(parsed.schedule, request.createdAt, TASK_TIME_ZONE);
    const prepared = await this.deps.createTask.prepare(input, { userId: request.userId }, schedule);
    await this.deps.batchWriter.commit({
      ...toEntityBatch(prepared),
      afterWrite: (tx) => store.completeVoice(tx, { requestId: request.id, taskId: prepared.task.id }),
    });
  }
}
