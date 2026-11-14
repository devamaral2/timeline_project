/**
 * Contratos HTTP consumidos pelo web.
 *
 * Estes tipos descrevem o wire format que o frontend conhece hoje. Eles ficam
 * deliberadamente fora do package de dominio: o backend pode evoluir seu dominio
 * sem transformar o package de entidades em dependencia do navegador.
 */

export const eventPriorities = ["urgent", "normal", "flexible"] as const;
export type EventPriority = (typeof eventPriorities)[number];

/** Numero livre de minutos antes do inicio — o usuario escolhe minutos ou dias na interface. */
export type NotificationOffsetMinutes = number;

/** A natureza do evento. Nao depende de ele ter uma note. */
export type EventKind = "routine" | "meal" | "sleep" | "training";

export const eventKinds: readonly EventKind[] = ["routine", "meal", "sleep", "training"];

export type KnownNoteType = "text" | "meal" | "sleep" | "training" | "skill" | "agent" | "router";

/** Nota que aponta para um arquivo de skill ou agente do Hermes (ADR 0005). Nunca o conteudo. */
export interface AgentFileNote {
  path: string;
  hash: string;
  missing: boolean;
  description?: string;
}

export interface TextNote {
  body: string;
}

export interface FoodItemMacronutrients {
  carbohydratesGrams: number;
  proteinsGrams: number;
  totalFatGrams: number;
  fiberGrams: number;
}

export interface FoodItem {
  id: string;
  sourceFoodId?: string;
  sourceFoodRevision?: number;
  name: string;
  portion: string;
  approximateWeightGrams: number;
  caloriesKcal: number;
  macronutrients: FoodItemMacronutrients;
  /** @deprecated Micronutrientes deixaram de existir; a API ainda devolve `{}`. Nao use. */
  micronutrients?: Record<string, number>;
}

export interface MealTotals {
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
}

/** `model`: a receita foi proposta pelo modelo, nao dita pelo usuario. */
export type MealRecipeSource = "user" | "model";

export interface MealRecipeIngredient {
  name: string;
  quantity: string;
}

export interface MealRecipe {
  source: MealRecipeSource;
  servings?: number;
  prepTimeMinutes?: number;
  ingredients: MealRecipeIngredient[];
  /** Modo de preparo, um passo por item. */
  steps: string[];
}

export interface MealItem {
  sourceMealId?: string;
  sourceMealRevision?: number;
  name: string;
  description: string;
  foodItems: FoodItem[];
  totals: MealTotals;
  recipe?: MealRecipe;
  generation?: { status: "pending" | "completed" | "failed" };
  nutritionSource?: "model-estimate";
}

export interface SleepItem {
  trackedSleepTime: number;
  score: number;
}

export type WorkoutCode = "walking" | "treadmill" | "running" | "weightlifting" | "free";

export interface WorkoutSet {
  id: string;
  exercise: string;
  repetitions: number;
  weight: number;
}

interface WorkoutSnapshotBase {
  id: string;
  workoutCode: WorkoutCode;
  workoutName: string;
  calories: number;
  duration: number;
}

export type WorkoutSnapshot =
  | (WorkoutSnapshotBase & { workoutCode: "walking" | "treadmill" | "running"; pace: number; distance: number })
  | (WorkoutSnapshotBase & { workoutCode: "weightlifting"; sets: WorkoutSet[] })
  | (WorkoutSnapshotBase & { workoutCode: "free" });

export interface TrainingData {
  workouts: WorkoutSnapshot[];
  caloriesBurned: number;
}

export type WorkoutInput =
  | (Omit<Extract<WorkoutSnapshot, { workoutCode: "walking" | "treadmill" | "running" }>, "id" | "workoutName" | "calories"> & {
      id?: string;
      calories?: number;
    })
  | (Omit<Extract<WorkoutSnapshot, { workoutCode: "weightlifting" }>, "id" | "workoutName" | "calories" | "sets"> & {
      id?: string;
      calories?: number;
      sets: Array<Omit<WorkoutSet, "id"> & { id?: string }>;
    })
  | (Omit<Extract<WorkoutSnapshot, { workoutCode: "free" }>, "id" | "workoutName" | "calories"> & {
      id?: string;
      calories?: number;
    });

