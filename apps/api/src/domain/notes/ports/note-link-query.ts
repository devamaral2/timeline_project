/** Onde uma note aparece: um evento ou uma tarefa vivos, com o necessario para listar. */
export interface NoteLinkSummary {
  kind: "event" | "task";
  id: string;
  name: string;
  /** A natureza do evento; so para `kind: "event"`. */
  eventKind?: string;
  /** Inicio do evento ou da tarefa, se houver. */
  at?: Date;
  /** Fim do evento, se ele já terminou; as tarefas não têm. */
  endsAt?: Date;
}

export interface NoteLinkQuery {
  /**
   * Os eventos e tarefas (vivos) em que cada note aparece: eventos primeiro, do
   * mais antigo ao mais novo, depois as tarefas. Note sem vinculo nao tem chave.
   */
  linksOf(noteIds: readonly string[]): Promise<Map<string, NoteLinkSummary[]>>;
}
