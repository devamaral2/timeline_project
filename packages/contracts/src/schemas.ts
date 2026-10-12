import { z } from "zod";

const eventPrioritySchema = z.enum(["urgent", "normal", "flexible"]);
const notificationOffsetsSchema = z.array(z.number());
const eventKindSchema = z.enum(["routine", "meal", "sleep", "training"]);
const textNoteSchema = z.object({ body: z.string() }).strict();
const sleepDataSchema = z.object({ trackedSleepTime: z.number(), score: z.number() }).strict();

const foodItemSchema = z.object({
  id: z.string(),
  sourceFoodId: z.string().optional(),
  sourceFoodRevision: z.number().int().optional(),
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
  micronutrients: z.record(z.string(), z.number()).optional(),
}).strict();

const mealRecipeSchema = z.object({
  source: z.enum(["user", "model"]),
  servings: z.number().optional(),
  prepTimeMinutes: z.number().optional(),
  ingredients: z.array(z.object({ name: z.string(), quantity: z.string() }).strict()),
  steps: z.array(z.string()),
}).strict();

const mealItemSchema = z.object({
  sourceMealId: z.string().optional(),
  sourceMealRevision: z.number().int().optional(),
  name: z.string(),
  description: z.string(),
  foodItems: z.array(foodItemSchema),
  totals: z.object({
    totalCaloriesKcal: z.number(),
    totalProteinGrams: z.number(),
    totalCarbohydrateGrams: z.number(),
    totalFatGrams: z.number(),
    totalFiberGrams: z.number(),
  }).strict(),
  recipe: mealRecipeSchema.optional(),
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
  treadmillWorkoutSchema,
  runningWorkoutSchema,
  weightliftingWorkoutSchema,
  freeWorkoutSchema,
]);

const trainingDataSchema = z.object({
  workouts: z.array(workoutSchema),
  caloriesBurned: z.number(),
}).strict();

export const noteLinkSchema = z.object({
  kind: z.enum(["event", "task"]), id: z.string(), name: z.string(), eventKind: z.string().optional(), at: z.string().optional(), endsAt: z.string().optional(),
}).strict();

const noteBase = {
  id: z.string(), name: z.string(), schemaVersion: z.number().int(), links: z.array(noteLinkSchema).optional(), tags: z.array(z.string()),
  revision: z.number().int(), createdAt: z.string(), updatedAt: z.string(),
};

export const noteSchema = z.discriminatedUnion("type", [
  z.object({ ...noteBase, type: z.literal("text"), data: textNoteSchema }).strict(),
  z.object({ ...noteBase, type: z.literal("meal"), data: mealItemSchema }).strict(),
  z.object({ ...noteBase, type: z.literal("sleep"), data: sleepDataSchema }).strict(),
  z.object({ ...noteBase, type: z.literal("training"), data: trainingDataSchema }).strict(),
]);

const noteInputBase = { name: z.string().optional(), tags: z.array(z.string()).optional() };

const createNoteVariants = <TExtra extends z.ZodRawShape>(extra: TExtra) => [
  z.object({ ...noteInputBase, ...extra, type: z.literal("text").optional(), data: textNoteSchema }).strict(),
  z.object({ ...noteInputBase, ...extra, type: z.literal("meal"), data: z.object({ inputText: z.string() }).strict() }).strict(),
  z.object({
    ...noteInputBase, ...extra, type: z.literal("sleep"),
    data: z.object({ trackedSleepTime: z.number().optional(), score: z.number().optional() }).strict().optional(),
  }).strict(),
  z.object({ ...noteInputBase, ...extra, type: z.literal("training"), data: z.object({ workouts: z.array(z.unknown()) }).strict().optional() }).strict(),
] as const;

const createNoteSchema = z.union(createNoteVariants({}));

