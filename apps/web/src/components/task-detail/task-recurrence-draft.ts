import type { CreateRecurrenceInput, RecurrenceDto, RecurrenceRule } from "@repo/contracts";
import { shiftDayKey } from "@repo/timeline";
import type { EditRecurrenceInput } from "@/lib/api/recurrences";
import { type TaskDraft, instantFromDraft } from "./task-draft";

/**
 * A regra da série como texto do formulário. Fica fora do `TaskDraft`: a série
 * é outra chamada, com revisão própria. `weekdays` é o bitmask da API (bit 0 =
 * domingo). Funções puras: a seção e o hook só leem e escrevem aqui.
 */
export type RecurrenceFrequency = RecurrenceRule["frequency"];

export interface RecurrenceDraft {
  frequency: RecurrenceFrequency;
  interval: number;
  /** Dias da semana, em bitmask (bit 0 = domingo). Só vale na frequência semanal. */
  weekdays: number;
  /** Dia do mês. Vale na mensal e na anual. */
  monthDay: number;
  /** Mês, de 1 a 12. Só vale na anual. */
  month: number;
  /** `YYYY-MM-DD`, ou vazio: sem fim. */
  endsOn: string;
}

export type RecurrenceErrors = Partial<Record<"startDate" | "startTime" | "interval" | "weekdays" | "monthDay" | "endsOn", string>>;

/** Os campos do formulário que a série usa: o início e o fim planejado. */
export type RecurrenceSchedule = Pick<TaskDraft, "startDate" | "startTime" | "endDate" | "endTime">;

/** A parte da regra que a seção edita. Hora, duração, fuso e início não entram: vêm do formulário ou da série. */
type EditableRule = Pick<RecurrenceRule, "frequency" | "interval"> & Partial<Pick<RecurrenceRule, "byWeekday" | "byMonthDay" | "byMonth" | "endsOn">>;

export const START_DATE_MESSAGE = "Informe a data de início: a série começa nela.";
export const START_TIME_MESSAGE = "Informe a hora: a série se repete nesse horário.";
const INTERVAL_MESSAGE = "Repita a cada 1 ou mais.";
const WEEKDAY_MESSAGE = "Escolha pelo menos um dia da semana.";
const MONTH_DAY_MESSAGE = "Escolha um dia entre 1 e 31.";
const MONTH_DAY_MISSING_MESSAGE = "Esse dia não existe nesse mês.";
const END_BEFORE_START_MESSAGE = "O fim não pode ser antes do início.";
const END_CANNOT_CLEAR_MESSAGE = "Uma série não perde o fim depois de criada: a data só muda.";

/** Dias de cada mês; fevereiro com 29, porque a série pode cair num ano bissexto. */
const MAX_DAY_OF_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** O dia da semana e do mês de uma data `YYYY-MM-DD`, lidos sem fuso. */
function partsOf(dayKey: string): { weekday: number; day: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return { weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(), day, month };
}

/** Rascunho novo, ao tocar em "Repetir": a semana e o dia começam no dia de início do formulário. */
export function emptyRecurrenceDraft(startDate: string): RecurrenceDraft {
  const parts = partsOf(startDate);
  return {
    frequency: "weekly",
    interval: 1,
    weekdays: parts ? 1 << parts.weekday : 0,
    monthDay: parts?.day ?? 1,
    month: parts?.month ?? 1,
    endsOn: "",
  };
}

/** O rascunho de uma série lida: o que a seção mostra e o que a comparação do Salvar usa de base. */
export function recurrenceDraftFromRule(rule: RecurrenceRule): RecurrenceDraft {
  return {
    frequency: rule.frequency,
    interval: rule.interval,
    weekdays: rule.byWeekday ?? 0,
    monthDay: rule.byMonthDay ?? 1,
    month: rule.byMonth ?? 1,
    endsOn: rule.endsOn ?? "",
  };
}

/** Só as chaves que a frequência usa, como a API as espera. */
function editableRuleOf(draft: RecurrenceDraft): EditableRule {
  const weekly = draft.frequency === "weekly";
  const monthDay = draft.frequency === "monthly" || draft.frequency === "yearly";
  const yearly = draft.frequency === "yearly";
  return {
    frequency: draft.frequency,
    interval: draft.interval,
    ...(weekly ? { byWeekday: draft.weekdays } : {}),
    ...(monthDay ? { byMonthDay: draft.monthDay } : {}),
    ...(yearly ? { byMonth: draft.month } : {}),
    ...(draft.endsOn ? { endsOn: draft.endsOn } : {}),
  };
}

