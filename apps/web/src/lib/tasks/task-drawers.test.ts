import type { TaskCardDto } from "@repo/contracts";
import { taskCardSchema } from "@repo/contracts/schemas";
import { expect, test } from "vitest";
import { nestSubtasks } from "./task-groups";
import { drawerOf, drawersOf, listedCards, toNowLabel } from "./task-drawers";

/** Um cartão válido do contrato: o que o teste não diz fica com o padrão de uma tarefa de pessoa. */
function card(overrides: { id: string } & Record<string, unknown>): TaskCardDto {
  return taskCardSchema.parse({
    actor: "human",
    kind: "common",
    status: "todo",
    priority: "medium",
    name: overrides.id,
    description: "",
    project: { id: "project-1", name: "diario", personal: true },
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

const agent = (id: string, status: string, extra: Record<string, unknown> = {}) =>
  card({ id, actor: "agent", kind: "request", status, ...extra });

test.each([
  ["todo", "now"],
  ["doing", "now"],
  ["toDefine", "later"],
  ["inHold", "later"],
  ["done", "ended"],
  ["cancel", "ended"],
  ["missed", "ended"],
])("tarefa de pessoa %s cai em %s", (status, drawer) => {
  expect(drawerOf(card({ id: "t", status }))).toBe(drawer);
});

test.each([
  ["todo", "continuous"],
  ["doing", "continuous"],
  ["toDefine", "continuous"],
  ["inHold", "continuous"],
  ["done", "ended"],
  ["cancel", "ended"],
  ["missed", "ended"],
])("tarefa longa de pessoa %s cai em %s", (status, drawer) => {
  expect(drawerOf(card({ id: "t", status, longRunning: true }))).toBe(drawer);
});

test.each(["preparing", "queued", "starting", "running", "awaiting_transcription"])("pedido de agente %s fica fora da lista, na gaveta de execução", (status) => {
  expect(drawerOf(agent("a", status))).toBe("execution");
});

test("pedido de agente esperando você cai em Para agora", () => {
  expect(drawerOf(agent("a", "waiting"))).toBe("now");
});

test.each(["completed", "interrupted", "failed", "cancelled", "rolled_back"])("pedido de agente %s: cada situação leva à sua gaveta e sem situação vai para Finalizadas", (status) => {
  expect(drawerOf(agent("a", status, { situation: "to_review" }))).toBe("now");
  expect(drawerOf(agent("a", status, { situation: "bookmarked" }))).toBe("later");
  expect(drawerOf(agent("a", status, { situation: "reviewed" }))).toBe("ended");
  expect(drawerOf(agent("a", status))).toBe("ended");
});

test.each(["preparing", "queued", "starting", "running", "waiting", "awaiting_transcription", "completed", "interrupted", "failed", "cancelled", "rolled_back"])(
  "a execução agendada cai em Contínuas com o status %s",
  (status) => {
    expect(drawerOf(card({ id: "c", actor: "agent", kind: "cron", status }))).toBe("continuous");
  },
);

test.each(["save_content", "save_content_with_transcription"])("o conteúdo guardado (%s) não tem situação: terminado cai em Finalizadas, em andamento na execução", (kind) => {
  const saved = (status: string) => card({ id: "g", actor: "agent", kind, status });
  expect(drawerOf(saved("awaiting_transcription"))).toBe("execution");
  expect(drawerOf(saved("running"))).toBe("execution");
  expect(drawerOf(saved("completed"))).toBe("ended");
  expect(drawerOf(saved("failed"))).toBe("ended");
  expect(drawerOf(saved("cancelled"))).toBe("ended");
});

test("tarefa sem status (de referência) não tem gaveta", () => {
  expect(drawerOf(card({ id: "ref", status: undefined }))).toBeNull();
});

test("as quatro gavetas vêm na ordem, com os títulos e só Para agora e Contínuas abertas; a vazia não aparece", () => {
  const drawers = drawersOf([
    card({ id: "feita", status: "done" }),
    card({ id: "ideia", status: "toDefine" }),
    card({ id: "longa", status: "doing", longRunning: true }),
    card({ id: "agora", status: "todo" }),
  ]);

  expect(drawers.map((d) => [d.key, d.title, d.collapsedByDefault, d.cards.map((c) => c.id)])).toEqual([
    ["now", "Para agora", false, ["agora"]],
    ["continuous", "Contínuas", false, ["longa"]],
    ["later", "Para depois", true, ["ideia"]],
    ["ended", "Finalizadas", true, ["feita"]],
  ]);
  expect(drawersOf([card({ id: "agora", status: "todo" })]).map((d) => d.key)).toEqual(["now"]);
  expect(drawersOf([])).toEqual([]);
});

test("em cada gaveta a pessoa vem antes do agente, e cada grupo fica na ordem recebida", () => {
  const drawers = drawersOf([
    agent("agente-1", "waiting"),
    card({ id: "pessoa-1", status: "todo" }),
    agent("agente-2", "waiting"),
    card({ id: "pessoa-2", status: "doing" }),
  ]);

  expect(drawers).toHaveLength(1);
  expect(drawers[0].cards.map((c) => c.id)).toEqual(["pessoa-1", "pessoa-2", "agente-1", "agente-2"]);
});

test("o trabalho em andamento do agente e a tarefa sem status não entram em nenhuma gaveta", () => {
  const drawers = drawersOf([agent("rodando", "running"), card({ id: "ref", status: undefined }), card({ id: "pessoa", status: "todo" })]);

  expect(drawers.flatMap((d) => d.cards.map((c) => c.id))).toEqual(["pessoa"]);
});

test("mudar a situação leva o pedido de agente para a outra gaveta", () => {
  const keyOf = (situation: string) => drawersOf([agent("a", "completed", { situation })])[0].key;

  expect(keyOf("to_review")).toBe("now");
  expect(keyOf("reviewed")).toBe("ended");
  expect(keyOf("bookmarked")).toBe("later");
});

test("a subtarefa cuja principal está em andamento continua como linha", () => {
  const rows = listedCards([
    agent("principal", "running"),
    card({ id: "filha", status: "todo", parentTaskId: "principal" }),
    card({ id: "outra", status: "todo" }),
  ]);
  const tree = nestSubtasks(rows);

  expect(rows.map((c) => c.id)).toEqual(["filha", "outra"]);
  expect(tree.roots.map((c) => c.id)).toEqual(["filha", "outra"]);
  expect(drawersOf(tree.roots)[0].cards.map((c) => c.id)).toEqual(["filha", "outra"]);
});

test("a subtarefa com a principal na lista fica dentro dela, mesmo caindo em outra gaveta", () => {
  const tree = nestSubtasks(listedCards([card({ id: "principal", status: "todo" }), card({ id: "filha", status: "done", parentTaskId: "principal" })]));

  expect(drawersOf(tree.roots).map((d) => [d.key, d.cards.map((c) => c.id)])).toEqual([["now", ["principal"]]]);
  expect(tree.subtasksOf("principal").map((c) => c.id)).toEqual(["filha"]);
});

test("o resumo conta as tarefas para agora", () => {
  expect(toNowLabel(0)).toBe("Nenhuma tarefa para agora");
  expect(toNowLabel(1)).toBe("1 tarefa para agora");
  expect(toNowLabel(5)).toBe("5 tarefas para agora");
});
