import { taskDayKeysOf } from "./task-days";
import type { AgendaDay, AgendaTaskCard } from "./agenda-day";

/**
 * Agrupa as tarefas pelos dias civis que ocupam no fuso da agenda: uma tarefa
 * que atravessa a meia-noite aparece no dia em que comecou e no dia em que
 * terminou. Dias e tarefas saem em ordem decrescente e ids repetidos sao
 * descartados, porque janelas vizinhas podem se sobrepor.
 */
export function groupTasksByDay(
  tasks: readonly AgendaTaskCard[],
  todayKey: string,
): AgendaDay[] {
  const uniqueTasks = new Map<string, AgendaTaskCard>();
  for (const task of tasks) {
    if (!uniqueTasks.has(task.id)) uniqueTasks.set(task.id, task);
  }

  const tasksByDay = new Map<string, AgendaTaskCard[]>();
  for (const task of uniqueTasks.values()) {
    for (const key of taskDayKeysOf(task.startedAt, task.estimatedFinishAt)) {
      const bucket = tasksByDay.get(key);
      if (bucket) bucket.push(task);
      else tasksByDay.set(key, [task]);
    }
  }

  return [...tasksByDay.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([dayKey, dayTasks]) => ({
      dayKey,
      isToday: dayKey === todayKey,
      tasks: dayTasks.sort((left, right) => right.startedAt.localeCompare(left.startedAt)),
    }));
}
