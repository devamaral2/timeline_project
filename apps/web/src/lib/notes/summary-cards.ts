/**
 * As fichas de um resumo (`docs/summary-cards.md`): o que a tela de notícias, de resumo de e-mail e de
 * transcrição desenha no lugar do texto corrido. O dado continua sendo o markdown da nota; aqui ele é só
 * lido. Um texto sem título nenhum não vira ficha (`null`) e a tela mostra o markdown como sempre.
 *
 * Fica fora dos componentes para o Android copiar a regra, linha a linha
 * (`domain/markdown/SummaryCards.kt`); os dois são conferidos pela mesma fixture.
 */
import { youtubeVideoOf } from "./youtube";

export const SUMMARY_CARDS_TYPES = ["news", "email_summary", "youtube_transcript"] as const;
export type SummaryCardsType = (typeof SUMMARY_CARDS_TYPES)[number];

export function isSummaryCardsType(type: string): type is SummaryCardsType {
  return (SUMMARY_CARDS_TYPES as readonly string[]).includes(type);
}

export interface SummaryLink {
  label: string;
  /** `null` quando a fonte veio só com o nome, ou com um endereço que não é `http(s)`. */
  href: string | null;
}

export type SummaryDueTone = "late" | "soon" | "calm";

export interface SummaryCard {
  title: string;
  /** A editoria da notícia: o título do grupo em que ela está. */
  kicker: string | null;
  /** A linha `De: nome · detalhe`. */
  from: { name: string; detail: string | null; initials: string } | null;
  /** A linha `Prazo: texto`. */
  due: { text: string; tone: SummaryDueTone } | null;
  /** As linhas `Fonte:` e `Fontes:`. */
  sources: SummaryLink[];
  /** Os parágrafos feitos só de links: os botões do pé da ficha. */
  actions: { label: string; href: string }[];
  /** O resto, em markdown. */
  body: string;
}

export interface SummaryRow {
  title: string | null;
  text: string;
  /** A minutagem como o texto a traz: `12:40` ou `12:40–13:05`. */
  time: string | null;
  /** O link que abre a linha: externo (`http(s)`) ou um trecho do próprio texto (`#t-125`). */
  href: string | null;
  /** O intervalo, em segundos, quando a minutagem é um intervalo. */
  range: { start: number; end: number } | null;
}

export type SummarySection =
  | { kind: "cards"; title: string | null; intro: string; cards: SummaryCard[] }
  | { kind: "rows"; title: string; rows: SummaryRow[]; peaks: boolean }
  | { kind: "text"; title: string; body: string }
  | { kind: "transcript"; title: string; body: string };

export interface SummaryScore {
  value: number;
  label: string;
}

export interface SummaryDocument {
  /** A linha `Fonte: [site](endereço) · autor` que abre o texto. */
  source: { label: string; href: string; byline: string | null } | null;
  /** O que vem antes do primeiro título, em markdown. */
  lead: string;
  /** Os números do topo: nenhum ou de dois a três. */
  score: SummaryScore[];
  /** Até onde vai o vídeo: o último trecho marcado ou o fim do último intervalo. */
  durationSeconds: number | null;
  sections: SummarySection[];
}

