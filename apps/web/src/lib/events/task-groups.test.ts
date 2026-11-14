import type { EventCardDto } from "@repo/contracts";
import { eventCardSchema } from "@repo/contracts/schemas";
import { expect, test } from "vitest";
import { groupTrackedEvents } from "./task-groups";

/** Um cartão válido do contrato: o que o teste não diz fica com o padrão de uma tarefa de pessoa. */
function card(overrides: { id: string } & Record<string, unknown>): EventCardDto {
  return eventCardSchema.parse({
    actor: "human",
    kind: "routine",
    status: "todo",
    priority: "medium",
    name: overrides.id,
    description: "",
    longRunning: false,
    notifyOffsetsMinutes: [],
    tags: [],
    artifactTypes: [],
    parentEventIds: [],
    blockedByEventIds: [],
    revision: 1,
    ...overrides,
  });
}

test("junta os dois executores nos seis grupos, na ordem do canvas, e tira os grupos vazios", () => {
  const groups = groupTrackedEvents([
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
  const groups = groupTrackedEvents([card({ id: "luz", status: "todo" })]);

  expect(groups.map((group) => group.title)).toEqual(["A fazer"]);
});

test("mantém a ordem recebida dentro de cada grupo", () => {
  const groups = groupTrackedEvents([
    card({ id: "depois", status: "todo", startedAt: "2026-09-20T00:00:00-03:00" }),
    card({ id: "antes", status: "todo", startedAt: "2026-09-15T00:00:00-03:00" }),
  ]);

  expect(groups[0].cards.map((c) => c.id)).toEqual(["depois", "antes"]);
});

test("a subtarefa cujo pai está na lista não vira linha própria; com o pai fora da lista, aparece", () => {
  const groups = groupTrackedEvents([
    card({ id: "proposta", status: "todo" }),
    card({ id: "ler", status: "done", parentEventIds: ["proposta"] }),
    card({ id: "rascunho", status: "todo", parentEventIds: ["sumiu"] }),
  ]);

  const shown = groups.flatMap((group) => group.cards.map((c) => c.id));
  expect(shown).toEqual(["proposta", "rascunho"]);
});

test("evento sem status (de referência) não entra em nenhum grupo", () => {
  const groups = groupTrackedEvents([card({ id: "consulta", status: undefined, startedAt: "2026-09-15T10:00:00-03:00" })]);

  expect(groups).toEqual([]);
});