export interface TrainingInputData {
  workouts: WorkoutInput[];
}

export interface NoteDtoOf<TType extends KnownNoteType, TData> {
  id: string;
  name: string;
  type: TType;
  schemaVersion: number;
  data: TData;
  /** Onde a nota aparece (vazio na solta); a API de notas preenche, os eventos nao. */
  links?: NoteLinkDto[];
  tags: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

/** Onde a nota aparece: um evento ou uma tarefa. */
export interface NoteLinkDto {
  kind: "event" | "task";
  id: string;
  name: string;
  /** A natureza do evento (routine, meal, training, sleep...); so para `kind: "event"`. */
  eventKind?: string;
  /** Quando o alvo acontece — inicio do evento ou da tarefa. */
  at?: string;
  /** Quando o evento terminou, se terminou; so para `kind: "event"`. */
  endsAt?: string;
}

/** Uma note: `type` + `schemaVersion` dizem que forma o `data` tem. */
export type NoteDto =
  | NoteDtoOf<"text", TextNote>
  | NoteDtoOf<"meal", MealItem>
  | NoteDtoOf<"sleep", SleepItem>
  | NoteDtoOf<"training", TrainingData>
  | NoteDtoOf<"skill", AgentFileNote>
  | NoteDtoOf<"agent", AgentFileNote>
  | NoteDtoOf<"router", TextNote>;

export interface MealCreateInput {
  inputText: string;
}

interface NoteInputBase {
  name?: string;
  tags?: string[];
}

/** Uma note nova. `type` ausente e texto livre. */
export type CreateNoteInput =
  | (NoteInputBase & { type?: "text"; data: TextNote })
  | (NoteInputBase & { type: "meal"; data: MealCreateInput })
  | (NoteInputBase & { type: "sleep"; data?: Partial<SleepItem> })
  | (NoteInputBase & { type: "training"; data?: TrainingInputData });

export type NoteDataInput =
  | { type: "text"; data: TextNote }
  | { type: "meal"; data: MealItem }
  | { type: "sleep"; data: SleepItem }
  | { type: "training"; data: TrainingData };

/**
 * Uma entrada da lista de notes do evento ao editar: com `id` e sem `data`, a
 * note so entra (ou continua) na lista; com `id` e `data`, tambem e editada; sem
 * `id`, nasce uma note nova.
 */
export type UpdateEventNoteInput =
  | (NoteInputBase & { id: string; type?: undefined; data?: undefined })
  | (NoteInputBase & { id?: string; schemaVersion?: number } & NoteDataInput);

export interface CreateEventInput {
  name?: string;
  description?: string;
  tags?: string[];
  missed?: boolean;
  priority?: EventPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  /** ISO-8601. Ausente e agora; pode ser passado ou futuro. */
  startedAt?: string;
  /** ISO-8601. Ausente e um evento sem fim declarado. */
  finishedAt?: string;
  /** A natureza do evento. Ausente e rotina. */
  kind?: EventKind;
  /** Notes novas, criadas junto com o evento. */
  notes?: CreateNoteInput[];
  noteIds?: string[];
  taskIds?: string[];
}

export const recurrenceFrequencies = ["daily", "weekly", "monthly", "yearly"] as const;
export type RecurrenceFrequency = (typeof recurrenceFrequencies)[number];

/** A regra de repeticao de `POST /api/recurrences`. */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  /** Mascara de dias da semana, bit 0 = domingo. So em `weekly`. */
  byWeekday?: number;
  /** So em `monthly` e `yearly`. */
  byMonthDay?: number;
  /** So em `yearly`. */
  byMonth?: number;
  /** `HH:MM`, hora de parede no fuso da regra. */
  timeOfDay: string;
  durationMinutes?: number;
  timeZone: string;
  /** `YYYY-MM-DD`. */
  startsOn: string;
  endsOn?: string;
}

