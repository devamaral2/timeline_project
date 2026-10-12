import { expect, test } from "vitest";
import type { TaskSummaryDto } from "@/lib/api/contracts";
import {
  groupTasks,
  isOverdueTask,
  overdueLabel,
  pendingDependencies,
  releasedBy,
  reopenedStatus,
  scheduleToInstants,
  statusForSchedule,
  subtaskProgress,
  taskCounts,
  taskDateLine,
  taskTimeLine,
  taskTimeOf,
  taskWhenLabel,
  toggledStatus,
} from "./tasks-model";

/** Segunda, 14 de setembro de 2026, 10:00 no fuso da timeline. */
const now = new Date("2026-09-14T10:00:00-03:00");

function task(overrides: Partial<TaskSummaryDto> = {}): TaskSummaryDto {
  return {
    id: "t1",
    name: "Pagar conta de luz",
    status: "todo",
    priority: "medium",
    notifyOffsetsMinutes: [],
    tags: [],
    dependsOnTaskIds: [],
    revision: 1,
    ...overrides,
  };
}

test("a meia-noite do dia e um dia sem horario", () => {
  const dayOnly = task({ startedAt: "2026-09-17T00:00:00-03:00" });
  const timed = task({ startedAt: "2026-09-17T09:00:00-03:00" });
  expect(taskTimeOf(dayOnly)).toBeNull();
  expect(taskTimeOf(timed)).toBe("09:00");
  expect(taskTimeOf(task())).toBeNull();
});

test("rotula quando a tarefa acontece", () => {
  expect(taskWhenLabel(task({ status: "scheduled", startedAt: "2026-09-14T09:00:00-03:00" }), now)).toBe("Hoje, 09:00");
  expect(taskWhenLabel(task({ status: "scheduled", startedAt: "2026-09-15T07:00:00-03:00" }), now)).toBe("Amanhã, 07:00");
  expect(taskWhenLabel(task({ startedAt: "2026-09-17T00:00:00-03:00" }), now)).toBe("Qui., 17 set.");
  expect(taskWhenLabel(task({ startedAt: "2026-09-14T00:00:00-03:00" }), now)).toBe("Hoje");
  expect(taskWhenLabel(task({ startedAt: "2027-01-05T00:00:00-03:00" }), now)).toBe("Ter., 5 jan. 2027");
  expect(taskWhenLabel(task({ status: "toDefine" }), now)).toBe("Sem data");
});

test("atrasa so A fazer e Agendada, quando o dia ja passou", () => {
  const yesterday = "2026-09-13T00:00:00-03:00";
  expect(isOverdueTask(task({ startedAt: yesterday }), now)).toBe(true);
  expect(isOverdueTask(task({ status: "scheduled", startedAt: "2026-09-13T08:00:00-03:00" }), now)).toBe(true);
  expect(isOverdueTask(task({ startedAt: "2026-09-14T00:00:00-03:00" }), now)).toBe(false);
  expect(isOverdueTask(task({ status: "inHold", startedAt: yesterday }), now)).toBe(false);
  expect(isOverdueTask(task({ status: "done", startedAt: yesterday }), now)).toBe(false);
  expect(isOverdueTask(task(), now)).toBe(false);
});

test("diz ha quantos dias a tarefa venceu", () => {
  expect(overdueLabel({ startedAt: "2026-09-13T00:00:00-03:00" }, now)).toBe("Venceu ontem");
  expect(overdueLabel({ startedAt: "2026-09-10T00:00:00-03:00" }, now)).toBe("Venceu há 4 dias");
});

test("agrupa por status, na ordem do design, escondendo os vazios e as subtarefas", () => {
  const groups = groupTasks([
    task({ id: "a", status: "done" }),
    task({ id: "b", status: "scheduled", startedAt: "2026-09-15T07:00:00-03:00" }),
    task({ id: "c", status: "todo", name: "Marcar dentista", startedAt: "2026-09-17T00:00:00-03:00" }),
    task({ id: "d", status: "todo", name: "Pagar luz", startedAt: "2026-09-13T00:00:00-03:00" }),
    task({ id: "e", status: "todo", parentTaskId: "c" }),
  ]);
  expect(groups.map((group) => group.title)).toEqual(["A fazer", "Agendadas", "Concluídas"]);
  expect(groups[0]?.tasks.map((item) => item.id)).toEqual(["d", "c"]);
  expect(groups.map((group) => group.collapsedByDefault)).toEqual([false, false, true]);
});

