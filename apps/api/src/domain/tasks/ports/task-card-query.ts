import type { ProjectRef } from "../../projects/types/project";
import type { Recurrence } from "../../recurrences/entities/recurrence.entity";
import type { Actor, TaskPriority, TaskStatus } from "../../sets";
import type { Task } from "../entities/task.entity";

/** O que o cartao da agenda e da lista de tarefas mostra de uma tarefa. */
export interface TaskCard {
  task: Task;
  /** O projeto da tarefa. */
  project: ProjectRef;
  /** Os tipos dos artefatos da tarefa, na ordem em que aparecem. */
  artifactTypes: string[];
  /** A serie de que a tarefa e uma ocorrencia, para o cartao mostrar a regra. */
  recurrence?: Recurrence;
}

/** A janela da agenda: tarefas com inicio, sem as longas e sem os passos. */
export interface AgendaQueryParams {
  userId: string;
  from?: Date;
  to?: Date;
  /** Ausente, pessoa e agente juntos. */
  actor?: Actor;
  kind?: string;
  tag?: string;
  cursor?: string;
  limit: number;
}

export interface AgendaPage {
  items: TaskCard[];
  nextCursor?: string;
}

/** A lista de tarefas: tarefas com status, incluindo as longas e sem os passos. */
export interface TrackedQueryParams {
  userId: string;
  actor?: Actor;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  tag?: string;
  /** Busca no nome, sem diferenciar maiusculas. Ja normalizada (minuscula). */
  q?: string;
  /** Janela sobre o inicio planejado, ou o fim planejado quando nao ha inicio. Tarefa sem as duas datas fica de fora. */
  from?: Date;
  to?: Date;
  /** So as tarefas longas, ou so as que nao sao. */
  longRunning?: boolean;
  limit?: number;
}

/** As leituras que alimentam o cartao da agenda e da lista de tarefas. */
export interface TaskCardQuery {
  /** Do mais novo para o mais antigo, em paginas. */
  agenda(params: AgendaQueryParams): Promise<AgendaPage>;
  /** Uma serie aparece uma vez so, pela proxima ocorrencia em aberto. */
  tracked(params: TrackedQueryParams): Promise<TaskCard[]>;
  /** Os cartoes das tarefas vivas entre os ids, na ordem dos ids. */
  cardsOf(taskIds: readonly string[]): Promise<TaskCard[]>;
}
