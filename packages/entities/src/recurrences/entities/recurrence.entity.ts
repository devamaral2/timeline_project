import { ulid } from "ulid";
import {
  isRecurrenceFrequency,
  isRecurrenceTarget,
  type RecurrenceRule,
  type RecurrenceTarget,
} from "../contracts/recurrence-rule";
import { RecurrenceValidationError } from "../errors/recurrence.errors";

export interface RecurrenceCreateProps {
  id?: string;
  userId: string;
  target: RecurrenceTarget;
  rule: RecurrenceRule;
  /**
   * O que cada ocorrencia copia. A entidade so garante que e um objeto: quem
   * sabe se ele gera um evento ou uma tarefa valida e o usecase, que monta uma
   * ocorrencia de ensaio antes de salvar.
   */
  template: Record<string, unknown>;
}

export interface RecurrenceRehydrateProps extends RecurrenceCreateProps {
  revision: number;
  materializedThrough?: string;
}

export interface RecurrenceReviseChanges {
  rule?: Partial<RecurrenceRule>;
  template?: Record<string, unknown>;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Dias maximos de cada mes num ano bissexto: 30 de fevereiro nunca acontece. */
const MAX_DAY_OF_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !DAY_KEY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isIntegerBetween(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
}

/**
 * A regra de repeticao de um evento ou de uma tarefa.
 *
 * As ocorrencias sao linhas de verdade em `events`/`tasks`, geradas quando
 * alguem le a timeline ou a lista de tarefas. `materializedThrough` e ate que
 * dia civil isso ja foi feito — a proxima leitura continua dali.
 */
export class Recurrence {
  private constructor(
    readonly id: string,
    readonly userId: string,
    readonly target: RecurrenceTarget,
    readonly rule: Readonly<RecurrenceRule>,
    readonly template: Readonly<Record<string, unknown>>,
    readonly materializedThrough: string | undefined,
    readonly revision: number,
  ) {}

  static create(props: RecurrenceCreateProps): Recurrence {
    return Recurrence.build({ ...props, id: props.id ?? ulid(), revision: 1, materializedThrough: undefined });
  }

  static rehydrate(props: RecurrenceRehydrateProps): Recurrence {
    return Recurrence.build({ ...props, id: props.id ?? ulid(), materializedThrough: props.materializedThrough });
  }

  /**
   * Mudar a regra ou o template invalida o que ja foi gerado para frente: a
   * marca d'agua volta, e o repositorio apaga as ocorrencias futuras que
   * ninguem editou a mao.
   */
  revise(changes: RecurrenceReviseChanges): Recurrence {
    return Recurrence.build({
      id: this.id,
      userId: this.userId,
      target: this.target,
      rule: { ...this.rule, ...changes.rule },
      template: changes.template ?? { ...this.template },
      materializedThrough: undefined,
      revision: this.revision + 1,
    });
  }

  /** A mesma regra, com a marca d'agua adiante. Nao conta como revisao. */
  materializedUntil(dayKey: string): Recurrence {
    return Recurrence.build({
      id: this.id,
      userId: this.userId,
      target: this.target,
      rule: { ...this.rule },
      template: { ...this.template },
      materializedThrough: dayKey,
      revision: this.revision,
    });
  }

