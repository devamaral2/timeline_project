import { z } from "zod";

/**
 * Os contratos como esquemas, para os testes de contrato dos clientes. A forma
 * de cada um espelha a interface de mesmo nome; quem valida a entrada da API e
 * o dominio, nao estes esquemas.
 */
const taskActorSchema = z.enum(["human", "agent"]);
const humanTaskKindSchema = z.enum(["common", "meal", "sleep", "training"]);
const agentRequestKindSchema = z.enum(["request", "search_request", "build_request", "inquiry_request", "review_request", "cron"]);
const taskKindSchema = z.enum([...humanTaskKindSchema.options, ...agentRequestKindSchema.options, "step"]);
const humanTaskStatusSchema = z.enum(["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"]);
const agentTaskStatusSchema = z.enum([
  "preparing", "queued", "starting", "running", "waiting", "completed", "interrupted", "failed", "cancelled", "rolled_back",
]);
const taskStatusSchema = z.enum([...humanTaskStatusSchema.options, ...agentTaskStatusSchema.options]);
const taskPrioritySchema = z.enum(["urgent", "high", "medium", "low"]);
const taskArtifactRelationSchema = z.enum(["creates", "updates", "uses", "deletes"]);
const artifactTypeSchema = z.enum(["text", "food", "sleep", "training", "workout", "skill", "agent", "router"]);
const notificationOffsetsSchema = z.array(z.number());

const textDataSchema = z.object({ body: z.string() }).strict();
const agentFileDataSchema = z.object({ path: z.string(), hash: z.string(), missing: z.boolean(), description: z.string().optional() }).strict();
const sleepDataSchema = z.object({ trackedSleepTime: z.number(), score: z.number() }).strict();
const workoutDataSchema = z.object({
  code: z.enum(["walking", "treadmill", "running", "weightlifting", "free"]),
  category: z.enum(["cardio", "strength", "free"]),
  active: z.boolean(),
}).strict();

const foodItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  portion: z.string(),
  approximateWeightGrams: z.number(),
  caloriesKcal: z.number(),
  macronutrients: z.object({
    carbohydratesGrams: z.number(),
    proteinsGrams: z.number(),
    totalFatGrams: z.number(),
    fiberGrams: z.number(),
  }).strict(),
}).strict();

const foodRecipeSchema = z.object({
  source: z.enum(["user", "model"]),
  servings: z.number().optional(),
  prepTimeMinutes: z.number().optional(),
  ingredients: z.array(z.object({ name: z.string(), quantity: z.string() }).strict()),
  steps: z.array(z.string()),
}).strict();

const foodDataSchema = z.object({
  description: z.string(),
  quantity: z.string().optional(),
  items: z.array(foodItemSchema),
  totals: z.object({
    totalCaloriesKcal: z.number(),
    totalProteinGrams: z.number(),
    totalCarbohydrateGrams: z.number(),
    totalFatGrams: z.number(),
    totalFiberGrams: z.number(),
  }).strict(),
  recipe: foodRecipeSchema.optional(),
  generation: z.object({ status: z.enum(["pending", "completed", "failed"]) }).strict().optional(),
  nutritionSource: z.literal("model-estimate").optional(),
}).strict();

const workoutSetSchema = z.object({
  id: z.string(),
  exercise: z.string(),
  repetitions: z.number().int(),
  weight: z.number(),
}).strict();

const treadmillWorkoutSchema = z.object({
  id: z.string(),
  workoutCode: z.literal("treadmill"),
  workoutName: z.string(),
  calories: z.number(),
  duration: z.number(),
  pace: z.number(),
  distance: z.number(),
}).strict();

const runningWorkoutSchema = treadmillWorkoutSchema.extend({ workoutCode: z.literal("running") });

const walkingWorkoutSchema = treadmillWorkoutSchema.extend({ workoutCode: z.literal("walking") });

const weightliftingWorkoutSchema = z.object({
  id: z.string(),
  workoutCode: z.literal("weightlifting"),
  workoutName: z.string(),
  calories: z.number(),
  duration: z.number(),
  sets: z.array(workoutSetSchema),
}).strict();

const freeWorkoutSchema = z.object({
  id: z.string(),
  workoutCode: z.literal("free"),
  workoutName: z.string(),
  calories: z.number(),
  duration: z.number(),
}).strict();

const workoutSchema = z.discriminatedUnion("workoutCode", [
  walkingWorkoutSchema,
  treadmillWorkoutSchema,
  runningWorkoutSchema,
  weightliftingWorkoutSchema,
  freeWorkoutSchema,
]);

const trainingDataSchema = z.object({
  workouts: z.array(workoutSchema),
  caloriesBurned: z.number(),
}).strict();

