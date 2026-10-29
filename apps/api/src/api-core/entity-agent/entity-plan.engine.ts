import type {
  EventKind,
  MealItem,
  SleepItem,
  TextNote,
  TrainingData,
  WorkoutCode,
  WorkoutSnapshot,
} from "../../domain";
import { createUlid } from "./entity-plan.ids";
import type {
  ApplyEntityPlanOptions,
  ApplyEntityPlanResult,
  EntityCommand,
  EntityPlan,
  EntityPlanChanges,
  LogMealCommand,
  LogRoutineCommand,
  LogSleepCommand,
  LogTaskCommand,
  LogTrainingCommand,
  PlannedEvent,
  PlannedNote,
  PlannedNoteType,
  PlannedTask,
} from "./entity-plan.types";
import {
  addMinutes,
  CARDIO_WORKOUT_CODES,
  dayKeyOf,
  ENTITY_PLAN_TIME_ZONE,
  formatInstant,
  mealNameAt,
  normalizeText,
  parseInstant,
  round2,
  WORKOUT_NAMES,
} from "./entity-plan.time";

const DEFAULT_MEAL_DURATION_MINUTES = 20;
const DEFAULT_ROUTINE_DURATION_MINUTES = 60;
const DEFAULT_SLEEP_SCORE = 0;
/** Duas ocorrencias da mesma refeicao ate 90 min depois ainda sao a mesma refeicao. */
const MEAL_MERGE_WINDOW_MINUTES = 90;
/** Duas noites/sonecas a menos de 12 h de distancia sao o mesmo registro de sono. */
const SLEEP_MERGE_WINDOW_MINUTES = 12 * 60;

interface Context {
  now: Date;
  nowIso: string;
  timeZone: string;
  idFactory: () => string;
}

interface Change {
  eventId: string;
  noteId: string;
  eventOp: "create" | "update";
  noteOp: "create" | "update";
}

interface TaskChange {
  taskId: string;
  op: "create" | "update";
}

interface TrainingMetrics {
  duration: number;
  calories: number;
  distance: number;
  pace: number;
}

export function emptyEntityPlan(
  now: Date,
  timeZone = ENTITY_PLAN_TIME_ZONE,
): EntityPlan {
  return {
    schemaVersion: 1,
    timeZone,
    updatedAt: formatInstant(now, timeZone),
    events: [],
    notes: [],
    tasks: [],
  };
}

/**
 * Aplica um ou mais comandos sobre uma copia do plano. Nada e mutado no objeto
 * recebido: se um comando falhar, o estado anterior continua intacto.
 */
export function applyEntityCommands(
  plan: EntityPlan,
  commands: readonly EntityCommand[],
  options: ApplyEntityPlanOptions,
): ApplyEntityPlanResult {
  if (commands.length === 0) throw new Error("Nenhum comando para aplicar.");

  const timeZone = options.timeZone ?? plan.timeZone ?? ENTITY_PLAN_TIME_ZONE;
  const next = structuredClone(plan);
  const context: Context = {
    now: options.now,
    nowIso: formatInstant(options.now, timeZone),
    timeZone,
    idFactory: options.idFactory ?? (() => createUlid(options.now.getTime())),
  };

  const changes: Change[] = [];
  const taskChanges: TaskChange[] = [];
  for (const command of commands) {
    if (command.op === "log-task") {
      taskChanges.push(applyTask(next, command, context));
      continue;
    }
    changes.push(applyCommand(next, command, context));
  }

  next.timeZone = timeZone;
  next.updatedAt = context.nowIso;
  assertPlanConsistency(next);

  return { plan: next, changes: summarize(changes, taskChanges) };
}

export function applyEntityCommand(
  plan: EntityPlan,
  command: EntityCommand,
  options: ApplyEntityPlanOptions,
): ApplyEntityPlanResult {
  return applyEntityCommands(plan, [command], options);
}

