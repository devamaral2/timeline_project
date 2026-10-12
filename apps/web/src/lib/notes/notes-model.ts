import { TIMELINE_TIME_ZONE, dayKeyOf, formatTime } from "@repo/timeline";
import { dateLineOf, minutesBetween } from "@/lib/events/event-detail-format";
import type { MealItem, NoteDto, NoteLinkDto, SleepItem, TextNote, TrainingData } from "@/lib/api/contracts";

/**
 * O que a tela de Notas decide a partir dos dados: o filtro, o agrupamento por
 * dia, os rotulos de data e o texto da nota em blocos. Fica fora dos
 * componentes para que o mobile possa copiar a regra, linha a linha.
 */

export type NoteKind = "event" | "task" | "loose";
export type NoteFilter = "all" | NoteKind;

export const noteFilters: ReadonlyArray<{ key: NoteFilter; label: string }> = [
  { key: "all", label: "Todas" },
  { key: "event", label: "Eventos" },
  { key: "task", label: "Tarefas" },
  { key: "loose", label: "Soltas" },
];

/** Onde a nota aparece primeiro: a API manda os eventos antes das tarefas. */
export function primaryLinkOf(note: Pick<NoteDto, "links">): NoteLinkDto | undefined {
  return note.links?.[0];
}

export function noteKindOf(note: NoteDto): NoteKind {
  return primaryLinkOf(note)?.kind ?? "loose";
}

/**
 * O texto da nota para listar, buscar e ler: o corpo de uma nota de texto e um
 * resumo de uma nota estruturada (refeicao, sono ou treino).
 */
export function noteTextOf(note: Pick<NoteDto, "type" | "data">): string {
  // `type` e `data` chegam separados (um `Pick` desfaz a uniao discriminada): o par e conferido pela API.
  switch (note.type) {
    case "text":
      return (note.data as TextNote).body;
    case "meal": {
      const meal = note.data as MealItem;
      return [meal.description, ...meal.foodItems.map((food) => `${food.name} (${food.portion})`)]
        .filter(Boolean)
        .join("\n");
    }
    case "sleep": {
      const sleep = note.data as SleepItem;
      return `${sleep.trackedSleepTime} min monitorados · pontuação ${sleep.score}`;
    }
    case "training":
      return (note.data as TrainingData).workouts
        .map((workout) => `${workout.workoutName} · ${workout.duration} min`)
        .join("\n");
    default:
      return "";
  }
}

function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
}

export function filterNotes(notes: readonly NoteDto[], filter: NoteFilter, query = ""): NoteDto[] {
  const needle = normalize(query.trim());
  return notes.filter((note) => {
    if (filter !== "all" && noteKindOf(note) !== filter) return false;
    if (!needle) return true;
    const haystack = [note.name, noteTextOf(note), ...(note.links ?? []).map((link) => link.name), ...note.tags.map((tag) => `#${tag}`)];
    return haystack.some((text) => normalize(text).includes(needle));
  });
}

