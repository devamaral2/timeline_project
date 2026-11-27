import type { ArtifactDataInput, CreateArtifactInput } from "../artifacts/artifact.input";
import type { TaskArtifactRelation, TaskPriority, TaskSituation, HumanTaskKind, HumanTaskStatus } from "./task-types";
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
  priority?: TaskPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  /** Tarefa longa: fica fora da agenda, tem sempre status e nao se repete. */
  longRunning?: boolean;
  /**
   * A tarefa principal desta: qualquer tarefa, de pessoa ou de agente. `null`
   * tira a tarefa de baixo da principal. Nenhuma das duas e revisada por isso.
   */
  parentTaskId?: string | null;
  /**
   * As subtarefas desta: a lista completa. Uma subtarefa que estava sob outra
   * principal sai de la. Nenhuma tarefa e revisada por isso.
   */
  subtaskIds?: string[];
}

export interface CreateTaskInput extends TaskFields {
  /** O projeto da tarefa, que precisa ser do usuario. Ausente, a tarefa fica em `personal`. */
  projectId?: string;
  /**
   * Onde acontece, como o texto que o Google Maps entende. So a tarefa de pessoa tem, e so quando alguem informa:
   * ausente (ou vazio), a tarefa nasce sem local. A API nunca deduz o local de onde a pessoa esta.
   */
  location?: string;
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
  /** Artefatos novos, criados junto com a tarefa, na ordem em que aparecem. */
  artifacts?: CreateTaskArtifactInput[];
  /** Artefatos que ja existem e passam a aparecer na tarefa, depois dos novos. */
  artifactIds?: string[];
}

/** `null` apaga o campo: sem status, a tarefa volta a ser de referencia. */
export interface UpdateTaskInput extends TaskFields {
  taskId: string;
  expectedRevision: number;
  /** O projeto da tarefa, que precisa ser do usuario. Ausente nao muda; `null` devolve a tarefa a `personal`. */
  projectId?: string | null;
  /** Ausente nao muda; `null` ou vazio tira o local. */
  location?: string | null;
  kind?: HumanTaskKind;
  status?: HumanTaskStatus | null;
  startedAt?: string | null;
  estimatedFinishAt?: string | null;
  finishedAt?: string | null;
  /** A lista completa de artefatos da tarefa, na ordem. Os que saem dela deixam de aparecer, mas nao sao apagados. */
  artifacts?: UpdateTaskArtifactInput[];
}

/** `POST /api/projects`: o projeto novo, pelo nome. Responde com o `ProjectDto` criado. */
export interface CreateProjectInput {
  /** De 1 a 60 caracteres depois de tirar os espacos das pontas; unico por usuario, sem distinguir maiusculas. */
  name: string;
}

/** `PUT /api/tasks/:taskId/situation`: aceita qualquer um dos tres valores a partir de qualquer um. Responde com o cartao. */
export interface SetTaskSituationInput {
  situation: TaskSituation;
}