/**
 * A garantia que o pedido deixou explicita: todo evento tem exatamente uma
 * note do tipo do evento, e o vinculo aparece dos dois lados.
 */
export function assertPlanConsistency(plan: EntityPlan): void {
  const events = new Map(plan.events.map((event) => [event.id, event]));
  const notes = new Map(plan.notes.map((note) => [note.id, note]));
  if (events.size !== plan.events.length) throw new Error("O plano tem eventos com id repetido.");
  if (notes.size !== plan.notes.length) throw new Error("O plano tem notes com id repetido.");
  if (new Set(plan.tasks.map((task) => task.id)).size !== plan.tasks.length) {
    throw new Error("O plano tem tarefas com id repetido.");
  }

  for (const event of plan.events) {
    if (event.noteIds.length !== 1) {
      throw new Error(`O evento ${event.id} deveria ter exatamente uma note, mas tem ${event.noteIds.length}.`);
    }
    const note = notes.get(event.noteIds[0]);
    if (!note) throw new Error(`A note ${event.noteIds[0]} do evento ${event.id} não existe.`);
    if (!note.eventIds.includes(event.id)) {
      throw new Error(`O vínculo entre ${event.id} e ${note.id} não está nos dois lados.`);
    }
    if (note.type !== noteTypeForKind(event.kind)) {
      throw new Error(`O evento ${event.id} (${event.kind}) está ligado a uma note ${note.type}.`);
    }
  }

  for (const note of plan.notes) {
    if (note.eventIds.length !== 1) {
      throw new Error(`A note ${note.id} deveria estar em exatamente um evento, mas está em ${note.eventIds.length}.`);
    }
    const event = events.get(note.eventIds[0]);
    if (!event) throw new Error(`O evento ${note.eventIds[0]} da note ${note.id} não existe.`);
    if (!event.noteIds.includes(note.id)) {
      throw new Error(`O vínculo entre ${note.id} e ${event.id} não está nos dois lados.`);
    }
  }
}

function applyCommand(
  plan: EntityPlan,
  command: Exclude<EntityCommand, LogTaskCommand>,
  context: Context,
): Change {
  switch (command.op) {
    case "log-training":
      return applyTraining(plan, command, context);
    case "log-meal":
      return applyMeal(plan, command, context);
    case "log-routine":
      return applyRoutine(plan, command, context);
    case "log-sleep":
      return applySleep(plan, command, context);
  }
}

function applyTraining(plan: EntityPlan, command: LogTrainingCommand, context: Context): Change {
  const activity = (command.activity?.trim() || WORKOUT_NAMES[command.workoutCode]).trim();
  const metrics = resolveTrainingMetrics(command);
  const start = resolveStart(command, context.now);
  const end = addMinutes(start, metrics.duration);

  if (command.merge !== false) {
    const candidate = findTrainingCandidate(plan, command.workoutCode, start, context.timeZone);
    if (candidate) {
      const { event, note, workoutIndex } = candidate;
      const workout = mergeWorkout(note.data.workouts[workoutIndex], command.workoutCode, metrics);
      note.data.workouts[workoutIndex] = workout;
      note.data.caloriesBurned = sumCalories(note.data.workouts);
      note.name = activity;
      touchNote(note, context);

      event.startedAt = earliest(event.startedAt, start, context.timeZone);
      event.finishedAt = latest(event.finishedAt, end, context.timeZone);
      event.startedOn = dayKeyOf(parseInstant(event.startedAt, "startedAt"), context.timeZone);
      event.tags = mergeTags(event.tags, command.tags);
      touchEvent(event, context);
      return updatedChange(event, note);
    }
  }

  const event = newEvent(context, {
    kind: "training",
    name: activity,
    description: command.description ?? "",
    start,
    end,
    tags: command.tags,
  });
  const note = newNote(context, {
    type: "training",
    name: activity,
    eventId: event.id,
    tags: command.tags,
    data: {
      workouts: [newWorkout(command.workoutCode, activity, metrics, context.idFactory())],
      caloriesBurned: metrics.calories,
    } satisfies TrainingData,
  });
  attach(plan, event, note);
  return createdChange(event, note);
}