export interface NoteGroup {
  key: string;
  label: string;
  notes: NoteDto[];
}

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toKey.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function monthLabel(dayKey: string): string {
  const [year, month] = dayKey.split("-").map(Number) as [number, number];
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** Em que bloco do tempo a nota cai, pelo dia da ultima edicao. */
function groupOf(updatedAt: string, now: Date): { key: string; label: string } {
  const dayKey = dayKeyOf(updatedAt);
  const age = daysBetween(dayKey, dayKeyOf(now));
  if (age <= 0) return { key: "today", label: "Hoje" };
  if (age === 1) return { key: "yesterday", label: "Ontem" };
  if (age < 7) return { key: "week", label: "Esta semana" };
  if (dayKey.slice(0, 7) === dayKeyOf(now).slice(0, 7)) return { key: "month", label: "Este mês" };
  return { key: dayKey.slice(0, 7), label: monthLabel(dayKey) };
}

/** Do mais recente para o mais antigo, um grupo por bloco do tempo. */
export function groupNotes(notes: readonly NoteDto[], now: Date): NoteGroup[] {
  const sorted = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const groups: NoteGroup[] = [];
  for (const note of sorted) {
    const { key, label } = groupOf(note.updatedAt, now);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.notes.push(note);
    else groups.push({ key, label, notes: [note] });
  }
  return groups;
}

function partsOf(instant: string, timeZone = TIMELINE_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(new Date(instant));
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { weekday: pick("weekday"), day: pick("day"), month: pick("month"), year: pick("year") };
}

/** "11 set." — e o ano, quando ele nao e o corrente. */
function shortDay(instant: string, now: Date): string {
  const { day, month, year } = partsOf(instant);
  const sameYear = dayKeyOf(instant).slice(0, 4) === dayKeyOf(now).slice(0, 4);
  return `${day} ${month}${sameYear ? "" : ` ${year}`}`;
}

/** A hora na lista: `09:40` hoje e ontem, `sex., 11 set.` depois. */
export function noteStamp(updatedAt: string, now: Date): string {
  const age = daysBetween(dayKeyOf(updatedAt), dayKeyOf(now));
  if (age === 0 || age === 1) return formatTime(updatedAt);
  return `${partsOf(updatedAt).weekday}, ${shortDay(updatedAt, now)}`;
}

/** "hoje, 09:00", "ontem, 21:12", "amanhã, 08:00" ou "11 set., 09:00". */
export function whenLabel(instant: string, now: Date): string {
  const age = daysBetween(dayKeyOf(instant), dayKeyOf(now));
  const time = formatTime(instant);
  if (age === 0) return `hoje, ${time}`;
  if (age === 1) return `ontem, ${time}`;
  if (age === -1) return `amanhã, ${time}`;
  return `${shortDay(instant, now)}, ${time}`;
}

/** Quando a nota nasceu e, se houve edição, quando mudou: "hoje, 08:05", "ontem, 21:12" ou "em 12 set.". */
export function noteDates(
  note: Pick<NoteDto, "createdAt" | "updatedAt" | "revision">,
  now: Date,
): { created: string; edited: string | null } {
  const relative = (instant: string) => {
    const age = daysBetween(dayKeyOf(instant), dayKeyOf(now));
    return age === 0 || age === 1 ? whenLabel(instant, now) : `em ${shortDay(instant, now)}`;
  };
  const edited = note.revision > 1 && note.updatedAt !== note.createdAt;
  return { created: relative(note.createdAt), edited: edited ? relative(note.updatedAt) : null };
}

/**
 * Uma nota de sono vive na noite do evento a que pertence: o titulo e o dia (ou
 * os dois dias) dele e, se o evento terminou, quanto durou na agenda. Sem
 * evento, a nota e so a nota.
 */
export function sleepAgendaOf(note: Pick<NoteDto, "type" | "links">): { title: string; agendaMinutes: number | null } | null {
  if (note.type !== "sleep") return null;
  const event = note.links?.find((link) => link.kind === "event" && link.at);
  if (!event?.at) return null;
  return {
    title: dateLineOf(event.at, event.endsAt),
    agendaMinutes: event.endsAt ? minutesBetween(event.at, event.endsAt) : null,
  };
}

/** O rotulo da origem: "Evento · Almoço", "Tarefa · Revisar proposta" (com "+N" se ha mais) ou "Nota solta". */
export function noteOriginLabel(note: Pick<NoteDto, "links">): string {
  const link = primaryLinkOf(note);
  if (!link) return "Nota solta";
  const more = (note.links?.length ?? 1) - 1;
  return `${link.kind === "event" ? "Evento" : "Tarefa"} · ${link.name}${more > 0 ? ` +${more}` : ""}`;
}

const HEADING_MARKER = /^\s*#{1,6}\s+/;
const BLOCK_MARKER = /^\s*(?:>\s?|[-*+•]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/;
const FENCE = /^\s*(?:```|~~~)/;
const RULE = /^\s*(?:[-*_]\s*){3,}$/;

/** O texto de uma linha sem a marcação inline do markdown (negrito, itálico, código, links). */
export function stripInlineMarkdown(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?=[^\w*]|$)/g, "$1$2")
    .replace(/(^|[^\w])_(?!\s)(.+?)_(?=[^\w]|$)/g, "$1$2");
}

/**
 * O corpo em markdown de uma nota de texto, sem o titulo repetido na primeira
 * linha (a tela ja o mostra). Notas estruturadas nao tem markdown: vazio.
 */
export function noteMarkdownOf(note: Pick<NoteDto, "name" | "type" | "data">): string {
  if (note.type !== "text") return "";
  const lines = noteTextOf(note).split(/\r?\n/);
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex >= 0 && lines[firstIndex]?.trim().replace(HEADING_MARKER, "") === note.name) {
    lines.splice(0, firstIndex + 1);
  }
  return lines.join("\n").trim();
}

/** O trecho da lista: o texto sem o titulo repetido, sem marcacao do markdown e em uma linha so. */
export function noteSnippet(note: Pick<NoteDto, "name" | "type" | "data">): string {
  const lines = noteTextOf(note).split(/\r?\n/).map((line) => line.trim());
  const firstIndex = lines.findIndex(Boolean);
  const first = lines[firstIndex]?.replace(HEADING_MARKER, "");
  const body = first === note.name ? lines.slice(firstIndex + 1) : lines;
  return body
    .filter((line) => !FENCE.test(line) && !RULE.test(line))
    .map((line) => stripInlineMarkdown(line.replace(HEADING_MARKER, "").replace(BLOCK_MARKER, "")))
    .filter(Boolean)
    .join(" ");
}

/** Uma nota aparece em cada uma de suas tags; notas sem tags têm um grupo próprio. */
export function groupNotesByTag(notes: readonly NoteDto[]): NoteGroup[] {
  const groups = new Map<string, NoteGroup>();
  for (const note of [...notes].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
    for (const tag of new Set(note.tags.length ? note.tags : [""])) {
      const group = groups.get(tag) ?? { key: tag, label: tag ? `#${tag}` : "Sem tag", notes: [] };
      group.notes.push(note);
      groups.set(tag, group);
    }
  }
  return [...groups.values()].sort((a, b) => !a.key ? 1 : !b.key ? -1 : a.key.localeCompare(b.key, "pt-BR"));
}
