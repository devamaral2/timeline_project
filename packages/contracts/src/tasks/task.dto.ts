import type { ArtifactDto, ArtifactType } from "../artifacts/artifact.dto";
import type { RecurrenceRule } from "../recurrences/recurrence-rule";
import type { TaskActor, TaskArtifactRelation, TaskKind, TaskPriority, TaskStatus } from "./task-types";
import type { NotificationOffsetMinutes } from "./notification-offset-minutes";

/** A serie de que a tarefa e uma ocorrencia. */
export interface TaskRecurrenceDto {
  id: string;
  /** O dia civil da ocorrencia, `YYYY-MM-DD`. */
  occurrenceOn: string;
  /** Alguem editou esta ocorrencia: ela deixou de acompanhar a serie. */
  detached: boolean;
  rule: RecurrenceRule;
}

/**
 * O cartao da agenda e da lista de tarefas: as duas telas usam o mesmo. Todo
 * campo e o dado como esta gravado; rotulos ("Hoje", "ha 12 min", "atrasado")
 * sao calculados na tela.
 */
export interface TaskCardDto {
  id: string;
  actor: TaskActor;
  kind: TaskKind;
  /** Ausente na tarefa de referencia, que so marca um horario. */
  status?: TaskStatus;
  priority: TaskPriority;
  name: string;
  description: string;
  /** Onde acontece, como o texto que o Google Maps entende; vazio sem local. So tarefas de pessoa tem. */
  location: string;
  /** Inicio planejado. A meia-noite local significa "o dia, sem hora". */
  startedAt?: string;
  /** Fim planejado: o fim do bloco ou, no tarefa longa, o prazo. */
  estimatedFinishAt?: string;
  /** Conclusao real. */
  finishedAt?: string;
  /** Tarefa longa: fica fora da agenda. */
  longRunning: boolean;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  tags: string[];
  /** Os tipos dos artefatos da tarefa, na ordem em que aparecem. */
  artifactTypes: ArtifactType[];
  /** As tarefas de que este se segue ("segue-se de"): os que vem antes dele na sequencia. */
  previousTaskIds: string[];
  recurrence?: TaskRecurrenceDto;
  /** Para o `PATCH` direto da lista (`expectedRevision`), sem ler o detalhe antes. */
  revision: number;
}

export interface TaskArtifactDto {
  relation: TaskArtifactRelation;
  /** O vinculo veio da serie, e nao de uma edicao desta ocorrencia. */
  fromRecurrence: boolean;
  artifact: ArtifactDto;
}

/**
 * Um pedido ao agente que criou ou alterou a tarefa ("criado por", "atualizado
 * por"). A lista tem uma linha por relacao: a tarefa criada por um pedido e
 * alterado depois por outro traz as duas.
 */
export interface TaskRequestDto {
  /** A tarefa do pedido: a tela de detalhe dele abre por este id. */
  id: string;
  /** O inicio do que o usuario pediu. */
  name: string;
  relation: "generates" | "updates";
  /** Quando o pedido gravou a mudanca (ISO 8601). */
  at: string;
}

export interface TaskDto extends TaskCardDto {
  /** Os artefatos da tarefa, na ordem em que aparecem. */
  artifacts: TaskArtifactDto[];
  /** As tarefas que se seguem a este ("da sequencia a"). */
  nextTaskIds: string[];
  /** Os pedidos que criaram e alteraram a tarefa, do mais antigo ao mais novo. So o detalhe traz. */
  requests: TaskRequestDto[];
}

export interface AgendaPageDto {
  items: TaskCardDto[];
  nextCursor?: string;
}