function applyMeal(plan: EntityPlan, command: LogMealCommand, context: Context): Change {
  const items = command.items.trim();
  const start = resolveStart(command, context.now);
  const mealName = command.name?.trim() || mealNameAt(start, context.timeZone);
  const duration = command.durationMinutes ?? DEFAULT_MEAL_DURATION_MINUTES;
  const end = addMinutes(start, duration);

  if (command.merge !== false) {
    const candidate = findMealCandidate(plan, mealName, start, context.timeZone);
    if (candidate) {
      const { event, note } = candidate;
      const data = note.data;
      data.description = appendText(data.description, items, "; ");
      // O texto mudou: a analise nutricional volta a ser pendente, como no
      // `save_meal_event` da API. Os numeros antigos ficam ate a nova analise.
      data.generation = { status: "pending" };
      note.name = event.name || mealName;
      touchNote(note, context);

      event.startedAt = earliest(event.startedAt, start, context.timeZone);
      event.finishedAt = latest(event.finishedAt, end, context.timeZone);
      event.startedOn = dayKeyOf(parseInstant(event.startedAt, "startedAt"), context.timeZone);
      event.tags = mergeTags(event.tags, command.tags);
      touchEvent(event, context);
      return updatedChange(event, note);
    }
  }

  const event = newEvent(context, {
    kind: "meal",
    name: mealName,
    description: "",
    start,
    end,
    tags: command.tags,
  });
  const note = newNote(context, {
    type: "meal",
    name: mealName,
    eventId: event.id,
    tags: command.tags,
    data: {
      name: mealName,
      description: items,
      foodItems: [],
      totals: {
        totalCaloriesKcal: 0,
        totalProteinGrams: 0,
        totalCarbohydrateGrams: 0,
        totalFatGrams: 0,
        totalFiberGrams: 0,
      },
      generation: { status: "pending" },
    } satisfies MealItem,
  });
  attach(plan, event, note);
  return createdChange(event, note);
}

function applyRoutine(plan: EntityPlan, command: LogRoutineCommand, context: Context): Change {
  const name = command.name.trim();
  const description = command.description?.trim() ?? "";
  const duration = command.durationMinutes ?? DEFAULT_ROUTINE_DURATION_MINUTES;
  const start = resolveStart(command, context.now);
  const end = addMinutes(start, duration);

  if (command.merge !== false) {
    const candidate = findRoutineCandidate(plan, name, start, context.timeZone);
    if (candidate) {
      const { event, note } = candidate;
      if (description) note.data.body = appendText(note.data.body, description, "\n\n");
      touchNote(note, context);

      event.startedAt = earliest(event.startedAt, start, context.timeZone);
      event.finishedAt = latest(event.finishedAt, end, context.timeZone);
      event.startedOn = dayKeyOf(parseInstant(event.startedAt, "startedAt"), context.timeZone);
      event.tags = mergeTags(event.tags, command.tags);
      if (!event.description && description) event.description = description;
      touchEvent(event, context);
      return updatedChange(event, note);
    }
  }

  const event = newEvent(context, {
    kind: "routine",
    name,
    description,
    start,
    end,
    tags: command.tags,
  });
  const note = newNote(context, {
    type: "text",
    name,
    eventId: event.id,
    tags: command.tags,
    data: { body: description || name } satisfies TextNote,
  });
  attach(plan, event, note);
  return createdChange(event, note);
}

