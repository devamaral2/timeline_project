import { monotonicFactory } from "ulid";
import type { ProcessJobKind } from "../../infrastructure/ai-jobs/ai-job-context";

/** Os agentes que a fila de passos executa. O fallback tem fila propria e nao e um passo de entidade. */
export const ENTITY_CREATE_AGENTS = ["event-create", "task-create", "note-create"] as const;
export const SERIES_CREATE_AGENTS = ["recurring-event-create", "recurring-task-create"] as const;
export const CREATE_AGENTS = [...ENTITY_CREATE_AGENTS, ...SERIES_CREATE_AGENTS] as const;
export const ENTITY_EDIT_AGENTS = ["event-edit", "task-edit", "note-edit"] as const;
export const SERIES_EDIT_AGENTS = ["recurring-event-edit", "recurring-task-edit"] as const;
export const EDIT_AGENTS = [...ENTITY_EDIT_AGENTS, ...SERIES_EDIT_AGENTS] as const;
export const STEP_AGENTS = [...CREATE_AGENTS, ...EDIT_AGENTS, "query"] as const;
export type StepAgent = (typeof STEP_AGENTS)[number];
export type ProcessAgent = StepAgent | "fallback";

export type EntityKind = "event" | "task" | "note";
export type Expected = "one" | "many";

/** Qual pergunta do JEV de entrada aciona qual agente, e em que fila ele roda. */
export const DISPATCH_STEPS: Readonly<Record<string, StepAgent>> = {
  event_create: "event-create",
  task_create: "task-create",
  note_create: "note-create",
  event_edit: "event-edit",
  task_edit: "task-edit",
  note_edit: "note-edit",
  recurring_event_create: "recurring-event-create",
  recurring_task_create: "recurring-task-create",
  recurring_event_edit: "recurring-event-edit",
  recurring_task_edit: "recurring-task-edit",
  query: "query",
};

/** O que o JEV escolhe como candidato de edicao: as entidades de sempre ou uma serie (recorrencia). */
export type CandidateKind = EntityKind | "recurrence";

/** O que cada agente de edicao altera: define quais candidatos o JEV escolhe para ele. */
export const EDIT_SELECTOR: Readonly<Record<(typeof EDIT_AGENTS)[number], { kind: CandidateKind; target?: "event" | "task" }>> = {
  "event-edit": { kind: "event" },
  "task-edit": { kind: "task" },
  "note-edit": { kind: "note" },
  "recurring-event-edit": { kind: "recurrence", target: "event" },
  "recurring-task-edit": { kind: "recurrence", target: "task" },
};

/** O candidato e do tipo que o agente de edicao altera (uma serie de eventos nao serve ao agente de tarefas). */
export function selects(agent: (typeof EDIT_AGENTS)[number], candidate: { kind: CandidateKind; target?: "event" | "task" }): boolean {
  const wanted = EDIT_SELECTOR[agent];
  return candidate.kind === wanted.kind && candidate.target === wanted.target;
}

export type CreateAgent = (typeof CREATE_AGENTS)[number];
export type EditAgent = (typeof EDIT_AGENTS)[number];

export function jobKindOf(agent: ProcessAgent): ProcessJobKind {
  return `process-${agent}` as ProcessJobKind;
}

export function isStepAgent(value: string): value is StepAgent {
  return (STEP_AGENTS as readonly string[]).includes(value);
}

/** Monotonico: os passos de um processo ordenam por id na ordem em que foram criados, mesmo no mesmo milissegundo. */
export const newStepId = monotonicFactory();
