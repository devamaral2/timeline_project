/** O que o pedido fez com o evento: criou ("criado por") ou alterou ("atualizado por"). */
export type EventRequestRelationKind = "generates" | "updates";

/** Um pedido vivo que criou ou alterou o evento, com o necessario para listar. */
export interface EventRequestLink {
  requestId: string;
  relation: EventRequestRelationKind;
  /** O nome do pedido: o inicio do que o usuario pediu. */
  name: string;
  /** Quando o pedido gravou a relacao. */
  at: Date;
}

export interface EventRequestLinkQuery {
  /**
   * Os pedidos que criaram ou alteraram o evento, do mais antigo ao mais novo.
   * Os passos de agente ficam de fora: a relacao do passo e a mesma do pedido.
   */
  linksOf(eventId: string): Promise<EventRequestLink[]>;
}
