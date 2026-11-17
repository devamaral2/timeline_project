import { describe, expect, test } from "vitest";
import {
  Artifact,
  ArtifactNotFoundError,
  ArtifactOwnershipError,
  ArtifactRevisionConflictError,
  ArtifactValidationError,
  Task,
  TaskNotFoundError,
  TaskOwnershipError,
} from "../../domain";
import { InMemoryArtifactTaskLinkQuery } from "../../api-core/artifacts/testing/in-memory-artifact-task-link.query";
import { createTasksKit } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { UpdateArtifactUseCase } from "./update-artifact.usecase";

const actor = { userId: "auth-user-1" };
const startedAt = new Date("2026-08-17T15:00:00.000Z");
const zeroTotals = { totalCaloriesKcal: 0, totalProteinGrams: 0, totalCarbohydrateGrams: 0, totalFatGrams: 0, totalFiberGrams: 0 };
const rice = {
  id: "item-1",
  name: "Arroz",
  portion: "100 g",
  approximateWeightGrams: 100,
  caloriesKcal: 130,
  macronutrients: { carbohydratesGrams: 28, proteinsGrams: 2.7, totalFatGrams: 0.3, fiberGrams: 0.4 },
};
const agentFile = { path: "hermes/skills/agenda/SKILL.md", hash: "a".repeat(64), missing: false };

function note(id = "note-1", userId: string | undefined = actor.userId): Artifact {
  return Artifact.create({ id, userId, name: "Pauta", data: { body: "itens" }, tags: ["time"] });
}

function task(id: string, artifactIds: string[] = [], overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({
    id,
    userId: actor.userId,
    name: id,
    startedAt,
    artifactLinks: artifactIds.map((artifactId) => ({ artifactId, relation: "creates" as const, fromRecurrence: false })),
    ...overrides,
  });
}

function setup(artifacts: Artifact[], tasks: Task[] = []) {
  const kit = createTasksKit({ artifacts, tasks });
  const useCase = new UpdateArtifactUseCase(
    kit.artifactRepository,
    new InMemoryArtifactTaskLinkQuery(kit.database),
    kit.artifactBuilder,
    kit.taskRepository,
    kit.batchWriter,
  );
  return { ...kit, useCase };
}

describe("content", () => {
  test("edits the name and the tags, keeping the data", async () => {
    const { useCase, artifactRepository } = setup([note()]);

    await useCase.execute({ artifactId: "note-1", expectedRevision: 1, name: "  Pauta da semana ", tags: ["Trabalho"] }, actor);

    expect(await artifactRepository.findById("note-1")).toMatchObject({
      name: "Pauta da semana",
      tags: ["trabalho"],
      data: { body: "itens" },
      revision: 2,
    });
  });

  test("a blank name keeps the current one", async () => {
    const { useCase, artifactRepository } = setup([note()]);

    await useCase.execute({ artifactId: "note-1", expectedRevision: 1, name: "   ", tags: [] }, actor);

    expect(await artifactRepository.findById("note-1")).toMatchObject({ name: "Pauta", tags: [], revision: 2 });
  });

  test("replaces the whole data when it comes with its type", async () => {
    const { useCase, artifactRepository } = setup([note()]);

    await useCase.execute({ artifactId: "note-1", expectedRevision: 1, type: "text", data: { body: "itens revisados" } }, actor);

    expect(await artifactRepository.findById("note-1")).toMatchObject({ data: { body: "itens revisados" }, name: "Pauta", revision: 2 });
  });

  test("recalculates what is derived: the totals of a food with items", async () => {
    const food = Artifact.create({ id: "food-1", userId: actor.userId, type: "food", name: "Arroz", data: { description: "arroz", items: [], totals: zeroTotals } });
    const { useCase, artifactRepository } = setup([food]);

    await useCase.execute(
      { artifactId: "food-1", expectedRevision: 1, type: "food", data: { description: "arroz", items: [rice], totals: zeroTotals } },
      actor,
    );

    expect((await artifactRepository.findById("food-1"))?.data).toMatchObject({
      totals: { totalCaloriesKcal: 130, totalProteinGrams: 2.7, totalCarbohydrateGrams: 28, totalFatGrams: 0.3, totalFiberGrams: 0.4 },
    });
  });

  test("changes the type when the data of the new type comes along", async () => {
    const { useCase, artifactRepository } = setup([note()]);

    await useCase.execute({ artifactId: "note-1", expectedRevision: 1, type: "sleep", data: { trackedSleepTime: 420, score: 80 } }, actor);

    expect(await artifactRepository.findById("note-1")).toMatchObject({ type: "sleep", data: { trackedSleepTime: 420, score: 80 } });
  });

  test("a food being calculated cannot be edited by hand, and an edit cannot ask for a calculation", async () => {
    const pending = Artifact.create({
      id: "pending",
      userId: actor.userId,
      type: "food",
      name: "Almoço",
      data: { description: "arroz", items: [], totals: zeroTotals, generation: { status: "pending" } },
    });
    const plain = Artifact.create({ id: "plain", userId: actor.userId, type: "food", name: "Arroz", data: { description: "arroz", items: [], totals: zeroTotals } });
    const { useCase, batchWriter } = setup([pending, plain]);

    await expect(useCase.execute({ artifactId: "pending", expectedRevision: 1, name: "Outro" }, actor)).rejects.toThrow(
      "A food whose nutrients are being calculated cannot be manually edited",
    );
    await expect(
      useCase.execute(
        {
          artifactId: "plain",
          expectedRevision: 1,
          type: "food",
          data: { description: "arroz", items: [], totals: zeroTotals, generation: { status: "pending" } },
        },
        actor,
      ),
    ).rejects.toThrow("Only food creation can schedule the nutrient calculation");
    expect(batchWriter.commits).toEqual([]);
  });

  test("refuses invalid data without writing anything", async () => {
    const { useCase, artifactRepository, batchWriter } = setup([note()]);

    await expect(
      useCase.execute({ artifactId: "note-1", expectedRevision: 1, type: "text", data: { body: "" } }, actor),
    ).rejects.toThrow(ArtifactValidationError);
    expect((await artifactRepository.findById("note-1"))?.revision).toBe(1);
    expect(batchWriter.commits).toEqual([]);
  });
});

