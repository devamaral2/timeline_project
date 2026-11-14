import { z } from "zod";

/**
 * Os contratos como esquemas, para os testes de contrato dos clientes. A forma
 * de cada um espelha a interface de mesmo nome; quem valida a entrada da API e
 * o dominio, nao estes esquemas.
 */
const eventActorSchema = z.enum(["human", "agent"]);
const humanEventKindSchema = z.enum(["routine", "meal", "sleep", "training"]);
const agentRequestKindSchema = z.enum(["request", "search_request", "build_request", "inquiry_request", "review_request", "cron"]);
const eventKindSchema = z.enum([...humanEventKindSchema.options, ...agentRequestKindSchema.options, "step"]);
const humanEventStatusSchema = z.enum(["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"]);
const agentEventStatusSchema = z.enum(["queued", "running", "waiting", "done", "failed", "cancel"]);
const eventStatusSchema = z.enum([...humanEventStatusSchema.options, "queued", "running", "waiting", "failed"]);
const eventPrioritySchema = z.enum(["urgent", "high", "medium", "low"]);
const eventArtifactRelationSchema = z.enum(["creates", "updates", "uses", "deletes"]);
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

export const artifactEventLinkSchema = z.object({
  eventId: z.string(), relation: eventArtifactRelationSchema, name: z.string(), actor: eventActorSchema, kind: eventKindSchema,
  startedAt: z.string().optional(), estimatedFinishAt: z.string().optional(),
}).strict();

