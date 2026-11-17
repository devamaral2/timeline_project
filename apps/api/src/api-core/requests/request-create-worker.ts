import type { ArtifactRepository, EntityBatchWriter, TaskRepository, RecurrenceRepository } from "../../domain/ports";
import { AgentRunCancelledError } from "../agent/errors/agent.errors";
import { AgentChangeSession } from "../agent/services/agent-change-session";
import { TIME_ZONE } from "../agent/time";
import type { CreateTaskUseCase } from "../tasks/create-task.usecase";
import { getMealTaskName } from "../tasks/services/meal-task-name.service";
import type { PlaceResolver } from "../tasks/services/place-resolver.service";
import {
  artifactCreateOutput, taskCreateOutput, recurringTaskCreateOutput,
  type ArtifactCreateOutput, type TaskCreateOutput, type RecurringTaskCreateOutput,
} from "./request-agent-schemas";
import { describeRequest, type RequestAgentRunner } from "./request-agent-runner";
import { RuleError, seriesInput } from "./request-recurrence";
import { runStep, StepFailure, validInstant, type StepPayload } from "./request-step-common";
import type { CreateAgent } from "./request-steps";
import type { LinkRecord, NewEntity, RequestRecord, RequestStore, StepRecord } from "./request-store";

/**
 * O que o passo criou. `paired` sao as refeicoes: a tarefa e o alimento nascem juntos e ja ligados, entao o
 * alimento entra finalizado e a finalizacao nao o liga a mais nada. `handedOff` diz que o passo deixou itens
 * para outro passo do mesmo pedido (o alimento de uma refeicao que a tarefa cria): sem nada proprio, nao falha.
 */
interface Staged {
  entities: NewEntity[];
  paired: LinkRecord[];
  handedOff?: boolean;
}