const recurrenceRuleShape = {
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int(),
  byWeekday: z.number().int().optional(),
  byMonthDay: z.number().int().optional(),
  byMonth: z.number().int().optional(),
  timeOfDay: z.string(),
  durationMinutes: z.number().int().optional(),
  timeZone: z.string(),
  startsOn: z.string(),
  endsOn: z.string().optional(),
};

export const artifactTaskLinkSchema = z.object({
  taskId: z.string(), relation: taskArtifactRelationSchema, name: z.string(), actor: taskActorSchema, kind: taskKindSchema,
  startedAt: z.string().optional(), estimatedFinishAt: z.string().optional(),
}).strict();

const artifactBase = {
  id: z.string(), name: z.string(), schemaVersion: z.number().int(), global: z.boolean(), derived: z.boolean(),
  tasks: z.array(artifactTaskLinkSchema).optional(), tags: z.array(z.string()),
  revision: z.number().int(), createdAt: z.string(), updatedAt: z.string(),
};

export const artifactSchema = z.discriminatedUnion("type", [
  z.object({ ...artifactBase, type: z.literal("text"), data: textDataSchema }).strict(),
  z.object({ ...artifactBase, type: z.literal("food"), data: foodDataSchema }).strict(),
  z.object({ ...artifactBase, type: z.literal("sleep"), data: sleepDataSchema }).strict(),
  z.object({ ...artifactBase, type: z.literal("training"), data: trainingDataSchema }).strict(),
  z.object({ ...artifactBase, type: z.literal("workout"), data: workoutDataSchema }).strict(),
  z.object({ ...artifactBase, type: z.literal("skill"), data: agentFileDataSchema }).strict(),
  z.object({ ...artifactBase, type: z.literal("agent"), data: agentFileDataSchema }).strict(),
  z.object({ ...artifactBase, type: z.literal("router"), data: textDataSchema }).strict(),
]);

const artifactInputBase = { name: z.string().optional(), tags: z.array(z.string()).optional() };

const createArtifactVariants = <TExtra extends z.ZodRawShape>(extra: TExtra) => [
  z.object({ ...artifactInputBase, ...extra, type: z.literal("text").optional(), data: textDataSchema }).strict(),
  z.object({ ...artifactInputBase, ...extra, type: z.literal("food"), data: z.object({ inputText: z.string() }).strict() }).strict(),
  z.object({
    ...artifactInputBase, ...extra, type: z.literal("sleep"),
    data: z.object({ trackedSleepTime: z.number().optional(), score: z.number().optional() }).strict().optional(),
  }).strict(),
  z.object({ ...artifactInputBase, ...extra, type: z.literal("training"), data: z.object({ workouts: z.array(z.unknown()) }).strict().optional() }).strict(),
] as const;

const foodCopySchema = z.object({ copyOf: z.string(), quantity: z.string().optional() }).strict();
const createTaskArtifactSchema = z.union([...createArtifactVariants({}), foodCopySchema]);

const artifactDataVariants = <TExtra extends z.ZodRawShape>(extra: TExtra) => [
  z.object({ ...artifactInputBase, ...extra, schemaVersion: z.number().int().optional(), type: z.literal("text"), data: textDataSchema }).strict(),
  z.object({ ...artifactInputBase, ...extra, schemaVersion: z.number().int().optional(), type: z.literal("food"), data: foodDataSchema }).strict(),
  z.object({ ...artifactInputBase, ...extra, schemaVersion: z.number().int().optional(), type: z.literal("sleep"), data: sleepDataSchema }).strict(),
  z.object({ ...artifactInputBase, ...extra, schemaVersion: z.number().int().optional(), type: z.literal("training"), data: trainingDataSchema }).strict(),
] as const;

const updateTaskArtifactSchema = z.union([
  z.object({ ...artifactInputBase, id: z.string(), relation: taskArtifactRelationSchema.optional() }).strict(),
  ...artifactDataVariants({ id: z.string().optional(), relation: taskArtifactRelationSchema.optional() }),
  foodCopySchema,
]);

const taskRecurrenceSchema = z.object({
  id: z.string(), occurrenceOn: z.string(), detached: z.boolean(), rule: z.object(recurrenceRuleShape).strict(),
}).strict();

const taskCardShape = {
  id: z.string(), actor: taskActorSchema, kind: taskKindSchema, status: taskStatusSchema.optional(), priority: taskPrioritySchema,
  name: z.string(), description: z.string(), location: z.string().optional(), startedAt: z.string().optional(), estimatedFinishAt: z.string().optional(),
  finishedAt: z.string().optional(), longRunning: z.boolean(), notifyOffsetsMinutes: notificationOffsetsSchema,
  tags: z.array(z.string()), artifactTypes: z.array(artifactTypeSchema), parentTaskId: z.string().optional(), recurrence: taskRecurrenceSchema.optional(), revision: z.number().int(),
  createdAt: z.string(), updatedAt: z.string(),
};