const updateEventNoteSchema = z.union([
  z.object({ ...noteInputBase, id: z.string() }).strict(),
  z.object({ ...noteInputBase, id: z.string().optional(), schemaVersion: z.number().int().optional(), type: z.literal("text"), data: textNoteSchema }).strict(),
  z.object({ ...noteInputBase, id: z.string().optional(), schemaVersion: z.number().int().optional(), type: z.literal("meal"), data: mealItemSchema }).strict(),
  z.object({ ...noteInputBase, id: z.string().optional(), schemaVersion: z.number().int().optional(), type: z.literal("sleep"), data: sleepDataSchema }).strict(),
  z.object({ ...noteInputBase, id: z.string().optional(), schemaVersion: z.number().int().optional(), type: z.literal("training"), data: trainingDataSchema }).strict(),
]);

export const timelineEventCardSchema = z.object({
  id: z.string(), kind: eventKindSchema, noteTypes: z.array(z.string()),
  missed: z.boolean(), name: z.string(), description: z.string(), startedAt: z.string(), finishedAt: z.string().optional(),
  notifyOffsetsMinutes: notificationOffsetsSchema, durationLabel: z.string(), tags: z.array(z.string()),
  interruptions: z.array(z.object({ name: z.string(), description: z.string(), durationLabel: z.string() }).strict()),
}).strict();

export const timelineEventPageSchema = z.object({
  items: z.array(timelineEventCardSchema), nextCursor: z.string().optional(),
}).strict();

export const eventDetailSchema = z.object({
  id: z.string(), name: z.string(), description: z.string(), startedAt: z.string(), finishedAt: z.string().optional(),
  tags: z.array(z.string()), missed: z.boolean(), priority: eventPrioritySchema, notifyOffsetsMinutes: notificationOffsetsSchema,
  interruptions: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), startedAt: z.string(), finishedAt: z.string() }).strict()),
  revision: z.number().int(), kind: eventKindSchema, notes: z.array(noteSchema), taskIds: z.array(z.string()).optional(),
}).strict();

export const createEventInputSchema = z.object({
  name: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional(), missed: z.boolean().optional(),
  priority: eventPrioritySchema.optional(), notifyOffsetsMinutes: notificationOffsetsSchema.optional(), startedAt: z.string().optional(),
  finishedAt: z.string().optional(), kind: eventKindSchema.optional(), notes: z.array(createNoteSchema).optional(),
  noteIds: z.array(z.string()).optional(), taskIds: z.array(z.string()).optional(),
}).strict();

export const updateEventInputSchema = z.object({
  eventId: z.string(), expectedRevision: z.number().int(), name: z.string().optional(), description: z.string().optional(),
  startedAt: z.string().optional(), finishedAt: z.string().optional(), tags: z.array(z.string()).optional(), missed: z.boolean().optional(),
  priority: eventPrioritySchema.optional(), notifyOffsetsMinutes: notificationOffsetsSchema.optional(),
  interruptions: z.array(z.object({ id: z.string().optional(), name: z.string().optional(), description: z.string().optional(), startedAt: z.string().optional(), finishedAt: z.string().optional() }).strict()).optional(),
  kind: eventKindSchema.optional(), notes: z.array(updateEventNoteSchema).optional(), taskIds: z.array(z.string()).optional(),
}).strict();

/** `POST /api/notes`: a note e os eventos e tarefas em que ela ja nasce aparecendo. */
export const createNoteInputSchema = z.union(
  createNoteVariants({ eventIds: z.array(z.string()).optional(), taskIds: z.array(z.string()).optional() }),
);

export const createNoteResponseSchema = z.object({ noteId: z.string() }).strict();

const updateNoteBase = {
  expectedRevision: z.number().int(), ...noteInputBase,
  eventIds: z.array(z.string()).optional(), taskIds: z.array(z.string()).optional(),
};

