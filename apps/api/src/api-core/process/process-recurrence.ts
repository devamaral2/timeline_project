import { weekdayIndexOf } from "@repo/timeline";
import type {
  CreateRecurrenceInput, EventRecurrenceTemplate, RecurrenceFrequency, RecurrenceRule, TaskRecurrenceTemplate,
} from "@repo/contracts";
import type { Recurrence } from "../../domain";
import type { RecurrenceRevision } from "../recurrences/revise-recurrence";
import type {
  RecurringEventCreateOutput, RecurringEventEditOutput, RecurringTaskCreateOutput, RecurringTaskEditOutput,
} from "./process-agent-schemas";

/**
 * Do que o agente de recorrencia escreveu para a regra do dominio. Os padroes sao do servidor: o usuario
 * nao e perguntado sobre intervalo, dia da semana, dia do mes, duracao ou inicio.
 */

/** Hora usada quando o usuario nao disse a que horas a serie acontece. */
export const DEFAULT_TIME_OF_DAY = "09:00";

/** Domingo primeiro, a mesma ordem da mascara `byWeekday` e de `weekdayIndexOf`. */
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type Weekday = (typeof WEEKDAYS)[number];

/** Uma regra que o dominio nao aceita ou que contradiz o que o usuario disse. */
export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

interface Cadence {
  frequency: RecurrenceFrequency;
  interval?: number;
  weekdays?: readonly Weekday[];
  monthDay?: number;
  month?: number;
  timeOfDay: string;
  durationMinutes?: number;
  startsOn?: string;
  endsOn?: string;
}

const present = <T>(value: T | null | undefined): T | undefined => value ?? undefined;

export function buildRule(cadence: Cadence, today: string, timeZone: string): RecurrenceRule {
  const startsOn = cadence.startsOn ?? today;
  const [, startMonth, startDay] = startsOn.split("-").map(Number) as [number, number, number];
  if (cadence.weekdays?.length && cadence.frequency !== "weekly") {
    throw new RuleError("weekdays só vale com frequência semanal");
  }
  if (cadence.monthDay !== undefined && cadence.frequency !== "monthly" && cadence.frequency !== "yearly") {
    throw new RuleError("monthDay só vale com frequência mensal ou anual");
  }
  if (cadence.month !== undefined && cadence.frequency !== "yearly") throw new RuleError("month só vale com frequência anual");
  if (cadence.endsOn !== undefined && cadence.endsOn < startsOn) throw new RuleError("a série termina antes de começar");

  const rule: RecurrenceRule = {
    frequency: cadence.frequency, interval: cadence.interval ?? 1, timeOfDay: cadence.timeOfDay, timeZone, startsOn,
  };
  if (cadence.frequency === "weekly") {
    const indexes = cadence.weekdays?.length
      ? cadence.weekdays.map((code) => WEEKDAYS.indexOf(code))
      : [weekdayIndexOf(startsOn)];
    rule.byWeekday = indexes.reduce((mask, index) => mask | (1 << index), 0);
  }
  if (cadence.frequency === "monthly" || cadence.frequency === "yearly") rule.byMonthDay = cadence.monthDay ?? startDay;
  if (cadence.frequency === "yearly") rule.byMonth = cadence.month ?? startMonth;
  if (cadence.durationMinutes !== undefined) rule.durationMinutes = cadence.durationMinutes;
  if (cadence.endsOn !== undefined) rule.endsOn = cadence.endsOn;
  return rule;
}

type SeriesFields = {
  frequency: RecurrenceFrequency;
  interval: number | null; weekdays: Weekday[] | null; monthDay: number | null; month: number | null;
  timeOfDay: string | null; durationMinutes: number | null; startsOn: string | null; endsOn: string | null;
};

function cadenceOf(series: SeriesFields): Cadence {
  return {
    frequency: series.frequency,
    interval: present(series.interval),
    weekdays: present(series.weekdays),
    monthDay: present(series.monthDay),
    month: present(series.month),
    timeOfDay: series.timeOfDay ?? DEFAULT_TIME_OF_DAY,
    durationMinutes: present(series.durationMinutes),
    startsOn: present(series.startsOn),
    endsOn: present(series.endsOn),
  };
}