const artifactBase = {
  id: z.string(), name: z.string(), schemaVersion: z.number().int(), global: z.boolean(), derived: z.boolean(),
  events: z.array(artifactEventLinkSchema).optional(), tags: z.array(z.string()),
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
const createEventArtifactSchema = z.union([...createArtifactVariants({}), foodCopySchema]);

const artifactDataVariants = <TExtra extends z.ZodRawShape>(extra: TExtra) => [
  z.object({ ...artifactInputBase, ...extra, schemaVersion: z.number().int().optional(), type: z.literal("text"), data: textDataSchema }).strict(),
  z.object({ ...artifactInputBase, ...extra, schemaVersion: z.number().int().optional(), type: z.literal("food"), data: foodDataSchema }).strict(),
  z.object({ ...artifactInputBase, ...extra, schemaVersion: z.number().int().optional(), type: z.literal("sleep"), data: sleepDataSchema }).strict(),
  z.object({ ...artifactInputBase, ...extra, schemaVersion: z.number().int().optional(), type: z.literal("training"), data: trainingDataSchema }).strict(),
] as const;

const updateEventArtifactSchema = z.union([
  z.object({ ...artifactInputBase, id: z.string(), relation: eventArtifactRelationSchema.optional() }).strict(),
  ...artifactDataVariants({ id: z.string().optional(), relation: eventArtifactRelationSchema.optional() }),
  foodCopySchema,
]);

const eventRecurrenceSchema = z.object({
  id: z.string(), occurrenceOn: z.string(), detached: z.boolean(), rule: z.object(recurrenceRuleShape).strict(),
}).strict();

const eventCardShape = {
  id: z.string(), actor: eventActorSchema, kind: eventKindSchema, status: eventStatusSchema.optional(), priority: eventPrioritySchema,
  name: z.string(), description: z.string(), startedAt: z.string().optional(), estimatedFinishAt: z.string().optional(),
  finishedAt: z.string().optional(), longRunning: z.boolean(), notifyOffsetsMinutes: notificationOffsetsSchema,
  tags: z.array(z.string()), artifactTypes: z.array(artifactTypeSchema), parentEventIds: z.array(z.string()),
  blockedByEventIds: z.array(z.string()), recurrence: eventRecurrenceSchema.optional(), revision: z.number().int(),
};

export const eventCardSchema = z.object(eventCardShape).strict();

export const agendaPageSchema = z.object({ items: z.array(eventCardSchema), nextCursor: z.string().optional() }).strict();

export const eventSchema = z.object({
  ...eventCardShape,
  artifacts: z.array(z.object({ relation: eventArtifactRelationSchema, fromRecurrence: z.boolean(), artifact: artifactSchema }).strict()),
  subtaskEventIds: z.array(z.string()), blocksEventIds: z.array(z.string()),
}).strict();

const eventFieldsShape = {
  name: z.string().optional(), description: z.string().optional(), priority: eventPrioritySchema.optional(),
  notifyOffsetsMinutes: notificationOffsetsSchema.optional(), tags: z.array(z.string()).optional(), longRunning: z.boolean().optional(),
  subtaskEventIds: z.array(z.string()).optional(), blocksEventIds: z.array(z.string()).optional(),
  parentEventIds: z.array(z.string()).optional(), blockedByEventIds: z.array(z.string()).optional(),
};

export const createEventInputSchema = z.object({
  ...eventFieldsShape, kind: humanEventKindSchema.optional(), status: humanEventStatusSchema.optional(),
  startedAt: z.string().optional(), estimatedFinishAt: z.string().optional(), finishedAt: z.string().optional(),
  artifacts: z.array(createEventArtifactSchema).optional(), artifactIds: z.array(z.string()).optional(),
}).strict();

export const updateEventInputSchema = z.object({
  ...eventFieldsShape, eventId: z.string(), expectedRevision: z.number().int(), kind: humanEventKindSchema.optional(),
  status: humanEventStatusSchema.nullable().optional(), startedAt: z.string().nullable().optional(),
  estimatedFinishAt: z.string().nullable().optional(), finishedAt: z.string().nullable().optional(),
  artifacts: z.array(updateEventArtifactSchema).optional(),
}).strict();

/** `POST /api/artifacts`: o artefato e os eventos em que ele ja nasce aparecendo. */
export const createArtifactRequestSchema = z.union(createArtifactVariants({ eventIds: z.array(z.string()).optional() }));

export const createArtifactResponseSchema = z.object({ artifactId: z.string() }).strict();

const updateArtifactBase = {
  expectedRevision: z.number().int(), ...artifactInputBase, eventIds: z.array(z.string()).optional(),
};

/** `PATCH /api/artifacts/:artifactId`: com `type`, o `data` e o novo conteudo inteiro. */
export const updateArtifactRequestSchema = z.union([
  z.object(updateArtifactBase).strict(),
  ...artifactDataVariants({ expectedRevision: z.number().int(), eventIds: z.array(z.string()).optional() }),
]);

export const tagSuggestionSchema = z.object({ id: z.string(), name: z.string() }).strict();

export const recurrenceSchema = z.object({
  ...recurrenceRuleShape, id: z.string(), template: z.record(z.string(), z.unknown()), revision: z.number().int(),
}).strict();

/** O que cada ocorrencia copia: o evento sem a janela, que vem da regra. */
const recurrenceTemplateSchema = createEventInputSchema.omit({
  startedAt: true, estimatedFinishAt: true, finishedAt: true, longRunning: true,
  subtaskEventIds: true, blocksEventIds: true, blockedByEventIds: true,
});

/** `POST /api/recurrences`: a regra e o que cada ocorrencia copia. */
export const createRecurrenceInputSchema = z.object({ ...recurrenceRuleShape, template: recurrenceTemplateSchema }).strict();

/** `PATCH /api/recurrences/:recurrenceId`: so o que muda; `template` troca o template inteiro. */
export const updateRecurrenceInputSchema = z.object(recurrenceRuleShape).partial().extend({
  recurrenceId: z.string(), expectedRevision: z.number().int(), template: recurrenceTemplateSchema.optional(),
}).strict();

const agentTraceFieldSchema = z.object({ label: z.string(), value: z.string() }).strict();

export const agentTraceSchema = z.object({
  route: z.enum(["steps", "hermes"]),
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

export const requestSchema = z.object({
  id: z.string(),
  kind: agentRequestKindSchema,
  route: z.enum(["steps", "hermes", "voice", "food"]),
  status: agentEventStatusSchema,
  title: z.string(),
  sessionId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  text: z.string().optional(),
  steps: z.array(z.object({
    id: z.string(),
    agent: z.string(),
    label: z.string(),
    status: agentEventStatusSchema,
    errorCode: z.string().optional(),
    result: z.object({
      columns: z.array(z.string()), rows: z.array(z.array(z.unknown())), truncated: z.boolean(),
    }).strict().optional(),
  }).strict()),
  entities: z.array(z.object({
    kind: z.enum(["event", "artifact"]),
    id: z.string(),
    name: z.string(),
    artifactType: artifactTypeSchema.optional(),
    operation: z.enum(["create", "update", "delete"]),
    linkedTo: z.array(z.object({ kind: z.enum(["event", "artifact"]), id: z.string() }).strict()),
  }).strict()),
  message: z.string().optional(),
  errorCode: z.enum(["invalid_input", "forbidden", "limit_reached", "conflict", "unavailable", "cancelled", "internal"]).optional(),
  progress: z.string().optional(),
  trace: agentTraceSchema.optional(),
}).strict();

export const contractSchemas = {
  agendaPage: agendaPageSchema,
  eventCard: eventCardSchema,
  event: eventSchema,
  createEventInput: createEventInputSchema,
  updateEventInput: updateEventInputSchema,
  artifact: artifactSchema,
  createArtifactRequest: createArtifactRequestSchema,
  createArtifactResponse: createArtifactResponseSchema,
  updateArtifactRequest: updateArtifactRequestSchema,
  tagSuggestion: tagSuggestionSchema,
  recurrence: recurrenceSchema,
  createRecurrenceInput: createRecurrenceInputSchema,
  updateRecurrenceInput: updateRecurrenceInputSchema,
  request: requestSchema,
} as const;
