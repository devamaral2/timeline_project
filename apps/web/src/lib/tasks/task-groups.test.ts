import type { TaskCardDto } from "@repo/contracts";
import { taskCardSchema } from "@repo/contracts/schemas";
import { expect, test } from "vitest";
import { nestSubtasks, oneRowPerSeries, showsSeriesRule } from "./task-groups";

/** Um cartão válido do contrato: o que o teste não diz fica com o padrão de uma tarefa de pessoa. */
function card(overrides: { id: string } & Record<string, unknown>): TaskCardDto {
  return taskCardSchema.parse({
    actor: "human",
    kind: "common",
    status: "todo",
    priority: "medium",
    name: overrides.id,
    description: "",
    project: { id: "project-1", name: "personal", personal: true },
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    revision: 1,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  });
}

test("a subtarefa cuja principal está na lista vai para dentro dela, na ordem recebida, e não vira linha", () => {
  const tree = nestSubtasks([
    card({ id: "proposta", status: "doing" }),
    card({ id: "ler", status: "done", parentTaskId: "proposta" }),
    card({ id: "luz", status: "todo" }),
    card({ id: "responder", status: "todo", parentTaskId: "proposta" }),
  ]);

  expect(tree.roots.map((c) => c.id)).toEqual(["proposta", "luz"]);
  expect(tree.subtasksOf("proposta").map((c) => c.id)).toEqual(["ler", "responder"]);
  expect(tree.subtasksOf("luz")).toEqual([]);
});

test("a subtarefa cuja principal não está na lista continua sendo linha", () => {
  const tree = nestSubtasks([card({ id: "rascunho", status: "todo", parentTaskId: "sumiu" })]);

  expect(tree.roots.map((c) => c.id)).toEqual(["rascunho"]);
});

test("a subtarefa de uma subtarefa fica dentro da sua principal direta", () => {
  const tree = nestSubtasks([
    card({ id: "viagem", status: "todo" }),
    card({ id: "documentos", status: "todo", parentTaskId: "viagem" }),
    card({ id: "passaporte", status: "inHold", parentTaskId: "documentos" }),
  ]);

  expect(tree.roots.map((c) => c.id)).toEqual(["viagem"]);
  expect(tree.subtasksOf("viagem").map((c) => c.id)).toEqual(["documentos"]);
  expect(tree.subtasksOf("documentos").map((c) => c.id)).toEqual(["passaporte"]);
});

test("um ciclo vindo da rede não some com as tarefas: elas continuam linhas", () => {
  const tree = nestSubtasks([
    card({ id: "a", status: "todo", parentTaskId: "b" }),
    card({ id: "b", status: "todo", parentTaskId: "a" }),
  ]);

  expect(tree.roots.map((c) => c.id)).toEqual(["a", "b"]);
  expect(tree.subtasksOf("a")).toEqual([]);
});

const serieRule = {
  frequency: "daily" as const,
  interval: 1,
  timeOfDay: "18:00",
  timeZone: "America/Sao_Paulo",
  startsOn: "2026-09-01",
};

function occurrence(id: string, occurrenceOn: string, overrides: Record<string, unknown> = {}): TaskCardDto {
  return card({
    id,
    recurrence: { id: "serie-1", occurrenceOn, detached: false, rule: serieRule },
    ...overrides,
  });
}

test("uma série aparece uma vez: fica a ocorrência em aberto mais próxima, no lugar da primeira", () => {
  const rows = oneRowPerSeries([
    occurrence("dia-14", "2026-09-14"),
    card({ id: "avulsa", status: "todo" }),
    occurrence("dia-15", "2026-09-15"),
    occurrence("dia-16", "2026-09-16"),
  ]);

  expect(rows.map((c) => c.id)).toEqual(["dia-14", "avulsa"]);
});

test("a ocorrência destacada aparece por si, e não entra na conta da série", () => {
  const rows = oneRowPerSeries([
    occurrence("dia-14", "2026-09-14"),
    occurrence("editada", "2026-09-13", { recurrence: { id: "serie-1", occurrenceOn: "2026-09-13", detached: true, rule: serieRule } }),
  ]);

  expect(rows.map((c) => c.id)).toEqual(["dia-14", "editada"]);
});

test("sem ocorrência em aberto, a série ainda aparece uma vez só", () => {
  const rows = oneRowPerSeries([
    occurrence("feita-14", "2026-09-14", { status: "done" }),
    occurrence("feita-15", "2026-09-15", { status: "done" }),
  ]);

  expect(rows.map((c) => c.id)).toEqual(["feita-14"]);
});

test("a regra da série só substitui o horário de uma ocorrência que segue a série", () => {
  expect(showsSeriesRule(occurrence("dia-14", "2026-09-14"))).toBe(true);
  expect(showsSeriesRule(occurrence("editada", "2026-09-14", { recurrence: { id: "serie-1", occurrenceOn: "2026-09-14", detached: true, rule: serieRule } }))).toBe(false);
  expect(showsSeriesRule(card({ id: "avulsa" }))).toBe(false);
});