export interface StepRepositories {
  tasks: TaskRepository;
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
      createTask: CreateTaskUseCase;
      /** Troca o lugar dito pelo endereco de um lugar que existe. Sem ele, o local fica como foi dito. */
      places?: Pick<PlaceResolver, "resolve">;
    },
  ) {}

  async run(agent: CreateAgent, payload: StepPayload, signal?: AbortSignal): Promise<void> {
    const { store } = this.deps;
    await runStep(store, payload, signal, async ({ request, step, timings }) => {
      const session = new AgentChangeSession(
        request.userId, this.deps.repositories, this.deps.createTask, () => request.createdAt,
      );
      const started = performance.now();
      const { entities, paired, handedOff } = await this.stage(agent, request, step, session, signal);
      timings.total = Math.round(performance.now() - started);
      if (signal?.aborted) throw new AgentRunCancelledError();
      if (entities.length === 0 && !handedOff) throw new StepFailure("empty");

      await this.deps.batchWriter.commit({
        ...session.toBatch(),
        afterWrite: async (tx) => {
          await store.recordStepSuccess(tx, { requestId: request.id, stepId: step.id, entities, timings });
          for (const link of paired) {
            await store.markFinalized(tx, { kind: "artifact", id: link.from.id, stepId: step.id }, [link]);
          }
        },
      });
    });
  }

  private async stage(
    agent: CreateAgent,
    request: RequestRecord,
    step: StepRecord,
    session: AgentChangeSession,
    signal?: AbortSignal,
  ): Promise<Staged> {
    const user = describeRequest(request.prompt, step.expected, request.context);
    const base = { agent, now: request.createdAt, user, signal, stepId: step.id };
    switch (agent) {
      case "task-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: taskCreateOutput });
        return this.stageTasks(session, value);
      }
      case "artifact-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: artifactCreateOutput });
        return this.stageArtifacts(session, value, request);
      }
      case "recurring-task-create": {
        const { value } = await this.deps.runner.run({ ...base, schema: recurringTaskCreateOutput });
        return { entities: await this.stageSeries(session, value), paired: [] };
      }
    }
  }

  /**
   * Cada serie nova entra com a primeira ocorrencia no mesmo lote (e uma linha de verdade, que o pedido
   * mostra). O template nao traz artefatos, nem o alimento de uma refeicao. O lugar dito e procurado no mapa,
   * e toda ocorrencia nasce com ele; sem lugar dito, a serie fica sem local.
   */
  private async stageSeries(
    session: AgentChangeSession, output: RecurringTaskCreateOutput,
  ): Promise<NewEntity[]> {
    const today = session.todayIn(TIME_ZONE);
    for (const series of output.series) {
      const said = series.location?.trim();
      const location = said ? await (this.deps.places?.resolve(said) ?? said) : null;
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
   * Toda refeicao nasce com o alimento dela, ja ligado, no mesmo lote: com o nome e os alimentos ditos ou, sem
   * eles, o nome da refeicao. O lugar dito e procurado no mapa; sem lugar dito, a tarefa nasce sem
   * local.
   */
  private async stageTasks(
    session: AgentChangeSession, output: TaskCreateOutput,
  ): Promise<Staged> {
    const ids: string[] = [];
    const entities: NewEntity[] = [];
    const paired: LinkRecord[] = [];
    for (const item of output.tasks) {
      const said = item.location?.trim();
      const location = said ? await (this.deps.places?.resolve(said) ?? said) : undefined;
      const meal = item.kind === "meal";
      const result = await this.createTracked(session, {
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
        ...(meal ? { artifacts: [{
          type: "food" as const,
          // O alimento leva o nome do que foi comido; sem ele dito, o da refeicao.
          name: item.foodName?.trim() || item.name,
          data: { inputText: item.foods?.trim() ?? "" },
        }] } : {}),
      });
      ids.push(result.taskId);
      entities.push({ kind: "task", id: result.taskId, operation: "create" });
      for (const foodId of result.foodIds) {
        entities.push({ kind: "artifact", id: foodId, operation: "create" });
        paired.push(pairOf(foodId, result.taskId));
      }
    }

    // A hierarquia entre as tarefas da propria lista: a posicao que o agente deu vira o id recem-criado.
    for (const [index, item] of output.tasks.entries()) {
      if (item.subtaskOf === null) continue;
      const parent = ids[item.subtaskOf];
      const subtask = ids[index];
      if (!parent || !subtask || parent === subtask) throw new StepFailure("rejected");
      const result = await session.addSubtask(parent, subtask);
      if (!result.ok) throw new StepFailure("rejected");
    }
    return { entities, paired };
  }

  /**
   * O que foi comido e sempre uma refeicao: tarefa e alimento ligados. Se o pedido tem um passo de criar
   * tarefas, a refeicao e dele (o agente de tarefas manda os alimentos junto) e este passo deixa o alimento
   * para ele, para nao haver duas. Sem esse passo, este cria a tarefa da refeicao com o alimento. O alimento
   * nasce pendente: gravar o artefato abre o pedido de construcao que calcula os nutrientes.
   */
  private async stageArtifacts(
    session: AgentChangeSession, output: ArtifactCreateOutput, request: RequestRecord,
  ): Promise<Staged> {
    const entities: NewEntity[] = [];
    const paired: LinkRecord[] = [];
    let handedOff = false;
    const tasksStepOwnsMeals = (await this.deps.store.steps(request.id))
      .some((candidate) => candidate.agent === "task-create" && candidate.status !== "failed" && candidate.status !== "cancel");
    for (const item of output.artifacts) {
      if (item.type === "food") {
        if (tasksStepOwnsMeals) {
          handedOff = true;
          continue;
        }
        const startedAt = validInstant(item.startedAt);
        const at = startedAt ? new Date(startedAt) : request.createdAt;
        // A tarefa leva o nome da refeicao pelo horario ("Almoço"); o alimento, o do que foi comido ("Feijoada").
        const meal = await this.createTracked(session, {
          name: getMealTaskName(at, TIME_ZONE),
          kind: "meal",
          ...(startedAt ? { startedAt } : {}),
          artifacts: [{ type: "food", name: item.name, data: { inputText: item.content } }],
        });
        entities.push({ kind: "task", id: meal.taskId, operation: "create" });
        for (const foodId of meal.foodIds) {
          entities.push({ kind: "artifact", id: foodId, operation: "create" });
          paired.push(pairOf(foodId, meal.taskId));
        }
        continue;
      }
      const result = await session.createArtifact({ name: item.name, content: item.content });
      if (!result.ok) throw new StepFailure("rejected");
      entities.push({ kind: "artifact", id: result.id, operation: "create" });
    }
    return { entities, paired, handedOff };
  }

  /** Cria a tarefa no lote e devolve, com ela, os alimentos novos que nasceram ligados a ela. */
  private async createTracked(
    session: AgentChangeSession, input: Parameters<AgentChangeSession["createTask"]>[0],
  ): Promise<{ taskId: string; foodIds: string[] }> {
    const before = new Set(session.result().created.filter((item) => item.kind === "artifact").map((item) => item.id));
    const result = await session.createTask(input, { derivedArtifacts: false });
    if (!result.ok) throw new StepFailure("rejected");
    const foodIds = session.result().created
      .filter((item) => item.kind === "artifact" && !before.has(item.id))
      .map((item) => item.id);
    return { taskId: result.id, foodIds };
  }
}

/** O alimento pertence a tarefa da refeicao: a mesma direcao que a finalizacao usa. */
function pairOf(foodId: string, taskId: string): LinkRecord {
  return { from: { kind: "artifact", id: foodId }, to: { kind: "task", id: taskId } };
}

