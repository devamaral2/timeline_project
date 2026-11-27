/**
 * Fixtures das funções de `packages/timeline` e de `hueForTag`/`tagColors`
 * (`packages/theme`): cada caso é a entrada e a saída das funções TS, e o teste
 * Kotlin confere o port contra elas. O fuso é sempre o da timeline
 * (America/Sao_Paulo), nunca o da máquina.
 */
import {
  dayKeyOf, dayKeyRange, dayNumber, formatTime, isSameMonth, longDate, mediumDate, monthGridOf, monthLabel,
  relativeDayLabel, shiftDayKey, shiftMonthKey, shortDate, taskDayKeysOf, weekOf, weekday, weekdayIndexOf,
  zonedDayEnd, zonedDayStart, zonedTimeAt,
} from "../../../packages/timeline/src/index";
import { briefDate } from "../../../apps/web/src/lib/dates/day-labels";
import {
  darkTheme, hueForTag, lightTheme, projectInitials, tagColors, type Theme,
} from "../../../packages/theme/src/index";

type Case = { args: unknown[]; result: unknown };

function cases<Args extends unknown[]>(fn: (...args: Args) => unknown, inputs: Args[]): Case[] {
  return inputs.map((args) => ({ args, result: fn(...args) }));
}

const DAYS = [
  "2026-09-14", "2026-09-13", "2026-09-19", "2026-02-28", "2024-02-29", "2026-12-31", "2027-01-01",
  "2026-05-31", "2025-03-31", "2018-11-04", "2018-02-17", "2019-10-01", "2026-01-01", "2023-07-04",
];

const INSTANTS = [
  "2026-09-14T02:59:59.999Z", "2026-09-14T03:00:00.000Z", "2026-09-14T03:05:00.000Z", "2026-09-14T12:00:00.000Z",
  "2026-09-14T15:30:00.000Z", "2026-09-15T02:59:59.999Z", "2026-12-31T23:59:59.000Z", "2027-01-01T02:00:00.000Z",
  "2026-01-01T03:00:00.000Z", "2018-11-04T02:30:00.000Z", "2018-11-04T03:00:00.000Z", "2018-11-04T04:00:00.000Z",
  "2018-02-18T01:00:00.000Z", "2018-02-18T02:00:00.000Z", "2024-02-29T14:45:00.000Z", "2026-09-14T22:00:00Z",
  "2026-09-14T23:30:00+00:00",
];

const TIMES = ["00:00", "07:00", "09:35", "23:59", "12:05"];

const TASK_DAY_RANGES: [string, string | null][] = [
  ["2026-09-14T12:00:00.000Z", "2026-09-14T13:00:00.000Z"],
  ["2026-09-14T12:00:00.000Z", null],
  ["2026-09-14T22:00:00.000Z", "2026-09-15T02:00:00.000Z"],
  ["2026-09-15T01:00:00.000Z", "2026-09-15T09:00:00.000Z"],
  ["2026-09-15T01:00:00.000Z", "2026-09-15T03:00:00.000Z"],
  ["2026-09-14T03:00:00.000Z", "2026-09-15T03:00:00.000Z"],
  ["2026-09-14T03:00:00.000Z", "2026-09-17T15:00:00.000Z"],
  ["2026-09-14T12:00:00.000Z", "2026-09-14T12:00:00.000Z"],
  ["2026-09-14T12:00:00.000Z", "2026-09-14T11:00:00.000Z"],
  ["2026-12-30T12:00:00.000Z", "2027-01-02T12:00:00.000Z"],
];

const TAG_NAMES = ["saúde", "casa", "trabalho", "a", "Treino", "reunião-semanal", "x".repeat(40), "日本語", "😀tag", "ção"];

/** Os nomes de projeto dos fixtures da marca: os exemplos da spec, nomes de uma letra, com acento, com dígito e com emoji. */
const PROJECT_NAMES = [
  "timeline_project", "agent-skills", "t3code", "diario", "a", "7", "ágil", "órbita_ação", "meu projeto", "api.gateway",
  "acme/web", "timelineProject", "--lead--", "日本語", "x1", "TP", "😀proj", "x".repeat(60),
];

/** `diario` é o único projeto com a marca neutra; o nome dele vem sempre com o booleano ligado. */
const projectOf = (name: string) => ({ name, personal: name === "diario" });

