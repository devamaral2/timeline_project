import type { CandidateKind } from "./request-steps";

/**
 * Uma entidade que um pedido de edicao pode estar alterando. So o que o JEV precisa para reconhecer
 * "a reuniao de hoje" ou "o aluguel": nunca o conteudo inteiro.
 */
export interface EditCandidate {
  kind: CandidateKind;
  id: string;
  name: string;
  /** Numa serie: a cadencia, em texto. */
  cadence?: string;
  eventKind?: string;
  /** Presente no evento acompanhado; ausente no que so marca um horario. */
  status?: string;
  startedAt?: string;
  estimatedFinishAt?: string;
  artifactType?: string;
  /** Inicio do texto do artefato. */
  text?: string;
}

/** Quem monta, no servidor, a lista curta de candidatos que o JEV escolhe. */
export interface CandidateQuery {
  shortlist(input: { userId: string; now: Date; kinds: readonly CandidateKind[] }): Promise<EditCandidate[]>;
}

/** Uma linha por candidato, para o JEV casar com o pedido. */
export function describeCandidate(candidate: EditCandidate): string {
  const label = candidate.kind === "event"
    ? `evento (${candidate.eventKind ?? "common"}${candidate.status ? `, ${candidate.status}` : ""})`
    : candidate.kind === "recurrence" ? "série de eventos recorrentes"
      : `artefato (${candidate.artifactType ?? "text"})`;
  return [
    `${label}: ${candidate.name}`,
    candidate.cadence,
    candidate.startedAt ? `início ${candidate.startedAt}` : undefined,
    candidate.estimatedFinishAt ? `fim planejado ${candidate.estimatedFinishAt}` : undefined,
    candidate.text ? `conteúdo: ${candidate.text}` : undefined,
  ].filter(Boolean).join("; ");
}
