/**
 * Os conjuntos fechados do dominio (docs/tdd/novo-banco-de-dados.md). Cada um
 * aparece duas vezes: no codec da coluna (`persistence/database/tables.ts`), para o
 * TypeScript, e no CHECK da migration, para o SQLite.
 */

/** Quem executa a tarefa. */
export const ACTORS = ["human", "agent"] as const;

export const HUMAN_KINDS = ["common", "meal", "sleep", "training"] as const;
export const AGENT_KINDS = [
  // So o pedido do chat e da voz; a pagina guardada e o video a transcrever tem tipo proprio.
  "request",
  "save_content",
  "save_content_with_transcription",
  "search_request",
  "build_request",
  "inquiry_request",
  "review_request",
  "cron",
  "step",
] as const;
export const TASK_KINDS = [...HUMAN_KINDS, ...AGENT_KINDS] as const;
/** Tarefas de agente que a agenda nunca mostra (ADR 0021); a lista de pedidos mostra as duas de conteudo, mas nao o passo. */
export const OFF_AGENDA_KINDS = ["step", "save_content", "save_content_with_transcription"] as const satisfies readonly (typeof AGENT_KINDS)[number][];
/** Os tipos que a agenda aceita como filtro. */
export const AGENDA_KINDS = TASK_KINDS.filter((kind) => !(OFF_AGENDA_KINDS as readonly string[]).includes(kind));

export const HUMAN_STATUSES = ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"] as const;
export const AGENT_STATUSES = [
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
  "awaiting_transcription",
  "completed",
  "interrupted",
  "failed",
  "cancelled",
  "rolled_back",
] as const;
// Os dois conjuntos nao tem valor em comum; a coluna guarda a uniao.
export const TASK_STATUSES = [...new Set([...HUMAN_STATUSES, ...AGENT_STATUSES])] as [
  (typeof HUMAN_STATUSES)[number] | (typeof AGENT_STATUSES)[number],
  ...((typeof HUMAN_STATUSES)[number] | (typeof AGENT_STATUSES)[number])[],
];

/**
 * A situacao da tarefa de agente que terminou, que o usuario controla: para revisar, revisada ou guardada.
 * So tem situacao o pedido (nem passo, nem execucao agendada) que esta num status final.
 */
export const SITUATIONS = ["to_review", "reviewed", "bookmarked"] as const;

export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;

export const ENTRY_KINDS = ["message", "thought", "trace", "result", "input"] as const;
export const ENTRY_ROLES = ["user", "agent"] as const;

export const ARTIFACT_TYPES = [
  "text", "news", "email_summary", "youtube_transcript", "food", "sleep", "training", "workout", "skill", "agent", "router",
] as const;
/** Os unicos tipos que podem nao ter dono. */
export const GLOBAL_ARTIFACT_TYPES = ["food", "workout"] as const;

export const TASK_TASK_RELATIONS = ["generates", "updates", "deletes", "step", "subtask", "follow_up"] as const;
/** A hierarquia entre tarefas: da tarefa principal para a subtarefa. Cada tarefa tem no maximo uma principal. */
export const SUBTASK_RELATION = "subtask" as const satisfies (typeof TASK_TASK_RELATIONS)[number];
export const TASK_ARTIFACT_RELATIONS = ["creates", "updates", "uses", "deletes"] as const;
export const ARTIFACT_ARTIFACT_RELATIONS = ["derives"] as const;

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export const RECURRENCE_FREQS = ["daily", "weekly", "monthly", "yearly"] as const;

export type Actor = (typeof ACTORS)[number];
export type HumanTaskKind = (typeof HUMAN_KINDS)[number];
export type AgentTaskKind = (typeof AGENT_KINDS)[number];
export type TaskKind = (typeof TASK_KINDS)[number];
export type HumanTaskStatus = (typeof HUMAN_STATUSES)[number];
export type AgentTaskStatus = (typeof AGENT_STATUSES)[number];
export type TaskStatus = HumanTaskStatus | AgentTaskStatus;
export type Situation = (typeof SITUATIONS)[number];
export type TaskPriority = (typeof PRIORITIES)[number];
export type EntryKind = (typeof ENTRY_KINDS)[number];
export type EntryRole = (typeof ENTRY_ROLES)[number];
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
export type TaskTaskRelationKind = (typeof TASK_TASK_RELATIONS)[number];
export type TaskArtifactRelationKind = (typeof TASK_ARTIFACT_RELATIONS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