/** Quantas linhas de uma lista aparecem antes de "Mostrar todas". */
export const SUMMARY_ROWS_SHOWN = 5;
/** A partir de quantos caracteres o texto de um grupo abre recolhido. */
export const SUMMARY_TEXT_FOLD = 700;

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const FENCE = /^ {0,3}(```|~~~)/;
const SOURCE_LINE = /^Fonte: \[((?:\\.|[^\]\\])*)\]\(([^()\s]+)\)(?:[ \t]*·[ \t]*(.+))?$/;
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+(.*)$/;
const CONTINUATION = /^(?: {2,}|\t)\S/;
const ANCHOR_MARK = /^\{#t-(\d+)\}/;
const FIELD = /^(?:[-*+][ \t]+)?(?:\*\*|__)?(De|Prazo|Fontes?)(?:\*\*|__)?[ \t]*:(?:\*\*|__)?[ \t]+(.+)$/i;
const LINK = /\[((?:\\.|[^\]\\])*)\]\(([^()\s]+)\)/g;
const TIME = "\\d{1,3}:\\d{2}(?::\\d{2})?";
const TIME_ONLY = new RegExp(`^${TIME}$`);
const TIME_RANGE = new RegExp(`^(${TIME})[ \\t]*[–—-][ \\t]*(${TIME})$`);
const ROW_LINK = new RegExp(`^\\[((?:\\\\.|[^\\]\\\\])*)\\]\\(([^()\\s]+)\\)[ \\t]*(?:\\((${TIME})\\))?[ \\t]*(?:[:—–-][ \\t]*)?(.*)$`);
const ROW_STRONG = /^\*\*(.+?)\*\*[ \t]*(?:[:—–-][ \t]*)?(.*)$/;
const ROW_CHECK = /^\[[ xX]\][ \t]+/;
const SPEAKER = /\*\*([^*]+?):?\*\*/;
const WORD = /[\p{L}\p{N}]+/gu;

interface Mark {
  line: number;
  level: number;
  title: string;
}

/**
 * Como ler um artefato em fichas, ou `null` quando ele fica em markdown. Os três tipos de resumo são lidos como o
 * que são. A nota (`text`) só quando é a transcrição que a Leitura diária guarda: abre com a linha
 * `Fonte:` de um vídeo do YouTube e tem trechos marcados (`{#t-125}`). Enquanto a transcrição não chega, o
 * documento do vídeo não tem trecho nenhum e segue como nota.
 */
export function summaryCardsTypeOf(type: string, markdown: string): SummaryCardsType | null {
  if (isSummaryCardsType(type)) return type;
  if (type !== "text") return null;
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const first = lines.find((line) => line.trim() !== "");
  const source = first === undefined ? null : SOURCE_LINE.exec(first.trim());
  if (!source || !youtubeVideoOf(source[2] ?? "")) return null;
  return lines.some((line) => ANCHOR_MARK.test(line)) ? "youtube_transcript" : null;
}

/** As fichas de um artefato pelo tipo e pelo texto dele, ou `null` quando ele fica em markdown. */
export function summaryCardsFor(type: string, markdown: string): SummaryDocument | null {
  const kind = summaryCardsTypeOf(type, markdown);
  return kind ? summaryCardsOf(kind, markdown) : null;
}

/** As fichas de um texto, ou `null` quando ele não tem título nenhum. */
export function summaryCardsOf(type: SummaryCardsType, markdown: string): SummaryDocument | null {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");

  let source: SummaryDocument["source"] = null;
  const first = lines.findIndex((line) => line.trim() !== "");
  const sourceMatch = first >= 0 ? SOURCE_LINE.exec(lines[first]?.trim() ?? "") : null;
  if (sourceMatch && isRemote(sourceMatch[2] ?? "")) {
    source = { label: plainInline(sourceMatch[1] ?? ""), href: sourceMatch[2] ?? "", byline: sourceMatch[3] ? plainInline(sourceMatch[3]) : null };
    lines.splice(0, first + 1);
  }

  let marks = headingsOf(lines);
  if (marks.length === 0) return null;
  let top = Math.min(...marks.map((mark) => mark.level));
  // Um título sozinho no topo é o nome do texto, não um grupo.
  const tops = marks.filter((mark) => mark.level === top);
  const opening = lines.findIndex((line) => line.trim() !== "");
  if (tops.length === 1 && tops[0]?.line === opening && marks.length > 1) {
    lines.splice(0, opening + 1);
    marks = headingsOf(lines);
    top = Math.min(...marks.map((mark) => mark.level));
  }

  const starts = marks.filter((mark) => mark.level === top);
  const lead = joined(lines.slice(0, starts[0]?.line ?? lines.length));
  const sections: SummarySection[] = [];
  starts.forEach((start, index) => {
    const end = starts[index + 1]?.line ?? lines.length;
    const inner = marks.filter((mark) => mark.line > start.line && mark.line < end);
    const section = sectionOf(type, start.title, lines, start.line + 1, end, inner);
    if (!section) return;
    const previous = sections[sections.length - 1];
    if (section.kind === "cards" && section.title === null && section.intro === "" && previous?.kind === "cards" && previous.title === null) {
      previous.cards.push(...section.cards);
      return;
    }
    sections.push(section);
  });
  if (sections.length === 0) return null;

  const durationSeconds = durationOf(lines, sections);
  return { source, lead, score: scoreOf(type, lead, sections, lines, durationSeconds), durationSeconds, sections };
}

function headingsOf(lines: readonly string[]): Mark[] {
  const marks: Mark[] = [];
  let fenced = false;
  lines.forEach((line, index) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;
    const match = HEADING.exec(line);
    const title = match ? plainInline(match[2] ?? "") : "";
    if (match && title) marks.push({ line: index, level: (match[1] ?? "").length, title });
  });
  return marks;
}