/** O status de um cartao pertence ao executor dele: pessoa so tem os seus e agente so tem os seus. */
function statusMatchesActor(card: { actor: "human" | "agent"; status?: string | undefined }): boolean {
  if (card.status === undefined) return card.actor === "human";
  const own: readonly string[] = card.actor === "agent" ? agentTaskStatusSchema.options : humanTaskStatusSchema.options;
  return own.includes(card.status);
}

const STATUS_MATCHES_ACTOR = { message: "O status nao e do executor da tarefa", path: ["status"] };

export const taskCardSchema = z.object(taskCardShape).strict().refine(statusMatchesActor, STATUS_MATCHES_ACTOR);

export const agendaPageSchema = z.object({ items: z.array(taskCardSchema), nextCursor: z.string().optional() }).strict();

const taskRequestSchema = z.object({
  id: z.string(), name: z.string(), relation: z.enum(["generates", "updates"]), at: z.string(),
}).strict();

export const taskSchema = z.object({
  ...taskCardShape,
  artifacts: z.array(z.object({ relation: taskArtifactRelationSchema, fromRecurrence: z.boolean(), artifact: artifactSchema }).strict()),
  subtaskIds: z.array(z.string()),
  requests: z.array(taskRequestSchema),
}).strict().refine(statusMatchesActor, STATUS_MATCHES_ACTOR);

const taskFieldsShape = {
  name: z.string().optional(), description: z.string().optional(),
  priority: taskPrioritySchema.optional(),
  notifyOffsetsMinutes: notificationOffsetsSchema.optional(), tags: z.array(z.string()).optional(), longRunning: z.boolean().optional(),
  parentTaskId: z.string().nullable().optional(), subtaskIds: z.array(z.string()).optional(),
};

const locationSchema = z.string().max(300);

export const createTaskInputSchema = z.object({
  ...taskFieldsShape, location: locationSchema.optional(), kind: humanTaskKindSchema.optional(), status: humanTaskStatusSchema.optional(),
  startedAt: z.string().optional(), estimatedFinishAt: z.string().optional(), finishedAt: z.string().optional(),
  artifacts: z.array(createTaskArtifactSchema).optional(), artifactIds: z.array(z.string()).optional(),
}).strict();

export const updateTaskInputSchema = z.object({
  ...taskFieldsShape, location: locationSchema.nullable().optional(), taskId: z.string(), expectedRevision: z.number().int(), kind: humanTaskKindSchema.optional(),
  status: humanTaskStatusSchema.nullable().optional(), startedAt: z.string().nullable().optional(),
  estimatedFinishAt: z.string().nullable().optional(), finishedAt: z.string().nullable().optional(),
  artifacts: z.array(updateTaskArtifactSchema).optional(),
}).strict();

/** O teto do markdown de uma pagina lida. O corpo HTTP da rota tem folga sobre ele (escapes do JSON, UTF-8). */
export const DAILY_READING_MARKDOWN_MAX = 300_000;

/** `POST /api/tasks/daily-reading`: uma pagina lida, ja em markdown. */
export const dailyReadingInputSchema = z.object({
  url: z.string().max(2048).regex(/^https?:\/\/\S+$/i),
  title: z.string().trim().min(1).max(300),
  markdown: z.string().max(DAILY_READING_MARKDOWN_MAX).refine((value) => value.trim().length > 0),
  siteName: z.string().trim().max(120).optional(),
  byline: z.string().trim().max(200).optional(),
}).strict();

export const dailyReadingResultSchema = z.object({
  taskId: z.string(), artifactId: z.string(), taskCreated: z.boolean(), artifactCreated: z.boolean(),
}).strict();

/** `POST /api/artifacts`: o artefato e as tarefas em que ele ja nasce aparecendo. */
export const createArtifactRequestSchema = z.union(createArtifactVariants({ taskIds: z.array(z.string()).optional() }));

export const createArtifactResponseSchema = z.object({ artifactId: z.string() }).strict();

const updateArtifactBase = {
  expectedRevision: z.number().int(), ...artifactInputBase, taskIds: z.array(z.string()).optional(),
};

/** `PATCH /api/artifacts/:artifactId`: com `type`, o `data` e o novo conteudo inteiro. */
export const updateArtifactRequestSchema = z.union([
  z.object(updateArtifactBase).strict(),
  ...artifactDataVariants({ expectedRevision: z.number().int(), taskIds: z.array(z.string()).optional() }),
]);

export const tagSuggestionSchema = z.object({ id: z.string(), name: z.string() }).strict();

export const placeSuggestionSchema = z.object({ name: z.string(), address: z.string(), label: z.string() }).strict();

