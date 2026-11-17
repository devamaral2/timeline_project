/** Quem executa a tarefa. */
export type TaskActor = "human" | "agent";

export type HumanTaskKind = "common" | "meal" | "sleep" | "training";

/** Um pedido do usuario ao agente, ou uma execucao agendada (`cron`). */
export type AgentRequestKind =
  | "request"
  | "search_request"
  | "build_request"
  | "inquiry_request"
  | "review_request"
  | "cron";

/** `step` e o passo em que um pedido se desdobra; nao aparece na agenda nem na lista de pedidos. */
export type AgentTaskKind = AgentRequestKind | "step";

export type TaskKind = HumanTaskKind | AgentTaskKind;

/**
 * Os estados de uma tarefa de pessoa. `toDefine` ainda nao tem data; `inHold`
 * espera por algo de fora; `missed` e marca manual de nao realizado. "Agendado"
 * e "atrasado" nao sao estados: a tela calcula pelas datas.
 */
export type HumanTaskStatus = "todo" | "toDefine" | "doing" | "inHold" | "done" | "cancel" | "missed";

export type AgentTaskStatus = "queued" | "running" | "waiting" | "done" | "failed" | "cancel";

export type TaskStatus = HumanTaskStatus | AgentTaskStatus;

export type TaskPriority = "urgent" | "high" | "medium" | "low";

/** O que uma tarefa faz com um artefato. */
export type TaskArtifactRelation = "creates" | "updates" | "uses" | "deletes";