  private static build(props: Required<Omit<RecurrenceRehydrateProps, "materializedThrough">> & {
    materializedThrough: string | undefined;
  }): Recurrence {
    const rule = normalizeRule(props.rule);

    if (!isRecurrenceTarget(props.target)) {
      throw new RecurrenceValidationError("Invalid recurrence target");
    }
    if (typeof props.template !== "object" || props.template === null || Array.isArray(props.template)) {
      throw new RecurrenceValidationError("Recurrence template must be an object");
    }
    if (!Number.isInteger(props.revision) || props.revision < 1) {
      throw new RecurrenceValidationError("Recurrence revision must be an integer >= 1");
    }
    if (props.materializedThrough !== undefined && !isDayKey(props.materializedThrough)) {
      throw new RecurrenceValidationError("Invalid materializedThrough");
    }

    return new Recurrence(
      props.id,
      props.userId,
      props.target,
      Object.freeze(rule),
      Object.freeze(structuredClone(props.template)),
      props.materializedThrough,
      props.revision,
    );
  }
}

function normalizeRule(rule: RecurrenceRule): RecurrenceRule {
  if (!isRecurrenceFrequency(rule.frequency)) {
    throw new RecurrenceValidationError("Invalid recurrence frequency");
  }
  if (!isIntegerBetween(rule.interval, 1, 32767)) {
    throw new RecurrenceValidationError("Recurrence interval must be an integer >= 1");
  }

  const weekly = rule.frequency === "weekly";
  const monthDay = rule.frequency === "monthly" || rule.frequency === "yearly";
  const yearly = rule.frequency === "yearly";

  if (weekly !== (rule.byWeekday !== undefined)) {
    throw new RecurrenceValidationError("byWeekday is required for weekly recurrences, and only for them");
  }
  if (weekly && !isIntegerBetween(rule.byWeekday, 1, 127)) {
    throw new RecurrenceValidationError("byWeekday must pick at least one weekday");
  }
  if (monthDay !== (rule.byMonthDay !== undefined)) {
    throw new RecurrenceValidationError("byMonthDay is required for monthly and yearly recurrences, and only for them");
  }
  if (monthDay && !isIntegerBetween(rule.byMonthDay, 1, 31)) {
    throw new RecurrenceValidationError("byMonthDay must be between 1 and 31");
  }
  if (yearly !== (rule.byMonth !== undefined)) {
    throw new RecurrenceValidationError("byMonth is required for yearly recurrences, and only for them");
  }
  if (yearly) {
    if (!isIntegerBetween(rule.byMonth, 1, 12)) {
      throw new RecurrenceValidationError("byMonth must be between 1 and 12");
    }
    if ((rule.byMonthDay as number) > (MAX_DAY_OF_MONTH[(rule.byMonth as number) - 1] as number)) {
      throw new RecurrenceValidationError("That day never happens in that month");
    }
  }
  if (typeof rule.timeOfDay !== "string" || !TIME_OF_DAY.test(rule.timeOfDay)) {
    throw new RecurrenceValidationError("timeOfDay must be HH:MM");
  }
  if (rule.durationMinutes !== undefined && !isIntegerBetween(rule.durationMinutes, 1, 60 * 24 * 366)) {
    throw new RecurrenceValidationError("durationMinutes must be a positive integer");
  }
  if (!isTimeZone(rule.timeZone)) {
    throw new RecurrenceValidationError("Invalid time zone");
  }
  if (!isDayKey(rule.startsOn)) {
    throw new RecurrenceValidationError("startsOn must be YYYY-MM-DD");
  }
  if (rule.endsOn !== undefined) {
    if (!isDayKey(rule.endsOn)) throw new RecurrenceValidationError("endsOn must be YYYY-MM-DD");
    if (rule.endsOn < rule.startsOn) throw new RecurrenceValidationError("endsOn must be on or after startsOn");
  }

  // So as chaves da gramatica: um PATCH com lixo nao entra no jsonb pela porta dos fundos.
  const normalized: RecurrenceRule = {
    frequency: rule.frequency,
    interval: rule.interval,
    timeOfDay: rule.timeOfDay,
    timeZone: rule.timeZone,
    startsOn: rule.startsOn,
  };
  if (weekly) normalized.byWeekday = rule.byWeekday;
  if (monthDay) normalized.byMonthDay = rule.byMonthDay;
  if (yearly) normalized.byMonth = rule.byMonth;
  if (rule.durationMinutes !== undefined) normalized.durationMinutes = rule.durationMinutes;
  if (rule.endsOn !== undefined) normalized.endsOn = rule.endsOn;
  return normalized;
}