/** Recusas da própria tela sobre a regra, que valem na criação e na edição. */
export function validateRecurrenceDraft(draft: RecurrenceDraft, startsOn: string | undefined): RecurrenceErrors {
  const errors: RecurrenceErrors = {};
  if (!Number.isInteger(draft.interval) || draft.interval < 1) errors.interval = INTERVAL_MESSAGE;
  if (draft.frequency === "weekly" && (draft.weekdays < 1 || draft.weekdays > 127)) errors.weekdays = WEEKDAY_MESSAGE;
  if (draft.frequency === "monthly" || draft.frequency === "yearly") {
    if (!Number.isInteger(draft.monthDay) || draft.monthDay < 1 || draft.monthDay > 31) {
      errors.monthDay = MONTH_DAY_MESSAGE;
    } else if (draft.frequency === "yearly" && draft.monthDay > (MAX_DAY_OF_MONTH[draft.month - 1] ?? 0)) {
      errors.monthDay = MONTH_DAY_MISSING_MESSAGE;
    }
  }
  if (draft.endsOn && startsOn && draft.endsOn < startsOn) errors.endsOn = END_BEFORE_START_MESSAGE;
  return errors;
}

/** Criação: a regra precisa de início e de hora, que vêm do formulário. */
export function validateNewRecurrence(draft: RecurrenceDraft, schedule: RecurrenceSchedule): RecurrenceErrors {
  const errors = validateRecurrenceDraft(draft, schedule.startDate);
  if (!schedule.startDate) errors.startDate = START_DATE_MESSAGE;
  if (!schedule.startTime) errors.startTime = START_TIME_MESSAGE;
  return errors;
}

/** Edição da série: a regra já tem início, e não dá para tirar o fim que ela tem. */
export function validateSeriesEdit(series: RecurrenceDto, draft: RecurrenceDraft): RecurrenceErrors {
  const errors = validateRecurrenceDraft(draft, series.startsOn);
  if (!draft.endsOn && series.endsOn) errors.endsOn = END_CANNOT_CLEAR_MESSAGE;
  return errors;
}

/**
 * O início da série quando ela nasce de uma tarefa que já existe: a tarefa fica como está e é a primeira data, então a
 * série começa no dia seguinte (senão o dia dele ganharia uma segunda ocorrência). Sem data, nada muda: a validação
 * pede a data.
 */
export function scheduleAfterTask<T extends RecurrenceSchedule>(form: T): T {
  if (!form.startDate) return form;
  // O fim anda junto com o início: a duração da série é a da tarefa, e não pode sair negativa.
  return { ...form, startDate: shiftDayKey(form.startDate, 1), ...(form.endDate ? { endDate: shiftDayKey(form.endDate, 1) } : {}) };
}

/** A duração do bloco do formulário, em minutos; sem fim, ou sem ser depois do início, não há duração. */
function durationOf(schedule: RecurrenceSchedule): number | undefined {
  const start = instantFromDraft(schedule.startDate, schedule.startTime);
  const end = instantFromDraft(schedule.endDate, schedule.endTime);
  if (!start || !end) return undefined;
  const minutes = Math.round((Date.parse(end) - Date.parse(start)) / 60_000);
  return minutes > 0 ? minutes : undefined;
}

/**
 * A regra completa da criação: hora e início do formulário, duração do início ao
 * fim planejado, e o fuso do navegador. A série nasce com ela.
 */
export function buildRecurrenceRule(draft: RecurrenceDraft, schedule: RecurrenceSchedule, timeZone: string): RecurrenceRule {
  const duration = durationOf(schedule);
  return {
    ...editableRuleOf(draft),
    timeOfDay: schedule.startTime,
    ...(duration !== undefined ? { durationMinutes: duration } : {}),
    timeZone,
    startsOn: schedule.startDate,
  };
}

/** O que cada ocorrência copia: os campos da tarefa que a série leva. Sem datas: elas vêm da regra. */
function templateOf(form: TaskDraft): CreateRecurrenceInput["template"] {
  return {
    kind: form.kind,
    name: form.name.trim(),
    description: form.description,
    priority: form.priority,
    ...(form.tags.length ? { tags: form.tags } : {}),
    ...(form.reminders.length ? { notifyOffsetsMinutes: form.reminders } : {}),
  };
}

/** O corpo de `POST /api/recurrences`: a regra e o modelo, a partir do formulário. */
export function buildCreateRecurrenceInput(draft: RecurrenceDraft, form: TaskDraft, timeZone: string): CreateRecurrenceInput {
  return { ...buildRecurrenceRule(draft, form, timeZone), template: templateOf(form) };
}

/**
 * O `PATCH` da série com só a regra que mudou em relação à série lida, com a
 * revisão dela. `null` quando nada mudou. Uma troca que a API recusa (semanal
 * para mensal, por exemplo) sai assim mesmo: a recusa volta como mensagem.
 */
export function planSeriesEdit(series: RecurrenceDto, draft: RecurrenceDraft): EditRecurrenceInput | null {
  const current: Record<string, unknown> = { ...series };
  const target: Record<string, unknown> = { ...editableRuleOf(draft) };
  const patch: Record<string, unknown> = { expectedRevision: series.revision };
  let changed = false;
  for (const [key, value] of Object.entries(target)) {
    if (value !== current[key]) {
      patch[key] = value;
      changed = true;
    }
  }
  return changed ? (patch as EditRecurrenceInput) : null;
}

/** O fuso do navegador: a série guarda o que ele diz. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
