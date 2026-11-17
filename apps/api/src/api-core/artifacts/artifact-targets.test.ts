import { expect, test } from "vitest";
import { Artifact, Task, TaskNotFoundError, TaskOwnershipError } from "../../domain";
import { InMemoryTaskDatabase } from "../tasks/testing/in-memory-task-database";
import { InMemoryTaskRepository } from "../tasks/testing/in-memory-task.repository";
import { planArtifactLinks, uniqueIds } from "./artifact-targets";

const userId = "auth-user-1";
const startedAt = new Date("2026-08-17T15:00:00.000Z");

function setup(tasks: Task[]) {
  const artifacts = ["artifact-1", "other"].map((id) => Artifact.create({ id, userId, data: { body: id } }));
  const database = new InMemoryTaskDatabase(tasks, artifacts);
  return { database, tasks: new InMemoryTaskRepository(database) };
}

function task(id: string, artifactIds: string[] = [], overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({
    id,
    userId,
    name: id,
    startedAt,
    artifactLinks: artifactIds.map((artifactId) => ({ artifactId, relation: "creates" as const, fromRecurrence: false })),
    ...overrides,
  });
}

test("plans nothing when the artifact already appears exactly where it should, without reading any task", async () => {
  const neverRead = {
    findByIds: async () => {
      throw new Error("nao deveria ler");
    },
  };

  expect(await planArtifactLinks("artifact-1", ["e1", "e2"], ["e2", "e1"], neverRead, userId)).toEqual([]);
  expect(await planArtifactLinks("artifact-1", [], [], neverRead, userId)).toEqual([]);
});

test("the tasks that gain the artifact receive it at the end of their list, as used by default", async () => {
  const { tasks } = setup([task("e1", ["other"]), task("e2")]);

  const changes = await planArtifactLinks("artifact-1", [], ["e1", "e2"], tasks, userId);

  expect(changes).toHaveLength(2);
  expect(changes[0]).toMatchObject({
    op: "update",
    expectedRevision: 1,
    entity: {
      id: "e1",
      revision: 2,
      artifactLinks: [
        { artifactId: "other", relation: "creates", fromRecurrence: false },
        { artifactId: "artifact-1", relation: "uses", fromRecurrence: false },
      ],
    },
  });
  expect(changes[1]).toMatchObject({
    entity: { id: "e2", artifactLinks: [{ artifactId: "artifact-1", relation: "uses", fromRecurrence: false }] },
  });
});

test("the relation of the new links can be chosen", async () => {
  const { tasks } = setup([task("e1")]);

  const [change] = await planArtifactLinks("artifact-1", [], ["e1"], tasks, userId, "creates");

  expect(change).toMatchObject({ entity: { artifactLinks: [{ artifactId: "artifact-1", relation: "creates" }] } });
});

test("the tasks that leave the list lose the relation and keep their other artifacts", async () => {
  const { tasks } = setup([task("e1", ["other", "artifact-1"]), task("e2", ["artifact-1"])]);

  const changes = await planArtifactLinks("artifact-1", ["e1", "e2"], ["e2"], tasks, userId);

  expect(changes).toHaveLength(1);
  expect(changes[0]).toMatchObject({
    op: "update",
    expectedRevision: 1,
    entity: { id: "e1", revision: 2, artifactLinks: [{ artifactId: "other", relation: "creates" }] },
  });
});

test("adds and removes in the same plan, added tasks first", async () => {
  const { tasks } = setup([task("e1", ["artifact-1"]), task("e2")]);

  const changes = await planArtifactLinks("artifact-1", ["e1"], ["e2"], tasks, userId);

  expect(changes.map((change) => (change.op === "update" ? [change.entity.id, change.entity.artifactLinks.length] : []))).toEqual([
    ["e2", 1],
    ["e1", 0],
  ]);
});

test("an occurrence of a series that gains or loses the artifact is detached from the series", async () => {
  const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
  const { tasks } = setup([task("e1", [], { occurrence })]);

  const [change] = await planArtifactLinks("artifact-1", [], ["e1"], tasks, userId);

  expect(change).toMatchObject({ entity: { occurrence: { ...occurrence, detached: true } } });
});

test("plans without writing anything", async () => {
  const { database, tasks } = setup([task("e1")]);

  await planArtifactLinks("artifact-1", [], ["e1"], tasks, userId);

  expect(database.tasks[0]?.artifactLinks).toEqual([]);
  expect(database.tasks[0]?.revision).toBe(1);
});

test("every touched task must exist and belong to the user", async () => {
  const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", startedAt });
  const { tasks } = setup([theirs, task("e1")]);

  await expect(planArtifactLinks("artifact-1", [], ["e1", "missing"], tasks, userId)).rejects.toThrow(TaskNotFoundError);
  await expect(planArtifactLinks("artifact-1", [], ["theirs"], tasks, userId)).rejects.toThrow(TaskOwnershipError);
  await expect(planArtifactLinks("artifact-1", ["missing"], [], tasks, userId)).rejects.toThrow("Task not found: missing");
});

test("a agent task cannot gain an artifact by hand", async () => {
  const request = Task.create({ id: "request", userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const { tasks } = setup([request]);

  await expect(planArtifactLinks("artifact-1", [], ["request"], tasks, userId)).rejects.toThrow(
    "A agent task cannot be edited",
  );
});

test("uniqueIds removes repeats, keeps the order and treats a missing list as empty", () => {
  expect(uniqueIds(["b", "a", "b"])).toEqual(["b", "a"]);
  expect(uniqueIds(undefined)).toEqual([]);
});
