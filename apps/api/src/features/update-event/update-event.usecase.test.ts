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

  await useCase.execute({ eventId: "event-1", expectedRevision: 1, name: "Retrospectiva", status: "doing", tags: ["Time"] }, actor);

  expect(await eventRepository.findById("event-1")).toMatchObject({
    name: "Retrospectiva",
    status: "doing",
    tags: ["time"],
    revision: 2,
  });
});

test("null turns a tracked event back into a reference one", async () => {
  const { useCase, eventRepository } = setup({ events: [meeting({ status: "todo" })] });

  await useCase.execute({ eventId: "event-1", expectedRevision: 1, status: null }, actor);

  expect((await eventRepository.findById("event-1"))?.status).toBeUndefined();
});

test("the event, the edited and the new artifacts are written in one batch", async () => {
  const note = Artifact.create({ id: "note-1", userId: actor.userId, data: { body: "pauta" } });
  const event = meeting({ artifactLinks: [{ artifactId: "note-1", relation: "creates", fromRecurrence: false }] });
  const { useCase, eventRepository, artifactRepository, batchWriter, database } = setup({ events: [event], artifacts: [note] });

  await useCase.execute(
    {
      eventId: "event-1",
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

test("changing the parents edits the origin events in the same batch, and only them", async () => {
  const oldParent = Event.create({ id: "old", userId: actor.userId, name: "Antigo", status: "todo", subtaskIds: ["event-1"] });
  const newParent = Event.create({ id: "new", userId: actor.userId, name: "Novo", status: "todo" });
  const { useCase, eventRepository, batchWriter } = setup({ events: [meeting(), oldParent, newParent] });

  await useCase.execute({ eventId: "event-1", expectedRevision: 1, parentEventIds: ["new"] }, actor);

  expect(batchWriter.commits).toHaveLength(1);
  expect(await eventRepository.findById("old")).toMatchObject({ subtaskIds: [], revision: 2 });
  expect(await eventRepository.findById("new")).toMatchObject({ subtaskIds: ["event-1"], revision: 2 });
  expect(await eventRepository.findById("event-1")).toMatchObject({ parentIds: ["new"], revision: 2 });
});

test("editing an occurrence detaches it from its series", async () => {
  const occurrence = { recurrenceId: "rec-1", occurrenceOn: "2026-08-17", detached: false };
  const { useCase, eventRepository } = setup({ events: [meeting({ occurrence })] });

  await useCase.execute({ eventId: "event-1", expectedRevision: 1, status: "missed" }, actor);

  expect(await eventRepository.findById("event-1")).toMatchObject({ status: "missed", occurrence: { detached: true } });
});

test("rejects an event that does not exist", async () => {
  const { useCase } = setup({});

  await expect(useCase.execute({ eventId: "missing", expectedRevision: 1, name: "x" }, actor)).rejects.toThrow(EventNotFoundError);
});

test("rejects an event that belongs to another user, before looking at the revision", async () => {
  const { useCase, database, batchWriter } = setup({ events: [meeting()] });

  await expect(
    useCase.execute({ eventId: "event-1", expectedRevision: 99, name: "Invadido" }, { userId: "attacker-1" }),
  ).rejects.toThrow(EventOwnershipError);
  expect(database.events[0]?.name).toBe("Reunião");
  expect(batchWriter.commits).toEqual([]);
});

test("rejects a stale revision before preparing or writing anything", async () => {
  const stored = Event.rehydrate({ id: "event-1", userId: actor.userId, actor: "human", kind: "routine", name: "Reunião", startedAt, revision: 3 });
  const { useCase, database, batchWriter } = setup({ events: [stored] });

  await expect(
    // A lista de artefatos e invalida de proposito: o conflito de revisao vem antes de qualquer preparo.
    useCase.execute({ eventId: "event-1", expectedRevision: 2, name: "Atrasado", artifacts: [{ id: "missing" }] }, actor),
  ).rejects.toThrow(EventRevisionConflictError);
  await expect(useCase.execute({ eventId: "event-1", expectedRevision: 2 }, actor)).rejects.toThrow(
    "Expected revision 2 but found 3",
  );
  expect(database.events[0]).toBe(stored);
  expect(batchWriter.commits).toEqual([]);
});

test("writes nothing when the change is invalid", async () => {
  const { useCase, database, batchWriter } = setup({ events: [meeting()] });

  await expect(
    useCase.execute(
      { eventId: "event-1", expectedRevision: 1, artifacts: [{ type: "text", data: { body: "nova" } }], parentEventIds: ["missing"] },
      actor,
    ),
  ).rejects.toThrow(EventNotFoundError);
  expect(database.artifacts).toEqual([]);
  expect(database.events[0]?.revision).toBe(1);
  expect(batchWriter.commits).toEqual([]);
});

test("writes nothing when an origin event changed while the edit was being prepared", async () => {
  const parent = Event.create({ id: "parent", userId: actor.userId, name: "Projeto", status: "todo" });
  const kit = setup({ events: [meeting(), parent] });
  const findByIds = kit.eventRepository.findByIds.bind(kit.eventRepository);
  // Outra aba edita o evento maior logo depois de ele ser lido.
  kit.eventRepository.findByIds = async (ids) => {
    const found = await findByIds(ids);
    const [origin] = found;
    if (origin) await kit.eventRepository.update(origin.revise({ name: "Editado em outra aba" }), actor.userId, origin.revision);
    return found;
  };

  await expect(
    kit.useCase.execute({ eventId: "event-1", expectedRevision: 1, name: "Nova", parentEventIds: ["parent"] }, actor),
  ).rejects.toThrow(EntityBatchConflictError);

  expect(kit.database.events.find((event) => event.id === "event-1")).toMatchObject({ name: "Reunião", revision: 1 });
  expect(kit.database.events.find((event) => event.id === "parent")?.subtaskIds).toEqual([]);
});

test("an agent event cannot be edited", async () => {
  const request = Event.create({ id: "request", userId: actor.userId, actor: "agent", kind: "request", status: "running", name: "Pedido" });
  const { useCase } = setup({ events: [request] });

  await expect(useCase.execute({ eventId: "request", expectedRevision: 1, name: "Outro" }, actor)).rejects.toThrow(
    "An agent event cannot be edited",
  );
});
