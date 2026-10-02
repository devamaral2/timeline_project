import { z } from "zod";

const eventPrioritySchema = z.enum(["urgent", "normal", "flexible"]);
const notificationOffsetsSchema = z.array(z.number());
const routineDataSchema = z.object({}).strict();

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
  micronutrients: z.record(z.string(), z.number()),
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

const eventItemSchema = z.discriminatedUnion("type", [
  z.object({
    id: z.string(), position: z.number().int(), type: z.literal("routine"),
    schemaVersion: z.number().int(), isPrimary: z.boolean(), data: routineDataSchema,
  }).strict(),
  z.object({
    id: z.string(), position: z.number().int(), type: z.literal("meal"),
    schemaVersion: z.number().int(), isPrimary: z.boolean(), data: mealItemSchema,
  }).strict(),
  z.object({
    id: z.string(), position: z.number().int(), type: z.literal("sleep"),
    schemaVersion: z.number().int(), isPrimary: z.boolean(),
    data: z.object({ trackedSleepTime: z.number(), score: z.number() }).strict(),
  }).strict(),
  z.object({
    id: z.string(), position: z.number().int(), type: z.literal("training"),
    schemaVersion: z.number().int(), isPrimary: z.boolean(), data: trainingDataSchema,
  }).strict(),
]);

const createEventItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("routine"), isPrimary: z.boolean().optional(), data: routineDataSchema.optional() }).strict(),
  z.object({ type: z.literal("meal"), isPrimary: z.boolean().optional(), data: z.object({ inputText: z.string() }).strict() }).strict(),
  z.object({
    type: z.literal("sleep"), isPrimary: z.boolean().optional(),
    data: z.object({ trackedSleepTime: z.number().optional(), score: z.number().optional() }).strict().optional(),
  }).strict(),
  z.object({ type: z.literal("training"), isPrimary: z.boolean().optional(), data: z.object({ workouts: z.array(z.unknown()) }).strict().optional() }).strict(),
]);

const updateEventItemSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().optional(), type: z.literal("routine"), schemaVersion: z.number().int(), isPrimary: z.boolean(), data: routineDataSchema }).strict(),
  z.object({ id: z.string().optional(), type: z.literal("meal"), schemaVersion: z.number().int(), isPrimary: z.boolean(), data: mealItemSchema }).strict(),
  z.object({ id: z.string().optional(), type: z.literal("sleep"), schemaVersion: z.number().int(), isPrimary: z.boolean(), data: z.object({ trackedSleepTime: z.number(), score: z.number() }).strict() }).strict(),
  z.object({ id: z.string().optional(), type: z.literal("training"), schemaVersion: z.number().int(), isPrimary: z.boolean(), data: trainingDataSchema }).strict(),
]);

export const timelineEventCardSchema = z.object({
  id: z.string(), primaryItemId: z.string(), primaryItemType: z.string(), itemTypes: z.array(z.string()),
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
  revision: z.number().int(), primaryItemId: z.string(), items: z.array(eventItemSchema), taskIds: z.array(z.string()).optional(),
}).strict();

export const createEventInputSchema = z.object({
  name: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional(), missed: z.boolean().optional(),
  priority: eventPrioritySchema.optional(), notifyOffsetsMinutes: notificationOffsetsSchema.optional(), startedAt: z.string().optional(),
  finishedAt: z.string().optional(), items: z.array(createEventItemSchema), taskIds: z.array(z.string()).optional(),
}).strict();

export const updateEventInputSchema = z.object({
  eventId: z.string(), expectedRevision: z.number().int(), name: z.string().optional(), description: z.string().optional(),
  startedAt: z.string().optional(), finishedAt: z.string().optional(), tags: z.array(z.string()).optional(), missed: z.boolean().optional(),
  priority: eventPrioritySchema.optional(), notifyOffsetsMinutes: notificationOffsetsSchema.optional(),
  interruptions: z.array(z.object({ id: z.string().optional(), name: z.string().optional(), description: z.string().optional(), startedAt: z.string().optional(), finishedAt: z.string().optional() }).strict()).optional(),
  items: z.array(updateEventItemSchema).optional(), taskIds: z.array(z.string()).optional(),
}).strict();

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
  tagSuggestion: tagSuggestionSchema,
  agentChatTicket: agentChatTicketSchema,
  agentChatClientFrame: agentChatClientFrameSchema,
  agentChatServerFrame: agentChatServerFrameSchema,
  agentConversationPage: agentConversationPageSchema,
  agentChatMessagePage: agentChatMessagePageSchema,
} as const;