/**
 * A marca como o Android a desenha: as iniciais, o fundo e o texto, que é a cor do fundo da tela. O fundo de um projeto
 * comum é a cor das tags (`tagColors`, com o matiz do nome); o do `diario` é o neutro do texto apagado.
 */
function projectMark(project: { name: string; personal: boolean }, theme: Theme) {
  const mark = { initials: projectInitials(project.name), personal: project.personal, text: theme.colors.background };
  if (project.personal) return { ...mark, background: theme.colors.mutedForeground };
  return { ...mark, hue: hueForTag(project.name), background: tagColors(project.name, theme).color };
}

export function timelineFixtures(): Record<string, unknown> {
  const dayStart = (day: string) => zonedDayStart(day).toISOString();
  return {
    "timeline-cases": {
      timeZone: "America/Sao_Paulo",
      dayKeyOf: cases(dayKeyOf, INSTANTS.map((instant) => [instant] as [string])),
      zonedDayStart: cases(dayStart, DAYS.map((day) => [day] as [string])),
      zonedDayEnd: cases((day: string) => zonedDayEnd(day).toISOString(), DAYS.map((day) => [day] as [string])),
      zonedTimeAt: cases(
        (day: string, time: string) => zonedTimeAt(day, time).toISOString(),
        DAYS.flatMap((day) => TIMES.map((time) => [day, time] as [string, string])),
      ),
      shiftDayKey: cases(
        shiftDayKey,
        DAYS.flatMap((day) => [-40, -7, -1, 0, 1, 6, 7, 31, 400].map((days) => [day, days] as [string, number])),
      ),
      formatTime: cases(formatTime, INSTANTS.map((instant) => [instant] as [string])),
      briefDate: cases(briefDate, DAYS.map((day) => [day] as [string])),
      shortDate: cases(shortDate, DAYS.map((day) => [day] as [string])),
      longDate: cases(longDate, DAYS.map((day) => [day] as [string])),
      weekday: cases(weekday, DAYS.map((day) => [day] as [string])),
      dayNumber: cases(dayNumber, DAYS.map((day) => [day] as [string])),
      mediumDate: cases(mediumDate, DAYS.map((day) => [day] as [string])),
      relativeDayLabel: cases(
        relativeDayLabel,
        ["2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-10-14"].map(
          (day) => [day, "2026-09-14"] as [string, string],
        ),
      ),
      weekOf: cases(weekOf, DAYS.map((day) => [day] as [string])),
      weekdayIndexOf: cases(weekdayIndexOf, DAYS.map((day) => [day] as [string])),
      dayKeyRange: cases(dayKeyRange, [["2026-09-14", 3], ["2026-12-30", 5], ["2026-09-14", 0], ["2026-09-14", -2]]),
      monthGridOf: cases(monthGridOf, DAYS.map((day) => [day] as [string])),
      shiftMonthKey: cases(
        shiftMonthKey,
        DAYS.flatMap((day) => [-13, -1, 0, 1, 12].map((delta) => [day, delta] as [string, number])),
      ),
      monthLabel: cases(monthLabel, DAYS.map((day) => [day] as [string])),
      isSameMonth: cases(isSameMonth, [
        ["2026-09-01", "2026-09-30"], ["2026-09-30", "2026-10-01"], ["2025-09-14", "2026-09-14"],
      ]),
      taskDayKeysOf: cases(taskDayKeysOf, TASK_DAY_RANGES),
      toIsoMillis: cases((instant: string) => new Date(instant).toISOString(), INSTANTS.map((instant) => [instant] as [string])),
    },
    "project-marks": {
      projectInitials: cases(projectInitials, PROJECT_NAMES.map((name) => [name] as [string])),
      light: PROJECT_NAMES.map((name) => ({ name, ...projectMark(projectOf(name), lightTheme) })),
      dark: PROJECT_NAMES.map((name) => ({ name, ...projectMark(projectOf(name), darkTheme) })),
    },
    "tag-colors": {
      hueForTag: cases(hueForTag, TAG_NAMES.map((name) => [name] as [string])),
      light: TAG_NAMES.map((name) => ({ name, ...tagColors(name, lightTheme) })),
      dark: TAG_NAMES.map((name) => ({ name, ...tagColors(name, darkTheme) })),
    },
  };
}
