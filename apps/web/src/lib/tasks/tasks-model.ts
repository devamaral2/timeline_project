import { dayKeyOf, formatTime, weekday, zonedDayStart, zonedTimeAt } from "@repo/timeline";
import type { TaskSummaryDto, WorkItemPriority, WorkItemStatus } from "@/lib/api/contracts";

/**
 * O que a tela de Tarefas decide a partir dos dados: a ordem e o nome dos
 * grupos, o dia e a hora de cada tarefa, o que esta atrasado e o que ela
 * espera ou libera. Fica fora dos componentes para que o mobile possa copiar a
 * regra, linha a linha.
 *
 * O contrato so tem instantes (`startedAt`, `estimatedFinishAt`). "Um dia sem
 * hora" e, por convencao, a meia-noite desse dia no fuso da timeline: uma
 * tarefa com `startedAt` as 00:00 tem dia e nao tem horario.
 */

/** A ordem dos grupos na lista. Concluidas e Canceladas ficam recolhidas, no fim. */
export const TASK_STATUS_ORDER: readonly WorkItemStatus[] = ["todo", "scheduled", "toDefine", "inHold", "done", "cancel"];

const OPEN_STATUSES: readonly WorkItemStatus[] = ["todo", "scheduled", "toDefine", "inHold"];

/** O rotulo de uma tarefa so: "A fazer", "Agendada". */
export const taskStatusLabels: Record<WorkItemStatus, string> = {
  todo: "A fazer",
  scheduled: "Agendada",
  toDefine: "A definir",
  inHold: "Em espera",
  done: "Concluída",
  cancel: "Cancelada",
};

/** O titulo do grupo, no plural. */
export const taskGroupLabels: Record<WorkItemStatus, string> = {
  todo: "A fazer",
  scheduled: "Agendadas",
  toDefine: "A definir",
  inHold: "Em espera",
  done: "Concluídas",
  cancel: "Canceladas",
};

/** Da mais leve para a mais urgente, como o seletor mostra. */
export const TASK_PRIORITY_ORDER: readonly WorkItemPriority[] = ["low", "medium", "high", "urgent"];

export const taskPriorityLabels: Record<WorkItemPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

/** Quantas das tres barras acendem na prioridade. */
export const taskPriorityBars: Record<WorkItemPriority, 1 | 2 | 3> = { low: 1, medium: 2, high: 3, urgent: 3 };

const PRIORITY_RANK: Record<WorkItemPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function isOpenTask(task: Pick<TaskSummaryDto, "status">): boolean {
  return OPEN_STATUSES.includes(task.status);
}

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toKey.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

type TaskDates = Pick<TaskSummaryDto, "startedAt" | "estimatedFinishAt">;

/** O dia civil da tarefa: o do inicio e, sem ele, o do prazo. */
export function taskDayOf(task: TaskDates): string | null {
  const instant = task.startedAt ?? task.estimatedFinishAt;
  return instant ? dayKeyOf(instant) : null;
}

function isDayStart(instant: string): boolean {
  return new Date(instant).getTime() === zonedDayStart(dayKeyOf(instant)).getTime();
}

/** O horario de inicio, ou `null` quando a tarefa so tem o dia (meia-noite). */
export function taskTimeOf(task: Pick<TaskSummaryDto, "startedAt">): string | null {
  if (!task.startedAt || isDayStart(task.startedAt)) return null;
  return formatTime(task.startedAt);
}

/** Aberta com o dia ja passado. Agendada e A fazer atrasam; A definir e Em espera nao tem prazo a cumprir. */
export function isOverdueTask(task: Pick<TaskSummaryDto, "status"> & TaskDates, now: Date): boolean {
  if (task.status !== "todo" && task.status !== "scheduled") return false;
  const day = taskDayOf(task);
  return day !== null && day < dayKeyOf(now);
}

