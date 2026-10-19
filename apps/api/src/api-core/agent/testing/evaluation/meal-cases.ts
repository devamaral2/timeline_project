import { z } from "zod";
import data from "./meal-cases.json";

const startedAt = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("now") }).strict(),
  z.object({ kind: z.literal("relative"), minutes: z.number().int() }).strict(),
  z.object({
    kind: z.literal("absolute"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    dayOffset: z.number().int(),
  }).strict(),
]);

const route = z.enum([
  "read", "complex", "save_meal_event", "save_routine_event", "save_training_event",
  "save_sleep_event", "save_task", "save_recurrence", "finish_event",
]);

/**
 * Pedidos reais de refeicao em portugues, com a rota esperada e o que o
 * especialista de refeicao deve extrair. `startedAt` e `foods` ainda nao sao
 * medidos pelo roteador: ficam para a avaliacao do pipeline rapido.
 */
export const mealCaseSchema = z.object({
  id: z.string().regex(/^meal-\d{3}$/),
  text: z.string().min(1),
  note: z.string().min(1),
  expect: z.object({
    route,
    operation: z.enum(["create", "update"]).optional(),
    startedAt: startedAt.optional(),
    foods: z.array(z.object({ name: z.string().min(1), quantity: z.string().nullable() }).strict()).optional(),
  }).strict(),
}).strict();

const datasetSchema = z.object({
  now: z.iso.datetime({ offset: true }),
  timeZone: z.string(),
  cases: z.array(mealCaseSchema).min(1),
}).strict();

export type MealCase = z.infer<typeof mealCaseSchema>;
export const mealEvaluation = datasetSchema.parse(data);
