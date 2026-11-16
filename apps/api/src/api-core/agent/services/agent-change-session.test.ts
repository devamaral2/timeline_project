import { describe, expect, test } from "vitest";
import { Task } from "../../../domain";
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

describe("sequenceTasks", () => {
  test("puts the next task after the previous one, revising neither, and answers with the task that gained a predecessor", async () => {
    const { session } = setup(human("a"), human("b"));

    const result = await session.sequenceTasks("a", "b");

    expect(result).toEqual({ ok: true, kind: "task", op: "update", id: "b" });
    const batch = session.toBatch();
    expect(batch.sequence).toEqual([{ op: "add", fromId: "a", toId: "b" }]);
    expect(batch.tasks).toEqual([]);
  });

  test("a agent task can be on either end of the sequence", async () => {
    const request = Task.create({ id: "request", userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
    const { session } = setup(human("a"), request);

    expect(await session.sequenceTasks("request", "a")).toMatchObject({ ok: true });
    expect(await session.sequenceTasks("a", "request")).toMatchObject({ ok: true });

    expect(session.toBatch().sequence).toEqual([
      { op: "add", fromId: "request", toId: "a" },
      { op: "add", fromId: "a", toId: "request" },
    ]);
    expect(session.toBatch().tasks).toEqual([]);
  });

  test("repeating the same link does not stage the edge twice", async () => {
    const { session } = setup(human("a"), human("b"));

    await session.sequenceTasks("a", "b");
    const again = await session.sequenceTasks("a", "b");

    expect(again).toMatchObject({ ok: true });
    expect(session.toBatch().sequence).toEqual([{ op: "add", fromId: "a", toId: "b" }]);
  });

  test("a task created in this session can be an end before it exists in the database", async () => {
    const { session } = setup(human("a"));
    const created = await session.createTask({ name: "Novo", status: "todo" });
    if (!created.ok) throw new Error(created.error);

    expect(await session.sequenceTasks("a", created.id)).toMatchObject({ ok: true, id: created.id });

    const batch = session.toBatch();
    expect(batch.tasks.map((change) => change.op)).toEqual(["create"]);
    expect(batch.sequence).toEqual([{ op: "add", fromId: "a", toId: created.id }]);
  });

  test("refuses a task that follows itself, one that does not exist and one that belongs to someone else", async () => {
    const theirs = Task.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
    const { session } = setup(human("a"), theirs);

    expect(await session.sequenceTasks("a", "a")).toMatchObject({ ok: false });
    expect(await session.sequenceTasks("a", "missing")).toMatchObject({ ok: false });
    expect(await session.sequenceTasks("theirs", "a")).toMatchObject({ ok: false });
    expect(session.toBatch().sequence).toEqual([]);
  });

  test("the staged sequence is committed with the batch and read back from both sides", async () => {
    const { session, batchWriter, taskRepository } = setup(human("a"), human("b"));

    await session.sequenceTasks("a", "b");
    await batchWriter.commit(session.toBatch());

    expect((await taskRepository.findById("b"))?.previousIds).toEqual(["a"]);
    expect((await taskRepository.findById("a"))?.nextIds).toEqual(["b"]);
    expect((await taskRepository.findById("a"))?.revision).toBe(1);
    expect((await taskRepository.findById("b"))?.revision).toBe(1);
  });
});
