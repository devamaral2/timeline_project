import { describe, expect, it } from "vitest";
import { Note } from "../../domain";
import { RouterNotesReconciler, jevRouterNotes } from "./jev-router-notes";

function setup(owner: string | null = "owner", specs = jevRouterNotes) {
  const stored: Note[] = [];
  const notes = {
    async save(note: Note) { stored.push(note); },
    async update(note: Note) { stored.splice(stored.findIndex((item) => item.id === note.id), 1, note); },
    async listByUserId(userId: string) { return stored.filter((note) => note.userId === userId); },
  };
  return { stored, reconciler: new RouterNotesReconciler(notes, () => owner ?? undefined, specs) };
}

describe("jevRouterNotes", () => {
  it("writes one note per JEV with its parameters and questions", () => {
    const specs = jevRouterNotes();
    expect(specs.map((spec) => spec.name)).toEqual(["JEV · Despacho", "JEV · Vínculo", "JEV · Candidatas de edição"]);
    expect(specs[0]?.body).toContain("Certeza mínima: 0.92");
    expect(specs[0]?.body).toContain("### `event_create`");
    expect(specs[1]?.body).toContain("Máximo de candidatas");
  });
});

describe("RouterNotesReconciler", () => {
  it("creates router notes owned by the owner, once", async () => {
    const { reconciler, stored } = setup();
    await reconciler.sync();
    await reconciler.sync();
    expect(stored.map((note) => [note.type, note.userId])).toEqual([["router", "owner"], ["router", "owner"], ["router", "owner"]]);
    expect(stored[0]?.tags).toEqual(["router", "jev", "despacho"]);
  });

  it("rewrites the text when the config changed", async () => {
    let body = "um";
    const spec = () => [{ name: "JEV · X", body, tags: ["jev"] }];
    const { reconciler, stored } = setup("owner", spec);
    await reconciler.sync();
    body = "dois";
    await reconciler.sync();
    expect(stored).toHaveLength(1);
    expect((stored[0]?.data as { body: string }).body).toBe("dois");
  });

  it("does nothing without an owner", async () => {
    const { reconciler, stored } = setup(null);
    await reconciler.sync();
    expect(stored).toHaveLength(0);
  });
});
