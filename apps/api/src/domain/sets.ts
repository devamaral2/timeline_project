/**
 * Os conjuntos fechados do dominio (docs/tdd/novo-banco-de-dados.md). Cada um
 * aparece duas vezes: no tipo da coluna, para o TypeScript, e no check, para o
 * Postgres. Os dois saem daqui.
 */

/** Quem executa o evento. */
export const ACTORS = ["human", "agent"] as const;

export const HUMAN_KINDS = ["routine", "meal", "sleep", "training"] as const;
export const AGENT_KINDS = [
  "request",
  "search_request",
  "build_request",
  "inquiry_request",
  "review_request",
  "cron",
  "step",
] as const;
export const EVENT_KINDS = [...HUMAN_KINDS, ...AGENT_KINDS] as const;

export const HUMAN_STATUSES = ["todo", "toDefine", "doing", "inHold", "done", "cancel", "missed"] as const;
export const AGENT_STATUSES = ["queued", "running", "waiting", "done", "failed", "cancel"] as const;
// `done` e `cancel` existem nos dois conjuntos; a coluna guarda a uniao.
export const EVENT_STATUSES = [...new Set([...HUMAN_STATUSES, ...AGENT_STATUSES])] as [
  (typeof HUMAN_STATUSES)[number] | (typeof AGENT_STATUSES)[number],
  ...((typeof HUMAN_STATUSES)[number] | (typeof AGENT_STATUSES)[number])[],
];

export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;

export const ENTRY_KINDS = ["message", "thought", "trace", "result", "input"] as const;
export const ENTRY_ROLES = ["user", "agent"] as const;

export const ARTIFACT_TYPES = ["text", "food", "sleep", "training", "workout", "skill", "agent", "router"] as const;
/** Os unicos tipos que podem nao ter dono. */
export const GLOBAL_ARTIFACT_TYPES = ["food", "workout"] as const;

export const EVENT_EVENT_RELATIONS = ["generates", "updates", "deletes", "subtask", "blocks", "follow_up"] as const;
export const EVENT_ARTIFACT_RELATIONS = ["creates", "updates", "uses", "deletes"] as const;
export const ARTIFACT_ARTIFACT_RELATIONS = ["derives"] as const;

export const JOB_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

export const RECURRENCE_FREQS = ["daily", "weekly", "monthly", "yearly"] as const;

export type Actor = (typeof ACTORS)[number];
export type HumanEventKind = (typeof HUMAN_KINDS)[number];
export type AgentEventKind = (typeof AGENT_KINDS)[number];
export type EventKind = (typeof EVENT_KINDS)[number];
export type HumanEventStatus = (typeof HUMAN_STATUSES)[number];
export type AgentEventStatus = (typeof AGENT_STATUSES)[number];
export type EventStatus = HumanEventStatus | AgentEventStatus;
export type EventPriority = (typeof PRIORITIES)[number];
export type EntryKind = (typeof ENTRY_KINDS)[number];
export type EntryRole = (typeof ENTRY_ROLES)[number];
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];
export type EventEventRelationKind = (typeof EVENT_EVENT_RELATIONS)[number];
export type EventArtifactRelationKind = (typeof EVENT_ARTIFACT_RELATIONS)[number];
export type JobStatus = (typeof JOB_STATUSES)[number];
