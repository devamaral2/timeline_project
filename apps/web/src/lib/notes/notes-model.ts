import { TIMELINE_TIME_ZONE, dayKeyOf, formatTime } from "@repo/timeline";
import type { ArtifactDto } from "@repo/contracts";
import { hasTextBody } from "@repo/contracts/artifact-types";

/**
 * As regras de texto que as telas de nota ainda usam: o rótulo de quando um
 * instante cai e o corpo em markdown de uma nota de texto. Ficam fora dos
 * componentes para que o mobile possa copiar a regra, linha a linha.
 */

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toKey.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
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

/** "hoje, 09:00", "ontem, 21:12", "amanhã, 08:00" ou "11 set., 09:00". */
export function whenLabel(instant: string, now: Date): string {
  const age = daysBetween(dayKeyOf(instant), dayKeyOf(now));
  const time = formatTime(instant);
  if (age === 0) return `hoje, ${time}`;
  if (age === 1) return `ontem, ${time}`;
  if (age === -1) return `amanhã, ${time}`;
  return `${shortDay(instant, now)}, ${time}`;
}

const HEADING_MARKER = /^\s*#{1,6}\s+/;

/**
 * O corpo em markdown de uma nota de texto, sem o titulo repetido na primeira
 * linha (a tela ja o mostra). Os outros tipos de artefato nao tem markdown: vazio.
 */
export function noteMarkdownOf(artifact: ArtifactDto): string {
  if (!hasTextBody(artifact)) return "";
  const lines = artifact.data.body.split(/\r?\n/);
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex >= 0 && lines[firstIndex]?.trim().replace(HEADING_MARKER, "") === artifact.name) {
    lines.splice(0, firstIndex + 1);
  }
  return lines.join("\n").trim();
}
