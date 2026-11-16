import type { TaskCardDto } from "@repo/contracts";
import { weekdayIndexOf } from "@repo/timeline";

export const EXAMPLE_TODAY = "2026-09-14";
export const EXAMPLE_NOW = Date.parse(`${EXAMPLE_TODAY}T09:35:00-03:00`);

// Os estados e as prioridades da prévia são os do cartão do contrato; a prévia só usa um subconjunto deles.
export type ExampleStatus = Extract<NonNullable<TaskCardDto["status"]>, "todo" | "inHold" | "doing" | "done" | "cancel">;
export type ExamplePriority = Extract<TaskCardDto["priority"], "urgent" | "medium" | "low">;
export interface ExampleTracking {
  id: string;
  status: ExampleStatus;
  priority: ExamplePriority;
}

export interface ExampleTask {
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
  tracking?: ExampleTracking;
  missed?: boolean;
  /** Sem horário de término registrado, como o contador do app principal. */
  running?: boolean;
  notifyOffsetsMinutes?: number[];
  /** Só nas tarefas da API: o cartão do contrato, que a linha única desenha. A prévia não o tem. */
  card?: TaskCardDto;
}

const todayTasks: ExampleTask[] = [
  { name: "Treino de força", type: "training", time: "07:00 — 08:00", minutes: 60, duration: "1 h", tag: "saúde", tracking: { id: "BRD-24", status: "done", priority: "medium" } },
  { name: "Café da manhã", type: "meal", time: "08:15 — 08:45", minutes: 30, duration: "30 min", missed: true },
  { name: "Revisar proposta", type: "common", time: "09:00 — 10:30", minutes: 90, duration: "1 h 30", tag: "trabalho", tracking: { id: "BRD-25", status: "doing", priority: "urgent" } },
  { name: "Almoço", type: "meal", time: "12:30 — 13:00", minutes: 30, duration: "30 min", href: "/mockups/tarefas/almoco" },
  { name: "Descanso da tarde", type: "sleep", time: "14:00 — 14:20", minutes: 20, duration: "20 min" },
];

const weekdayTasks: ExampleTask[] = [
  { name: "Treino de mobilidade", type: "training", time: "07:00 — 07:45", minutes: 45, duration: "45 min", tag: "saúde", tracking: { id: "BRD-26", status: "inHold", priority: "medium" } },
  { name: "Planejar o dia", type: "common", time: "08:00 — 08:15", minutes: 15, duration: "15 min", tag: "pessoal", tracking: { id: "BRD-27", status: "todo", priority: "low" } },
];

const saturdayTasks: ExampleTask[] = [
  { name: "Caminhada no parque", type: "training", time: "08:00 — 09:00", minutes: 60, duration: "1 h", tag: "ao ar livre" },
  { name: "Almoço em família", type: "meal", time: "12:00 — 13:30", minutes: 90, duration: "1 h 30" },
];

/** Fixtures repetidas para explorar a navegação; nunca representam dados reais. */
export function exampleTasksOn(dayKey: string): ExampleTask[] {
  if (dayKey === EXAMPLE_TODAY) return todayTasks;
  const weekday = weekdayIndexOf(dayKey);
  if (weekday === 0) return [];
  return weekday === 6 ? saturdayTasks : weekdayTasks;
}
