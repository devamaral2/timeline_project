import { describe, expect, test } from "vitest";
import { Artifact, Task } from "../../../domain";
import { createTasksKit } from "../../tasks/testing/in-memory-tasks-kit";
import { AgentChangeSession } from "./agent-change-session";

const userId = "auth-user-1";

function human(id: string): Task {
  return Task.create({ id, userId, name: id, status: "todo" });
}

function setup(...tasks: Task[]) {
  const kit = createTasksKit({ tasks });
  const session = new AgentChangeSession(
    userId,
    { tasks: kit.taskRepository, artifacts: kit.artifactRepository },
    kit.createTask,
  );
  return { ...kit, session };
}

describe("addSubtask", () => {
  test("puts the subtask under the main task, revising neither, and answers with the subtask", async () => {
    const { session } = setup(human("a"), human("b"));

    const result = await session.addSubtask("a", "b");

    expect(result).toEqual({ ok: true, kind: "task", op: "update", id: "b" });
    const batch = session.toBatch();
    expect(batch.subtasks).toEqual([{ op: "add", parentId: "a", subtaskId: "b" }]);
    expect(batch.tasks).toEqual([]);
  });

  test("a agent task can be on either end of the hierarchy", async () => {
    const request = Task.create({ id: "request", userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
    const { session } = setup(human("a"), human("b"), request);

    expect(await session.addSubtask("request", "a")).toMatchObject({ ok: true });
    expect(await session.addSubtask("b", "request")).toMatchObject({ ok: true });

    expect(session.toBatch().subtasks).toEqual([
      { op: "add", parentId: "request", subtaskId: "a" },
      { op: "add", parentId: "b", subtaskId: "request" },
    ]);
    expect(session.toBatch().tasks).toEqual([]);
  });

  test("repeating the same link does not stage the edge twice", async () => {
    const { session } = setup(human("a"), human("b"));

    await session.addSubtask("a", "b");
    const again = await session.addSubtask("a", "b");

    expect(again).toMatchObject({ ok: true });
    expect(session.toBatch().subtasks).toEqual([{ op: "add", parentId: "a", subtaskId: "b" }]);
  });

  test("a second main task for the same subtask in one request is refused: a task has a single main task", async () => {
    const { session } = setup(human("a"), human("b"), human("c"));

    await session.addSubtask("a", "c");
    const second = await session.addSubtask("b", "c");

    expect(second).toMatchObject({ ok: false });
    expect(session.toBatch().subtasks).toEqual([{ op: "add", parentId: "a", subtaskId: "c" }]);
  });

  test("a task created in this session can be an end before it exists in the database", async () => {
    const { session } = setup(human("a"));
    const created = await session.createTask({ name: "Novo", status: "todo" });
    if (!created.ok) throw new Error(created.error);

    expect(await session.addSubtask("a", created.id)).toMatchObject({ ok: true, id: created.id });

    const batch = session.toBatch();
    expect(batch.tasks.map((change) => change.op)).toEqual(["create"]);
    expect(batch.subtasks).toEqual([{ op: "add", parentId: "a", subtaskId: created.id }]);
  });

  test("refuses a task that is its own subtask, one that does not exist and one that belongs to someone else", async () => {
    const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
    const { session } = setup(human("a"), theirs);

    expect(await session.addSubtask("a", "a")).toMatchObject({ ok: false });
    expect(await session.addSubtask("a", "missing")).toMatchObject({ ok: false });
    expect(await session.addSubtask("theirs", "a")).toMatchObject({ ok: false });
    expect(session.toBatch().subtasks).toEqual([]);
  });

  test("the staged hierarchy is committed with the batch and read back from both sides", async () => {
    const { session, batchWriter, taskRepository } = setup(human("a"), human("b"));

    await session.addSubtask("a", "b");
    await batchWriter.commit(session.toBatch());

    expect((await taskRepository.findById("b"))?.parentId).toBe("a");
    expect((await taskRepository.findById("a"))?.subtaskIds).toEqual(["b"]);
    expect((await taskRepository.findById("a"))?.revision).toBe(1);
    expect((await taskRepository.findById("b"))?.revision).toBe(1);
  });
});

describe("updateArtifact", () => {
  test.each(["text", "news", "email_summary", "youtube_transcript"] as const)("rewrites the text of a %s artifact and keeps its type", async (type) => {
    const artifact = Artifact.create({ id: "art-1", userId, type, name: "Resumo", data: { body: "primeira versão" } });
    const kit = createTasksKit({ artifacts: [artifact] });
    const session = new AgentChangeSession(userId, { tasks: kit.taskRepository, artifacts: kit.artifactRepository }, kit.createTask);

    const result = await session.updateArtifact("art-1", { content: "versão corrigida", tags: ["leitura"] });

    expect(result).toEqual({ ok: true, kind: "artifact", op: "update", id: "art-1" });
    expect(session.toBatch().artifacts).toMatchObject([{ op: "update", expectedRevision: 1, entity: { id: "art-1", type, data: { body: "versão corrigida" }, tags: ["leitura"] } }]);
  });

  test("an artifact that is not free text does not take a new text", async () => {
    const sleep = Artifact.create({ id: "art-2", userId, type: "sleep", name: "Noite", data: { trackedSleepTime: 420, score: 80 } });
    const kit = createTasksKit({ artifacts: [sleep] });
    const session = new AgentChangeSession(userId, { tasks: kit.taskRepository, artifacts: kit.artifactRepository }, kit.createTask);

    const result = await session.updateArtifact("art-2", { content: "texto" });

    expect(result).toMatchObject({ ok: false });
    expect(JSON.stringify(result)).toContain("só artefatos de texto livre têm content");
    expect(session.toBatch().artifacts).toEqual([]);
  });
});