function applySleep(plan: EntityPlan, command: LogSleepCommand, context: Context): Change {
  const tracked = round2(command.trackedSleepTimeMinutes);
  const start = command.startedAt
    ? parseInstant(command.startedAt, "startedAt")
    : addMinutes(context.now, -tracked);
  const end = addMinutes(start, tracked);
  const score = command.score ?? DEFAULT_SLEEP_SCORE;

  if (command.merge !== false) {
    const candidate = findSleepCandidate(plan, start, context.timeZone);
    if (candidate) {
      const { event, note } = candidate;
      const previousTracked = note.data.trackedSleepTime;
      const nextTracked = round2(previousTracked + tracked);
      note.data.score = round2(
        (note.data.score * previousTracked + score * tracked) / Math.max(1, nextTracked),
      );
      note.data.trackedSleepTime = nextTracked;
      touchNote(note, context);

      event.startedAt = earliest(event.startedAt, start, context.timeZone);
      event.finishedAt = latest(event.finishedAt, end, context.timeZone);
      event.startedOn = dayKeyOf(parseInstant(event.startedAt, "startedAt"), context.timeZone);
      event.tags = mergeTags(event.tags, command.tags);
      touchEvent(event, context);
      return updatedChange(event, note);
    }
  }

  const event = newEvent(context, {
    kind: "sleep",
    name: "Sono",
    description: "",
    start,
    end,
    tags: command.tags,
  });
  const note = newNote(context, {
    type: "sleep",
    name: "Sono",
    eventId: event.id,
    tags: command.tags,
    data: { trackedSleepTime: tracked, score } satisfies SleepItem,
  });
  attach(plan, event, note);
  return createdChange(event, note);
}

/**
 * Tarefa nao tem note: ela e uma entidade propria. `merge` junta pelo nome
 * normalizado enquanto a tarefa nao estiver concluida/cancelada — repetir
 * "preparar viagem" atualiza o prazo e a descricao em vez de duplicar.
 */
function applyTask(plan: EntityPlan, command: LogTaskCommand, context: Context): TaskChange {
  const name = command.name.trim();
  const start = command.startedAt ? parseInstant(command.startedAt, "startedAt") : null;
  const status = command.status ?? (start ? "scheduled" : "todo");
  const estimatedFinish = resolveTaskDeadline(command, start ?? context.now);

  if (command.merge !== false) {
    const existing = findTaskCandidate(plan, name);
    if (existing) {
      if (command.description) {
        existing.description = appendText(existing.description, command.description, "\n\n");
      }
      if (estimatedFinish) {
        existing.estimatedFinishAt = latestOfNullable(
          existing.estimatedFinishAt,
          estimatedFinish,
          context.timeZone,
        );
      }
      if (start) existing.startedAt = earliestOfNullable(existing.startedAt, start, context.timeZone);
      if (command.status) existing.status = command.status;
      if (command.priority) existing.priority = command.priority;
      existing.tags = mergeTags(existing.tags, command.tags);
      existing.revision += 1;
      existing.updatedAt = context.nowIso;
      return { taskId: existing.id, op: "update" };
    }
  }

  const task: PlannedTask = {
    id: context.idFactory(),
    name,
    description: command.description?.trim() ?? "",
    status,
    priority: command.priority ?? "medium",
    startedAt: start ? formatInstant(start, context.timeZone) : null,
    estimatedFinishAt: estimatedFinish ? formatInstant(estimatedFinish, context.timeZone) : null,
    finishedAt: null,
    tags: normalizeTags(command.tags),
    revision: 1,
    createdAt: context.nowIso,
    updatedAt: context.nowIso,
  };
  plan.tasks.push(task);
  return { taskId: task.id, op: "create" };
}

function resolveTaskDeadline(command: LogTaskCommand, reference: Date): Date | null {
  if (command.estimatedFinishAt) return parseInstant(command.estimatedFinishAt, "estimatedFinishAt");
  if (command.durationMinutes !== undefined) return addMinutes(reference, command.durationMinutes);
  return null;
}

function findTaskCandidate(plan: EntityPlan, name: string): PlannedTask | undefined {
  const normalized = normalizeText(name);
  return plan.tasks.find(
    (task) =>
      normalizeText(task.name) === normalized && task.status !== "done" && task.status !== "cancel",
  );
}

