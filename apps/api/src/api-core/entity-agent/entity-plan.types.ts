import type {
  EventKind,
  MealItem,
  SleepItem,
  TextNote,
  TrainingData,
  WorkoutCode,
} from "../../domain";

/** As quatro naturezas de note que o banco conhece hoje. */
export type PlannedNoteType = "text" | "meal" | "sleep" | "training";

/**
 * Um evento do plano. Os campos espelham `events` no banco, com os vinculos
 * (`noteIds`) resolvidos no proprio JSON para o plano ser legivel sem join.
 */
export interface PlannedEvent {
  id: string;
  kind: EventKind;
  name: string;
  description: string;
  /** ISO-8601 com offset do fuso do plano. */
  startedAt: string;
  finishedAt: string | null;
  /** Dia civil local (`YYYY-MM-DD`), como a coluna gerada `events.started_on`. */
  startedOn: string;
  tags: string[];
  revision: number;
  noteIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface PlannedNoteBase {
  id: string;
  name: string;
  schemaVersion: number;
  tags: string[];
  revision: number;
  /** Os eventos em que a note aparece; hoje sempre um, porque cada evento tem a sua note. */
  eventIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type PlannedNote =
  | (PlannedNoteBase & { type: "text"; data: TextNote })
  | (PlannedNoteBase & { type: "meal"; data: MealItem })
  | (PlannedNoteBase & { type: "sleep"; data: SleepItem })
  | (PlannedNoteBase & { type: "training"; data: TrainingData });

/** Status possiveis de uma tarefa, iguais ao enum `work_item_status` do banco. */
export type TaskStatus = "todo" | "scheduled" | "toDefine" | "inHold" | "done" | "cancel";

/** Prioridade de uma tarefa, igual ao enum `work_item_priority` do banco. */
export type TaskPriority = "urgent" | "high" | "medium" | "low";

/**
 * Uma tarefa do plano. Os campos espelham `tasks` no banco; tarefa nao tem
 * note obrigatoria, ao contrario do evento.
 */
export interface PlannedTask {
  id: string;
  name: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Nulo enquanto a tarefa nao foi iniciada (o caso comum de um `todo`). */
  startedAt: string | null;
  estimatedFinishAt: string | null;
  finishedAt: string | null;
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * O documento que o agente mantem entre pedidos. `events` + `notes` sao as
 * entidades; o vinculo vive nos dois lados para o JSON ser auto-contido.
 * `tasks` fica na raiz porque tarefa nao se liga a note por obrigacao.
 */
export interface EntityPlan {
  schemaVersion: 1;
  timeZone: string;
  updatedAt: string;
  events: PlannedEvent[];
  notes: PlannedNote[];
  tasks: PlannedTask[];
}

interface CommandBase {
  /** Omitido: agora. Sempre interpretado no fuso do plano. */
  startedAt?: string;
  /** `false` proibe juntar numa entidade existente; o padrao e juntar. */
  merge?: boolean;
  tags?: string[];
}

export interface LogTrainingCommand extends CommandBase {
  op: "log-training";
  workoutCode: WorkoutCode;
  /** Nome do evento/nota. Omitido: o nome do catalogo ("Caminhada", "Corrida"...). */
  activity?: string;
  description?: string;
  durationMinutes?: number;
  calories?: number;
  /** Minutos por quilometro. */
  paceMinPerKm?: number;
  distanceKm?: number;
}

export interface LogMealCommand extends CommandBase {
  op: "log-meal";
  /** Os alimentos e quantidades, como o usuario disse. */
  items: string;
  /** Omitido: o nome da refeicao pela hora local (Almoco, Jantar...). */
  name?: string;
  /** O padrao e 20 minutos. */
  durationMinutes?: number;
}

export interface LogRoutineCommand extends CommandBase {
  op: "log-routine";
  name: string;
  description?: string;
  durationMinutes?: number;
}

export interface LogSleepCommand extends CommandBase {
  op: "log-sleep";
  trackedSleepTimeMinutes: number;
  score?: number;
}

export interface LogTaskCommand extends CommandBase {
  op: "log-task";
  name: string;
  description?: string;
  /** Omitido: `todo`. */
  status?: TaskStatus;
  /** Omitido: `medium`. */
  priority?: TaskPriority;
  /** Prazo explicito. Tem precedencia sobre `durationMinutes`. */
  estimatedFinishAt?: string;
  /** Prazo relativo ao inicio (ou a agora, se a tarefa ainda nao comecou). */
  durationMinutes?: number;
}

export type EntityCommand =
  | LogTrainingCommand
  | LogMealCommand
  | LogRoutineCommand
  | LogSleepCommand
  | LogTaskCommand;

export interface EntityPlanChanges {
  createdEventIds: string[];
  updatedEventIds: string[];
  createdNoteIds: string[];
  updatedNoteIds: string[];
  createdTaskIds: string[];
  updatedTaskIds: string[];
}

export interface ApplyEntityPlanResult {
  plan: EntityPlan;
  changes: EntityPlanChanges;
}

export interface ApplyEntityPlanOptions {
  now: Date;
  timeZone?: string;
  /** Injetavel nos testes; o padrao e ULID. */
  idFactory?: () => string;
}
