import type { ArtifactDataInput, CreateArtifactInput } from "../artifacts/artifact.input";
import type { GeoPointInput } from "./place-suggestion.dto";
import type { TaskArtifactRelation, TaskPriority, HumanTaskKind, HumanTaskStatus } from "./task-types";
import type { NotificationOffsetMinutes } from "./notification-offset-minutes";

/**
 * Um alimento que ja existe, comido nesta tarefa. A tarefa nao usa o original:
 * ganha uma copia so dele, com a quantidade, para que editar o original nao
 * mude o passado.
 */
export interface TaskFoodCopyInput {
  copyOf: string;
  /** Quanto foi comido: "1 prato", "2 fatias". */
  quantity?: string;
}

/** Um artefato novo que nasce junto com a tarefa. */
export type CreateTaskArtifactInput = CreateArtifactInput | TaskFoodCopyInput;

/**
 * Uma entrada da lista de artefatos de uma tarefa ao editar. Com `id` e sem
 * `data`, o artefato que existe so entra (ou continua) na lista; com `id` e
 * `data`, ele tambem e editado; sem `id`, nasce um artefato novo.
 */
export type UpdateTaskArtifactInput =
  | { id: string; relation?: TaskArtifactRelation; type?: undefined; data?: undefined; name?: string; tags?: string[] }
  | ({ id?: string; relation?: TaskArtifactRelation; name?: string; tags?: string[]; schemaVersion?: number } & ArtifactDataInput)
  | TaskFoodCopyInput;

interface TaskFields {
  name?: string;
  description?: string;
  /** Onde acontece; vazio apaga. Tarefa de pessoa apenas. */
  location?: string;
  priority?: TaskPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  /** Tarefa longa: fica fora da agenda, tem sempre status e nao se repete. */
  longRunning?: boolean;
  /** As tarefas de que este se segue ("segue-se de"): a lista completa. Qualquer tarefa, de pessoa ou de agente. */
  previousTaskIds?: string[];
  /** As tarefas que se seguem a este ("da sequencia a"): a lista completa. Nenhuma tarefa e revisado por isso. */
  nextTaskIds?: string[];
}

export interface CreateTaskInput extends TaskFields {
  /** A natureza da tarefa. Ausente e rotina. */
  kind?: HumanTaskKind;
  /** Ausente, a tarefa nasce de referencia: so marca um horario. A tarefa longa nasce `todo`. */
  status?: HumanTaskStatus;
  /** Inicio planejado, em ISO-8601. Ausente na tarefa de referencia significa agora. */
  startedAt?: string;
  /** Fim planejado. Ausente na tarefa de referencia, e estimado pela duracao tipica do `kind`. */
  estimatedFinishAt?: string;
  /** Conclusao real. */
  finishedAt?: string;
  /**
   * Onde a pessoa esta ao criar. Sem `location`, a API usa o endereco destas coordenadas como local. Nao e
   * guardado na tarefa.
   */
  coordinates?: GeoPointInput;
  /** Artefatos novos, criados junto com a tarefa, na ordem em que aparecem. */
  artifacts?: CreateTaskArtifactInput[];
  /** Artefatos que ja existem e passam a aparecer na tarefa, depois dos novos. */
  artifactIds?: string[];
}

/** `null` apaga o campo: sem status, a tarefa volta a ser de referencia. */
export interface UpdateTaskInput extends TaskFields {
  taskId: string;
  expectedRevision: number;
  kind?: HumanTaskKind;
  status?: HumanTaskStatus | null;
  startedAt?: string | null;
  estimatedFinishAt?: string | null;
  finishedAt?: string | null;
  /** A lista completa de artefatos da tarefa, na ordem. Os que saem dela deixam de aparecer, mas nao sao apagados. */
  artifacts?: UpdateTaskArtifactInput[];
}