function earliestOfNullable(current: string | null, candidate: Date, timeZone: string): string {
  if (!current) return formatInstant(candidate, timeZone);
  return earliest(current, candidate, timeZone);
}

function latestOfNullable(current: string | null, candidate: Date, timeZone: string): string {
  if (!current) return formatInstant(candidate, timeZone);
  return latest(current, candidate, timeZone);
}

function resolveStart(command: { startedAt?: string }, fallback: Date): Date {
  return command.startedAt
    ? parseInstant(command.startedAt, "startedAt")
    : fallback;
}

function resolveTrainingMetrics(command: LogTrainingCommand): TrainingMetrics {
  const cardio = CARDIO_WORKOUT_CODES.includes(command.workoutCode);
  let duration = command.durationMinutes;
  let pace = command.paceMinPerKm;
  let distance = command.distanceKm;

  if (!cardio) {
    if (duration === undefined) {
      throw new Error(`durationMinutes é obrigatório para ${WORKOUT_NAMES[command.workoutCode]}.`);
    }
    return { duration, calories: command.calories ?? 0, distance: 0, pace: 0 };
  }

  if (duration === undefined && distance !== undefined && pace !== undefined) {
    duration = distance * pace;
  }
  if (duration === undefined) {
    throw new Error("Informe durationMinutes ou distanceKm + paceMinPerKm para um treino de cardio.");
  }
  if (distance === undefined && pace !== undefined && pace > 0) {
    distance = duration / pace;
  }
  if (pace === undefined && distance !== undefined && distance > 0) {
    pace = duration / distance;
  }
  return {
    duration: round2(duration),
    calories: round2(command.calories ?? 0),
    distance: round2(distance ?? 0),
    pace: round2(pace ?? 0),
  };
}

function newWorkout(
  workoutCode: WorkoutCode,
  workoutName: string,
  metrics: TrainingMetrics,
  id: string,
): WorkoutSnapshot {
  const base = {
    id,
    workoutName,
    calories: metrics.calories,
    duration: metrics.duration,
  };
  if (workoutCode === "weightlifting") {
    return { ...base, workoutCode: "weightlifting", sets: [] };
  }
  if (workoutCode === "free") {
    return { ...base, workoutCode: "free" };
  }
  return {
    ...base,
    workoutCode,
    pace: metrics.pace,
    distance: metrics.distance,
  };
}

function mergeWorkout(
  previous: WorkoutSnapshot,
  workoutCode: WorkoutCode,
  incoming: TrainingMetrics,
): WorkoutSnapshot {
  if (previous.workoutCode === "weightlifting") {
    return {
      ...previous,
      calories: round2(previous.calories + incoming.calories),
      duration: round2(previous.duration + incoming.duration),
    };
  }
  if (previous.workoutCode === "free") {
    return {
      ...previous,
      calories: round2(previous.calories + incoming.calories),
      duration: round2(previous.duration + incoming.duration),
    };
  }
  if (workoutCode === "weightlifting" || workoutCode === "free") return previous;
  const duration = round2(previous.duration + incoming.duration);
  const distance = round2(previous.distance + incoming.distance);
  return {
    ...previous,
    calories: round2(previous.calories + incoming.calories),
    duration,
    distance,
    pace: distance > 0 ? round2(duration / distance) : previous.pace,
  };
}

function findTrainingCandidate(
  plan: EntityPlan,
  workoutCode: WorkoutCode,
  start: Date,
  timeZone: string,
): { event: PlannedEvent; note: Extract<PlannedNote, { type: "training" }>; workoutIndex: number } | undefined {
  const day = dayKeyOf(start, timeZone);
  const candidates = plan.events
    .filter((event) => event.kind === "training" && event.startedOn === day)
    .sort(byStartDescending);
  for (const event of candidates) {
    const note = linkedNote(plan, event, "training");
    if (!note) continue;
    const workoutIndex = note.data.workouts.findIndex((workout) => workout.workoutCode === workoutCode);
    if (workoutIndex >= 0) return { event, note, workoutIndex };
  }
  return undefined;
}

