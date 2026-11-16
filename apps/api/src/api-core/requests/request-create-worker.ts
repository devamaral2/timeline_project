import type { GeoPointInput } from "@repo/contracts";
import type { ArtifactRepository, EntityBatchWriter, EventRepository, RecurrenceRepository } from "../../domain/ports";
import { AgentRunCancelledError } from "../agent/errors/agent.errors";
import { AgentChangeSession } from "../agent/services/agent-change-session";
import { TIME_ZONE } from "../agent/time";
import type { CreateEventUseCase } from "../events/create-event.usecase";
import type { PlaceResolver } from "../events/services/place-resolver.service";
import {
  artifactCreateOutput, taskCreateOutput, recurringTaskCreateOutput,
  type ArtifactCreateOutput, type TaskCreateOutput, type RecurringTaskCreateOutput,
} from "./request-agent-schemas";
import { describeRequest, type RequestAgentRunner } from "./request-agent-runner";
import { RuleError, seriesInput } from "./request-recurrence";
import { runStep, StepFailure, validInstant, type StepPayload } from "./request-step-common";
import type { CreateAgent } from "./request-steps";
import type { NewEntity, RequestRecord, RequestStore, StepRecord } from "./request-store";

export interface StepRepositories {
  events: EventRepository;
  artifacts: ArtifactRepository;
  recurrences?: RecurrenceRepository;
}

/**
 * Executa um passo de criacao: o agente extrai os itens do pedido (sem consultar nada), o servidor valida,
 * grava as entidades num commit proprio e, na mesma transacao, registra o passo, as relacoes dele com o que
 * criou e enfileira a finalizacao. Falha vira passo vermelho: nunca pergunta e nunca refaz o passo.
 */
export class RequestCreateWorker {
  constructor(
    private readonly deps: {
      store: RequestStore;
      runner: RequestAgentRunner;
      batchWriter: EntityBatchWriter;
      repositories: StepRepositories;
      createEvent: CreateEventUseCase;
      /** Troca o lugar dito pelo endereco de um lugar que existe. Sem ele, o local fica como foi dito. */
      places?: Pick<PlaceResolver, "resolve">;
    },
  ) {}

  async run(agent: CreateAgent, payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store } = this.deps;
    await runStep(store, payload, signal, async ({ request, step, timings }) => {
      const session = new AgentChangeSession(
        request.userId, this.deps.repositories, this.deps.createEvent, () => request.createdAt,
      );
      const started = performance.now();
      const entities = await this.stage(agent, request, step, session, signal);
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();
      if (entities.length === 0) throw new StepFailure("empty");

      await this.deps.batchWriter.commit({
        ...session.toBatch(),
        afterWrite: (tx) => store.recordStepSuccess(tx, { requestId: request.id, stepId: step.id, entities, timings }),
      });
    });
  }

  private async stage(
    agent: CreateAgent,
    request: RequestRecord,
    step: StepRecord,
    session: AgentChangeSession,
    signal?: AbortSignal,
  ): Promise<NewEntity[]> {
    const user = describeRequest(request.prompt, step.expected, request.context, step.input?.instruction);
    const base = { agent, now: request.createdAt, user, signal, stepId: step.id };
    switch (agent) {
      case "task-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: taskCreateOutput });
        return this.stageTasks(session, value, request.context?.coordinates);
      }
      case "artifact-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: artifactCreateOutput });
        return this.stageArtifacts(session, value, request.createdAt);
      }
      case "recurring-task-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: recurringTaskCreateOutput });
        return this.stageSeries(session, value, request.context?.coordinates);
      }
    }
  }

  /**
   * Cada serie nova entra com a primeira ocorrencia no mesmo lote (e uma linha de verdade, que o pedido
   * mostra). O template nao traz artefatos, nem o alimento de uma refeicao. O lugar dito e procurado no mapa
   * perto de onde a pessoa esta, e toda ocorrencia nasce com ele.
   */
  private async stageSeries(
    session: AgentChangeSession, output: RecurringTaskCreateOutput, coordinates?: GeoPointInput,
  ): Promise<NewEntity[]> {
    const today = session.todayIn(TIME_ZONE);
    for (const series of output.series) {
      const said = series.location?.trim();
      const location = said ? await (this.deps.places?.resolve(said, coordinates) ?? said) : null;
      let input: ReturnType<typeof seriesInput>;
      try {
        input = seriesInput({ ...series, location }, today, TIME_ZONE);
      } catch (error) {
        if (error instanceof RuleError) throw new StepFailure("rejected");
        throw error;
      }
      const result = await session.createRecurrence(input, { derivedArtifacts: false });
      if (!result.ok) throw new StepFailure("rejected");
    }
    return session.result().created
      .filter((item) => item.kind === "task")
      .map((item): NewEntity => ({ ...item, operation: "create" }));
  }

  /**
   * O alimento de uma refeicao nao nasce aqui: quem cria artefatos e outro passo, e a finalizacao os liga. O lugar
   * dito e procurado no mapa perto de onde a pessoa esta; sem lugar dito, vale o endereco de onde ela esta.
   */
  private async stageTasks(
    session: AgentChangeSession, output: TaskCreateOutput, coordinates?: GeoPointInput,
  ): Promise<NewEntity[]> {
    const ids: string[] = [];
    for (const item of output.tasks) {
      const said = item.location?.trim();
      const location = said ? await (this.deps.places?.resolve(said, coordinates) ?? said) : undefined;
      const result = await session.createEvent({
        name: item.name,
        kind: item.kind,
        status: item.status ?? undefined,
        priority: item.priority ?? undefined,
        longRunning: item.longRunning ?? undefined,
        startedAt: validInstant(item.startedAt),
        estimatedFinishAt: validInstant(item.estimatedFinishAt),
        description: item.description ?? undefined,
        tags: item.tags,
        ...(location ? { location } : {}),
        ...(coordinates ? { coordinates } : {}),
      }, { derivedArtifacts: false });
      if (!result.ok) throw new StepFailure("rejected");
      ids.push(result.id);
    }

    // A sequencia entre as tarefas da propria lista: a posicao que o agente deu vira o id recem-criado.
    for (const [index, item] of output.tasks.entries()) {
      for (const previousIndex of item.followsFrom) {
        const previous = ids[previousIndex];
        const next = ids[index];
        if (!previous || !next || previous === next) throw new StepFailure("rejected");
        const result = await session.sequenceTasks(previous, next);
        if (!result.ok) throw new StepFailure("rejected");
      }
    }
    return ids.map((id): NewEntity => ({ kind: "task", id, operation: "create" }));
  }

  /** O alimento nasce pendente: gravar o artefato abre o pedido de construcao que calcula os nutrientes. */
  private async stageArtifacts(session: AgentChangeSession, output: ArtifactCreateOutput, now: Date): Promise<NewEntity[]> {
    const entities: NewEntity[] = [];
    for (const item of output.artifacts) {
      if (item.type === "food") {
        const food = await session.buildArtifact({ type: "food", name: item.name, data: { inputText: item.content } }, now);
        session.stageNewArtifact(food);
        entities.push({ kind: "artifact", id: food.id, operation: "create" });
        continue;
      }
      const result = await session.createArtifact({ name: item.name, content: item.content });
      if (!result.ok) throw new StepFailure("rejected");
      entities.push({ kind: "artifact", id: result.id, operation: "create" });
    }
    return entities;
  }
}
