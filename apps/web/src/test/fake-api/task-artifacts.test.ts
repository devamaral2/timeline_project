import { expect, test } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { createFakeApi } from ".";
import { artifactFixture, artifactsArea } from "./artifacts";
import { taskFixture, tasksArea } from "./tasks";

const WORKOUT = { code: "weightlifting", category: "strength", active: true };

test("GET da tarefa monta artifacts com os vínculos dele, na ordem em que foram semeados", async () => {
  const api = createFakeApi({
    areas: [tasksArea, artifactsArea],
    seed: {
      tasks: [taskFixture({ id: "ev-1" }), taskFixture({ id: "ev-2" })],
      artifacts: [
        artifactFixture({ id: "art-global", name: "Musculação", type: "workout", global: true, data: WORKOUT, links: [{ taskId: "ev-1", relation: "uses" }] }),
        artifactFixture({ id: "art-own", name: "Ficha A", links: [{ taskId: "ev-1", relation: "uses" }] }),
        artifactFixture({ id: "art-other", name: "De outra tarefa", links: [{ taskId: "ev-2", relation: "uses" }] }),
        artifactFixture({ id: "art-created", name: "Registro", links: [{ taskId: "ev-1", relation: "creates" }] }),
        artifactFixture({ id: "art-gone", name: "Apagado", deleted: true, links: [{ taskId: "ev-1", relation: "uses" }] }),
      ],
    },
  });

  const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;

  expect(task.artifacts.map((link) => [link.artifact.name, link.relation])).toEqual([
    ["Musculação", "uses"],
    ["Ficha A", "uses"],
    ["Registro", "creates"],
  ]);
  expect(task.artifacts[0]?.artifact).toMatchObject({ id: "art-global", type: "workout", global: true });
  // O artefato vem inteiro, mas sem `tasks`: essa lista só existe nas listas de artefatos.
  expect(task.artifacts[1]?.artifact).not.toHaveProperty("tasks");
  expect(task.artifacts[1]?.fromRecurrence).toBe(false);
});

test("uma tarefa sem vínculo de artefato devolve artifacts vazio", async () => {
  const api = createFakeApi({
    areas: [tasksArea, artifactsArea],
    seed: {
      tasks: [taskFixture({ id: "ev-1" })],
      artifacts: [artifactFixture({ id: "art-other", links: [{ taskId: "ev-2", relation: "uses" }] })],
    },
  });

  const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;

  expect(task.artifacts).toEqual([]);
});

/** A edição manda a lista inteira de artefatos, na ordem da tela: a tarefa devolve essa mesma ordem. */
function patchTask(api: { authedFetch: (path: string, init?: RequestInit) => Promise<unknown> }, body: unknown) {
  return api.authedFetch("/api/tasks/ev-1", { method: "PATCH", body: JSON.stringify(body) });
}

test("PATCH com artifacts devolve a lista no GET da tarefa, na ordem enviada; quem sai perde só o vínculo", async () => {
  const api = createFakeApi({
    areas: [tasksArea, artifactsArea],
    seed: {
      tasks: [taskFixture({ id: "ev-1", revision: 4 })],
      artifacts: [
        artifactFixture({ id: "art-a", name: "Ficha A", links: [{ taskId: "ev-1", relation: "uses" }] }),
        artifactFixture({ id: "art-b", name: "Registro", links: [{ taskId: "ev-1", relation: "creates" }] }),
        artifactFixture({ id: "art-c", name: "Esteira" }),
        artifactFixture({ id: "art-d", name: "Sai da lista", links: [{ taskId: "ev-1", relation: "uses" }] }),
      ],
    },
  });

  await patchTask(api, {
    expectedRevision: 4,
    artifacts: [
      { id: "art-c", relation: "uses" },
      { id: "art-a", relation: "uses" },
      { id: "art-b", relation: "creates" },
    ],
  });

  const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;
  expect(task.revision).toBe(5);
  expect(task.artifacts.map((link) => [link.artifact.name, link.relation])).toEqual([
    ["Esteira", "uses"],
    ["Ficha A", "uses"],
    ["Registro", "creates"],
  ]);
  // Quem saiu da lista continua existindo: só a ligação com esta tarefa acabou.
  const removed = (await api.authedFetch("/api/artifacts/art-d")) as { name: string };
  expect(removed.name).toBe("Sai da lista");
});

test("PATCH com artifacts que cita um artefato inexistente responde 404 e não grava nada", async () => {
  const api = createFakeApi({
    areas: [tasksArea, artifactsArea],
    seed: {
      tasks: [taskFixture({ id: "ev-1", revision: 1 })],
      artifacts: [artifactFixture({ id: "art-a", name: "Ficha A", links: [{ taskId: "ev-1", relation: "uses" }] })],
    },
  });

  await expect(patchTask(api, { expectedRevision: 1, artifacts: [{ id: "nao-existe", relation: "uses" }] })).rejects.toMatchObject({ status: 404 });

  const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;
  expect(task.revision).toBe(1);
  expect(task.artifacts.map((link) => link.artifact.name)).toEqual(["Ficha A"]);
});

const FOOD = {
  description: "Arroz branco",
  items: [],
  totals: { totalCaloriesKcal: 200, totalProteinGrams: 4, totalCarbohydrateGrams: 44, totalFatGrams: 0, totalFiberGrams: 1 },
  generation: { status: "completed" },
};

