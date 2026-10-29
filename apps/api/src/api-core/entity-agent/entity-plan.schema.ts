import { z } from "zod";
import type { EntityCommand, EntityPlan } from "./entity-plan.types";
import { WORKOUT_NAMES } from "./entity-plan.time";

const instant = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), "data ISO-8601 inválida");

const tags = z.array(z.string().min(1).max(40)).max(20).optional();

const TASK_STATUSES = ["todo", "scheduled", "toDefine", "inHold", "done", "cancel"] as const;
const TASK_PRIORITIES = ["urgent", "high", "medium", "low"] as const;

const commandBase = {
  startedAt: instant.optional(),
  merge: z.boolean().optional(),
  tags,
};

export const logTrainingCommandSchema = z
  .object({
    op: z.literal("log-training"),
    workoutCode: z.enum(Object.keys(WORKOUT_NAMES) as [keyof typeof WORKOUT_NAMES, ...(keyof typeof WORKOUT_NAMES)[]]),
    activity: z.string().min(1).max(80).optional(),
    description: z.string().max(2000).optional(),
    durationMinutes: z.number().positive().optional(),
    calories: z.number().nonnegative().optional(),
    paceMinPerKm: z.number().positive().optional(),
    distanceKm: z.number().nonnegative().optional(),
    ...commandBase,
  })
  .strict();

export const logMealCommandSchema = z
  .object({
    op: z.literal("log-meal"),
    items: z.string().min(1).max(2000),
    name: z.string().min(1).max(80).optional(),
    durationMinutes: z.number().positive().max(240).optional(),
    ...commandBase,
  })
  .strict();

export const logRoutineCommandSchema = z
  .object({
    op: z.literal("log-routine"),
    name: z.string().min(1).max(80),
    description: z.string().max(2000).optional(),
    durationMinutes: z.number().positive().max(24 * 60).optional(),
    ...commandBase,
  })
  .strict();

export const logSleepCommandSchema = z
  .object({
    op: z.literal("log-sleep"),
    trackedSleepTimeMinutes: z.number().positive().max(24 * 60),
    score: z.number().min(0).max(100).optional(),
    ...commandBase,
  })
  .strict();

export const logTaskCommandSchema = z
  .object({
    op: z.literal("log-task"),
    name: z.string().min(1).max(120),
    description: z.string().max(2000).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    estimatedFinishAt: instant.optional(),
    durationMinutes: z.number().positive().max(365 * 24 * 60).optional(),
    ...commandBase,
  })
  .strict();

export const entityCommandSchema = z.discriminatedUnion("op", [
  logTrainingCommandSchema,
  logMealCommandSchema,
  logRoutineCommandSchema,
  logSleepCommandSchema,
  logTaskCommandSchema,
]);

export const entityCommandsSchema = z.array(entityCommandSchema).min(1).max(20);

const plannedEventSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["routine", "meal", "sleep", "training"]),
    name: z.string().min(1),
    description: z.string(),
    startedAt: instant,
    finishedAt: instant.nullable(),
    startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    tags: z.array(z.string()),
    revision: z.number().int().min(1),
    noteIds: z.array(z.string().min(1)),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict();

const plannedNoteSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum(["text", "meal", "sleep", "training"]),
    schemaVersion: z.number().int().min(1),
    data: z.record(z.string(), z.unknown()),
    tags: z.array(z.string()),
    revision: z.number().int().min(1),
    eventIds: z.array(z.string().min(1)),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict();

const plannedTaskSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    status: z.enum(TASK_STATUSES),
    priority: z.enum(TASK_PRIORITIES),
    startedAt: instant.nullable(),
    estimatedFinishAt: instant.nullable(),
    finishedAt: instant.nullable(),
    tags: z.array(z.string()),
    revision: z.number().int().min(1),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict();

export const entityPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    timeZone: z.string().min(1),
    updatedAt: instant,
    events: z.array(plannedEventSchema),
    notes: z.array(plannedNoteSchema),
    // Plano gravado antes das tarefas existirem nao tem a chave: nasce vazio.
    tasks: z.array(plannedTaskSchema).default([]),
  })
  .strict();

export function parseEntityCommand(value: unknown): EntityCommand {
  return entityCommandSchema.parse(value) as EntityCommand;
}

/** O plano vem de um arquivo local; o schema impede que um JSON editado a mao vire estado invalido. */
export function parseEntityPlan(value: unknown): EntityPlan {
  return entityPlanSchema.parse(value) as unknown as EntityPlan;
}
