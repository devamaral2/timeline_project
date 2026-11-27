import type { TranscriptionResult, TranscriptionSegment } from "@repo/contracts";

/**
 * A montagem do documento de uma transcrição (spec #39): o markdown que a Leitura diária guarda, feito do resultado
 * cru do serviço local e do que o Haiku devolveu (nomes dos falantes, resumo por tópicos, assuntos dos momentos mais
 * assistidos, resumo dos comentários). O texto das falas é o entregue, sem tirar nem pôr; tudo o que vem do Haiku ou
 * do YouTube entra como texto simples (`plain`), sem como virar markdown.
 */

const NAME_MAX = 60;
const TITLE_MAX = 200;
const TEXT_MAX = 600;
const SUMMARY_MAX = 4000;

/** O que o Haiku devolveu sobre o vídeo (a chamada 1), ainda não confiável. */
export interface TranscriptionSummary {
  speakers: { label: string; name: string }[];
  topics: { title: string; summary: string; startSegment: number; minute: number }[];
  hotMoments: { index: number; subject: string }[];
}

/** `MM:SS`, ou `H:MM:SS` de uma hora em diante. */
export function timeLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${String(minutes).padStart(2, "0")}:${rest}`;
}

/**
 * Texto de uma linha só, sem como virar markdown (link, negrito, título, âncora): o que o Haiku devolve e o que
 * vem do YouTube são dados não confiáveis.
 */
export function plain(text: string, max: number): string {
  return text
    .replace(/[[\]{}*`<>\\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[#>\-+\s]+/, "")
    .trim()
    .slice(0, max)
    .trim();
}

/** Os parágrafos de um texto livre, cada linha em texto simples e sem as vazias. */
export function paragraphs(text: string): string[] {
  return text.split(/\r?\n/).map((line) => plain(line, SUMMARY_MAX)).filter(Boolean);
}

/** O canal do vídeo como o documento o mostra (autoria da linha da fonte): texto simples e curto. */
export const bylineOf = (channel: string): string => plain(channel, NAME_MAX);

/** O corpo do documento, na ordem da spec: resumo, mais assistidos, comentários, descrição e transcrição. */
export function composeTranscriptionDocument(
  videoId: string,
  result: TranscriptionResult,
  segments: readonly TranscriptionSegment[],
  format: TranscriptionSummary,
  commentsSummary: string | undefined,
): string {
  const anchorOf = (segment: TranscriptionSegment) => `t-${Math.floor(segment.startSeconds)}`;
  /** A primeira fala que ainda não acabou no instante: a que toca nele ou a seguinte. */
  const locate = (seconds: number) => segments.findIndex((segment) => segment.endSeconds > seconds);

  const names = new Map<string, string>();
  for (const { label, name } of format.speakers) {
    const shown = plain(name, NAME_MAX);
    if (shown) names.set(label, shown);
  }

  const sections: string[] = [];

  const topics = format.topics.flatMap((topic) => {
    const title = plain(topic.title, TITLE_MAX);
    const at = Number.isInteger(topic.startSegment) && topic.startSegment >= 0 && topic.startSegment < segments.length
      ? topic.startSegment
      : locate(Math.max(0, topic.minute) * 60);
    const segment = segments[at];
    if (!title || !segment) return [];
    const summary = plain(topic.summary, TEXT_MAX);
    return [`- [${title}](#${anchorOf(segment)}) (${timeLabel(segment.startSeconds)})${summary ? `: ${summary}` : ""}`];
  });
  if (topics.length > 0) sections.push(["## Resumo", ...topics].join("\n"));

  const subjects = new Map(format.hotMoments.map((entry) => [entry.index, plain(entry.subject, TEXT_MAX)]));
  const moments = result.hotMoments.flatMap((moment, index) => {
    const segment = segments[locate(moment.startSeconds)];
    if (!segment) return [];
    const subject = subjects.get(index);
    return [`- [${timeLabel(moment.startSeconds)}–${timeLabel(moment.endSeconds)}](#${anchorOf(segment)})${subject ? `: ${subject}` : ""}`];
  });
  if (moments.length > 0) sections.push(["## Momentos mais assistidos", ...moments].join("\n"));

  if (commentsSummary) sections.push(`## Comentários\n${commentsSummary}`);

  const description = result.video.description.replace(/\r\n?/g, "\n").trim();
  if (description) {
    // Uma linha da descrição não vira título nem âncora do documento.
    sections.push(`## Descrição\n${description.split("\n").map((line) => line.replace(/^(\s*)([#{>])/, "$1\\$2")).join("\n")}`);
  }

  const taken = new Set<string>();
  const blocks = segments.map((segment) => {
    const id = anchorOf(segment);
    // Duas falas no mesmo segundo dividem a âncora da primeira: um id não se repete.
    const marker = taken.has(id) ? "" : `{#${id}} `;
    taken.add(id);
    const seconds = Math.floor(segment.startSeconds);
    const speaker = names.get(segment.speaker) ?? (plain(segment.speaker, NAME_MAX) || "Falante");
    const text = segment.text.trim().replace(/\s*\n\s*/g, " ");
    return `${marker}[${timeLabel(seconds)}](https://youtu.be/${videoId}?t=${seconds}) **${speaker}:** ${text}`;
  });
  sections.push(["## Transcrição", ...blocks].join("\n\n"));

  return sections.join("\n\n");
}
