/** Quem executa o evento. */
export type EventActor = "human" | "agent";

export type HumanEventKind = "routine" | "meal" | "sleep" | "training";

/** Um pedido do usuario ao agente, ou uma execucao agendada (`cron`). */
export type AgentRequestKind =
  | "request"
  | "search_request"
  | "build_request"
  | "inquiry_request"
  | "review_request"
  | "cron";

/** `step` e o passo em que um pedido se desdobra; nao aparece na agenda nem na lista de pedidos. */
export type AgentEventKind = AgentRequestKind | "step";

export type EventKind = HumanEventKind | AgentEventKind;

/**
 * Os estados de um evento de pessoa. `toDefine` ainda nao tem data; `inHold`
 * espera por algo de fora; `missed` e marca manual de nao realizado. "Agendado"
 * e "atrasado" nao sao estados: a tela calcula pelas datas.
 */
export type HumanEventStatus = "todo" | "toDefine" | "doing" | "inHold" | "done" | "cancel" | "missed";

export type AgentEventStatus = "queued" | "running" | "waiting" | "done" | "failed" | "cancel";

export type EventStatus = HumanEventStatus | AgentEventStatus;

export type EventPriority = "urgent" | "high" | "medium" | "low";

/** O que um evento faz com um artefato. */
export type EventArtifactRelation = "creates" | "updates" | "uses" | "deletes";
