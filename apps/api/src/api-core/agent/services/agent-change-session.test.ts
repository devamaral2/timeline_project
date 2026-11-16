import { describe, expect, test } from "vitest";
import { Event } from "../../../domain";
import { createEventsKit } from "../../events/testing/in-memory-events-kit";
import { AgentChangeSession } from "./agent-change-session";

const userId = "auth-user-1";

function human(id: string): Event {
  return Event.create({ id, userId, name: id, status: "todo" });
}

function setup(...events: Event[]) {
  const kit = createEventsKit({ events });
  const session = new AgentChangeSession(
    userId,
    { events: kit.eventRepository, artifacts: kit.artifactRepository },
    kit.createEvent,
  );
  return { ...kit, session };
}

describe("sequenceEvents", () => {
  test("puts the next event after the previous one, revising neither, and answers with the event that gained a predecessor", async () => {
    const { session } = setup(human("a"), human("b"));

    const result = await session.sequenceTasks("a", "b");

    expect(result).toEqual({ ok: true, kind: "task", op: "update", id: "b" });
    const batch = session.toBatch();
    expect(batch.sequence).toEqual([{ op: "add", fromId: "a", toId: "b" }]);
    expect(batch.tasks).toEqual([]);
  });

  test("an agent event can be on either end of the sequence", async () => {
    const request = Event.create({ id: "request", userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
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

  test("an event created in this session can be an end before it exists in the database", async () => {
    const { session } = setup(human("a"));
    const created = await session.createEvent({ name: "Novo", status: "todo" });
    if (!created.ok) throw new Error(created.error);

    expect(await session.sequenceTasks("a", created.id)).toMatchObject({ ok: true, id: created.id });

    const batch = session.toBatch();
    expect(batch.tasks.map((change) => change.op)).toEqual(["create"]);
    expect(batch.sequence).toEqual([{ op: "add", fromId: "a", toId: created.id }]);
  });

  test("refuses an event that follows itself, one that does not exist and one that belongs to someone else", async () => {
    const theirs = Event.create({ id: "theirs", userId: "someone-else", name: "Deles", status: "todo" });
    const { session } = setup(human("a"), theirs);

    expect(await session.sequenceTasks("a", "a")).toMatchObject({ ok: false });
    expect(await session.sequenceTasks("a", "missing")).toMatchObject({ ok: false });
    expect(await session.sequenceTasks("theirs", "a")).toMatchObject({ ok: false });
    expect(session.toBatch().sequence).toEqual([]);
  });

  test("the staged sequence is committed with the batch and read back from both sides", async () => {
    const { session, batchWriter, eventRepository } = setup(human("a"), human("b"));

    await session.sequenceTasks("a", "b");
    await batchWriter.commit(session.toBatch());

    expect((await eventRepository.findById("b"))?.previousIds).toEqual(["a"]);
    expect((await eventRepository.findById("a"))?.nextIds).toEqual(["b"]);
    expect((await eventRepository.findById("a"))?.revision).toBe(1);
    expect((await eventRepository.findById("b"))?.revision).toBe(1);
  });
});
