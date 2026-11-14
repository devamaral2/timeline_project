import { describe, expect, test } from "vitest";
import { Artifact, Event } from "../../domain";
import { InMemoryArtifactEventLinkQuery } from "../../api-core/artifacts/testing/in-memory-artifact-event-link.query";
import { InMemoryArtifactRepository } from "../../api-core/artifacts/testing/in-memory-artifact.repository";
import { InMemoryEventDatabase } from "../../api-core/events/testing/in-memory-event-database";
import { ListArtifactsUseCase, type ListArtifactsFilter } from "./list-artifacts.usecase";

const actor = { userId: "auth-user-1" };
const totals = { totalCaloriesKcal: 100, totalProteinGrams: 1, totalCarbohydrateGrams: 20, totalFatGrams: 0, totalFiberGrams: 1 };
const foodData = (description: string) => ({ description, items: [], totals });

/** `minute` da a ordem: quanto maior, mais recente a ultima edicao. */
function stored(id: string, minute: number, props: { userId?: string; type?: string; name?: string; data?: unknown; tags?: string[]; derived?: boolean }): Artifact {
  const type = props.type ?? "text";
  return Artifact.rehydrate({
    id,
    userId: "userId" in props ? props.userId : actor.userId,
    name: props.name ?? id,
    type,
    schemaVersion: 1,
    data: props.data ?? { body: `corpo de ${id}` },
    tags: props.tags,
    derived: props.derived,
    revision: 1,
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date(Date.UTC(2026, 7, 1, 10, minute)),
  });
}

function setup(artifacts: Artifact[], events: Event[] = []) {
  const database = new InMemoryEventDatabase(events, artifacts);
  const useCase = new ListArtifactsUseCase(new InMemoryArtifactRepository(database.artifacts), new InMemoryArtifactEventLinkQuery(database));
  const ids = async (filter?: ListArtifactsFilter, as = actor) => (await useCase.execute(filter, as)).map((artifact) => artifact.id);
  return { useCase, ids };
}

const library = () => [
  stored("note-old", 1, { name: "Compras", data: { body: "Tinta AZUL e pincel" }, tags: ["casa"] }),
  stored("food-rice", 2, { type: "food", name: "Arroz", data: foodData("arroz branco"), tags: ["casa", "base"] }),
  stored("sleep", 3, { type: "sleep", name: "Sono", data: { trackedSleepTime: 420, score: 80 } }),
  stored("note-new", 4, { name: "Ideias azuis", data: { body: "quintal" } }),
  stored("copy", 5, { type: "food", name: "Arroz", data: { ...foodData("arroz branco"), quantity: "1 prato" }, derived: true }),
  stored("theirs", 6, { userId: "someone-else", name: "Compras deles", tags: ["casa"] }),
  stored("global-banana", 7, { userId: undefined, type: "food", name: "Banana", data: foodData("banana prata"), tags: ["fruta"] }),
  stored("global-apple", 8, { userId: undefined, type: "food", name: "Abacate", data: foodData("abacate") }),
  stored("global-run", 9, { userId: undefined, type: "workout", name: "Corrida", data: { code: "running", category: "cardio" } }),
];