function sectionOf(type: SummaryCardsType, title: string, lines: readonly string[], from: number, to: number, inner: readonly Mark[]): SummarySection | null {
  if (inner.length > 0) {
    const level = Math.min(...inner.map((mark) => mark.level));
    const starts = inner.filter((mark) => mark.level === level);
    const cards = starts.map((start, index) => cardOf(start.title, lines.slice(start.line + 1, starts[index + 1]?.line ?? to)));
    const intro = joined(lines.slice(from, starts[0]?.line ?? to));
    // Na notícia o grupo é a editoria: vai para dentro de cada ficha, no lugar do rótulo do grupo.
    if (type === "news") return { kind: "cards", title: null, intro, cards: cards.map((card) => ({ ...card, kicker: title })) };
    return { kind: "cards", title, intro, cards };
  }
  const content = lines.slice(from, to);
  const body = joined(content);
  if (body === "") return null;
  if (content.some((line) => ANCHOR_MARK.test(line))) return { kind: "transcript", title, body };
  const rows = rowsOf(content);
  if (rows) return { kind: "rows", title, rows, peaks: rows.every((row) => row.range !== null) };
  if (type === "youtube_transcript") return { kind: "text", title, body };
  return { kind: "cards", title: null, intro: "", cards: [cardOf(title, content)] };
}

/** A ficha de um título: as linhas `De:`, `Prazo:` e `Fontes:` e os parágrafos só de links saem do texto. */
function cardOf(title: string, content: readonly string[]): SummaryCard {
  const card: SummaryCard = { title, kicker: null, from: null, due: null, sources: [], actions: [], body: "" };
  const kept: string[] = [];
  let fenced = false;
  for (const line of content) {
    if (FENCE.test(line)) fenced = !fenced;
    const field = fenced ? null : FIELD.exec(line.trim());
    const name = field?.[1]?.toLowerCase() ?? "";
    const value = field?.[2]?.trim() ?? "";
    if (name === "de" && !card.from) {
      card.from = senderOf(value);
    } else if (name === "prazo" && !card.due) {
      const text = plainInline(value);
      card.due = { text, tone: dueToneOf(text) };
    } else if (name.startsWith("fonte")) {
      card.sources.push(...sourcesOf(value));
    } else {
      kept.push(line);
    }
  }

  // Um parágrafo feito só de links é a linha de ações da ficha.
  const body: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length === 0) return;
    const actions = actionsOf(paragraph.join(" "));
    if (actions) card.actions.push(...actions);
    else body.push(...paragraph);
    paragraph = [];
  };
  fenced = false;
  for (const line of kept) {
    if (FENCE.test(line)) {
      flush();
      fenced = !fenced;
      body.push(line);
    } else if (fenced) {
      body.push(line);
    } else if (line.trim() === "") {
      flush();
      body.push(line);
    } else {
      paragraph.push(line);
    }
  }
  flush();
  card.body = joined(body);
  return card;
}

