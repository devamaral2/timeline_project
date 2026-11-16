import { expect, test } from "vitest";
import { Task, TaskOwnershipError, Recurrence } from "../../domain/index";
import { databaseOf, taskWith } from "../../api-core/tasks/testing/task-fixtures";
import { InMemoryArtifactRepository } from "../../api-core/artifacts/testing/in-memory-artifact.repository";
import { InMemoryTaskDatabase } from "../../api-core/tasks/testing/in-memory-task-database";
import { InMemoryTaskRepository } from "../../api-core/tasks/testing/in-memory-task.repository";
import { InMemoryTaskRequestLinkQuery } from "../../api-core/tasks/testing/in-memory-task-request-link.query";
import { InMemoryRecurrenceRepository } from "../../api-core/recurrences/testing/in-memory-recurrence.repository";
import { GetTaskUseCase } from "./get-task.usecase";

const actor = { userId: "auth-user-1" };
const startedAt = new Date("2026-08-16T18:00:00.000Z");

function setup(database: InMemoryTaskDatabase) {
  const recurrences = new InMemoryRecurrenceRepository(database);
  const requestLinks = new InMemoryTaskRequestLinkQuery();
  const useCase = new GetTaskUseCase(
    new InMemoryTaskRepository(database),
    new InMemoryArtifactRepository(database.artifacts),
    recurrences,
    requestLinks,
  );
  return { useCase, recurrences, requestLinks };
}

test("returns the task with its kind, artifacts and revision for the owner", async () => {
  const fixture = taskWith(
    { id: "task-1", userId: actor.userId, name: "Treino", description: "Gym session", startedAt, tags: ["gym"] },
    [{ id: "training-1", type: "training", data: { workouts: [{ workoutCode: "free", workoutName: "Livre", calories: 420, duration: 60 }], caloriesBurned: 420 } }],
  );
  const { useCase } = setup(databaseOf([fixture]));

  const result = await useCase.execute({ taskId: "task-1" }, actor);

  expect(result).toMatchObject({
    id: "task-1",
    actor: "human",
    kind: "training",
    name: "Treino",
    description: "Gym session",
    tags: ["gym"],
    startedAt: "2026-08-16T18:00:00.000Z",
    estimatedFinishAt: "2026-08-16T19:30:00.000Z",
    longRunning: false,
    revision: 1,
    artifactTypes: ["training"],
    artifacts: [
      {
        relation: "creates",
        fromRecurrence: false,
        artifact: {
          id: "training-1",
          type: "training",
          schemaVersion: 1,
          data: { workouts: [{ workoutCode: "free", calories: 420, duration: 60 }], caloriesBurned: 420 },
        },
      },
    ],
    previousTaskIds: [],
    nextTaskIds: [],
  });
  expect(result).not.toHaveProperty("status");
  expect(result).not.toHaveProperty("notes");
  expect(result?.artifacts[0]?.artifact).not.toHaveProperty("tasks");
});

test("returns null when the task does not exist", async () => {
  const { useCase } = setup(new InMemoryTaskDatabase());

  expect(await useCase.execute({ taskId: "missing" }, actor)).toBeNull();
});

test("rejects reading a task that belongs to another user", async () => {
  const fixture = taskWith({ id: "task-1", userId: actor.userId, name: "Sono", startedAt }, [
    { type: "sleep", data: { score: 70, trackedSleepTime: 420 } },
  ]);
  const { useCase } = setup(databaseOf([fixture]));

  await expect(useCase.execute({ taskId: "task-1" }, { userId: "attacker-1" })).rejects.toThrow(TaskOwnershipError);
});

test("returns the artifacts in the order of the links, and hides a deleted one", async () => {
  const fixture = taskWith({ id: "task-1", userId: actor.userId, name: "Reunião", startedAt }, [
    { type: "text", data: { body: "primeira" } },
    { type: "text", data: { body: "segunda" } },
    { type: "text", data: { body: "terceira" } },
  ]);
  const database = databaseOf([fixture]);
  // O repositorio em memoria nao tem soft delete: tirar o artefato da lista equivale a ele nao voltar do banco.
  database.artifacts.splice(1, 1);

  const result = await setup(database).useCase.execute({ taskId: "task-1" }, actor);

  expect(result?.artifacts.map((entry) => (entry.artifact.data as { body: string }).body)).toEqual(["primeira", "terceira"]);
  expect(result?.artifactTypes).toEqual(["text", "text"]);
});