function findMealCandidate(
  plan: EntityPlan,
  mealName: string,
  start: Date,
  timeZone: string,
): { event: PlannedEvent; note: Extract<PlannedNote, { type: "meal" }> } | undefined {
  const day = dayKeyOf(start, timeZone);
  const candidates = plan.events
    .filter((event) => event.kind === "meal" && event.startedOn === day)
    .sort(byStartDescending);
  for (const event of candidates) {
    const note = linkedNote(plan, event, "meal");
    if (!note) continue;
    const sameName = normalizeText(note.name) === normalizeText(mealName)
      || normalizeText(event.name) === normalizeText(mealName);
    const eventStart = parseInstant(event.startedAt, "startedAt");
    const close = Math.abs(eventStart.getTime() - start.getTime()) <= MEAL_MERGE_WINDOW_MINUTES * 60_000;
    if (sameName || close) return { event, note };
  }
  return undefined;
}

function findRoutineCandidate(
  plan: EntityPlan,
  name: string,
  start: Date,
  timeZone: string,
): { event: PlannedEvent; note: Extract<PlannedNote, { type: "text" }> } | undefined {
  const day = dayKeyOf(start, timeZone);
  const normalized = normalizeText(name);
  const event = plan.events
    .filter((candidate) => candidate.kind === "routine" && candidate.startedOn === day)
    .sort(byStartDescending)
    .find((candidate) => normalizeText(candidate.name) === normalized);
  if (!event) return undefined;
  const note = linkedNote(plan, event, "text");
  return note ? { event, note } : undefined;
}

function findSleepCandidate(
  plan: EntityPlan,
  start: Date,
  timeZone: string,
): { event: PlannedEvent; note: Extract<PlannedNote, { type: "sleep" }> } | undefined {
  const candidates = plan.events
    .filter((event) => event.kind === "sleep")
    .sort(byStartDescending);
  for (const event of candidates) {
    const note = linkedNote(plan, event, "sleep");
    if (!note) continue;
    const eventStart = parseInstant(event.startedAt, "startedAt");
    if (Math.abs(eventStart.getTime() - start.getTime()) <= SLEEP_MERGE_WINDOW_MINUTES * 60_000) {
      return { event, note };
    }
    if (event.startedOn === dayKeyOf(start, timeZone)) return { event, note };
  }
  return undefined;
}

function linkedNote<TType extends PlannedNoteType>(
  plan: EntityPlan,
  event: PlannedEvent,
  type: TType,
): Extract<PlannedNote, { type: TType }> | undefined {
  for (const noteId of event.noteIds) {
    const note = plan.notes.find((candidate) => candidate.id === noteId);
    if (note?.type === type) return note as Extract<PlannedNote, { type: TType }>;
  }
  const fallback = plan.notes.find(
    (candidate) => candidate.eventIds.includes(event.id) && candidate.type === type,
  );
  return fallback as Extract<PlannedNote, { type: TType }> | undefined;
}

function newEvent(
  context: Context,
  input: {
    kind: EventKind;
    name: string;
    description: string;
    start: Date;
    end: Date;
    tags?: string[];
  },
): PlannedEvent {
  return {
    id: context.idFactory(),
    kind: input.kind,
    name: input.name,
    description: input.description,
    startedAt: formatInstant(input.start, context.timeZone),
    finishedAt: formatInstant(input.end, context.timeZone),
    startedOn: dayKeyOf(input.start, context.timeZone),
    tags: normalizeTags(input.tags),
    revision: 1,
    noteIds: [],
    createdAt: context.nowIso,
    updatedAt: context.nowIso,
  };
}

