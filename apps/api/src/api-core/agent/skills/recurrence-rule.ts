import { shiftDayKey, weekdayIndexOf } from "@repo/timeline";
import type { RecurrenceFrequency, RecurrenceRule } from "@repo/contracts";

/** Domingo primeiro: a mesma ordem de `weekdayIndexOf` e da mascara `byWeekday`. */
export const WEEKDAY_CODES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

export interface RecurrenceRuleArgs {
  frequency: RecurrenceFrequency;
  interval?: number;
  weekdays?: WeekdayCode[];
  monthDay?: number;
  month?: number;
  timeOfDay: string;
  durationMinutes?: number;
  startsOn?: string;
  endsOn?: string;
}

/**
 * Os argumentos que o modelo escreve viram a regra do dominio. O que o usuario
 * nao disse mas a data inicial implica (qual dia da semana, qual dia do mes)
 * e preenchido aqui; o que seria adivinhar uma intencao diferente da dita e
 * recusado com uma mensagem que o modelo consegue corrigir.
 */
export function buildRecurrenceRule(args: RecurrenceRuleArgs, today: string, timeZone: string): RecurrenceRule {
  const startsOn = args.startsOn ?? today;
  const [, startMonth, startDay] = startsOn.split("-").map(Number) as [number, number, number];

  if (args.weekdays?.length && args.frequency !== "weekly") {
    throw new Error("weekdays só vale com frequency weekly. Para dias específicos da semana, use weekly.");
  }
  if (args.monthDay !== undefined && args.frequency !== "monthly" && args.frequency !== "yearly") {
    throw new Error("monthDay só vale com frequency monthly ou yearly.");
  }
  if (args.month !== undefined && args.frequency !== "yearly") {
    throw new Error("month só vale com frequency yearly.");
  }
  if (args.endsOn !== undefined && args.endsOn < startsOn) {
    throw new Error(`endsOn (${args.endsOn}) não pode ser anterior a startsOn (${startsOn}).`);
  }

  const rule: RecurrenceRule = {
    frequency: args.frequency,
    interval: args.interval ?? 1,
    timeOfDay: args.timeOfDay,
    timeZone,
    startsOn,
  };

  if (args.frequency === "weekly") {
    const indexes = args.weekdays?.length
      ? args.weekdays.map((code) => WEEKDAY_CODES.indexOf(code))
      : [weekdayIndexOf(startsOn)];
    rule.byWeekday = indexes.reduce((mask, index) => mask | (1 << index), 0);
  }
  if (args.frequency === "monthly" || args.frequency === "yearly") {
    rule.byMonthDay = args.monthDay ?? startDay;
  }
  if (args.frequency === "yearly") rule.byMonth = args.month ?? startMonth;
  if (args.durationMinutes !== undefined) rule.durationMinutes = args.durationMinutes;
  if (args.endsOn !== undefined) rule.endsOn = args.endsOn;
  return rule;
}

/** A regra do dominio de volta nos argumentos que o modelo escreve, para uma alteracao parcial partir dela. */
export function ruleArgsOf(rule: RecurrenceRule): RecurrenceRuleArgs {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays: rule.byWeekday === undefined
      ? undefined
      : WEEKDAY_CODES.filter((_, index) => ((rule.byWeekday as number) & (1 << index)) !== 0),
    monthDay: rule.byMonthDay,
    month: rule.byMonth,
    timeOfDay: rule.timeOfDay,
    durationMinutes: rule.durationMinutes,
    startsOn: rule.startsOn,
    endsOn: rule.endsOn,
  };
}

/** Quatro anos a frente cobrem ate o 29 de fevereiro: a primeira ocorrencia de qualquer regra valida cai ali. */
export function firstSearchLimit(from: string): string {
  return shiftDayKey(from, 366 * 4);
}
