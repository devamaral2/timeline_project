export const TIMELINE_TIME_ZONE = "America/Sao_Paulo";

const MONTHS_SHORT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

const MONTHS_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const WEEKDAYS = [
  "Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira",
  "Quinta-feira", "Sexta-feira", "Sábado",
];

/**
 * Diferenca, em milissegundos, entre o horario local do fuso e o UTC no
 * instante informado. Positivo a leste de Greenwich.
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const valueOf = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    valueOf("year"),
    valueOf("month") - 1,
    valueOf("day"),
    valueOf("hour") % 24,
    valueOf("minute"),
    valueOf("second"),
  );
  return asUtc - instant.getTime();
}

/** Data civil (YYYY-MM-DD) do instante no fuso da timeline. */
export function dayKeyOf(instant: Date | string, timeZone = TIMELINE_TIME_ZONE): string {
  const date = typeof instant === "string" ? new Date(instant) : instant;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Instante da meia-noite daquele dia civil no fuso da timeline. */
export function zonedDayStart(dayKey: string, timeZone = TIMELINE_TIME_ZONE): Date {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  // Duas passadas resolvem os casos em que o offset muda na propria fronteira do dia.
  const firstGuess = new Date(naiveUtc - timeZoneOffsetMs(new Date(naiveUtc), timeZone));
  return new Date(naiveUtc - timeZoneOffsetMs(firstGuess, timeZone));
}

/** Ultimo instante representavel daquele dia civil no fuso da timeline. */
export function zonedDayEnd(dayKey: string, timeZone = TIMELINE_TIME_ZONE): Date {
  return new Date(zonedDayStart(shiftDayKey(dayKey, 1), timeZone).getTime() - 1);
}

/** Soma (ou subtrai) dias civis a uma chave YYYY-MM-DD. */
export function shiftDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split("-").map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Hora no formato HH:MM no fuso da timeline. */
export function formatTime(instant: string, timeZone = TIMELINE_TIME_ZONE): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instant));
}

function partsOf(dayKey: string): [number, number, number] {
  return dayKey.split("-").map(Number) as [number, number, number];
}

/** "19 AGO" */
export function shortDate(dayKey: string): string {
  const [, month, day] = partsOf(dayKey);
  return `${day} ${MONTHS_SHORT[month - 1]?.toUpperCase() ?? ""}`;
}

/** "19 de agosto de 2026" */
export function longDate(dayKey: string): string {
  const [year, month, day] = partsOf(dayKey);
  return `${day} de ${MONTHS_LONG[month - 1] ?? ""} de ${year}`;
}

/** "Quarta-feira" */
export function weekday(dayKey: string): string {
  const [year, month, day] = partsOf(dayKey);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

/** Inicial do dia da semana — D S T Q Q S S, a régua do seletor de data. */
export function weekdayInitial(dayKey: string): string {
  return weekday(dayKey).charAt(0).toUpperCase();
}

/** Dia do mes, sem zero a esquerda: "22". */
export function dayNumber(dayKey: string): string {
  const [, , day] = partsOf(dayKey);
  return String(day);
}

/** "22 de maio, quinta-feira" — a data por extenso do cabecalho. */
export function mediumDate(dayKey: string): string {
  const [, month, day] = partsOf(dayKey);
  return `${day} de ${MONTHS_LONG[month - 1] ?? ""}, ${weekday(dayKey).toLowerCase()}`;
}

/**
 * O titulo do cabecalho. Os tres dias em volta de hoje tem nome proprio; os
 * outros ficam com o dia da semana, que e o que orienta quem esta navegando.
 */
export function relativeDayLabel(dayKey: string, todayKey: string): string {
  if (dayKey === todayKey) return "Hoje";
  if (dayKey === shiftDayKey(todayKey, -1)) return "Ontem";
  if (dayKey === shiftDayKey(todayKey, 1)) return "Amanhã";
  return weekday(dayKey);
}
