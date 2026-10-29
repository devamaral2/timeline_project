import type { CandidateKind } from "./process-steps";

/**
 * Uma entidade que um pedido de edicao pode estar alterando. So o que o JEV precisa para reconhecer
 * "a reuniao de hoje" ou "a tarefa do aluguel": nunca o conteudo inteiro.
 */
export interface EditCandidate {
  kind: CandidateKind;
  id: string;
  name: string;
  /** Numa serie: o que ela gera. */
  target?: "event" | "task";
  /** Numa serie: a cadencia, em texto. */
  cadence?: string;
  eventKind?: string;
  startedAt?: string;
  finishedAt?: string;
  status?: string;
  noteType?: string;
  /** Inicio do texto da nota. */
  text?: string;
}

/** Quem monta, no servidor, a lista curta de candidatos que o JEV escolhe. */
export interface CandidateQuery {
  shortlist(input: { userId: string; now: Date; kinds: readonly CandidateKind[] }): Promise<EditCandidate[]>;
}

/** Uma linha por candidato, para o JEV casar com o pedido. */
export function describeCandidate(candidate: EditCandidate): string {
  const label = candidate.kind === "event" ? `evento (${candidate.eventKind ?? "rotina"})`
    : candidate.kind === "task" ? `tarefa (${candidate.status ?? "todo"})`
      : candidate.kind === "recurrence" ? `série recorrente de ${candidate.target === "task" ? "tarefas" : "eventos"}`
        : `nota (${candidate.noteType ?? "texto"})`;
  return [
    `${label}: ${candidate.name}`,
    candidate.cadence,
    candidate.startedAt ? `início ${candidate.startedAt}` : undefined,
    candidate.finishedAt ? `fim ${candidate.finishedAt}` : undefined,
    candidate.text ? `conteúdo: ${candidate.text}` : undefined,
  ].filter(Boolean).join("; ");
}
