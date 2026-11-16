import type { CreateRecurrenceInput, RecurrenceDto, RecurrenceRule } from "@repo/contracts";
import {
  createRecurrenceInputSchema,
  recurrenceSchema,
  updateRecurrenceInputSchema,
} from "@repo/contracts/schemas";
import { z } from "zod";
import type { FakeArea, FakeRequest, FakeResult, FakeStore } from ".";

/**
 * Área de séries: lista, leitura, criação, edição e remoção. A regra é conferida
 * e reduzida às chaves da frequência como a API faz (`recurrence.entity.ts`).
 */

const RECURRENCES = "recurrences";
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Ano bissexto: 29 de fevereiro existe. */
const MAX_DAY_OF_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MAX_DURATION_MINUTES = 60 * 24 * 366;

const createdRecurrenceSchema = z.object({ recurrenceId: z.string() }).strict();

type RecurrenceBody = Partial<RecurrenceRule> & { expectedRevision: number; template?: Record<string, unknown> };

/** Uma série para o seed. Os campos que você não passa ganham uma regra diária às 18:00 em São Paulo. */
export function recurrenceFixture(overrides: Partial<RecurrenceDto> & { id: string }): RecurrenceDto {
  return recurrenceSchema.parse({
    frequency: "daily",
    interval: 1,
    timeOfDay: "18:00",
    timeZone: "America/Sao_Paulo",
    startsOn: "2026-09-01",
    template: { name: "Tarefa", priority: "medium", description: "" },
    revision: 1,
    ...overrides,
  });
}

function table(store: FakeStore) {
  return store.table<RecurrenceDto>(RECURRENCES);
}

function isDayKey(value: string): boolean {
  if (!DAY_KEY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function between(value: number | undefined, min: number, max: number): boolean {
  return value !== undefined && Number.isInteger(value) && value >= min && value <= max;
}

/** A regra válida, só com as chaves que a frequência usa; `undefined` quando a regra não vale. */
function checkedRule(rule: RecurrenceRule): RecurrenceRule | undefined {
  const { frequency, interval, byWeekday, byMonthDay, byMonth, timeOfDay, durationMinutes, timeZone, startsOn, endsOn } = rule;
  const weekly = frequency === "weekly";
  const monthDay = frequency === "monthly" || frequency === "yearly";
  const yearly = frequency === "yearly";

  const valid =
    Number.isInteger(interval) && interval >= 1 &&
    (weekly ? between(byWeekday, 1, 127) : byWeekday === undefined) &&
    (monthDay ? between(byMonthDay, 1, 31) : byMonthDay === undefined) &&
    (yearly
      ? between(byMonth, 1, 12) && (byMonthDay ?? 0) <= (MAX_DAY_OF_MONTH[(byMonth ?? 1) - 1] ?? 0)
      : byMonth === undefined) &&
    TIME_OF_DAY.test(timeOfDay) &&
    (durationMinutes === undefined || between(durationMinutes, 1, MAX_DURATION_MINUTES)) &&
    isTimeZone(timeZone) &&
    isDayKey(startsOn) &&
    (endsOn === undefined || (isDayKey(endsOn) && endsOn >= startsOn));
  if (!valid) return undefined;

  return {
    frequency,
    interval,
    timeOfDay,
    timeZone,
    startsOn,
    ...(weekly ? { byWeekday } : {}),
    ...(monthDay ? { byMonthDay } : {}),
    ...(yearly ? { byMonth } : {}),
    ...(durationMinutes !== undefined ? { durationMinutes } : {}),
    ...(endsOn !== undefined ? { endsOn } : {}),
  };
}

function ruleOf(recurrence: RecurrenceDto): RecurrenceRule {
  const { id: _id, template: _template, revision: _revision, ...rule } = recurrence;
  return rule;
}

function list(_request: FakeRequest, store: FakeStore): FakeResult {
  return { status: 200, body: [...table(store).values()] };
}

function create(request: FakeRequest, store: FakeStore): FakeResult {
  const { template, ...rule } = request.body as CreateRecurrenceInput;
  const checked = checkedRule(rule);
  if (!checked) return { status: 400 };
  const id = store.nextId("rec");
  table(store).set(id, recurrenceSchema.parse({ ...checked, id, template, revision: 1 }));
  return { status: 201, body: createdRecurrenceSchema.parse({ recurrenceId: id }) };
}

function read(request: FakeRequest, store: FakeStore): FakeResult {
  const recurrence = table(store).get(request.params.recurrenceId ?? "");
  if (!recurrence) return { status: 404 };
  return { status: 200, body: recurrence };
}

function update(request: FakeRequest, store: FakeStore): FakeResult {
  const current = table(store).get(request.params.recurrenceId ?? "");
  if (!current) return { status: 404 };
  const { expectedRevision, template, ...patch } = request.body as RecurrenceBody;
  if (expectedRevision !== current.revision) return { status: 409 };

  const checked = checkedRule({ ...ruleOf(current), ...patch });
  if (!checked) return { status: 400 };
  table(store).set(
    current.id,
    recurrenceSchema.parse({ ...checked, id: current.id, template: template ?? current.template, revision: current.revision + 1 }),
  );
  return { status: 204 };
}

function remove(request: FakeRequest, store: FakeStore): FakeResult {
  if (!table(store).delete(request.params.recurrenceId ?? "")) return { status: 404 };
  return { status: 204 };
}

export const recurrencesArea: FakeArea = {
  name: "séries",
  routes: [
    { method: "GET", path: "/api/recurrences", output: z.array(recurrenceSchema), handle: list },
    { method: "POST", path: "/api/recurrences", input: createRecurrenceInputSchema, output: createdRecurrenceSchema, idempotent: true, handle: create },
    { method: "GET", path: "/api/recurrences/:recurrenceId", output: recurrenceSchema, handle: read },
    { method: "PATCH", path: "/api/recurrences/:recurrenceId", input: updateRecurrenceInputSchema.omit({ recurrenceId: true }), handle: update },
    { method: "DELETE", path: "/api/recurrences/:recurrenceId", handle: remove },
  ],
};
