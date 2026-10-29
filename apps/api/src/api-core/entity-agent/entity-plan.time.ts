import type { WorkoutCode } from "../../domain";

export const ENTITY_PLAN_TIME_ZONE = "America/Sao_Paulo";

export const WORKOUT_NAMES: Record<WorkoutCode, string> = {
  walking: "Caminhada",
  running: "Corrida",
  treadmill: "Esteira",
  weightlifting: "Musculação",
  free: "Livre",
};

export const CARDIO_WORKOUT_CODES: readonly WorkoutCode[] = [
  "walking",
  "running",
  "treadmill",
];

interface LocalParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
  millisecond: string;
  offsetMinutes: number;
}

function pad(value: number, size = 2): string {
  return String(value).padStart(size, "0");
}

function localParts(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
    hourCycle: "h23",
  }).formatToParts(instant);

  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "0";

  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = value("hour");
  const minute = value("minute");
  const second = value("second");
  const millisecond = value("fractionalSecond");

  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    Number(millisecond),
  );

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    millisecond,
    // Arredonda para o minuto: offsets historicos com segundos nao existem no
    // fuso da timeline, e o formato ISO-8601 so aceita hh:mm.
    offsetMinutes: Math.round((localAsUtc - instant.getTime()) / 60_000),
  };
}

/** ISO-8601 no fuso do plano, com o offset explicito (ex.: `-03:00`). */
export function formatInstant(instant: Date, timeZone = ENTITY_PLAN_TIME_ZONE): string {
  const parts = localParts(instant, timeZone);
  const sign = parts.offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(parts.offsetMinutes);
  return [
    `${parts.year}-${parts.month}-${parts.day}`,
    "T",
    `${parts.hour}:${parts.minute}:${parts.second}.${parts.millisecond}`,
    `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`,
  ].join("");
}

/** Dia civil local, a mesma regra da coluna gerada `events.started_on`. */
export function dayKeyOf(instant: Date, timeZone = ENTITY_PLAN_TIME_ZONE): string {
  const parts = localParts(instant, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Hora local em minutos desde a meia-noite. */
export function minutesOfDay(instant: Date, timeZone = ENTITY_PLAN_TIME_ZONE): number {
  const parts = localParts(instant, timeZone);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/**
 * O nome da refeicao pela hora local, igual ao `getMealEventName` da API.
 * Mantido aqui para o plano nao depender do runtime da aplicacao.
 */
export function mealNameAt(instant: Date, timeZone = ENTITY_PLAN_TIME_ZONE): string {
  const minutes = minutesOfDay(instant, timeZone);
  if (minutes <= 180 || minutes >= 1081) return "Jantar";
  if (minutes <= 390) return "Desjejum";
  if (minutes <= 600) return "Café da manhã";
  if (minutes <= 690) return "Colação";
  if (minutes <= 959) return "Almoço";
  return "Lanche da tarde";
}

export function addMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * 60_000);
}

export function parseInstant(value: string, field: string): Date {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`${field} não é uma data ISO-8601 válida: ${value}`);
  }
  return instant;
}

/** Comparacao de texto para achar a mesma atividade sem depender de acento/caixa. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Duas casas decimais, sem `-0`. */
export function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}
