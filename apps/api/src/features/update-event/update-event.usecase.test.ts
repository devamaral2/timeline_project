import { expect, test } from "vitest";
import {
  Artifact,
  EntityBatchConflictError,
  Event,
  EventNotFoundError,
  EventOwnershipError,
  EventRevisionConflictError,
} from "../../domain";
import { createEventsKit, type EventsKitOptions } from "../../api-core/events/testing/in-memory-events-kit";
import { UpdateEventUseCase } from "./update-event.usecase";

const actor = { userId: "auth-user-1" };
const startedAt = new Date("2026-08-17T15:00:00.000Z");

function setup(options: EventsKitOptions) {
  const kit = createEventsKit(options);
  const useCase = new UpdateEventUseCase(kit.eventRepository, kit.artifactRepository, kit.artifactBuilder, kit.batchWriter);
  return { ...kit, useCase };
}

function meeting(overrides: Partial<Parameters<typeof Event.create>[0]> = {}): Event {
  return Event.create({ id: "event-1", userId: actor.userId, name: "Reunião", startedAt, ...overrides });
}

test("updates the event and bumps its revision", async () => {
  const { useCase, eventRepository } = setup({ events: [meeting()] });

  await useCase.execute({ taskId: "event-1", expectedRevision: 1, name: "Retrospectiva", status: "doing", tags: ["Time"] }, actor);

  expect(await eventRepository.findById("event-1")).toMatchObject({
    name: "Retrospectiva",
    status: "doing",
    tags: ["time"],
    revision: 2,
  });
});

test("null turns a tracked event back into a reference one", async () => {
  const { useCase, eventRepository } = setup({ events: [meeting({ status: "todo" })] });

  await useCase.execute({ taskId: "event-1", expectedRevision: 1, status: null }, actor);

  expect((await eventRepository.findById("event-1"))?.status).toBeUndefined();
});

test("the event, the edited and the new artifacts are written in one batch", async () => {
  const note = Artifact.create({ id: "note-1", userId: actor.userId, data: { body: "pauta" } });
  const event = meeting({ artifactLinks: [{ artifactId: "note-1", relation: "creates", fromRecurrence: false }] });
  const { useCase, eventRepository, artifactRepository, batchWriter, database } = setup({ events: [event], artifacts: [note] });

  await useCase.execute(
    {
      taskId: "event-1",
      expectedRevision: 1,
      artifacts: [{ id: "note-1", type: "text", data: { body: "pauta revisada" } }, { type: "text", data: { body: "ata" } }],
    },
    actor,
  );

  const saved = await eventRepository.findById("event-1");
  expect(batchWriter.commits).toHaveLength(1);
  expect(database.artifacts).toHaveLength(2);
  expect(await artifactRepository.findById("note-1")).toMatchObject({ data: { body: "pauta revisada" }, revision: 2 });
  expect(saved?.artifactLinks.map((link) => link.relation)).toEqual(["creates", "creates"]);
  expect(saved?.artifactLinks[1]?.artifactId).toBe(database.artifacts[1]?.id);
  expect(saved?.revision).toBe(2);
});

test("changing the sequence writes the edges in the same batch and revises only the edited event", async () => {
  const oldBefore = Event.create({ id: "old", userId: actor.userId, name: "Antigo", status: "todo" });
  const newBefore = Event.create({ id: "new", userId: actor.userId, name: "Novo", status: "todo" });
  const after = Event.create({ id: "after", userId: actor.userId, name: "Depois", status: "todo" });
  const { useCase, eventRepository, batchWriter, database } = setup({ events: [meeting(), oldBefore, newBefore, after] });
  database.edges.push({ fromId: "old", toId: "event-1" });

  await useCase.execute({ taskId: "event-1", expectedRevision: 1, previousTaskIds: ["new"], nextTaskIds: ["after"] }, actor);

  expect(batchWriter.commits).toHaveLength(1);
  expect(batchWriter.commits[0]?.tasks.map((change) => change.op)).toEqual(["update"]);
  expect(batchWriter.commits[0]?.sequence).toEqual([
    { op: "add", fromId: "new", toId: "event-1" },
    { op: "remove", fromId: "old", toId: "event-1" },
    { op: "add", fromId: "event-1", toId: "after" },
  ]);
  expect(await eventRepository.findById("event-1")).toMatchObject({ previousIds: ["new"], nextIds: ["after"], revision: 2 });
  expect(await eventRepository.findById("old")).toMatchObject({ nextIds: [], revision: 1 });
  expect(await eventRepository.findById("new")).toMatchObject({ nextIds: ["event-1"], revision: 1 });
  expect(await eventRepository.findById("after")).toMatchObject({ previousIds: ["event-1"], revision: 1 });
});

test("an update without the lists keeps the sequence as it is", async () => {
  const before = Event.create({ id: "before", userId: actor.userId, name: "Antes", status: "todo" });
  const { useCase, eventRepository, batchWriter, database } = setup({ events: [meeting(), before] });
  database.edges.push({ fromId: "before", toId: "event-1" });

  await useCase.execute({ taskId: "event-1", expectedRevision: 1, name: "Outro nome" }, actor);

  expect(batchWriter.commits[0]?.sequence).toEqual([]);
  expect(await eventRepository.findById("event-1")).toMatchObject({ previousIds: ["before"], name: "Outro nome", revision: 2 });
});

test("repeating the same sequence is not a change of the sequence", async () => {
  const before = Event.create({ id: "before", userId: actor.userId, name: "Antes", status: "todo" });
  const { useCase, batchWriter, database } = setup({ events: [meeting(), before] });
  database.edges.push({ fromId: "before", toId: "event-1" });

  await useCase.execute({ taskId: "event-1", expectedRevision: 1, previousTaskIds: ["before"] }, actor);

  expect(batchWriter.commits[0]?.sequence).toEqual([]);
  expect(database.edges).toEqual([{ fromId: "before", toId: "event-1" }]);
});