/** `PATCH /api/notes/:noteId`: com `type`, o `data` e o novo conteudo inteiro. */
export const updateNoteInputSchema = z.union([
  z.object(updateNoteBase).strict(),
  z.object({ ...updateNoteBase, schemaVersion: z.number().int().optional(), type: z.literal("text"), data: textNoteSchema }).strict(),
  z.object({ ...updateNoteBase, schemaVersion: z.number().int().optional(), type: z.literal("meal"), data: mealItemSchema }).strict(),
  z.object({ ...updateNoteBase, schemaVersion: z.number().int().optional(), type: z.literal("sleep"), data: sleepDataSchema }).strict(),
  z.object({ ...updateNoteBase, schemaVersion: z.number().int().optional(), type: z.literal("training"), data: trainingDataSchema }).strict(),
]);

export const tagSuggestionSchema = z.object({ id: z.string(), name: z.string() }).strict();

const agentEntityRefSchema = z.object({
  kind: z.enum(["event", "task", "note"]), id: z.string(), change: z.enum(["created", "updated", "deleted"]), label: z.string().optional(),
}).strict();

const agentScreenContextSchema = z.object({ screen: z.string(), entityId: z.string().optional() }).strict();

export const agentChatTicketSchema = z.object({ ticket: z.string(), expiresAt: z.string() }).strict();

export const agentChatClientFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), id: z.string(), text: z.string(), context: agentScreenContextSchema.optional(), conversationId: z.string().optional() }).strict(),
  z.object({ type: z.literal("cancel"), id: z.string() }).strict(),
]);

const agentChatErrorCodeSchema = z.enum(["invalid_frame", "busy", "invalid_input", "forbidden", "limit_reached", "conflict", "conversation_gone", "unavailable", "cancelled", "internal"]);
const agentEntityItemSchema = z.object({ kind: z.enum(["event", "task", "note"]), id: z.string() }).passthrough();

export const agentChatServerFrameSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), userId: z.string(), expiresAt: z.string() }).strict(),
  z.object({ type: z.literal("status"), id: z.string(), label: z.string() }).strict(),
  z.object({
    type: z.literal("reply"), id: z.string(), conversationId: z.string(), assistantSeq: z.number().int(), agentResponse: z.string(),
    entities: z.array(agentEntityRefSchema), createdEntities: z.array(agentEntityItemSchema), updatedEntities: z.array(agentEntityItemSchema), deletedEntities: z.array(agentEntityItemSchema),
  }).strict(),
  z.object({ type: z.literal("error"), id: z.string().optional(), code: agentChatErrorCodeSchema }).strict(),
]);

export const agentConversationSchema = z.object({ id: z.string(), title: z.string().optional(), preview: z.string(), lastMessageAt: z.string(), revision: z.number().int(), createdAt: z.string(), updatedAt: z.string() }).strict();
export const agentConversationPageSchema = z.object({ items: z.array(agentConversationSchema), nextCursor: z.string().optional() }).strict();
export const agentChatMessagePageSchema = z.object({
  items: z.array(z.object({ id: z.string(), seq: z.number().int(), role: z.enum(["user", "assistant"]), content: z.string(), entities: z.array(agentEntityRefSchema), createdAt: z.string() }).strict()),
  nextCursor: z.string().optional(),
}).strict();

export const mobileContractSchemas = {
  timelineEventPage: timelineEventPageSchema,
  eventDetail: eventDetailSchema,
  createEventInput: createEventInputSchema,
  updateEventInput: updateEventInputSchema,
  note: noteSchema,
  createNoteInput: createNoteInputSchema,
  createNoteResponse: createNoteResponseSchema,
  updateNoteInput: updateNoteInputSchema,
  tagSuggestion: tagSuggestionSchema,
  agentChatTicket: agentChatTicketSchema,
  agentChatClientFrame: agentChatClientFrameSchema,
  agentChatServerFrame: agentChatServerFrameSchema,
  agentConversationPage: agentConversationPageSchema,
  agentChatMessagePage: agentChatMessagePageSchema,
} as const;