function newNote(
  context: Context,
  input: {
    type: PlannedNoteType;
    name: string;
    eventId: string;
    tags?: string[];
    data: TextNote | MealItem | SleepItem | TrainingData;
  },
): PlannedNote {
  return {
    id: context.idFactory(),
    name: input.name,
    type: input.type,
    schemaVersion: 1,
    data: input.data,
    tags: normalizeTags(input.tags),
    revision: 1,
    eventIds: [input.eventId],
    createdAt: context.nowIso,
    updatedAt: context.nowIso,
  } as PlannedNote;
}

function attach(plan: EntityPlan, event: PlannedEvent, note: PlannedNote): void {
  event.noteIds = [note.id];
  note.eventIds = [event.id];
  plan.events.push(event);
  plan.notes.push(note);
}

function touchEvent(event: PlannedEvent, context: Context): void {
  event.revision += 1;
  event.updatedAt = context.nowIso;
}

function touchNote(note: PlannedNote, context: Context): void {
  note.revision += 1;
  note.updatedAt = context.nowIso;
}

function createdChange(event: PlannedEvent, note: PlannedNote): Change {
  return { eventId: event.id, noteId: note.id, eventOp: "create", noteOp: "create" };
}

function updatedChange(event: PlannedEvent, note: PlannedNote): Change {
  return { eventId: event.id, noteId: note.id, eventOp: "update", noteOp: "update" };
}

function summarize(changes: readonly Change[], taskChanges: readonly TaskChange[] = []): EntityPlanChanges {
  return {
    createdEventIds: unique(changes.filter((change) => change.eventOp === "create").map((change) => change.eventId)),
    updatedEventIds: unique(changes.filter((change) => change.eventOp === "update").map((change) => change.eventId)),
    createdNoteIds: unique(changes.filter((change) => change.noteOp === "create").map((change) => change.noteId)),
    updatedNoteIds: unique(changes.filter((change) => change.noteOp === "update").map((change) => change.noteId)),
    createdTaskIds: unique(taskChanges.filter((change) => change.op === "create").map((change) => change.taskId)),
    updatedTaskIds: unique(taskChanges.filter((change) => change.op === "update").map((change) => change.taskId)),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function noteTypeForKind(kind: EventKind): PlannedNoteType {
  return kind === "routine" ? "text" : kind;
}

function normalizeTags(tags: string[] | undefined): string[] {
  return unique(
    (tags ?? [])
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0),
  );
}

function mergeTags(current: readonly string[], incoming: readonly string[] | undefined): string[] {
  return normalizeTags([...current, ...(incoming ?? [])]);
}

function appendText(current: string, addition: string, separator: string): string {
  const next = addition.trim();
  if (!next) return current;
  if (!current.trim()) return next;
  if (normalizeText(current).includes(normalizeText(next))) return current;
  const separatorAlreadyThere = separator.trim().length > 0 && current.trimEnd().endsWith(separator.trim());
  return `${current}${separatorAlreadyThere ? " " : separator}${next}`;
}

function sumCalories(workouts: readonly { calories: number }[]): number {
  return round2(workouts.reduce((total, workout) => total + workout.calories, 0));
}

function earliest(current: string, candidate: Date, timeZone: string): string {
  const currentDate = parseInstant(current, "startedAt");
  return formatInstant(
    currentDate.getTime() <= candidate.getTime() ? currentDate : candidate,
    timeZone,
  );
}

function latest(current: string | null, candidate: Date, timeZone: string): string {
  if (!current) return formatInstant(candidate, timeZone);
  const currentDate = parseInstant(current, "finishedAt");
  return formatInstant(
    currentDate.getTime() >= candidate.getTime() ? currentDate : candidate,
    timeZone,
  );
}

function byStartDescending(left: PlannedEvent, right: PlannedEvent): number {
  return parseInstant(right.startedAt, "startedAt").getTime()
    - parseInstant(left.startedAt, "startedAt").getTime();
}
