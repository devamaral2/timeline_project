import type { Pool } from "pg";
import { Artifact, Event, Recurrence, type EventCreateProps, type FoodData, type RecurrenceRule } from "../../../domain";

/** Os dois usuarios dos testes de integracao: o dono dos dados e um estranho. */
export const USER = "user-1";
export const OTHER_USER = "user-2";

/** Um dos exercicios globais que a migration semeia (`running`). */
export const GLOBAL_WORKOUT_ID = "01KDVDNA0124XD880E1MH1WADH";

export function at(iso: string): Date {
  return new Date(iso);
}

export function foodData(kcal: number, overrides: Partial<FoodData> = {}): FoodData {
  return {
    description: "arroz e feijao",
    items: [],
    totals: {
      totalCaloriesKcal: kcal,
      totalProteinGrams: kcal / 10,
      totalCarbohydrateGrams: kcal / 5,
      totalFatGrams: kcal / 20,
      totalFiberGrams: 0,
    },
    ...overrides,
  };
}

/** Um alimento que nasce a espera dos nutrientes: o servidor ainda vai calcular. */
export function pendingFoodData(description: string): FoodData {
  return foodData(0, { description, generation: { status: "pending" } });
}

export function textArtifact(userId: string, body: string, tags: string[] = []): Artifact {
  return Artifact.create({ userId, data: { body }, tags });
}

export function foodArtifact(userId: string, name: string, kcal: number): Artifact {
  return Artifact.create({ userId, type: "food", name, data: foodData(kcal) });
}

/** Evento de referencia de pessoa: so marca um horario. */
export function referenceEvent(userId: string, name: string, startedAt: string, props: Partial<EventCreateProps> = {}): Event {
  return Event.create({ userId, name, startedAt: at(startedAt), ...props });
}

/** Evento acompanhado de pessoa: tem status, e nao precisa de horario. */
export function trackedEvent(userId: string, name: string, props: Partial<EventCreateProps> = {}): Event {
  return Event.create({ userId, name, status: "todo", ...props });
}

/** Um pedido ao agente; os passos dele usam `kind: "step"`. */
export function agentEvent(userId: string, name: string, props: Partial<EventCreateProps> = {}): Event {
  return Event.create({
    userId,
    name,
    actor: "agent",
    kind: "request",
    status: "running",
    startedAt: at("2026-11-10T12:00:00Z"),
    ...props,
  });
}

export function dailyRule(startsOn: string, overrides: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return { frequency: "daily", interval: 1, timeOfDay: "18:00", timeZone: "America/Sao_Paulo", startsOn, ...overrides };
}

export function dailyRecurrence(userId: string, startsOn: string, template: Record<string, unknown> = {}): Recurrence {
  return Recurrence.create({ userId, rule: dailyRule(startsOn), template: { name: "Serie", kind: "routine", ...template } });
}

/** A ocorrencia de um dia da serie, as 18:00 de Sao Paulo, montada como a materializacao monta. */
export function occurrenceOf(recurrence: Recurrence, day: string, props: Partial<EventCreateProps> = {}): Event {
  return Event.create({
    userId: recurrence.userId,
    name: String(recurrence.template.name ?? "Serie"),
    startedAt: at(`${day}T21:00:00Z`),
    occurrence: { recurrenceId: recurrence.id, occurrenceOn: day, detached: false },
    ...props,
  });
}

export async function selectRows<T extends Record<string, unknown> = Record<string, unknown>>(
  pool: Pool,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await pool.query(sql, params)).rows as T[];
}

export async function countRows(pool: Pool, table: string, where = "true", params: unknown[] = []): Promise<number> {
  const [row] = await selectRows<{ n: number }>(pool, `SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params);
  return row.n;
}