function senderOf(value: string): NonNullable<SummaryCard["from"]> {
  const cut = value.indexOf(" · ");
  const name = plainInline((cut < 0 ? value : value.slice(0, cut)).replace(/<[^>]*>/g, ""));
  const detail = cut < 0 ? "" : plainInline(value.slice(cut + 3));
  return { name, detail: detail || null, initials: initialsOf(name) };
}

/** As iniciais do remetente: a da primeira palavra e a da última. */
export function initialsOf(name: string): string {
  const words = name.match(WORD) ?? [];
  const firstWord = words[0];
  if (!firstWord) return "";
  const lastWord = words.length > 1 ? words[words.length - 1] : undefined;
  return (firstLetter(firstWord) + (lastWord ? firstLetter(lastWord) : "")).toUpperCase();
}

function firstLetter(word: string): string {
  return Array.from(word)[0] ?? "";
}

/** O tom do prazo pelo que o texto diz: vencido, para hoje ou sem pressa. */
export function dueToneOf(text: string): SummaryDueTone {
  const folded = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (/atrasad|vencid|ontem/.test(folded)) return "late";
  if (/hoje|agora/.test(folded)) return "soon";
  return "calm";
}

function sourcesOf(value: string): SummaryLink[] {
  const links = linksOf(value);
  if (links.length > 0) return links.map((link) => ({ label: link.label, href: isRemote(link.href) ? link.href : null }));
  return value
    .split(/[ \t]*[·,;|][ \t]*/)
    .map((label) => plainInline(label))
    .filter(Boolean)
    .map((label) => ({ label, href: null }));
}

function actionsOf(paragraph: string): { label: string; href: string }[] | null {
  const rest = paragraph.replace(LINK, "");
  if (!/^[\s·|]*$/.test(rest)) return null;
  const links = linksOf(paragraph).filter((link) => isRemote(link.href) || /^mailto:/i.test(link.href));
  return links.length > 0 ? links : null;
}

function linksOf(text: string): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  for (const match of text.matchAll(LINK)) {
    const label = plainInline(match[1] ?? "");
    if (label) links.push({ label, href: match[2] ?? "" });
  }
  return links;
}

/** As linhas de um grupo que é só uma lista; `null` quando há outra coisa no meio. */
function rowsOf(content: readonly string[]): SummaryRow[] | null {
  const items: string[] = [];
  for (const line of content) {
    if (line.trim() === "") continue;
    const item = LIST_ITEM.exec(line);
    if (item) {
      items.push(item[1] ?? "");
    } else if (CONTINUATION.test(line) && items.length > 0) {
      items[items.length - 1] += ` ${line.trim()}`;
    } else {
      return null;
    }
  }
  return items.length > 0 ? items.map(rowOf) : null;
}

function rowOf(item: string): SummaryRow {
  const text = item.replace(ROW_CHECK, "").trim();
  const link = ROW_LINK.exec(text);
  if (link) {
    const label = plainInline(link[1] ?? "");
    const target = link[2] ?? "";
    const href = isRemote(target) || /^#t-\d+$/.test(target) ? target : null;
    const rest = plainInline(link[4] ?? "");
    const range = TIME_RANGE.exec(label);
    if (range) return { title: null, text: rest, time: label, href, range: { start: secondsOf(range[1] ?? ""), end: secondsOf(range[2] ?? "") } };
    if (TIME_ONLY.test(label)) return { title: null, text: rest, time: label, href, range: null };
    return { title: label, text: rest, time: link[3] ?? null, href, range: null };
  }
  const strong = ROW_STRONG.exec(text);
  if (strong) return { title: plainInline(strong[1] ?? "").replace(/[ \t]*:$/, ""), text: plainInline(strong[2] ?? ""), time: null, href: null, range: null };
  return { title: null, text: plainInline(text), time: null, href: null, range: null };
}

