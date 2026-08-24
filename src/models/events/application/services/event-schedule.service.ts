export const MAX_SCHEDULE_MINUTES = 7 * 24 * 60;

/** Como o agente descreve a janela do evento, sempre relativa -- nunca com datas absolutas. */
export interface ParsedEventSchedule {
  startTimeOfDay?: string;
  startOffsetMinutes?: number;
  durationMinutes?: number;
  endTimeOfDay?: string;
}

export interface ResolvedEventSchedule {
  startedAt: Date;
  finishedAt?: Date;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/**
 * O modelo nunca calcula datas: ele diz "faz 20 minutos", "por 6 horas" ou "ate as 06:00" e a
 * virada de dia e o fuso sao resolvidos aqui, com Date de verdade.
 */
export function resolveEventSchedule(
  schedule: ParsedEventSchedule,
  now: Date,
  timeZone: string,
): ResolvedEventSchedule {
  const startedAt = resolveStart(schedule, now, timeZone);
  const finishedAt = resolveFinish(schedule, startedAt, timeZone);

  // Uma janela invertida faria a entidade recusar o evento em toda leitura: melhor deixar aberto.
  if (finishedAt && finishedAt < startedAt) return { startedAt };
  return { startedAt, finishedAt };
}

function resolveStart(schedule: ParsedEventSchedule, now: Date, timeZone: string): Date {
  const startTimeOfDay = parseTimeOfDay(schedule.startTimeOfDay);
  if (startTimeOfDay) return occurrenceAtOrBefore(now, startTimeOfDay, timeZone);

  const offset = boundedMinutes(schedule.startOffsetMinutes);
  // Agendar para o futuro e outra feature: a timeline registra o que ja aconteceu.
  if (offset === undefined || offset >= 0) return now;
  return new Date(now.getTime() + offset * 60_000);
}

function resolveFinish(
  schedule: ParsedEventSchedule,
  startedAt: Date,
  timeZone: string,
): Date | undefined {
  const duration = boundedMinutes(schedule.durationMinutes);
  if (duration !== undefined && duration > 0) {
    return new Date(startedAt.getTime() + duration * 60_000);
  }

  const endTimeOfDay = parseTimeOfDay(schedule.endTimeOfDay);
  if (endTimeOfDay) return occurrenceAfter(startedAt, endTimeOfDay, timeZone);

  return undefined;
}

function parseTimeOfDay(value: string | undefined): { hour: number; minute: number } | null {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(value?.trim() ?? "");
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function boundedMinutes(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (Math.abs(value) > MAX_SCHEDULE_MINUTES) return undefined;
  return Math.round(value);
}

function occurrenceAtOrBefore(
  reference: Date,
  timeOfDay: { hour: number; minute: number },
  timeZone: string,
): Date {
  const sameDay = withTimeOfDay(reference, timeOfDay, timeZone, 0);
  if (sameDay <= reference) return sameDay;
  return withTimeOfDay(reference, timeOfDay, timeZone, -1);
}

function occurrenceAfter(
  reference: Date,
  timeOfDay: { hour: number; minute: number },
  timeZone: string,
): Date {
  const sameDay = withTimeOfDay(reference, timeOfDay, timeZone, 0);
  if (sameDay > reference) return sameDay;
  return withTimeOfDay(reference, timeOfDay, timeZone, 1);
}

function withTimeOfDay(
  reference: Date,
  timeOfDay: { hour: number; minute: number },
  timeZone: string,
  dayOffset: number,
): Date {
  const wallClock = toWallClock(reference, timeZone);
  const shifted = new Date(
    Date.UTC(wallClock.year, wallClock.month - 1, wallClock.day + dayOffset),
  );

  return toInstant(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: timeOfDay.hour,
      minute: timeOfDay.minute,
    },
    timeZone,
  );
}

function toWallClock(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function toInstant(wallClock: WallClock, timeZone: string): Date {
  const asIfUtc = Date.UTC(
    wallClock.year,
    wallClock.month - 1,
    wallClock.day,
    wallClock.hour,
    wallClock.minute,
  );
  // Duas passadas: a primeira estima o deslocamento, a segunda o corrige em bordas de fuso.
  const firstGuess = new Date(asIfUtc - offsetMs(new Date(asIfUtc), timeZone));
  return new Date(asIfUtc - offsetMs(firstGuess, timeZone));
}

function offsetMs(instant: Date, timeZone: string): number {
  const wallClock = toWallClock(instant, timeZone);
  const asIfUtc = Date.UTC(
    wallClock.year,
    wallClock.month - 1,
    wallClock.day,
    wallClock.hour,
    wallClock.minute,
    instant.getUTCSeconds(),
    instant.getUTCMilliseconds(),
  );
  return asIfUtc - instant.getTime();
}