/** "Venceu ontem" ou "Venceu há 3 dias". */
export function overdueLabel(task: TaskDates, now: Date): string {
  const day = taskDayOf(task);
  const days = day ? daysBetween(day, dayKeyOf(now)) : 0;
  return days <= 1 ? "Venceu ontem" : `Venceu há ${days} dias`;
}

const SHORT_DATE = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "numeric", month: "short" });

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1);
}

/** "Qui., 17 set." — e o ano, quando ele nao e o corrente. */
function shortDay(dayKey: string, now: Date): string {
  const instant = zonedTimeAt(dayKey, "12:00");
  const parts = SHORT_DATE.formatToParts(instant);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const sameYear = dayKey.slice(0, 4) === dayKeyOf(now).slice(0, 4);
  return `${capitalize(pick("weekday"))}, ${pick("day")} ${pick("month")}${sameYear ? "" : ` ${dayKey.slice(0, 4)}`}`;
}

/**
 * Quando a tarefa acontece: "Hoje, 09:00", "Amanhã", "Qui., 17 set." ou "Sem data".
 * Atrasada, o lugar do dia e de "Venceu ontem".
 */
export function taskWhenLabel(task: Pick<TaskSummaryDto, "status"> & TaskDates, now: Date): string {
  const day = taskDayOf(task);
  if (!day) return "Sem data";
  const time = taskTimeOf(task);
  const age = daysBetween(dayKeyOf(now), day);
  const base = age === 0 ? "Hoje" : age === 1 ? "Amanhã" : age === -1 ? "Ontem" : shortDay(day, now);
  return time ? `${base}, ${time}` : base;
}

export interface TaskGroup {
  status: WorkItemStatus;
  title: string;
  tasks: TaskSummaryDto[];
  /** Concluidas e Canceladas abrem recolhidas. */
  collapsedByDefault: boolean;
}

/** Dentro de cada grupo: pela data (padrao) ou pela prioridade. O empate cai no outro criterio e, por fim, no nome. */
export type TaskSort = "date" | "priority";

function compareByDate(a: TaskSummaryDto, b: TaskSummaryDto): number {
  const left = a.startedAt ?? a.estimatedFinishAt;
  const right = b.startedAt ?? b.estimatedFinishAt;
  if (left && right && left !== right) return left.localeCompare(right);
  if (left && !right) return -1;
  if (!left && right) return 1;
  return 0;
}

