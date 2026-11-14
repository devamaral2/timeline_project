import type { EventCardDto, EventRecurrenceDto } from "@repo/contracts";
import { dayKeyOf, formatTime, relativeDayLabel, shiftDayKey, shortDate, zonedDayStart } from "@repo/timeline";

/**
 * Os textos que a linha das listas (agenda e lista de tarefas) calcula a partir
 * do cartao de evento e do instante atual. Sao funcoes puras: quem chama passa
 * o `now`, e os testes fixam o relogio sem depender do fuso da maquina.
 *
 * Todo dia civil sai no fuso da timeline (`dayKeyOf`). "Dia sem hora" e a
 * meia-noite local de `startedAt`.
 */

type RecurrenceRule = EventRecurrenceDto["rule"];

const MINUTE_MS = 60_000;

/** Status de pessoa que ainda pede acao: a fazer, em curso, em espera e sem data. */
const OPEN_HUMAN_STATUSES = ["todo", "doing", "inHold", "toDefine"] as const;

const WEEKDAY_NAMES = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export interface WhenOptions {
  /** A lista pede a regra da serie no lugar do horario, quando a ocorrencia tem uma. */
  ruleInPlaceOfTime?: boolean;
}

/**
 * O quando da linha: "Hoje, 09:00", "Hoje", "Era ontem", "Sem data", "Prazo 30 nov",
 * "na fila · há 3 min", "há 12 min", "aguarda sua resposta" ou a regra da serie.
 */
export function cardWhenLabel(card: EventCardDto, now: Date, options: WhenOptions = {}): string {
  if (options.ruleInPlaceOfTime && card.recurrence && !card.recurrence.detached) {
    return recurrenceRuleLabel(card.recurrence.rule);
  }
  if (card.actor === "agent") return agentWhenLabel(card, now);
  if (card.longRunning) {
    return card.estimatedFinishAt ? `Prazo ${dayMonthLabel(dayKeyOf(card.estimatedFinishAt))}` : "Sem data";
  }
  if (!card.startedAt) return "Sem data";
  return dayWhenLabel(card.startedAt, card.status, now);
}

/**
 * Atrasado: a fazer com o dia ja passado, ou evento longo, ainda aberto, com o
 * prazo (o dia de `estimatedFinishAt`) ja passado. Evento de agente nao atrasa.
 */
export function cardIsOverdue(card: EventCardDto, now: Date): boolean {
  if (card.actor === "agent") return false;
  const todayKey = dayKeyOf(now);
  if (card.longRunning) {
    return (
      card.estimatedFinishAt !== undefined &&
      card.status !== undefined &&
      (OPEN_HUMAN_STATUSES as readonly string[]).includes(card.status) &&
      dayKeyOf(card.estimatedFinishAt) < todayKey
    );
  }
  return card.status === "todo" && card.startedAt !== undefined && dayKeyOf(card.startedAt) < todayKey;
}

/**
 * A duracao: fim planejado menos inicio, "50 min", "1h30", "2h". Sem os dois
 * instantes, ou no evento longo e no dia sem hora, nao ha duracao.
 */
export function cardDurationLabel(card: EventCardDto): string | null {
  if (card.longRunning || !card.startedAt || !card.estimatedFinishAt) return null;
  if (isDayStart(card.startedAt)) return null;
  const minutes = Math.round((new Date(card.estimatedFinishAt).getTime() - new Date(card.startedAt).getTime()) / MINUTE_MS);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

/** "Espera por 1 evento" ou "Espera por 2 eventos", pela contagem de bloqueadores de um evento em espera. */
export function cardBlockedLabel(card: EventCardDto): string | null {
  if (card.status !== "inHold") return null;
  const count = card.blockedByEventIds.length;
  if (count === 0) return null;
  return `Espera por ${count} ${count === 1 ? "evento" : "eventos"}`;
}

/** A regra da serie em texto: "Todo dia, 18:00", "Seg, qua e sex, 18:30". */
export function recurrenceRuleLabel(rule: RecurrenceRule): string {
  return capitalize(`${ruleDaysLabel(rule)}, ${rule.timeOfDay}`);
}

function ruleDaysLabel(rule: RecurrenceRule): string {
  const every = rule.interval;
  switch (rule.frequency) {
    case "daily":
      return every === 1 ? "todo dia" : `a cada ${every} dias`;
    case "weekly": {
      const days = weekdayList(rule.byWeekday ?? 0);
      return every === 1 ? days : `a cada ${every} semanas, ${days}`;
    }
    case "monthly":
      return every === 1
        ? `todo dia ${rule.byMonthDay ?? ""}`
        : `a cada ${every} meses, dia ${rule.byMonthDay ?? ""}`;
    case "yearly":
      return `todo ano, ${rule.byMonthDay ?? ""}/${rule.byMonth ?? ""}`;
  }
}

/** Os dias do bitmask (bit 0 = domingo): "seg, qua e sex". */
function weekdayList(mask: number): string {
  const names = WEEKDAY_NAMES.filter((_, index) => (mask & (1 << index)) !== 0);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

function agentWhenLabel(card: EventCardDto, now: Date): string {
  if (card.status === "waiting") return "aguarda sua resposta";
  if (card.status === "queued") {
    return card.startedAt ? `na fila · ${elapsedLabel(card.startedAt, now)}` : "na fila";
  }
  if (!card.startedAt) return "Sem data";
  return elapsedLabel(card.startedAt, now);
}

function dayWhenLabel(startedAt: string, status: EventCardDto["status"], now: Date): string {
  const dayKey = dayKeyOf(startedAt);
  const todayKey = dayKeyOf(now);
  if (status === "todo" && dayKey < todayKey) {
    return dayKey === shiftDayKey(todayKey, -1) ? "Era ontem" : `Era ${dayMonthLabel(dayKey)}`;
  }
  const isNearToday = [shiftDayKey(todayKey, -1), todayKey, shiftDayKey(todayKey, 1)].includes(dayKey);
  const day = isNearToday ? relativeDayLabel(dayKey, todayKey) : dayMonthLabel(dayKey);
  return isDayStart(startedAt) ? day : `${day}, ${formatTime(startedAt)}`;
}

/** "há 12 min", "há 2 h", "há 3 dias"; menos de um minuto, "agora". */
function elapsedLabel(instant: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(instant).getTime()) / MINUTE_MS));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

/** "30 nov": o formatador de data curta da timeline, em minusculas. */
function dayMonthLabel(dayKey: string): string {
  return shortDate(dayKey).toLowerCase();
}

function isDayStart(instant: string): boolean {
  return new Date(instant).getTime() === zonedDayStart(dayKeyOf(instant)).getTime();
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
}