test("ordena pela data e, sem ela, pela prioridade", () => {
  const [group] = groupTasks([
    task({ id: "baixa", status: "toDefine", priority: "low", name: "A" }),
    task({ id: "urgente", status: "toDefine", priority: "urgent", name: "B" }),
    task({ id: "datada", status: "toDefine", priority: "low", name: "C", startedAt: "2026-09-20T00:00:00-03:00" }),
  ]);
  expect(group?.tasks.map((item) => item.id)).toEqual(["datada", "urgente", "baixa"]);
});

test("conta abertas e atrasadas so entre as tarefas de topo", () => {
  const tasks = [
    task({ id: "a", startedAt: "2026-09-13T00:00:00-03:00" }),
    task({ id: "b", status: "toDefine" }),
    task({ id: "c", status: "done" }),
    task({ id: "d", parentTaskId: "a", startedAt: "2026-09-10T00:00:00-03:00" }),
  ];
  expect(taskCounts(tasks, now)).toEqual({ open: 2, overdue: 1 });
});

test("progresso de subtarefas, dependencias e o que a tarefa libera", () => {
  const tasks = [
    task({ id: "pai" }),
    task({ id: "f1", parentTaskId: "pai", status: "done" }),
    task({ id: "f2", parentTaskId: "pai" }),
    task({ id: "dep", status: "scheduled" }),
    task({ id: "feita", status: "done" }),
    task({ id: "bloqueada", dependsOnTaskIds: ["dep", "feita"] }),
  ];
  expect(subtaskProgress("pai", tasks)).toEqual({ done: 1, total: 2 });
  expect(subtaskProgress("dep", tasks)).toBeNull();
  const blocked = task({ id: "bloqueada", dependsOnTaskIds: ["dep", "feita"] });
  expect(pendingDependencies(blocked, tasks).map((item) => item.id)).toEqual(["dep"]);
  expect(releasedBy("dep", tasks).map((item) => item.id)).toEqual(["bloqueada"]);
});

test("o circulo conclui e reabre pelo status certo", () => {
  expect(toggledStatus(task({ status: "todo" }))).toBe("done");
  expect(toggledStatus(task({ status: "inHold" }))).toBe("done");
  expect(toggledStatus(task({ status: "done", startedAt: "2026-09-14T09:00:00-03:00" }))).toBe("scheduled");
  expect(toggledStatus(task({ status: "cancel", startedAt: "2026-09-14T00:00:00-03:00" }))).toBe("todo");
  expect(reopenedStatus({})).toBe("todo");
});

test("o formulario deriva o status e as datas do dia e do horario", () => {
  expect(statusForSchedule("2026-09-16", "09:00")).toBe("scheduled");
  expect(statusForSchedule("2026-09-16", "")).toBe("todo");
  expect(statusForSchedule("", "")).toBe("todo");
  expect(scheduleToInstants("", "09:00")).toEqual({});
  expect(scheduleToInstants("2026-09-16", "").startedAt).toBe("2026-09-16T03:00:00.000Z");
  expect(scheduleToInstants("2026-09-16", "09:00").startedAt).toBe("2026-09-16T12:00:00.000Z");
});

test("as linhas de data do detalhe", () => {
  expect(taskDateLine({ startedAt: "2026-09-18T00:00:00-03:00" })).toBe("Sexta-feira, 18 de setembro");
  expect(taskTimeLine({ startedAt: "2026-09-18T00:00:00-03:00" })).toBe("Sem horário definido");
  expect(taskTimeLine({ startedAt: "2026-09-14T09:00:00-03:00", estimatedFinishAt: "2026-09-14T10:30:00-03:00" })).toBe("09:00 → 10:30 · 1 h 30");
  expect(taskTimeLine({ startedAt: "2026-09-14T09:00:00-03:00" })).toBe("09:00");
  expect(taskDateLine({})).toBe("Sem data definida");
  expect(taskTimeLine({})).toBeNull();
});

test("ordena pela prioridade quando pedido, e a data desempata", () => {
  const [group] = groupTasks(
    [
      task({ id: "media-cedo", status: "toDefine", priority: "medium", startedAt: "2026-09-15T00:00:00-03:00" }),
      task({ id: "media-tarde", status: "toDefine", priority: "medium", startedAt: "2026-09-20T00:00:00-03:00" }),
      task({ id: "urgente", status: "toDefine", priority: "urgent" }),
    ],
    "priority",
  );
  expect(group?.tasks.map((item) => item.id)).toEqual(["urgente", "media-cedo", "media-tarde"]);
});
