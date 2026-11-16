import type { TaskCardDto } from "@repo/contracts";
import { taskCardSchema } from "@repo/contracts/schemas";
import { expect, test } from "vitest";
import { groupTrackedTasks, oneRowPerSeries, showsSeriesRule } from "./task-groups";

/** Um cartão válido do contrato: o que o teste não diz fica com o padrão de uma tarefa de pessoa. */
function card(overrides: { id: string } & Record<string, unknown>): TaskCardDto {
  return taskCardSchema.parse({
    actor: "human",
    kind: "common",
    status: "todo",
    priority: "medium",
    name: overrides.id,
    description: "",
    location: "",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    previousTaskIds: [],
    revision: 1,
    ...overrides,
  });
}

test("junta os dois executores nos seis grupos, na ordem do canvas, e tira os grupos vazios", () => {
  const groups = groupTrackedTasks([
    card({ id: "feita-agente", actor: "agent", kind: "request", status: "done" }),
    card({ id: "pneu", status: "inHold" }),
    card({ id: "falhou", actor: "agent", kind: "request", status: "failed" }),
    card({ id: "rodando", actor: "agent", kind: "request", status: "running" }),
    card({ id: "fotos", status: "toDefine" }),
    card({ id: "cancelada", status: "cancel" }),
    card({ id: "luz", status: "todo" }),
    card({ id: "treino", status: "doing" }),
    card({ id: "esperando", actor: "agent", kind: "request", status: "waiting" }),
    card({ id: "fila", actor: "agent", kind: "cron", status: "queued" }),
    card({ id: "perdida", status: "missed" }),
    card({ id: "feita", status: "done" }),
  ]);

  expect(groups.map((group) => [group.title, group.collapsedByDefault, group.cards.map((c) => c.id)])).toEqual([
    ["Em curso", false, ["rodando", "treino"]],
    ["A fazer", false, ["luz", "fila"]],
    ["Sem data", false, ["fotos"]],
    ["Em espera", false, ["pneu", "esperando"]],
    ["Feitas", true, ["feita-agente", "feita"]],
    ["Encerradas", true, ["falhou", "cancelada", "perdida"]],
  ]);
});

test("sem nenhum evento em um grupo, o grupo não aparece", () => {
  const groups = groupTrackedTasks([card({ id: "luz", status: "todo" })]);

  expect(groups.map((group) => group.title)).toEqual(["A fazer"]);
});

test("mantém a ordem recebida dentro de cada grupo", () => {
  const groups = groupTrackedTasks([
    card({ id: "depois", status: "todo", startedAt: "2026-09-20T00:00:00-03:00" }),
    card({ id: "antes", status: "todo", startedAt: "2026-09-15T00:00:00-03:00" }),
  ]);

  expect(groups[0].cards.map((c) => c.id)).toEqual(["depois", "antes"]);
});

test("a sequência não esconde ninguém: todo cartão com status vira linha, tenha antecessor na lista ou não", () => {
  const groups = groupTrackedTasks([
    card({ id: "proposta", status: "todo" }),
    card({ id: "ler", status: "done", previousTaskIds: ["proposta"] }),
    card({ id: "rascunho", status: "todo", previousTaskIds: ["sumiu"] }),
  ]);

  const shown = groups.flatMap((group) => group.cards.map((c) => c.id));
  expect(shown).toEqual(["proposta", "rascunho", "ler"]);
});

test("evento sem status (de referência) não entra em nenhum grupo", () => {
  const groups = groupTrackedTasks([card({ id: "consulta", status: undefined, startedAt: "2026-09-15T10:00:00-03:00" })]);

  expect(groups).toEqual([]);
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
