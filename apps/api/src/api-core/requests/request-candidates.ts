import type { CandidateKind } from "./request-steps";

/**
 * Uma entidade que um pedido de escrita pode estar alterando. So o que o agente de escrita precisa para
 * reconhecer "a reuniao de hoje" ou "o aluguel": nunca o conteudo inteiro.
 */
export interface EditCandidate {
  kind: CandidateKind;
  id: string;
  name: string;
  /** Numa serie: a cadencia, em texto. */
  cadence?: string;
  taskKind?: string;
  /** Presente na tarefa acompanhada; ausente na que so marca um horario. */
  status?: string;
  startedAt?: string;
  estimatedFinishAt?: string;
  artifactType?: string;
  /** Inicio do texto do artefato. */
  text?: string;
}

/** Quem monta, no servidor, a lista curta de candidatos que o agente de escrita recebe. */
export interface CandidateQuery {
  shortlist(input: { userId: string; now: Date; kinds: readonly CandidateKind[] }): Promise<EditCandidate[]>;
}