test("an agent event can come before or after a human event, and is not revised", async () => {
  const request = Event.create({ id: "request", userId: actor.userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const { useCase, eventRepository, database } = setup({ events: [meeting(), request] });

  await useCase.execute({ taskId: "event-1", expectedRevision: 1, previousTaskIds: ["request"] }, actor);
  await useCase.execute({ taskId: "event-1", expectedRevision: 2, previousTaskIds: [], nextTaskIds: ["request"] }, actor);

  expect(database.edges).toEqual([{ fromId: "event-1", toId: "request" }]);
  expect(await eventRepository.findById("request")).toMatchObject({ previousIds: ["event-1"], revision: 1 });
});

test("refuses a sequence that closes a cycle, and the event is not revised", async () => {
  const other = Event.create({ id: "other", userId: actor.userId, name: "Outro", status: "todo" });
  const { useCase, database } = setup({ events: [meeting(), other] });
  database.edges.push({ fromId: "event-1", toId: "other" });

  await expect(
    useCase.execute({ taskId: "event-1", expectedRevision: 1, previousTaskIds: ["other"] }, actor),
  ).rejects.toThrow("Events cannot follow each other in a cycle");
});

test("refuses an event that follows itself", async () => {
  const { useCase, batchWriter } = setup({ events: [meeting()] });

  await expect(
    useCase.execute({ taskId: "event-1", expectedRevision: 1, nextTaskIds: ["event-1"] }, actor),
  ).rejects.toThrow("An event cannot follow itself");
  expect(batchWriter.commits).toEqual([]);
});

test("editing an occurrence detaches it from its series", async () => {
  const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
  const { useCase, eventRepository } = setup({ events: [meeting({ occurrence })] });

  await useCase.execute({ taskId: "event-1", expectedRevision: 1, status: "missed" }, actor);

  expect(await eventRepository.findById("event-1")).toMatchObject({ status: "missed", occurrence: { detached: true } });
});

test("rejects an event that does not exist", async () => {
  const { useCase } = setup({});

  await expect(useCase.execute({ taskId: "missing", expectedRevision: 1, name: "x" }, actor)).rejects.toThrow(EventNotFoundError);
});

test("rejects an event that belongs to another user, before looking at the revision", async () => {
  const { useCase, database, batchWriter } = setup({ events: [meeting()] });

  await expect(
    useCase.execute({ taskId: "event-1", expectedRevision: 99, name: "Invadido" }, { userId: "attacker-1" }),
  ).rejects.toThrow(EventOwnershipError);
  expect(database.events[0]?.name).toBe("Reunião");
  expect(batchWriter.commits).toEqual([]);
});

test("rejects a stale revision before preparing or writing anything", async () => {
  const stored = Event.rehydrate({ id: "event-1", userId: actor.userId, actor: "human", kind: "common", name: "Reunião", startedAt, revision: 3 });
  const { useCase, database, batchWriter } = setup({ events: [stored] });

  await expect(
    // A lista de artefatos e invalida de proposito: o conflito de revisao vem antes de qualquer preparo.
    useCase.execute({ taskId: "event-1", expectedRevision: 2, name: "Atrasado", artifacts: [{ id: "missing" }] }, actor),
  ).rejects.toThrow(EventRevisionConflictError);
  await expect(useCase.execute({ taskId: "event-1", expectedRevision: 2 }, actor)).rejects.toThrow(
    "Expected revision 2 but found 3",
  );
  expect(database.events[0]).toBe(stored);
  expect(batchWriter.commits).toEqual([]);
});

test("writes nothing when the change is invalid", async () => {
  const { useCase, database, batchWriter } = setup({ events: [meeting()] });

  await expect(
    useCase.execute(
      { taskId: "event-1", expectedRevision: 1, artifacts: [{ type: "text", data: { body: "nova" } }], previousTaskIds: ["missing"] },
      actor,
    ),
  ).rejects.toThrow(EventNotFoundError);
  expect(database.artifacts).toEqual([]);
  expect(database.events[0]?.revision).toBe(1);
  expect(batchWriter.commits).toEqual([]);
});

test("writes nothing, not even the sequence, when the edited event changed while it was being prepared", async () => {
  const before = Event.create({ id: "before", userId: actor.userId, name: "Antes", status: "todo" });
  const kit = setup({ events: [meeting(), before] });
  const findByIds = kit.eventRepository.findByIds.bind(kit.eventRepository);
  // Outra aba edita o proprio evento logo depois de a ponta nova ser lida.
  kit.eventRepository.findByIds = async (ids) => {
    const found = await findByIds(ids);
    const current = (await kit.eventRepository.findById("event-1")) as Event;
    await kit.eventRepository.update(current.revise({ name: "Editado em outra aba" }), actor.userId, current.revision);
    return found;
  };

  await expect(
    kit.useCase.execute({ taskId: "event-1", expectedRevision: 1, name: "Nova", previousTaskIds: ["before"] }, actor),
  ).rejects.toThrow(EntityBatchConflictError);

  expect(kit.database.events.find((event) => event.id === "event-1")).toMatchObject({ name: "Editado em outra aba", revision: 2 });
  expect(kit.database.edges).toEqual([]);
});

test("an agent event cannot be edited", async () => {
  const request = Event.create({ id: "request", userId: actor.userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const { useCase } = setup({ events: [request] });

  await expect(useCase.execute({ taskId: "request", expectedRevision: 1, name: "Outro" }, actor)).rejects.toThrow(
    "An agent event cannot be edited",
  );
});
