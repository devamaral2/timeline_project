/**
 * O que mudou num campo do registro: `before` o que saiu (vermelho, `-`) e
 * `after` o que entrou (verde, `+`). Criado so tem `after`.
 *
 * `time` e `deadline` viajam em ISO 8601, para cada cliente formatar no fuso e
 * no idioma dele: `time` e o intervalo `inicio/fim` (`fim` pode faltar) e
 * `deadline` e um instante so. Os demais campos sao texto pronto para exibir.
 */
export interface AgentChatFieldChange {
  field: "time" | "deadline" | "name" | "description" | "status" | "priority" | "tags";
  before?: string;
  after?: string;
}

/** Um registro que uma resposta tocou. */
export interface AgentChatEntityRef {
  kind: "event" | "task" | "note";
  id: string;
  change: "created" | "updated" | "deleted";
  label?: string;
  /** O que a resposta tirou e pos neste registro (criado e alterado). */
  changes?: AgentChatFieldChange[];
}

/** Por que um job de IA falhou (`errorCode` do job). */
export type AgentChatErrorCode =
  | "invalid_input"
  | "forbidden"
  | "limit_reached"
  | "conflict"
  | "unavailable"
  | "cancelled"
  | "internal";
