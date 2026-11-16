/*
 * Dados ilustrativos do protótipo "Trilho". Nunca vêm da API: o relógio, os
 * dias e os eventos são fixos para que a tela seja a mesma a cada abertura.
 */

export type RailTaskType = "training" | "meal" | "common" | "sleep";
export type RailDayRelation = "past" | "today" | "future";
export type RailStatus = "done" | "running" | "upcoming" | "missed";

export interface RailTask {
  id: string;
  name: string;
  type: RailTaskType;
  /** Minutos desde a meia-noite. */
  start: number;
  end: number;
  tags: string[];
  missed?: boolean;
}

export interface RailDay {
  key: string;
  /** Rótulo do dia no seletor. */
  label: string;
  /** Data por extenso, em minúsculas (o cabeçalho cuida da caixa). */
  dateLine: string;
  relation: RailDayRelation;
  tasks: RailTask[];
}

export interface RailEntry {
  kind: "task";
  task: RailTask;
  status: RailStatus;
}

export interface RailGap {
  kind: "free";
  start: number;
  end: number;
}

export type RailItem = RailEntry | RailGap;

/** Relógio do protótipo: 09:35 de uma segunda-feira. */
export const RAIL_NOW = 9 * 60 + 35;

export const RAIL_DAYS: RailDay[] = [
  {
    key: "2026-09-13",
    label: "Ontem",
    dateLine: "domingo, 13 de setembro",
    relation: "past",
    tasks: [
      { id: "o-1", name: "Caminhada no parque", type: "training", start: 480, end: 540, tags: ["ao ar livre"] },
      { id: "o-2", name: "Almoço em família", type: "meal", start: 720, end: 810, tags: [] },
    ],
  },
  {
    key: "2026-09-14",
    label: "Hoje",
    dateLine: "segunda-feira, 14 de setembro",
    relation: "today",
    tasks: [
      { id: "h-1", name: "Treino de força", type: "training", start: 420, end: 480, tags: ["saúde"] },
      { id: "h-2", name: "Café da manhã", type: "meal", start: 495, end: 525, tags: [], missed: true },
      { id: "h-3", name: "Revisar proposta", type: "common", start: 540, end: 630, tags: ["trabalho"] },
      { id: "h-4", name: "Almoço", type: "meal", start: 750, end: 780, tags: [] },
      { id: "h-5", name: "Descanso da tarde", type: "sleep", start: 840, end: 860, tags: [] },
    ],
  },
  {
    key: "2026-09-15",
    label: "Amanhã",
    dateLine: "terça-feira, 15 de setembro",
    relation: "future",
    tasks: [
      { id: "a-1", name: "Treino de força", type: "training", start: 420, end: 480, tags: ["saúde"] },
      { id: "a-2", name: "Reunião de planejamento", type: "common", start: 600, end: 660, tags: ["trabalho"] },
      { id: "a-3", name: "Leitura", type: "common", start: 1260, end: 1290, tags: ["pessoal"] },
    ],
  },
];

/** Altura do trilho por minuto. Abaixo do mínimo e acima do máximo a escala para: é aproximada. */
const PX_PER_MINUTE = 1.2;

export function railHeightOf(minutes: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(minutes * PX_PER_MINUTE)));
}

export function statusOf(task: RailTask, relation: RailDayRelation, now: number): RailStatus {
  if (task.missed && relation !== "future") return "missed";
  if (relation === "past") return "done";
  if (relation === "future") return "upcoming";
  if (now >= task.end) return "done";
  if (now >= task.start) return "running";
  return "upcoming";
}

/** Eventos na ordem do relógio, com o tempo livre entre um e outro como lacuna. */
export function railItemsOf(day: RailDay, now: number): RailItem[] {
  const tasks = [...day.tasks].sort((left, right) => left.start - right.start);
  const items: RailItem[] = [];
  tasks.forEach((task, index) => {
    const previous = tasks[index - 1];
    if (previous && task.start > previous.end) {
      items.push({ kind: "free", start: previous.end, end: task.start });
    }
    items.push({ kind: "task", task, status: statusOf(task, day.relation, now) });
  });
  return items;
}

export function scheduledMinutesOf(day: RailDay): number {
  return day.tasks.reduce((total, task) => total + (task.end - task.start), 0);
}

export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} h ${rest} min`;
  if (hours) return `${hours} h`;
  return `${rest} min`;
}

export function clockOf(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const rest = String(minutes % 60).padStart(2, "0");
  return `${hours}:${rest}`;
}
