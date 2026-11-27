/** Quem executa a tarefa. */
export type TaskActor = "human" | "agent";

export type HumanTaskKind = "common" | "meal" | "sleep" | "training";

/**
 * Um pedido ao agente, ou uma execucao agendada (`cron`). `request` e so o
 * pedido do chat e da voz; `save_content` e a pagina de texto guardada pela
 * extensao; `save_content_with_transcription` e o video do YouTube guardado
 * para transcrever.
 */
export type AgentRequestKind =
  | "request"
  | "save_content"
  | "save_content_with_transcription"
  | "search_request"
  | "build_request"
  | "inquiry_request"
  | "review_request"
  | "cron";

/**
 * `step` e o passo em que um pedido se desdobra; nao aparece na agenda nem na
 * lista de pedidos. `save_content` e `save_content_with_transcription` tambem
 * ficam fora da agenda (ADR 0021), mas aparecem na lista de pedidos.
 */
export type AgentTaskKind = AgentRequestKind | "step";

export type TaskKind = HumanTaskKind | AgentTaskKind;

/**
 * Os estados de uma tarefa de pessoa. `toDefine` ainda nao tem data; `inHold`
 * espera por algo de fora; `missed` e marca manual de nao realizado. "Agendado"
 * e "atrasado" nao sao estados: a tela calcula pelas datas.
 */
export type HumanTaskStatus = "todo" | "toDefine" | "doing" | "inHold" | "done" | "cancel" | "missed";

/** `awaiting_transcription`: o pedido espera o servico local transcrever o video. */
export type AgentTaskStatus = "queued" | "running" | "waiting" | "awaiting_transcription" | "done" | "failed" | "cancel";

export type TaskStatus = HumanTaskStatus | AgentTaskStatus;

export type TaskPriority = "urgent" | "high" | "medium" | "low";

/** O que uma tarefa faz com um artefato. */
export type TaskArtifactRelation = "creates" | "updates" | "uses" | "deletes";
