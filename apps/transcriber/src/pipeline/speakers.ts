import type { TranscriptionSegment } from "@repo/contracts";
import type { SpeakerTurn, TimedText } from "../types";

const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

/** A distância entre a fala e um turno; zero quando se tocam. */
const gap = (text: TimedText, turn: SpeakerTurn) =>
  Math.max(0, turn.startSeconds - text.endSeconds, text.startSeconds - turn.endSeconds);

/**
 * Casa cada fala com o falante pelo tempo: o que mais a cobre ganha, somando os turnos do mesmo falante; numa fala
 * que cai num silêncio, o do turno mais próximo. Os rótulos do pyannote (`SPEAKER_00`) viram "Falante 1", "Falante 2"
 * na ordem em que cada voz aparece, que é o que a API espera. Sem turnos (a separação falhou), tudo é do Falante 1.
 */
export function matchSpeakers(texts: TimedText[], turns: SpeakerTurn[]): TranscriptionSegment[] {
  const labels = new Map<string, string>();
  const labelOf = (raw: string) => {
    let label = labels.get(raw);
    if (!label) {
      label = `Falante ${labels.size + 1}`;
      labels.set(raw, label);
    }
    return label;
  };

  const segments: TranscriptionSegment[] = [];
  for (const item of texts) {
    const spoken = item.text.trim();
    if (!spoken) continue;
    const speaker = labelOf(speakerOf(item, turns) ?? "");
    segments.push({ startSeconds: item.startSeconds, endSeconds: item.endSeconds, speaker, text: spoken });
  }
  return segments;
}

function speakerOf(item: TimedText, turns: SpeakerTurn[]): string | null {
  const covered = new Map<string, number>();
  for (const turn of turns) {
    const shared = overlap(item.startSeconds, item.endSeconds, turn.startSeconds, turn.endSeconds);
    if (shared > 0) covered.set(turn.speaker, (covered.get(turn.speaker) ?? 0) + shared);
  }
  if (covered.size > 0) return [...covered.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  let nearest: SpeakerTurn | null = null;
  for (const turn of turns) {
    if (!nearest || gap(item, turn) < gap(item, nearest)) nearest = turn;
  }
  return nearest?.speaker ?? null;
}