test("PATCH com uma cópia de alimento cria a cópia derivada com a quantidade, ligada à tarefa na ordem", async () => {
  const api = createFakeApi({
    areas: [tasksArea, artifactsArea],
    seed: {
      tasks: [taskFixture({ id: "ev-1", kind: "meal", revision: 2 })],
      artifacts: [artifactFixture({ id: "food-arroz", name: "Arroz", type: "food", global: true, data: FOOD })],
    },
  });

  await patchTask(api, { expectedRevision: 2, artifacts: [{ copyOf: "food-arroz", quantity: "150 g" }] });

  const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;
  expect(task.artifacts).toHaveLength(1);
  const [link] = task.artifacts;
  expect(link?.relation).toBe("uses");
  expect(link?.artifact).toMatchObject({ name: "Arroz", type: "food", global: false, derived: true, data: { ...FOOD, quantity: "150 g" } });
  expect(link?.artifact.id).not.toBe("food-arroz");
});

test("a cópia não aparece em GET /api/artifacts, e o original global segue igual", async () => {
  const api = createFakeApi({
    areas: [tasksArea, artifactsArea],
    seed: {
      tasks: [taskFixture({ id: "ev-1", kind: "meal", revision: 1 })],
      artifacts: [artifactFixture({ id: "food-arroz", name: "Arroz", type: "food", global: true, data: FOOD })],
    },
  });

  await patchTask(api, { expectedRevision: 1, artifacts: [{ copyOf: "food-arroz", quantity: "1 porção" }] });

  const listed = (await api.authedFetch("/api/artifacts?type=food&scope=global")) as { id: string }[];
  expect(listed.map((item) => item.id)).toEqual(["food-arroz"]);
  const own = (await api.authedFetch("/api/artifacts?type=food")) as unknown[];
  expect(own).toEqual([]);
});

test("editar o original depois não muda a cópia que já está na refeição", async () => {
  const api = createFakeApi({
    areas: [tasksArea, artifactsArea],
    seed: {
      tasks: [taskFixture({ id: "ev-1", kind: "meal", revision: 1 })],
      artifacts: [artifactFixture({ id: "food-meu", name: "Ovo", type: "food", data: FOOD, revision: 1 })],
    },
  });

  await patchTask(api, { expectedRevision: 1, artifacts: [{ copyOf: "food-meu", quantity: "2" }] });
  await api.authedFetch("/api/artifacts/food-meu", {
    method: "PATCH",
    body: JSON.stringify({ expectedRevision: 1, type: "food", data: { ...FOOD, totals: { ...FOOD.totals, totalCaloriesKcal: 999 } } }),
  });

  const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;
  expect(task.artifacts[0]?.artifact.data).toMatchObject({ quantity: "2", totals: { totalCaloriesKcal: 200 } });
});

test("uma cópia que já está na tarefa vai como id e continua ligada, sem criar outra cópia", async () => {
  const api = createFakeApi({
    areas: [tasksArea, artifactsArea],
    seed: {
      tasks: [taskFixture({ id: "ev-1", kind: "meal", revision: 1 })],
      artifacts: [artifactFixture({ id: "food-arroz", name: "Arroz", type: "food", global: true, data: FOOD })],
    },
  });

  await patchTask(api, { expectedRevision: 1, artifacts: [{ copyOf: "food-arroz", quantity: "1" }] });
  const copyId = ((await api.authedFetch("/api/tasks/ev-1")) as TaskDto).artifacts[0]?.artifact.id ?? "";
  await patchTask(api, { expectedRevision: 2, artifacts: [{ id: copyId, relation: "uses" }] });

  const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;
  expect(task.artifacts.map((link) => link.artifact.id)).toEqual([copyId]);
});

test("PATCH com cópia de um alimento que não existe responde 404 e não grava nada, nem as outras entradas", async () => {
  const api = createFakeApi({
    areas: [tasksArea, artifactsArea],
    seed: {
      tasks: [taskFixture({ id: "ev-1", kind: "meal", revision: 1 })],
      artifacts: [artifactFixture({ id: "food-arroz", name: "Arroz", type: "food", global: true, data: FOOD })],
    },
  });

  await expect(
    patchTask(api, { expectedRevision: 1, artifacts: [{ copyOf: "food-arroz", quantity: "1" }, { copyOf: "nao-existe", quantity: "1" }] }),
  ).rejects.toMatchObject({ status: 404 });

  const task = (await api.authedFetch("/api/tasks/ev-1")) as TaskDto;
  expect(task.revision).toBe(1);
  expect(task.artifacts).toEqual([]);
  expect((await api.authedFetch("/api/artifacts?type=food&scope=global")) as unknown[]).toHaveLength(1);
});

test("PATCH com cópia de um artefato que não é alimento responde 404", async () => {
  const api = createFakeApi({
    areas: [tasksArea, artifactsArea],
    seed: {
      tasks: [taskFixture({ id: "ev-1", revision: 1 })],
      artifacts: [artifactFixture({ id: "art-nota", name: "Nota" })],
    },
  });

  await expect(patchTask(api, { expectedRevision: 1, artifacts: [{ copyOf: "art-nota" }] })).rejects.toMatchObject({ status: 404 });
});
