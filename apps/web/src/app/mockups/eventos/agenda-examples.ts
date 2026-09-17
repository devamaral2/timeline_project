import { weekdayIndexOf } from "@repo/timeline";
import type { NotificationOffsetMinutes } from "@/lib/api/contracts";

export const EXAMPLE_TODAY = "2026-09-14";
export const EXAMPLE_NOW = Date.parse(`${EXAMPLE_TODAY}T09:35:00-03:00`);

// Proposta de tasks apenas para este protótipo. O evento continua sem status.
export type TaskStatus = "todo" | "scheduled" | "inProgress" | "completed" | "canceled";
export type TaskPriority = "urgent" | "normal" | "flexible";
export interface ExampleTask {
  id: string;
  status: TaskStatus;
  priority: TaskPriority;
}

export interface ExampleEvent {
  id?: string;
  name: string;
  type: string;
  time: string;
  minutes: number;
  duration: string;
  startedAt?: string;
  finishedAt?: string;
  tags?: string[];
  tag?: string;
  href?: string;
  task?: ExampleTask;
  missed?: boolean;
  /** Sem horário de término registrado, como o contador do app principal. */
  running?: boolean;
  notifyOffsetsMinutes?: NotificationOffsetMinutes[];
}

const todayEvents: ExampleEvent[] = [
  { name: "Treino de força", type: "training", time: "07:00 — 08:00", minutes: 60, duration: "1 h", tag: "saúde", task: { id: "BRD-24", status: "completed", priority: "normal" } },
  { name: "Café da manhã", type: "meal", time: "08:15 — 08:45", minutes: 30, duration: "30 min", missed: true },
  { name: "Revisar proposta", type: "routine", time: "09:00 — em andamento", minutes: 90, duration: "1 h 30", tag: "trabalho", running: true, task: { id: "BRD-25", status: "inProgress", priority: "urgent" } },
  { name: "Almoço", type: "meal", time: "12:30 — 13:00", minutes: 30, duration: "30 min", href: "/mockups/eventos/almoco" },
  { name: "Descanso da tarde", type: "sleep", time: "14:00 — 14:20", minutes: 20, duration: "20 min" },
];

const weekdayEvents: ExampleEvent[] = [
  { name: "Treino de mobilidade", type: "training", time: "07:00 — 07:45", minutes: 45, duration: "45 min", tag: "saúde", task: { id: "BRD-26", status: "scheduled", priority: "normal" } },
  { name: "Planejar o dia", type: "routine", time: "08:00 — 08:15", minutes: 15, duration: "15 min", tag: "pessoal", task: { id: "BRD-27", status: "todo", priority: "flexible" } },
];

const saturdayEvents: ExampleEvent[] = [
  { name: "Caminhada no parque", type: "training", time: "08:00 — 09:00", minutes: 60, duration: "1 h", tag: "ao ar livre" },
  { name: "Almoço em família", type: "meal", time: "12:00 — 13:30", minutes: 90, duration: "1 h 30" },
];

/** Fixtures repetidas para explorar a navegação; nunca representam dados reais. */
export function exampleEventsOn(dayKey: string): ExampleEvent[] {
  if (dayKey === EXAMPLE_TODAY) return todayEvents;
  const weekday = weekdayIndexOf(dayKey);
  if (weekday === 0) return [];
  return weekday === 6 ? saturdayEvents : weekdayEvents;
}