describe("tasks the artifact appears in", () => {
  test("absent, the tasks stay as they are", async () => {
    const { useCase, taskRepository } = setup([note()], [task("e1", ["note-1"])]);

    await useCase.execute({ artifactId: "note-1", expectedRevision: 1, name: "Outra" }, actor);

    expect(await taskRepository.findById("e1")).toMatchObject({ artifactLinks: [{ artifactId: "note-1" }], revision: 1 });
  });

  test("the list is complete: who enters gets the artifact as used, who leaves loses it, in the same batch as the content", async () => {
    const { useCase, taskRepository, artifactRepository, batchWriter } = setup(
      [note()],
      [task("stays", ["note-1"]), task("leaves", ["note-1"]), task("enters")],
    );

    await useCase.execute({ artifactId: "note-1", expectedRevision: 1, name: "Pauta nova", taskIds: ["stays", "enters", "enters"] }, actor);

    expect(batchWriter.commits).toHaveLength(1);
    expect(await taskRepository.findById("stays")).toMatchObject({ artifactLinks: [{ relation: "creates" }], revision: 1 });
    expect(await taskRepository.findById("leaves")).toMatchObject({ artifactLinks: [], revision: 2 });
    expect(await taskRepository.findById("enters")).toMatchObject({
      artifactLinks: [{ artifactId: "note-1", relation: "uses", fromRecurrence: false }],
      revision: 2,
    });
    expect(await artifactRepository.findById("note-1")).toMatchObject({ name: "Pauta nova", revision: 2 });
  });

  test("changing only the tasks does not revise the artifact", async () => {
    const { useCase, artifactRepository, taskRepository } = setup([note()], [task("e1", ["note-1"])]);

    await useCase.execute({ artifactId: "note-1", expectedRevision: 1, taskIds: [] }, actor);

    expect((await artifactRepository.findById("note-1"))?.revision).toBe(1);
    expect((await taskRepository.findById("e1"))?.artifactLinks).toEqual([]);
  });

  test("the requests to the agent that touched the artifact are not part of the list", async () => {
    const request = task("request", [], {
      actor: "agent",
      kind: "build_request",
      status: "done",
      artifactLinks: [{ artifactId: "note-1", relation: "updates", fromRecurrence: false }],
    });
    const { useCase, taskRepository } = setup([note()], [task("e1", ["note-1"]), request]);

    await useCase.execute({ artifactId: "note-1", expectedRevision: 1, taskIds: [] }, actor);

    expect((await taskRepository.findById("e1"))?.artifactLinks).toEqual([]);
    expect(await taskRepository.findById("request")).toMatchObject({ artifactLinks: [{ relation: "updates" }], revision: 1 });
  });

  test("an occurrence of a series that gains or loses the artifact is detached", async () => {
    const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
    const { useCase, taskRepository } = setup([note()], [task("e1", [], { occurrence })]);

    await useCase.execute({ artifactId: "note-1", expectedRevision: 1, taskIds: ["e1"] }, actor);

    expect((await taskRepository.findById("e1"))?.occurrence?.detached).toBe(true);
  });

  test("refuses a task that does not exist or belongs to someone else, writing nothing", async () => {
    const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", startedAt });
    const { useCase, artifactRepository, batchWriter } = setup([note()], [theirs]);

    await expect(
      useCase.execute({ artifactId: "note-1", expectedRevision: 1, name: "Nova", taskIds: ["missing"] }, actor),
    ).rejects.toThrow(TaskNotFoundError);
    await expect(useCase.execute({ artifactId: "note-1", expectedRevision: 1, taskIds: ["theirs"] }, actor)).rejects.toThrow(
      TaskOwnershipError,
    );
    expect((await artifactRepository.findById("note-1"))?.name).toBe("Pauta");
    expect(batchWriter.commits).toEqual([]);
  });
});