/** `12:40` e `1:02:03` em segundos. */
export function secondsOf(time: string): number {
  return time.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

function durationOf(lines: readonly string[], sections: readonly SummarySection[]): number | null {
  let last = 0;
  for (const line of lines) {
    const mark = ANCHOR_MARK.exec(line);
    if (mark) last = Math.max(last, Number(mark[1]));
  }
  for (const section of sections) {
    if (section.kind !== "rows") continue;
    for (const row of section.rows) if (row.range) last = Math.max(last, row.range.end);
  }
  return last > 0 ? last : null;
}

function scoreOf(type: SummaryCardsType, lead: string, sections: readonly SummarySection[], lines: readonly string[], durationSeconds: number | null): SummaryScore[] {
  const score: SummaryScore[] = [];
  const add = (value: number, one: string, many: string) => {
    if (value > 0) score.push({ value, label: value === 1 ? one : many });
  };
  const cards = sections.flatMap((section) => (section.kind === "cards" ? section.cards : []));

  if (type === "email_summary") {
    const counted = sections.flatMap((section) => {
      if (section.kind === "cards") return [{ title: section.title, count: section.cards.length }];
      return section.kind === "rows" ? [{ title: section.title, count: section.rows.length }] : [];
    });
    add(counted.reduce((total, group) => total + group.count, 0), "e-mail", "e-mails");
    const titled = counted.filter((group) => group.title !== null);
    const lower = (group: (typeof titled)[number] | undefined) => (group?.title ?? "").toLowerCase();
    // Com um grupo só, o número dele repetiria o total.
    if (titled[0] && counted.length > 1) add(titled[0].count, lower(titled[0]), lower(titled[0]));
    const today = cards.filter((card) => card.due?.tone === "soon" && /hoje/i.test(card.due.text)).length;
    const due = cards.filter((card) => card.due).length;
    if (today > 0) add(today, "vence hoje", "vencem hoje");
    else if (due > 0) add(due, "com prazo", "com prazo");
    else if (titled[1]) add(titled[1].count, lower(titled[1]), lower(titled[1]));
  } else if (type === "news") {
    add(cards.length, "assunto", "assuntos");
    const sources = new Set(cards.flatMap((card) => card.sources.map((link) => link.label.toLowerCase())));
    add(sources.size, "fonte", "fontes");
    const words = [lead, ...cards.flatMap((card) => [card.title, card.body])].join(" ").match(WORD)?.length ?? 0;
    if (cards.length > 0) add(Math.max(1, Math.ceil(words / 200)), "min de leitura", "min de leitura");
  } else {
    if (durationSeconds !== null) add(Math.max(1, Math.ceil(durationSeconds / 60)), "minuto", "minutos");
    const speakers = new Set<string>();
    for (const line of lines) {
      const name = ANCHOR_MARK.test(line) ? SPEAKER.exec(line)?.[1]?.trim().toLowerCase() : undefined;
      if (name) speakers.add(name);
    }
    add(speakers.size, "pessoa", "pessoas");
    const parts = sections.find((section) => section.kind === "rows" && !section.peaks);
    if (parts?.kind === "rows") add(parts.rows.length, "parte", "partes");
  }
  return score.length >= 2 ? score : [];
}

function isRemote(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

/** O texto de um trecho de markdown de uma linha: sem link, ênfase nem crase, com os espaços de sobra fora. */
export function plainInline(text: string): string {
  return text
    .replace(/!?\[((?:\\.|[^\]\\])*)\]\([^()\s]*\)/g, "$1")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/\*/g, "")
    .replace(/\\(.)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function joined(lines: readonly string[]): string {
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
