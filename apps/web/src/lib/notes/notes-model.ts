import { TIMELINE_TIME_ZONE, dayKeyOf, formatTime } from "@repo/timeline";
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

/** "Criada hoje, 08:05" ou "Criada em 12 set. · editada ontem, 21:12". */
export function noteDatesLine(note: Pick<NoteDto, "createdAt" | "updatedAt" | "revision">, now: Date): string {
  const relative = (instant: string) => {
    const age = daysBetween(dayKeyOf(instant), dayKeyOf(now));
    return age === 0 || age === 1 ? whenLabel(instant, now) : `em ${shortDay(instant, now)}`;
  };
  const created = `Criada ${relative(note.createdAt)}`;
  const edited = note.revision > 1 && note.updatedAt !== note.createdAt;
  return edited ? `${created} · editada ${relative(note.updatedAt)}` : created;
}

/** O rotulo da origem: "Evento · Almoço", "Tarefa · Revisar proposta" (com "+N" se ha mais) ou "Nota solta". */
export function noteOriginLabel(note: Pick<NoteDto, "links">): string {
  const link = primaryLinkOf(note);
  if (!link) return "Nota solta";
  const more = (note.links?.length ?? 1) - 1;
  return `${link.kind === "event" ? "Evento" : "Tarefa"} · ${link.name}${more > 0 ? ` +${more}` : ""}`;
}

const LIST_MARKER = /^\s*(?:[-*•])\s+/;
const HEADING_MARKER = /^\s*#{1,6}\s+/;

/** O trecho da lista: o texto sem o titulo repetido, sem marcadores e em uma linha so. */
export function noteSnippet(note: Pick<NoteDto, "name" | "type" | "data">): string {
  const lines = noteTextOf(note).split(/\r?\n/).map((line) => line.trim());
  const firstIndex = lines.findIndex(Boolean);
  const first = lines[firstIndex]?.replace(HEADING_MARKER, "");
  const body = first === note.name ? lines.slice(firstIndex + 1) : lines;
  return body
    .map((line) => line.replace(HEADING_MARKER, "").replace(LIST_MARKER, ""))
    .filter(Boolean)
    .join(" ");
}

export type NoteBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "list"; items: string[] };

/**
 * O texto da nota em blocos: `#` vira subtitulo, linhas com `-`, `*` ou `•`
 * viram lista e o resto vira paragrafo (linha em branco separa paragrafos).
 * O titulo repetido na primeira linha fica de fora, ja que a tela o mostra.
 */
export function parseNoteContent(note: Pick<NoteDto, "name" | "type" | "data">): NoteBlock[] {
  const lines = noteTextOf(note).split(/\r?\n/);
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex >= 0 && lines[firstIndex]?.trim().replace(HEADING_MARKER, "") === note.name) {
    lines.splice(0, firstIndex + 1);
  }

  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
    } else if (HEADING_MARKER.test(line)) {
      flushParagraph();
      blocks.push({ type: "heading", text: line.replace(HEADING_MARKER, "") });
    } else if (LIST_MARKER.test(line)) {
      flushParagraph();
      const item = line.replace(LIST_MARKER, "");
      const last = blocks[blocks.length - 1];
      if (last?.type === "list") last.items.push(item);
      else blocks.push({ type: "list", items: [item] });
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}