describe("nothing to do", () => {
  test("a request that changes nothing writes nothing", async () => {
    const { useCase, batchWriter, artifactRepository } = setup([note()], [task("e1", ["note-1"])]);

    await useCase.execute({ artifactId: "note-1", expectedRevision: 1 }, actor);
    await useCase.execute({ artifactId: "note-1", expectedRevision: 1, taskIds: ["e1"] }, actor);

    expect(batchWriter.commits).toEqual([]);
    expect((await artifactRepository.findById("note-1"))?.revision).toBe(1);
  });
});

describe("who and when", () => {
  test("rejects an artifact that does not exist", async () => {
    const { useCase } = setup([]);

    await expect(useCase.execute({ artifactId: "missing", expectedRevision: 1, name: "x" }, actor)).rejects.toThrow(
      ArtifactNotFoundError,
    );
  });

  test("rejects another user's artifact and a global one, before looking at the revision", async () => {
    const global = Artifact.create({ id: "global", type: "food", name: "Banana", data: { description: "banana", items: [], totals: zeroTotals } });
    const { useCase, batchWriter } = setup([note("theirs", "someone-else"), global]);

    await expect(useCase.execute({ artifactId: "theirs", expectedRevision: 99, name: "x" }, actor)).rejects.toThrow(
      ArtifactOwnershipError,
    );
    await expect(useCase.execute({ artifactId: "global", expectedRevision: 1, name: "Minha banana" }, actor)).rejects.toThrow(
      ArtifactOwnershipError,
    );
    expect(batchWriter.commits).toEqual([]);
  });

  test("rejects a stale revision before preparing or writing anything", async () => {
    const current = Artifact.rehydrate({
      id: "note-1",
      userId: actor.userId,
      name: "Pauta",
      type: "text",
      schemaVersion: 1,
      data: { body: "itens" },
      revision: 3,
      createdAt: startedAt,
      updatedAt: startedAt,
    });
    const { useCase, database, batchWriter } = setup([current], [task("e1")]);

    await expect(
      // O dado e a tarefa sao invalidos de proposito: o conflito de revisao vem antes de qualquer preparo.
      useCase.execute({ artifactId: "note-1", expectedRevision: 2, type: "text", data: { body: "" }, taskIds: ["missing"] }, actor),
    ).rejects.toThrow(ArtifactRevisionConflictError);
    await expect(useCase.execute({ artifactId: "note-1", expectedRevision: 2, taskIds: ["e1"] }, actor)).rejects.toThrow(
      "Expected revision 2 but found 3",
    );
    expect(database.artifacts[0]).toBe(current);
    expect(database.tasks[0]?.revision).toBe(1);
    expect(batchWriter.commits).toEqual([]);
  });

  test("skill and agent artifacts follow the files and cannot be edited, whatever the revision", async () => {
    const skill = Artifact.create({ id: "skill", userId: actor.userId, type: "skill", name: "Agenda", data: agentFile });
    const agent = Artifact.create({ id: "agent", userId: actor.userId, type: "agent", name: "Planner", data: { ...agentFile, path: "hermes/agents/planner.md" } });
    const { useCase, batchWriter } = setup([skill, agent], [task("e1")]);

    await expect(useCase.execute({ artifactId: "skill", expectedRevision: 1, name: "Outro" }, actor)).rejects.toThrow(
      "Skill and agent artifacts follow the files; ask Hermes to change the file",
    );
    await expect(useCase.execute({ artifactId: "agent", expectedRevision: 7, taskIds: ["e1"] }, actor)).rejects.toThrow(
      ArtifactValidationError,
    );
    expect(batchWriter.commits).toEqual([]);
  });

  test("router artifacts follow the JEV config and cannot be edited", async () => {
    const router = Artifact.create({ id: "router", userId: actor.userId, type: "router", name: "Rota", data: { body: "passos" } });
    const { useCase, artifactRepository } = setup([router]);

    await expect(
      useCase.execute({ artifactId: "router", expectedRevision: 1, type: "text", data: { body: "outros passos" } }, actor),
    ).rejects.toThrow("Router artifacts follow the JEV config and cannot be edited");
    expect((await artifactRepository.findById("router"))?.data).toEqual({ body: "passos" });
  });
});