export const recurrenceSchema = z.object({
  ...recurrenceRuleShape, id: z.string(), template: z.record(z.string(), z.unknown()), revision: z.number().int(),
  createdAt: z.string(), updatedAt: z.string(),
}).strict();

/** O que cada ocorrencia copia: a tarefa sem a janela, que vem da regra. */
const recurrenceTemplateSchema = createTaskInputSchema.omit({
  startedAt: true, estimatedFinishAt: true, finishedAt: true, longRunning: true,
  subtaskIds: true,
});

/** `POST /api/recurrences`: a regra e o que cada ocorrencia copia. */
export const createRecurrenceInputSchema = z.object({ ...recurrenceRuleShape, template: recurrenceTemplateSchema }).strict();

/** `PATCH /api/recurrences/:recurrenceId`: so o que muda; `template` troca o template inteiro. */
export const updateRecurrenceInputSchema = z.object(recurrenceRuleShape).partial().extend({
  recurrenceId: z.string(), expectedRevision: z.number().int(), template: recurrenceTemplateSchema.optional(),
}).strict();

const agentTraceFieldSchema = z.object({ label: z.string(), value: z.string() }).strict();

export const agentTraceSchema = z.object({
  route: z.enum(["steps", "hermes", "model"]),
  status: z.enum(["running", "done", "failed"]),
  startedAt: z.string().optional(),
  durationMs: z.number().optional(),
  fields: z.array(agentTraceFieldSchema),
  entries: z.array(z.object({
    id: z.string(),
    kind: z.enum(["request", "routing", "thought", "agent", "tool", "message", "answer"]),
    label: z.string(),
    source: z.string().optional(),
    summary: z.string().optional(),
    status: z.enum(["pending", "running", "done", "failed"]),
    startedAt: z.string().optional(),
    durationMs: z.number().optional(),
    fields: z.array(agentTraceFieldSchema).optional(),
    sections: z.array(z.object({ title: z.string(), text: z.string(), code: z.boolean().optional() }).strict()).optional(),
    raw: z.unknown().optional(),
  }).strict()),
}).strict();

const modelProviderSchema = z.enum(["anthropic", "openai", "openrouter"]);
const modelEffortSchema = z.enum(["low", "medium", "high", "max"]);

export const modelSelectionSchema = z.object({
  provider: modelProviderSchema,
  model: z.string().min(1).max(200),
  effort: modelEffortSchema,
}).strict();

export const modelOptionsSchema = z.object({
  providers: z.array(z.object({
    id: modelProviderSchema,
    name: z.string(),
    models: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
    defaultModel: z.string(),
  }).strict()),
  efforts: z.array(modelEffortSchema),
  default: modelSelectionSchema,
}).strict();

export const requestSchema = z.object({
  id: z.string(),
  kind: agentRequestKindSchema,
  route: z.enum(["steps", "hermes", "model", "voice", "food"]),
  status: agentTaskStatusSchema,
  title: z.string(),
  sessionId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  text: z.string().optional(),
  steps: z.array(z.object({
    id: z.string(),
    agent: z.string(),
    label: z.string(),
    status: agentTaskStatusSchema,
    errorCode: z.string().optional(),
    result: z.object({
      columns: z.array(z.string()), rows: z.array(z.array(z.unknown())), truncated: z.boolean(),
    }).strict().optional(),
  }).strict()),
  entities: z.array(z.object({
    kind: z.enum(["task", "artifact"]),
    id: z.string(),
    name: z.string(),
    artifactType: artifactTypeSchema.optional(),
    operation: z.enum(["create", "update", "delete"]),
    linkedTo: z.array(z.object({ kind: z.enum(["task", "artifact"]), id: z.string() }).strict()),
  }).strict()),
  message: z.string().optional(),
  errorCode: z.enum(["invalid_input", "forbidden", "limit_reached", "conflict", "unavailable", "cancelled", "internal"]).optional(),
  progress: z.string().optional(),
  trace: agentTraceSchema.optional(),
  model: modelSelectionSchema.optional(),
}).strict();

export const contractSchemas = {
  modelOptions: modelOptionsSchema,
  agendaPage: agendaPageSchema,
  taskCard: taskCardSchema,
  task: taskSchema,
  createTaskInput: createTaskInputSchema,
  updateTaskInput: updateTaskInputSchema,
  artifact: artifactSchema,
  createArtifactRequest: createArtifactRequestSchema,
  createArtifactResponse: createArtifactResponseSchema,
  updateArtifactRequest: updateArtifactRequestSchema,
  tagSuggestion: tagSuggestionSchema,
  placeSuggestion: placeSuggestionSchema,
  recurrence: recurrenceSchema,
  createRecurrenceInput: createRecurrenceInputSchema,
  updateRecurrenceInput: updateRecurrenceInputSchema,
  request: requestSchema,
} as const;