describe("the artifacts of the user", () => {
  test("lists them from the most recently edited to the oldest, without copies, globals or other users' artifacts", async () => {
    const { ids } = setup(library());

    expect(await ids()).toEqual(["note-new", "sleep", "food-rice", "note-old"]);
    expect(await ids({})).toEqual(["note-new", "sleep", "food-rice", "note-old"]);
    expect(await ids(undefined, { userId: "someone-else" })).toEqual(["theirs"]);
  });

  test("each one comes with the events it appears in, or an empty list", async () => {
    const lunch = Event.create({
      id: "lunch",
      userId: actor.userId,
      name: "Almoço",
      startedAt: new Date("2026-08-17T15:00:00.000Z"),
      artifactLinks: [{ artifactId: "food-rice", relation: "uses", fromRecurrence: false }],
    });
    const { useCase } = setup(library(), [lunch]);

    const artifacts = await useCase.execute(undefined, actor);

    expect(artifacts.find((artifact) => artifact.id === "food-rice")?.events).toEqual([
      {
        eventId: "lunch",
        relation: "uses",
        name: "Almoço",
        actor: "human",
        kind: "routine",
        startedAt: "2026-08-17T15:00:00.000Z",
        estimatedFinishAt: "2026-08-17T16:00:00.000Z",
      },
    ]);
    expect(artifacts.find((artifact) => artifact.id === "sleep")?.events).toEqual([]);
    expect(artifacts.find((artifact) => artifact.id === "food-rice")).toMatchObject({ global: false, derived: false, type: "food" });
  });

  test("filters by type", async () => {
    const { ids } = setup(library());

    expect(await ids({ type: "food" })).toEqual(["food-rice"]);
    expect(await ids({ type: "text" })).toEqual(["note-new", "note-old"]);
    expect(await ids({ type: "training" })).toEqual([]);
  });

  test("filters by tag", async () => {
    const { ids } = setup(library());

    expect(await ids({ tag: "casa" })).toEqual(["food-rice", "note-old"]);
    expect(await ids({ tag: "base" })).toEqual(["food-rice"]);
    expect(await ids({ tag: "fruta" })).toEqual([]);
  });

  test("searches the name of any artifact and the body of the texts, without case", async () => {
    const { ids } = setup(library());

    expect(await ids({ q: "azu" })).toEqual(["note-new", "note-old"]);
    expect(await ids({ q: "arroz" })).toEqual(["food-rice"]);
    // A descricao do alimento nao entra na busca: so o nome.
    expect(await ids({ q: "branco" })).toEqual([]);
    expect(await ids({ q: "quintal" })).toEqual(["note-new"]);
  });

  test("searches the body of a router artifact too", async () => {
    const { ids } = setup([stored("router", 1, { type: "router", name: "Rota", data: { body: "passo de triagem" } })]);

    expect(await ids({ q: "triagem" })).toEqual(["router"]);
  });

  test("filters by the event the artifacts appear in", async () => {
    const meeting = Event.create({
      id: "meeting",
      userId: actor.userId,
      name: "Reunião",
      startedAt: new Date("2026-08-17T15:00:00.000Z"),
      artifactLinks: [
        { artifactId: "note-old", relation: "creates", fromRecurrence: false },
        { artifactId: "sleep", relation: "uses", fromRecurrence: false },
      ],
    });
    const { ids } = setup(library(), [meeting]);

    expect(await ids({ eventId: "meeting" })).toEqual(["sleep", "note-old"]);
    expect(await ids({ eventId: "meeting", type: "text" })).toEqual(["note-old"]);
    expect(await ids({ eventId: "another" })).toEqual([]);
  });

  test("combines the filters and applies the limit last", async () => {
    const { ids } = setup(library());

    expect(await ids({ tag: "casa", q: "compras" })).toEqual(["note-old"]);
    expect(await ids({ limit: 2 })).toEqual(["note-new", "sleep"]);
    expect(await ids({ tag: "casa", limit: 1 })).toEqual(["food-rice"]);
  });
});

describe("`scope=global`", () => {
  test("lists the ownerless artifacts of one type, by name, for any user", async () => {
    const { ids, useCase } = setup(library());

    expect(await ids({ scope: "global", type: "food" })).toEqual(["global-apple", "global-banana"]);
    expect(await ids({ scope: "global", type: "workout" })).toEqual(["global-run"]);
    expect(await ids({ scope: "global", type: "food" }, { userId: "someone-else" })).toEqual(["global-apple", "global-banana"]);
    const [apple] = await useCase.execute({ scope: "global", type: "food" }, actor);
    expect(apple).toMatchObject({ name: "Abacate", global: true, derived: false, events: [] });
  });

  test("never mixes in the artifacts of the user, and has nothing for the types that cannot be global", async () => {
    const { ids } = setup(library());

    expect(await ids({ scope: "global", type: "text" })).toEqual([]);
    expect(await ids({ scope: "global" })).toEqual([]);
  });

  test("accepts the tag, search and limit filters", async () => {
    const { ids } = setup(library());

    expect(await ids({ scope: "global", type: "food", tag: "fruta" })).toEqual(["global-banana"]);
    expect(await ids({ scope: "global", type: "food", q: "aba" })).toEqual(["global-apple"]);
    expect(await ids({ scope: "global", type: "food", limit: 1 })).toEqual(["global-apple"]);
  });

  test("does not say which users' events use a global artifact", async () => {
    const lunch = Event.create({
      id: "lunch",
      userId: actor.userId,
      name: "Almoço",
      startedAt: new Date("2026-08-17T15:00:00.000Z"),
      artifactLinks: [{ artifactId: "global-banana", relation: "uses", fromRecurrence: false }],
    });
    const { useCase, ids } = setup(library(), [lunch]);

    const globals = await useCase.execute({ scope: "global", type: "food" }, { userId: "someone-else" });

    expect(globals.every((artifact) => artifact.events?.length === 0)).toBe(true);
    expect(await ids({ scope: "global", type: "food", eventId: "lunch" })).toEqual([]);
  });
});
