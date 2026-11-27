import { expect, test } from "vitest";
import { Artifact, ArtifactOwnershipError, Task } from "../../domain";
import { InMemoryArtifactTaskLinkQuery } from "../../api-core/artifacts/testing/in-memory-artifact-task-link.query";
import { InMemoryArtifactRepository } from "../../api-core/artifacts/testing/in-memory-artifact.repository";
import { InMemoryTaskDatabase } from "../../api-core/tasks/testing/in-memory-task-database";
import { GetArtifactUseCase } from "./get-artifact.usecase";

const actor = { userId: "auth-user-1" };
const totals = { totalCaloriesKcal: 89, totalProteinGrams: 1, totalCarbohydrateGrams: 23, totalFatGrams: 0, totalFiberGrams: 3 };

function useCaseOf(artifacts: Artifact[], tasks: Task[] = []) {
  const database = new InMemoryTaskDatabase(tasks, artifacts);
  return new GetArtifactUseCase(new InMemoryArtifactRepository(database.artifacts), new InMemoryArtifactTaskLinkQuery(database));
}

function linked(id: string, relation: "creates" | "uses" | "updates", overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({
    id,
    userId: actor.userId,
    name: id,
    status: "todo",
    artifactLinks: [{ artifactId: "note-1", relation, fromRecurrence: false }],
    ...overrides,
  });
}

test("returns the artifact of the actor with the tasks it appears in, oldest first and undated last", async () => {
  const note = Artifact.create({ id: "note-1", userId: actor.userId, name: "Pauta", data: { body: "itens" }, tags: ["time"] });
  const useCase = useCaseOf(
    [note],
    [
      linked("undated", "uses"),
      linked("later", "uses", { startedAt: new Date("2026-08-18T15:00:00.000Z") }),
      linked("first", "creates", { startedAt: new Date("2026-08-17T15:00:00.000Z"), estimatedFinishAt: new Date("2026-08-17T16:00:00.000Z") }),
      linked("request", "updates", { actor: "agent", kind: "request", status: "completed", startedAt: new Date("2026-08-19T15:00:00.000Z") }),
      linked("step", "updates", { actor: "agent", kind: "step", status: "completed", startedAt: new Date("2026-08-16T15:00:00.000Z") }),
    ],
  );

  const result = await useCase.execute({ artifactId: "note-1" }, actor);

  expect(result).toMatchObject({
    id: "note-1",
    name: "Pauta",
    type: "text",
    schemaVersion: 1,
    data: { body: "itens" },
    tags: ["time"],
    global: false,
    derived: false,
    revision: 1,
  });
  expect(result?.tasks).toEqual([
    {
      taskId: "first",
      relation: "creates",
      name: "first",
      actor: "human",
      kind: "common",
      startedAt: "2026-08-17T15:00:00.000Z",
      estimatedFinishAt: "2026-08-17T16:00:00.000Z",
    },
    { taskId: "later", relation: "uses", name: "later", actor: "human", kind: "common", startedAt: "2026-08-18T15:00:00.000Z" },
    { taskId: "request", relation: "updates", name: "request", actor: "agent", kind: "request", startedAt: "2026-08-19T15:00:00.000Z" },
    { taskId: "undated", relation: "uses", name: "undated", actor: "human", kind: "common" },
  ]);
});

test("a loose artifact has an empty list of tasks", async () => {
  const note = Artifact.create({ id: "note-1", userId: actor.userId, data: { body: "solta" } });

  expect((await useCaseOf([note]).execute({ artifactId: "note-1" }, actor))?.tasks).toEqual([]);
});

test("returns null when the artifact does not exist", async () => {
  expect(await useCaseOf([]).execute({ artifactId: "missing" }, actor)).toBeNull();
});

test("rejects reading an artifact that belongs to another user", async () => {
  const theirs = Artifact.create({ id: "theirs", userId: "someone-else", data: { body: "dele" } });

  await expect(useCaseOf([theirs]).execute({ artifactId: "theirs" }, actor)).rejects.toThrow(ArtifactOwnershipError);
});

test("a global artifact is read by anyone, without the tasks of the users that use it", async () => {
  const banana = Artifact.create({ id: "note-1", type: "food", name: "Banana", data: { description: "banana", items: [], totals } });
  const useCase = useCaseOf([banana], [linked("someone-elses-lunch", "uses", { userId: "someone-else" })]);

  const result = await useCase.execute({ artifactId: "note-1" }, actor);

  expect(result).toMatchObject({ id: "note-1", name: "Banana", global: true, data: { totals } });
  expect(result?.tasks).toEqual([]);
});

test("a derived copy is readable by its owner and says so", async () => {
  const original = Artifact.create({ type: "food", name: "Banana", data: { description: "banana", items: [], totals } });
  const copy = original.copyForTask(actor.userId, "2 unidades");

  const result = await useCaseOf([original, copy]).execute({ artifactId: copy.id }, actor);

  expect(result).toMatchObject({ derived: true, global: false, data: { quantity: "2 unidades" } });
});
