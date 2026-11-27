import { MAX_TASK_BLOCK_DAYS, type Task, type Recurrence } from "../../../domain/index";
import type {
  AgendaPage,
  AgendaQueryParams,
  TaskCard,
  TaskCardQuery,
  RecurrenceRepository,
  TrackedQueryParams,
} from "../../../domain/ports";
import { personalProjectOf } from "../../projects/testing/in-memory-project.query";
import { decodeAgendaCursor, encodeAgendaCursor } from "../../../infrastructure/persistence/tasks/queries/agenda-cursor";
import type { InMemoryTaskDatabase } from "./in-memory-task-database";

/** Os status de pessoa em que a tarefa ainda esta em aberto. */
const OPEN_STATUSES: readonly string[] = ["todo", "toDefine", "doing", "inHold"];
const MAX_TASK_BLOCK_MS = MAX_TASK_BLOCK_DAYS * 24 * 60 * 60 * 1000;

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** O instante pelo qual a lista de tarefas ordena e filtra: o inicio ou, sem ele, o fim planejado. */
function trackedInstantOf(task: Task): Date | undefined {
  return task.startedAt ?? task.estimatedFinishAt;
}

/**
 * As leituras do cartao sobre o banco em memoria, com a mesma semantica de
 * `PostgresTaskCardQuery`. `recurrences` e de onde sai a regra que o cartao de
 * uma ocorrencia mostra; sem ele, o cartao vem sem a serie.
 */
export class InMemoryTaskCardQuery implements TaskCardQuery {
  constructor(
    private readonly database: InMemoryTaskDatabase,
    private readonly recurrences?: Pick<RecurrenceRepository, "findById">,
  ) {}

  async agenda(params: AgendaQueryParams): Promise<AgendaPage> {
    const cursor = params.cursor ? decodeAgendaCursor(params.cursor) : undefined;
    const matching = this.database.tasks
      .filter((task) => {
        const startedAt = task.startedAt;
        if (task.userId !== params.userId || !startedAt || task.longRunning || task.kind === "step") return false;
        if (params.to && startedAt > params.to) return false;
        if (params.from) {
          // Um bloco dura no maximo 31 dias: quem ainda toca a janela comecou no maximo isso antes dela.
          if (startedAt.getTime() < params.from.getTime() - MAX_TASK_BLOCK_MS) return false;
          if ((task.estimatedFinishAt ?? task.finishedAt ?? startedAt) < params.from) return false;
        }
        if (params.actor && task.actor !== params.actor) return false;
        if (params.kind && task.kind !== params.kind) return false;
        if (params.tag && !task.tags.includes(params.tag)) return false;
        if (cursor) {
          const difference = startedAt.getTime() - cursor.startedAt.getTime();
          if (difference > 0 || (difference === 0 && task.id >= cursor.id)) return false;
        }
        return true;
      })
      .sort(
        (left, right) =>
          (right.startedAt as Date).getTime() - (left.startedAt as Date).getTime() || compareIds(right.id, left.id),
      );

    const rows = matching.slice(0, params.limit);
    const last = rows.at(-1);
    return {
      items: await this.cardsOf(rows.map((task) => task.id)),
      nextCursor:
        matching.length > params.limit && last
          ? encodeAgendaCursor({ startedAt: last.startedAt as Date, id: last.id })
          : undefined,
    };
  }

  async tracked(params: TrackedQueryParams): Promise<TaskCard[]> {
    const matching = this.database.tasks
      .filter((task) => {
        if (task.userId !== params.userId || task.status === undefined || task.kind === "step") return false;
        // Uma serie aparece uma vez so: pela proxima ocorrencia em aberto. A que alguem editou aparece por si.
        if (task.occurrence && !task.occurrence.detached && this.nextOpenOccurrenceId(task.occurrence.recurrenceId) !== task.id) {
          return false;
        }
        if (params.actor && task.actor !== params.actor) return false;
        if (params.status?.length && !params.status.includes(task.status)) return false;
        if (params.priority?.length && !params.priority.includes(task.priority)) return false;
        if (params.tag && !task.tags.includes(params.tag)) return false;
        if (params.q && !task.name.toLowerCase().includes(params.q)) return false;
        const instant = trackedInstantOf(task);
        if (params.from && !(instant && instant >= params.from)) return false;
        if (params.to && !(instant && instant <= params.to)) return false;
        if (params.longRunning !== undefined && task.longRunning !== params.longRunning) return false;
        return true;
      })
      .sort((left, right) => {
        const leftInstant = trackedInstantOf(left)?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightInstant = trackedInstantOf(right)?.getTime() ?? Number.POSITIVE_INFINITY;
        return leftInstant === rightInstant ? compareIds(left.id, right.id) : leftInstant - rightInstant;
      });

    const rows = params.limit === undefined ? matching : matching.slice(0, params.limit);
    return this.cardsOf(rows.map((task) => task.id));
  }

  async cardsOf(taskIds: readonly string[]): Promise<TaskCard[]> {
    const cards: TaskCard[] = [];
    for (const id of taskIds) {
      const stored = this.database.tasks.find((task) => task.id === id);
      if (!stored) continue;
      const task = this.database.hydrate(stored);
      const recurrence = task.occurrence ? await this.recurrenceOf(task.occurrence.recurrenceId) : undefined;
      cards.push({
        task,
        project: personalProjectOf(task.userId),
        artifactTypes: this.database.artifactsOf(task).map((artifact) => artifact.type),
        ...(recurrence ? { recurrence } : {}),
      });
    }
    return cards;
  }

  private nextOpenOccurrenceId(recurrenceId: string): string | undefined {
    return this.database.tasks
      .filter(
        (task) =>
          task.occurrence?.recurrenceId === recurrenceId &&
          !task.occurrence.detached &&
          task.status !== undefined &&
          OPEN_STATUSES.includes(task.status),
      )
      .sort((left, right) => (left.occurrence?.occurrenceOn ?? "").localeCompare(right.occurrence?.occurrenceOn ?? ""))[0]?.id;
  }

  private async recurrenceOf(recurrenceId: string): Promise<Recurrence | undefined> {
    return (await this.recurrences?.findById(recurrenceId)) ?? undefined;
  }
}
