import { expect, test } from "vitest";
import { Artifact, ArtifactValidationError, Task, TaskNotFoundError, TaskOwnershipError } from "../../domain";
import { createTasksKit, type TasksKitOptions } from "../../api-core/tasks/testing/in-memory-tasks-kit";
import { CreateArtifactUseCase } from "./create-artifact.usecase";

const actor = { userId: "auth-user-1" };
// 17/08/2026, 12:00 em Sao Paulo.
const now = new Date("2026-08-17T15:00:00.000Z");

function setup(options: TasksKitOptions = {}) {
  const kit = createTasksKit(options);
  const useCase = new CreateArtifactUseCase(kit.artifactBuilder, kit.taskRepository, kit.batchWriter, () => now);
  return { ...kit, useCase };
}

function task(id: string, overrides: Partial<Parameters<typeof Task.create>[0]> = {}): Task {
  return Task.create({ id, userId: actor.userId, name: id, startedAt: now, ...overrides });
}

test("creates a loose text artifact owned by the actor", async () => {
  const { useCase, artifactRepository, batchWriter } = setup();

  const { artifactId } = await useCase.execute({ data: { body: "Ideias\npara o quintal" }, tags: ["Casa"] }, actor);

  expect(await artifactRepository.findById(artifactId)).toMatchObject({
    id: artifactId,
    userId: "auth-user-1",
    type: "text",
    name: "Ideias",
    tags: ["casa"],
    data: { body: "Ideias\npara o quintal" },
    derived: false,
    revision: 1,
  });
  expect(batchWriter.commits).toHaveLength(1);
  expect(batchWriter.commits[0]?.tasks).toEqual([]);
});

test("a food is born pending, named after the meal of the hour", async () => {
  const { useCase, artifactRepository } = setup();

  const { artifactId } = await useCase.execute({ type: "food", data: { inputText: "arroz e feijão" } }, actor);

  const food = await artifactRepository.findById(artifactId);
  expect(food).toMatchObject({ type: "food", name: "Almoço" });
  expect(food?.data).toMatchObject({ description: "arroz e feijão", items: [], generation: { status: "pending" } });
});

test("the artifact is born appearing in the tasks asked, created by them, in the same batch", async () => {
  const other = { artifactId: "other", relation: "uses" as const, fromRecurrence: false };
  const { useCase, taskRepository, batchWriter } = setup({
    tasks: [task("e1", { artifactLinks: [other] }), task("e2"), task("untouched")],
    artifacts: [Artifact.create({ id: "other", userId: actor.userId, data: { body: "outra" } })],
  });

  const { artifactId } = await useCase.execute({ data: { body: "ata" }, taskIds: ["e1", "e2", "e1"] }, actor);

  const link = { artifactId, relation: "creates", fromRecurrence: false };
  expect(batchWriter.commits).toHaveLength(1);
  expect(await taskRepository.findById("e1")).toMatchObject({ artifactLinks: [other, link], revision: 2 });
  expect(await taskRepository.findById("e2")).toMatchObject({ artifactLinks: [link], revision: 2 });
  expect((await taskRepository.findById("untouched"))?.revision).toBe(1);
});

test("appearing in an occurrence of a series detaches it", async () => {
  const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
  const { useCase, taskRepository } = setup({ tasks: [task("e1", { occurrence })] });

  await useCase.execute({ data: { body: "so hoje" }, taskIds: ["e1"] }, actor);

  expect((await taskRepository.findById("e1"))?.occurrence?.detached).toBe(true);
});

test("the artifact is not born when a task does not exist or belongs to someone else", async () => {
  const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", startedAt: now });
  const { useCase, database, batchWriter } = setup({ tasks: [task("e1"), theirs] });

  await expect(useCase.execute({ data: { body: "x" }, taskIds: ["e1", "missing"] }, actor)).rejects.toThrow(TaskNotFoundError);
  await expect(useCase.execute({ data: { body: "x" }, taskIds: ["theirs"] }, actor)).rejects.toThrow(TaskOwnershipError);
  expect(database.artifacts).toEqual([]);
  expect(database.tasks.every((stored) => stored.revision === 1)).toBe(true);
  expect(batchWriter.commits).toEqual([]);
});

test("refuses invalid content before touching any task", async () => {
  const { useCase, database } = setup({ tasks: [task("e1")] });

  await expect(useCase.execute({ data: { body: "  " }, taskIds: ["e1"] }, actor)).rejects.toThrow(ArtifactValidationError);
  await expect(useCase.execute({ type: "food", data: { inputText: "" } }, actor)).rejects.toThrow(
    "Food description cannot be empty",
  );
  expect(database.artifacts).toEqual([]);
});

test.each([
  ["news", "Manchetes de hoje"],
  ["email_summary", "Três mensagens pedem resposta"],
  ["youtube_transcript", "Como montar um jardim"],
] as const)("a %s artifact is born with the type asked and the data of a text", async (type, title) => {
  const { useCase, artifactRepository } = setup();

  const { artifactId } = await useCase.execute({ type, data: { body: `${title}\n\nresto do texto` }, tags: ["Leitura"] }, actor);

  expect(await artifactRepository.findById(artifactId)).toMatchObject({
    userId: "auth-user-1",
    type,
    schemaVersion: 1,
    name: title,
    tags: ["leitura"],
    data: { body: `${title}\n\nresto do texto` },
    isGlobal: false,
  });
});

test.each(["news", "email_summary", "youtube_transcript"] as const)("an empty %s is refused like an empty text", async (type) => {
  const { useCase, database } = setup();

  await expect(useCase.execute({ type, data: { body: "  " } }, actor)).rejects.toThrow("Text artifact requires a body");
  expect(database.artifacts).toEqual([]);
});