test("returns the sequence in both directions: the tasks it follows and the ones that follow it", async () => {
  const first = Task.create({ id: "first", userId: actor.userId, name: "Pintar", status: "todo" });
  const middle = Task.create({ id: "middle", userId: actor.userId, name: "Mobiliar", status: "todo" });
  const last = Task.create({ id: "last", userId: actor.userId, name: "Inaugurar", status: "todo" });
  const database = new InMemoryTaskDatabase([first, middle, last]);
  database.edges.push({ fromId: "first", toId: "middle" }, { fromId: "middle", toId: "last" });
  const { useCase } = setup(database);

  const start = await useCase.execute({ taskId: "first" }, actor);
  const center = await useCase.execute({ taskId: "middle" }, actor);
  const end = await useCase.execute({ taskId: "last" }, actor);

  expect(start).toMatchObject({ previousTaskIds: [], nextTaskIds: ["middle"] });
  expect(center).toMatchObject({ status: "todo", previousTaskIds: ["first"], nextTaskIds: ["last"] });
  expect(end).toMatchObject({ previousTaskIds: ["middle"], nextTaskIds: [] });
  expect(center).not.toHaveProperty("subtaskTaskIds");
  expect(center).not.toHaveProperty("blockedByTaskIds");
});

test("a agent task appears in the sequence of a human task, and the other way around", async () => {
  const request = Task.create({ id: "request", userId: actor.userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const human = Task.create({ id: "human", userId: actor.userId, name: "Revisar", status: "todo" });
  const database = new InMemoryTaskDatabase([request, human]);
  database.edges.push({ fromId: "request", toId: "human" });
  const { useCase } = setup(database);

  expect((await useCase.execute({ taskId: "human" }, actor))?.previousTaskIds).toEqual(["request"]);
  expect((await useCase.execute({ taskId: "request" }, actor))?.nextTaskIds).toEqual(["human"]);
});

test("an occurrence comes with the rule of its series", async () => {
  const rule = { frequency: "daily" as const, interval: 1, timeOfDay: "15:00", timeZone: "America/Sao_Paulo", startsOn: "2026-08-01" };
  const series = Recurrence.create({ id: "rec-1", userId: actor.userId, rule, template: { name: "Correr" } });
  const occurrence = Task.create({
    id: "task-1",
    userId: actor.userId,
    name: "Correr",
    startedAt,
    occurrence: { recurrenceId: "rec-1", occurrenceOn: "2026-08-16", detached: false },
  });
  const { useCase, recurrences } = setup(new InMemoryTaskDatabase([occurrence]));
  await recurrences.save(series);

  const result = await useCase.execute({ taskId: "task-1" }, actor);

  expect(result?.recurrence).toEqual({ id: "rec-1", occurrenceOn: "2026-08-16", detached: false, rule });
});

test("an occurrence whose series is gone comes without it", async () => {
  const occurrence = Task.create({
    id: "task-1",
    userId: actor.userId,
    name: "Correr",
    startedAt,
    occurrence: { recurrenceId: "rec-gone", occurrenceOn: "2026-08-16", detached: true },
  });
  const { useCase } = setup(new InMemoryTaskDatabase([occurrence]));

  expect(await useCase.execute({ taskId: "task-1" }, actor)).not.toHaveProperty("recurrence");
});

test("returns the requests that created and updated the task, oldest first", async () => {
  const fixture = taskWith({ id: "task-1", userId: actor.userId, name: "Almoço", startedAt }, []);
  const { useCase, requestLinks } = setup(databaseOf([fixture]));
  requestLinks
    .link("task-1", { requestId: "req-2", relation: "updates", name: "mude o almoço para 13h", at: new Date("2026-08-16T12:00:00.000Z") })
    .link("task-1", { requestId: "req-1", relation: "generates", name: "crie um almoço", at: new Date("2026-08-16T10:00:00.000Z") });

  const result = await useCase.execute({ taskId: "task-1" }, actor);

  expect(result?.requests).toEqual([
    { id: "req-1", name: "crie um almoço", relation: "generates", at: "2026-08-16T10:00:00.000Z" },
    { id: "req-2", name: "mude o almoço para 13h", relation: "updates", at: "2026-08-16T12:00:00.000Z" },
  ]);
});

test("a task nobody asked the agent about has no requests", async () => {
  const fixture = taskWith({ id: "task-1", userId: actor.userId, name: "Sono", startedAt }, []);

  expect((await setup(databaseOf([fixture])).useCase.execute({ taskId: "task-1" }, actor))?.requests).toEqual([]);
});
