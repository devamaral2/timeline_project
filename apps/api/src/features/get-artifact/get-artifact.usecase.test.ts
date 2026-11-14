import { expect, test } from "vitest";
import { Artifact, ArtifactOwnershipError, Event } from "../../domain";
import { InMemoryArtifactEventLinkQuery } from "../../api-core/artifacts/testing/in-memory-artifact-event-link.query";
import { InMemoryArtifactRepository } from "../../api-core/artifacts/testing/in-memory-artifact.repository";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { GetArtifactUseCase } from "./get-artifact.usecase";

const actor = { userId: "auth-user-1" };
const totals = { totalCaloriesKcal: 89, totalProteinGrams: 1, totalCarbohydrateGrams: 23, totalFatGrams: 0, totalFiberGrams: 3 };

function useCaseOf(artifacts: Artifact[], events: Event[] = []) {
  const database = new InMemoryEventDatabase(events, artifacts);
  return new GetArtifactUseCase(new InMemoryArtifactRepository(database.artifacts), new InMemoryArtifactEventLinkQuery(database));
}

function linked(id: string, relation: "creates" | "uses" | "updates", overrides: Partial<Parameters<typeof Event.create>[0]> = {}): Event {
  return Event.create({
    id,
    userId: actor.userId,
    name: id,
    status: "todo",
    artifactLinks: [{ artifactId: "note-1", relation, fromRecurrence: false }],
    ...overrides,
  });
}

test("returns the artifact of the actor with the events it appears in, oldest first and undated last", async () => {
  const note = Artifact.create({ id: "note-1", userId: actor.userId, name: "Pauta", data: { body: "itens" }, tags: ["time"] });
  const useCase = useCaseOf(
    [note],
    [
      linked("undated", "uses"),
      linked("later", "uses", { startedAt: new Date("2026-08-18T15:00:00.000Z") }),
      linked("first", "creates", { startedAt: new Date("2026-08-17T15:00:00.000Z"), estimatedFinishAt: new Date("2026-08-17T16:00:00.000Z") }),
      linked("request", "updates", { actor: "agent", kind: "request", status: "done", startedAt: new Date("2026-08-19T15:00:00.000Z") }),
      linked("step", "updates", { actor: "agent", kind: "step", status: "done", startedAt: new Date("2026-08-16T15:00:00.000Z") }),
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
  expect(result?.events).toEqual([
    {
      eventId: "first",
      relation: "creates",
      name: "first",
      actor: "human",
      kind: "routine",
      startedAt: "2026-08-17T15:00:00.000Z",
      estimatedFinishAt: "2026-08-17T16:00:00.000Z",
    },
    { eventId: "later", relation: "uses", name: "later", actor: "human", kind: "routine", startedAt: "2026-08-18T15:00:00.000Z" },
    { eventId: "request", relation: "updates", name: "request", actor: "agent", kind: "request", startedAt: "2026-08-19T15:00:00.000Z" },
    { eventId: "undated", relation: "uses", name: "undated", actor: "human", kind: "routine" },
  ]);
});

test("a loose artifact has an empty list of events", async () => {
  const note = Artifact.create({ id: "note-1", userId: actor.userId, data: { body: "solta" } });

  expect((await useCaseOf([note]).execute({ artifactId: "note-1" }, actor))?.events).toEqual([]);
});

test("returns null when the artifact does not exist", async () => {
  expect(await useCaseOf([]).execute({ artifactId: "missing" }, actor)).toBeNull();
});

test("rejects reading an artifact that belongs to another user", async () => {
  const theirs = Artifact.create({ id: "theirs", userId: "someone-else", data: { body: "dele" } });

  await expect(useCaseOf([theirs]).execute({ artifactId: "theirs" }, actor)).rejects.toThrow(ArtifactOwnershipError);
});

test("a global artifact is read by anyone, without the events of the users that use it", async () => {
  const banana = Artifact.create({ id: "note-1", type: "food", name: "Banana", data: { description: "banana", items: [], totals } });
  const useCase = useCaseOf([banana], [linked("someone-elses-lunch", "uses", { userId: "someone-else" })]);

  const result = await useCase.execute({ artifactId: "note-1" }, actor);

  expect(result).toMatchObject({ id: "note-1", name: "Banana", global: true, data: { totals } });
  expect(result?.events).toEqual([]);
});

test("a derived copy is readable by its owner and says so", async () => {
  const original = Artifact.create({ type: "food", name: "Banana", data: { description: "banana", items: [], totals } });
  const copy = original.copyForEvent(actor.userId, "2 unidades");

  const result = await useCaseOf([original, copy]).execute({ artifactId: copy.id }, actor);

  expect(result).toMatchObject({ derived: true, global: false, data: { quantity: "2 unidades" } });
});