export type CreateEventRecurrenceInput = RecurrenceRule & {
  target: "event";
  template: Omit<CreateEventInput, "startedAt" | "finishedAt">;
};

export interface InterruptionPatchInput {
  id?: string;
  name?: string;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface UpdateEventInput {
  eventId: string;
  expectedRevision: number;
  name?: string;
  description?: string;
  startedAt?: string;
  finishedAt?: string;
  tags?: string[];
  missed?: boolean;
  priority?: EventPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  interruptions?: InterruptionPatchInput[];
  kind?: EventKind;
  /** A lista completa de notes do evento, na ordem. */
  notes?: UpdateEventNoteInput[];
  taskIds?: string[];
}

export interface TimelineEventCardDto {
  id: string;
  kind: EventKind;
  noteTypes: string[];
  missed: boolean;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  durationLabel: string;
  tags: string[];
  interruptions: Array<{
    name: string;
    description: string;
    durationLabel: string;
  }>;
}

export interface TimelineEventPageDto {
  items: TimelineEventCardDto[];
  nextCursor?: string;
}

export interface EventDetailInterruptionDto {
  id: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt: string;
}

export interface EventDetailDto {
  id: string;
  name: string;
  description: string;
  startedAt: string;
  finishedAt?: string;
  tags: string[];
  missed: boolean;
  priority: EventPriority;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  interruptions: EventDetailInterruptionDto[];
  revision: number;
  kind: EventKind;
  notes: NoteDto[];
  taskIds?: string[];
}

export type WorkItemStatus = "todo" | "scheduled" | "toDefine" | "inHold" | "done" | "cancel";
export type WorkItemPriority = "urgent" | "high" | "medium" | "low";

/** O que `GET /api/tasks` devolve — a lista de tarefas e a usada pelos avisos. */
export interface TaskSummaryDto {
  id: string;
  parentTaskId?: string;
  name: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  tags: string[];
  startedAt?: string;
  estimatedFinishAt?: string;
  finishedAt?: string;
  /** Ids das tarefas de que esta depende; o inverso e o que ela "libera". */
  dependsOnTaskIds: string[];
  revision: number;
}

/** O que `GET /api/tasks/:taskId` devolve — so o que o detalhe do evento le. */
export interface TaskDetailDto {
  id: string;
  parentTaskId?: string;
  name: string;
  description: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  notifyOffsetsMinutes: NotificationOffsetMinutes[];
  tags: string[];
  startedAt?: string;
  estimatedFinishAt?: string;
  finishedAt?: string;
  dependsOnTaskIds: string[];
  noteIds?: string[];
  revision: number;
}

/** `POST /api/tasks`: o que o formulario de nova tarefa e a subtarefa mandam. */
export interface CreateTaskRequest {
  parentTaskId?: string;
  name: string;
  description?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
  tags?: string[];
  startedAt?: string;
  estimatedFinishAt?: string;
  dependsOnTaskIds?: string[];
}

/** `PATCH /api/tasks/:taskId`: so o que muda; `expectedRevision` e obrigatorio. */
export interface UpdateTaskRequest extends Partial<Omit<CreateTaskRequest, "parentTaskId">> {
  expectedRevision: number;
}

/** `POST /api/notes`: a note e os eventos e tarefas em que ela ja nasce aparecendo. */
export type CreateNoteRequest = CreateNoteInput & {
  eventIds?: string[];
  taskIds?: string[];
};

/**
 * `PATCH /api/notes/:noteId`. Com `type`, o `data` e o conteudo novo inteiro.
 * `eventIds`/`taskIds` sao a lista completa de onde a nota aparece (vazia solta a
 * nota); ausentes, os vinculos ficam como estao.
 */
export type UpdateNoteRequest = {
  expectedRevision: number;
  name?: string;
  tags?: string[];
  eventIds?: string[];
  taskIds?: string[];
} & ({ type?: undefined; data?: undefined } | (NoteDataInput & { schemaVersion?: number }));

export interface TagSuggestionDto {
  id: string;
  name: string;
}

export type AgentEntityKind = "event" | "task" | "note";

/** Um registro que a resposta tocou. */
export interface AgentChatEntityRef {
  kind: AgentEntityKind;
  id: string;
  change: "created" | "updated" | "deleted";
  label?: string;
}

export interface AgentScreenContext {
  screen: string;
  entityId?: string;
}

/** Por que um job de IA falhou (`errorCode` do job). */
export type AgentChatErrorCode =
  | "invalid_input"
  | "forbidden"
  | "limit_reached"
  | "conflict"
  | "unavailable"
  | "cancelled"
  | "internal";

/** A rota de IA por processo (ADR 003): a caixa de processo que o chat mostra. */
export type AiProcessStatus = "dispatching" | "running" | "completed" | "failed";
export type AiProcessStepStatus = "pending" | "running" | "succeeded" | "failed";

export interface AiProcessQueryResult {
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
}

export interface AiProcessStepDto {
  id: string;
  agent: string;
  /** Texto predefinido pelo servidor ("Criando eventos"). */
  label: string;
  status: AiProcessStepStatus;
  errorCode?: string;
  /** Linhas da consulta, so no passo de consulta. */
  result?: AiProcessQueryResult;
}

export interface AiProcessEntityDto {
  kind: "event" | "task" | "note";
  id: string;
  name: string;
  operation: "create" | "update";
  linkedTo: Array<{ kind: string; id: string }>;
}

/**
 * O rastro de um pedido a IA, para a aba "Processo" do chat: tudo o que ela fez, em ordem, com o detalhe de
 * cada passo. As duas rotas (processo e Hermes) falam esta forma, e todo rotulo ja vem escrito pelo servidor.
 */
export type AgentTraceKind = "request" | "routing" | "thought" | "agent" | "tool" | "message" | "answer";
export type AgentTraceStatus = "pending" | "running" | "done" | "failed";

export interface AgentTraceField {
  label: string;
  value: string;
}

export interface AgentTraceSection {
  title: string;
  text: string;
  /** Comando, JSON ou saida de ferramenta: vai em fonte mono. */
  code?: boolean;
}

export interface AgentTraceEntryDto {
  id: string;
  kind: AgentTraceKind;
  label: string;
  /** O nome tecnico por tras do rotulo: a ferramenta, o agente. */
  source?: string;
  summary?: string;
  status: AgentTraceStatus;
  startedAt?: string;
  durationMs?: number;
  fields?: AgentTraceField[];
  sections?: AgentTraceSection[];
  /** O registro como o servidor o tem, para a vista "Bruto". */
  raw?: unknown;
}

export interface AgentTraceDto {
  route: "process" | "hermes";
  status: "running" | "done" | "failed";
  startedAt?: string;
  durationMs?: number;
  /** Totais do pedido: modelo, provedor, tokens. */
  fields: AgentTraceField[];
  entries: AgentTraceEntryDto[];
}

export interface AiProcessDto {
  id: string;
  status: AiProcessStatus;
  title: string;
  steps: AiProcessStepDto[];
  entities: AiProcessEntityDto[];
  /** Resposta do fallback ou o que falhou; ausente quando tudo deu certo. */
  message?: string;
  /** O rastro do pedido, para a aba "Processo". */
  trace?: AgentTraceDto;
}

export interface StartAiProcessRequest {
  userId: string;
  text: string;
  context?: AgentScreenContext;
}

/** O tipo da entidade da tela de detalhe; o servidor confere contra a entidade real (ADR 006). */
export type AiProcessEditEntityType =
  | "event" | "task" | "note" | "meal_note" | "sleep_note" | "training_note" | "skill_note" | "agent_note";

/** `POST /api/ai/process/edit`. */
export interface StartAiProcessEditRequest {
  userId: string;
  text: string;
  entityType: AiProcessEditEntityType;
  entityId: string;
}
