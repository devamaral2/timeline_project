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

export type KnownNoteType = "text" | "meal" | "sleep" | "training";

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
  micronutrients: Record<string, number>;
}

export interface MealTotals {
  totalCaloriesKcal: number;
  totalProteinGrams: number;
  totalCarbohydrateGrams: number;
  totalFatGrams: number;
  totalFiberGrams: number;
}

export interface MealItem {
  sourceMealId?: string;
  sourceMealRevision?: number;
  name: string;
  description: string;
  foodItems: FoodItem[];
  totals: MealTotals;
}

export interface SleepItem {
  trackedSleepTime: number;
  score: number;
}

export type WorkoutCode = "treadmill" | "running" | "weightlifting" | "free";

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
  | (WorkoutSnapshotBase & { workoutCode: "treadmill" | "running"; pace: number; distance: number })
  | (WorkoutSnapshotBase & { workoutCode: "weightlifting"; sets: WorkoutSet[] })
  | (WorkoutSnapshotBase & { workoutCode: "free" });

export interface TrainingData {
  workouts: WorkoutSnapshot[];
  caloriesBurned: number;
}

export type WorkoutInput =
  | (Omit<Extract<WorkoutSnapshot, { workoutCode: "treadmill" | "running" }>, "id" | "workoutName" | "calories"> & {
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
}

/** Uma note: `type` + `schemaVersion` dizem que forma o `data` tem. */
export type NoteDto =
  | NoteDtoOf<"text", TextNote>
  | NoteDtoOf<"meal", MealItem>
  | NoteDtoOf<"sleep", SleepItem>
  | NoteDtoOf<"training", TrainingData>;

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

export type WorkItemStatus = "inHold" | "todo" | "inProgress" | "done" | "cancel";
export type WorkItemPriority = "urgent" | "high" | "medium" | "low";

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
  revision: number;
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

/**
 * Chat com o agente (`/api/ai/chat`). O socket so abre com um ticket de uso
 * unico emitido por `POST /api/ai/chat/tickets`.
 *
 * O historico **nao** trafega mais: quem o guarda e o servidor, e o frame leva
 * so o id da conversa. Ler a conversa e REST (`/api/ai/conversations`), porque
 * o frame e limitado a 64 KiB e o socket morre a cada 15 min.
 */
export interface AgentChatTicketDto {
  ticket: string;
  expiresAt: string;
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

export interface AgentChatMessageFrame {
  type: "message";
  id: string;
  text: string;
  context?: AgentScreenContext;
  /** Ausente e conversa nova: o servidor devolve o id dela no `reply`. */
  conversationId?: string;
}

export interface AgentChatCancelFrame {
  type: "cancel";
  id: string;
}

export type AgentChatErrorCode =
  | "invalid_frame"
  | "busy"
  | "invalid_input"
  | "forbidden"
  | "limit_reached"
  | "conflict"
  | "conversation_gone"
  | "unavailable"
  | "cancelled"
  | "internal";

/** O web so le `kind` e `id` dos registros; o detalhe completo vem junto, mas nao e usado. */
export interface AgentEntityItemDto {
  kind: AgentEntityKind;
  id: string;
}

export type AgentChatServerFrame =
  | { type: "ready"; userId: string; expiresAt: string }
  | { type: "status"; id: string; label: string }
  | {
      type: "reply";
      id: string;
      /** A conversa do turno — adotado pelo cliente quando ela acabou de nascer. */
      conversationId: string;
      /** Onde a resposta caiu; um salto significa que outra aba escreveu no meio. */
      assistantSeq: number;
      agentResponse: string;
      entities: AgentChatEntityRef[];
      createdEntities: AgentEntityItemDto[];
      updatedEntities: AgentEntityItemDto[];
      deletedEntities: AgentEntityItemDto[];
    }
  | { type: "error"; id?: string; code: AgentChatErrorCode };

/** Uma conversa na lista de `GET /api/ai/conversations`. */
export interface AgentConversationDto {
  id: string;
  title?: string;
  /** O comeco do primeiro pedido: nomeia a conversa enquanto nao ha titulo. */
  preview: string;
  lastMessageAt: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentConversationPageDto {
  items: AgentConversationDto[];
  nextCursor?: string;
}

export interface AgentChatMessageDto {
  id: string;
  seq: number;
  role: "user" | "assistant";
  content: string;
  entities: AgentChatEntityRef[];
  createdAt: string;
}

/** Uma pagina de mensagens, da mais nova para a mais velha. */
export interface AgentChatMessagePageDto {
  items: AgentChatMessageDto[];
  nextCursor?: string;
}