function compareByPriority(a: TaskSummaryDto, b: TaskSummaryDto): number {
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

function compareTasks(sort: TaskSort) {
  const [first, second] = sort === "date" ? [compareByDate, compareByPriority] : [compareByPriority, compareByDate];
  return (a: TaskSummaryDto, b: TaskSummaryDto) => first(a, b) || second(a, b) || a.name.localeCompare(b.name, "pt-BR");
}

/** Subtarefa aparece dentro da tarefa, nao na lista. */
export function topLevelTasks(tasks: readonly TaskSummaryDto[]): TaskSummaryDto[] {
  return tasks.filter((task) => !task.parentTaskId);
}

/** Um grupo por status, na ordem do design; so entram os que tem alguma tarefa. */
export function groupTasks(tasks: readonly TaskSummaryDto[], sort: TaskSort = "date"): TaskGroup[] {
  const top = topLevelTasks(tasks);
  return TASK_STATUS_ORDER.map((status) => ({
    status,
    title: taskGroupLabels[status],
    tasks: top.filter((task) => task.status === status).sort(compareTasks(sort)),
    collapsedByDefault: status === "done" || status === "cancel",
  })).filter((group) => group.tasks.length > 0);
}

/** "9 abertas" e "1 atrasada", sobre as tarefas de topo. */
export function taskCounts(tasks: readonly TaskSummaryDto[], now: Date): { open: number; overdue: number } {
  const top = topLevelTasks(tasks);
  return {
    open: top.filter(isOpenTask).length,
    overdue: top.filter((task) => isOverdueTask(task, now)).length,
  };
}

export function countLabel(open: number): string {
  return open === 1 ? "1 aberta" : `${open} abertas`;
}

export function overdueCountLabel(overdue: number): string {
  return overdue === 1 ? "1 atrasada" : `${overdue} atrasadas`;
}

/** As subtarefas feitas e o total, ou `null` quando a tarefa nao tem subtarefas. */
export function subtaskProgress(taskId: string, tasks: readonly TaskSummaryDto[]): { done: number; total: number } | null {
  const children = tasks.filter((task) => task.parentTaskId === taskId);
  if (children.length === 0) return null;
  return { done: children.filter((task) => task.status === "done").length, total: children.length };
}

/** As tarefas de que esta depende e que ainda nao acabaram. */
export function pendingDependencies(task: Pick<TaskSummaryDto, "dependsOnTaskIds">, tasks: readonly TaskSummaryDto[]): TaskSummaryDto[] {
  const byId = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  return task.dependsOnTaskIds
    .map((id) => byId.get(id))
    .filter((dependency): dependency is TaskSummaryDto => dependency !== undefined && isOpenTask(dependency));
}

/** "Aguarda 1 tarefa" / "Aguarda 2 tarefas". */
export function waitingLabel(pending: number): string {
  return `Aguarda ${pending} ${pending === 1 ? "tarefa" : "tarefas"}`;
}

/** O caminho inverso de `dependsOnTaskIds`: o que esta tarefa libera quando acabar. */
export function releasedBy(taskId: string, tasks: readonly TaskSummaryDto[]): TaskSummaryDto[] {
  return tasks.filter((task) => task.dependsOnTaskIds.includes(taskId));
}

export function subtasksOf(taskId: string, tasks: readonly TaskSummaryDto[]): TaskSummaryDto[] {
  return tasks.filter((task) => task.parentTaskId === taskId);
}

/** O status a que uma tarefa volta ao ser reaberta: Agendada se tem horario, A fazer se nao. */
export function reopenedStatus(task: TaskDates): WorkItemStatus {
  return taskTimeOf(task) ? "scheduled" : "todo";
}

/** Concluir pelo circulo e reabrir pelo circulo: o status que o toque produz. */
export function toggledStatus(task: Pick<TaskSummaryDto, "status"> & TaskDates): WorkItemStatus {
  return task.status === "done" || task.status === "cancel" ? reopenedStatus(task) : "done";
}

/** Com dia e horario a tarefa fica Agendada; sem horario, A fazer. */
export function statusForSchedule(day: string, time: string): WorkItemStatus {
  return day && time ? "scheduled" : "todo";
}

/**
 * As datas que o formulario manda: o dia sozinho vira a meia-noite desse dia,
 * e dia com horario vira o instante exato.
 */
export function scheduleToInstants(day: string, time: string): { startedAt?: string } {
  if (!day) return {};
  return { startedAt: (time ? zonedTimeAt(day, time) : zonedDayStart(day)).toISOString() };
}

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "Sexta-feira, 18 de setembro", ou "Sem data definida". */
export function taskDateLine(task: TaskDates): string {
  const day = taskDayOf(task);
  if (!day) return "Sem data definida";
  const [, month, date] = day.split("-").map(Number) as [number, number, number];
  return `${weekday(day)}, ${date} de ${MONTHS[month - 1]}`;
}

/** "Sem horário definido", "09:00" ou "09:00 → 10:30 · 1 h 30"; `null` sem data. */
export function taskTimeLine(task: TaskDates): string | null {
  if (!taskDayOf(task)) return null;
  const start = taskTimeOf(task);
  if (!start) return "Sem horário definido";
  if (!task.startedAt || !task.estimatedFinishAt || task.estimatedFinishAt <= task.startedAt) return start;
  const minutes = Math.round((new Date(task.estimatedFinishAt).getTime() - new Date(task.startedAt).getTime()) / 60_000);
  const duration = minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60}` : ""}`;
  return `${start} → ${formatTime(task.estimatedFinishAt)} · ${duration}`;
}
