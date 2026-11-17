/** O que o pedido fez com a tarefa: criou ("criado por") ou alterou ("atualizado por"). */
export type TaskRequestRelationKind = "generates" | "updates";

/** Um pedido vivo que criou ou alterou a tarefa, com o necessario para listar. */
export interface TaskRequestLink {
  requestId: string;
  relation: TaskRequestRelationKind;
  /** O nome do pedido: o inicio do que o usuario pediu. */
  name: string;
  /** Quando o pedido gravou a relacao. */
  at: Date;
}

export interface TaskRequestLinkQuery {
  /**
   * Os pedidos que criaram ou alteraram a tarefa, do mais antigo ao mais novo.
   * Os passos de agente ficam de fora: a relacao do passo e a mesma do pedido.
   */
  linksOf(taskId: string): Promise<TaskRequestLink[]>;
}