/** Uma serie nova de eventos. O template nao traz notas: quem cria notas e outro agente. */
export function eventSeriesInput(
  series: RecurringEventCreateOutput["series"][number], today: string, timeZone: string,
): CreateRecurrenceInput {
  const template: EventRecurrenceTemplate = {
    kind: series.kind, name: series.name,
    ...(series.description ? { description: series.description } : {}),
    ...(series.tags.length ? { tags: series.tags } : {}),
  };
  return { ...buildRule(cadenceOf(series), today, timeZone), target: "event", template };
}

/** Uma serie nova de tarefas. */
export function taskSeriesInput(
  series: RecurringTaskCreateOutput["series"][number], today: string, timeZone: string,
): CreateRecurrenceInput {
  const template: TaskRecurrenceTemplate = {
    name: series.name,
    ...(series.description ? { description: series.description } : {}),
    ...(series.tags.length ? { tags: series.tags } : {}),
    ...(series.priority ? { priority: series.priority } : {}),
  };
  return { ...buildRule(cadenceOf(series), today, timeZone), target: "task", template };
}

function baseOf(rule: Readonly<RecurrenceRule>): Cadence {
  return {
    frequency: rule.frequency, interval: rule.interval,
    weekdays: rule.byWeekday === undefined ? undefined : WEEKDAYS.filter((_, index) => ((rule.byWeekday as number) & (1 << index)) !== 0),
    monthDay: rule.byMonthDay, month: rule.byMonth, timeOfDay: rule.timeOfDay,
    durationMinutes: rule.durationMinutes, startsOn: rule.startsOn, endsOn: rule.endsOn,
  };
}

type SeriesEdit = (RecurringEventEditOutput | RecurringTaskEditOutput)["edits"][number];

/** O que a edicao muda, ou nada: edicao sem campo novo nao e um pedido. */
export function changesNothing(edit: SeriesEdit): boolean {
  const { id: _id, ...fields } = edit;
  return Object.values(fields).every((value) => value === null);
}

/**
 * Alteracao parcial da serie, de hoje em diante: parte da regra e do template como estao e muda so o que foi
 * pedido. Trocar a frequencia descarta o que era da anterior (dias da semana, dia do mes).
 */
export function planSeriesEdit(current: Recurrence, edit: SeriesEdit, timeZone: string): RecurrenceRevision {
  const base = baseOf(current.rule);
  const frequency = edit.frequency ?? base.frequency;
  const keeps = frequency === base.frequency;
  const merged: Cadence = {
    frequency,
    interval: present(edit.interval) ?? base.interval,
    weekdays: present(edit.weekdays) ?? (keeps ? base.weekdays : undefined),
    monthDay: present(edit.monthDay) ?? (frequency === "monthly" || frequency === "yearly" ? base.monthDay : undefined),
    month: present(edit.month) ?? (keeps ? base.month : undefined),
    timeOfDay: edit.timeOfDay ?? base.timeOfDay,
    durationMinutes: present(edit.durationMinutes) ?? base.durationMinutes,
    startsOn: present(edit.startsOn) ?? base.startsOn,
    endsOn: present(edit.endsOn) ?? base.endsOn,
  };
  // Chaves ausentes da regra nova viram `undefined`: o merge da entidade as removeria da regra.
  const rule = {
    byWeekday: undefined, byMonthDay: undefined, byMonth: undefined, durationMinutes: undefined, endsOn: undefined,
    ...buildRule(merged, current.rule.startsOn, timeZone),
  };

  const priority = "priority" in edit ? edit.priority : null;
  if (edit.name === null && edit.description === null && edit.tags === null && priority === null) return { rule };

  const stored = current.template as {
    name?: string; description?: string; tags?: string[]; priority?: string; kind?: EventRecurrenceTemplate["kind"];
    parentTaskId?: string;
  };
  if (current.target === "task") {
    return {
      rule,
      template: {
        name: edit.name ?? stored.name ?? "",
        description: edit.description ?? stored.description,
        tags: edit.tags ?? stored.tags,
        priority: (priority ?? stored.priority) as TaskRecurrenceTemplate["priority"],
        parentTaskId: stored.parentTaskId,
      },
    };
  }
  return {
    rule,
    // As notas da serie (a refeicao de um almoco fixo) ficam: este agente nao cria nem troca notas.
    keepNotes: true,
    template: {
      kind: stored.kind, name: edit.name ?? stored.name,
      description: edit.description ?? stored.description, tags: edit.tags ?? stored.tags,
      priority: stored.priority as EventRecurrenceTemplate["priority"],
    },
  };
}
