import { describe, expect, it } from "vitest";
import { Note, type AgentFileNote } from "../../../domain";
import type { AgentFileEntry } from "./agent-files.service";
import { AgentFileNotesReconciler, agentFileNoteName } from "./agent-file-notes.reconciler";

const hash = (char: string) => char.repeat(64);
const skill = (hashChar: string, missing = false, tags: string[] = [], description = ""): AgentFileEntry => ({
  path: "hermes/skills/devops/deploy/SKILL.md", kind: "skill", hash: hash(hashChar), missing, tags, description,
});
const agent: AgentFileEntry = { path: "hermes/agents/revisor.md", kind: "agent", hash: hash("b"), missing: false, tags: [], description: "" };

function setup(owner: string | null = "owner") {
  const stored: Note[] = [];
  const updates: number[] = [];
  const notes = {
    async save(note: Note) { stored.push(note); },
    async update(note: Note, _actor: string, expectedRevision: number) {
      updates.push(expectedRevision);
      stored.splice(stored.findIndex((item) => item.id === note.id), 1, note);
    },
    async listByUserId(userId: string) { return stored.filter((note) => note.userId === userId); },
  };
  const listeners: Array<(entries: AgentFileEntry[]) => void> = [];
  let entries: AgentFileEntry[] = [];
  const files = { entries: () => entries, onReconciled: (listener: (entries: AgentFileEntry[]) => void) => { listeners.push(listener); } };
  const reconciler = new AgentFileNotesReconciler(files, notes, () => owner ?? undefined);
  return { reconciler, stored, updates, listeners, setEntries: (next: AgentFileEntry[]) => { entries = next; } };
}

describe("AgentFileNotesReconciler", () => {
  it("names a skill after its folder and an agent after its file", () => {
    expect(agentFileNoteName(skill("a"))).toBe("deploy");
    expect(agentFileNoteName(agent)).toBe("revisor");
  });

  it("creates one reference note per file, without the file text", async () => {
    const { reconciler, stored } = setup();
    await reconciler.sync([skill("a"), agent]);
    expect(stored.map((note) => [note.type, note.name, note.userId])).toEqual([
      ["skill", "deploy", "owner"], ["agent", "revisor", "owner"],
    ]);
    expect(stored[0]?.data).toEqual({ path: skill("a").path, hash: hash("a"), missing: false });
  });

  it("tags every note with its kind, including notes created before the tag existed", async () => {
    const created = setup();
    await created.reconciler.sync([skill("a"), agent]);
    expect(created.stored.map((note) => note.tags)).toEqual([["skill"], ["agent"]]);

    const legacy = setup();
    legacy.stored.push(Note.create({ userId: "owner", type: "skill", name: "deploy", data: { path: skill("a").path, hash: hash("a"), missing: false } }));
    await legacy.reconciler.sync([skill("a")]);
    expect(legacy.stored[0]?.tags).toEqual(["skill"]);
  });

  it("adds the usage tags from the file header to the kind tag, keeping tags the owner added", async () => {
    const { reconciler, stored } = setup();
    await reconciler.sync([skill("a", false, ["devops", "release"])]);
    expect(stored[0]?.tags).toEqual(["skill", "devops", "release"]);
    stored[0] = stored[0]!.revise({ tags: ["skill", "meu"] });
    await reconciler.sync([skill("a", false, ["devops", "release", "ci"])]);
    expect(stored[0]?.tags).toEqual(["skill", "meu", "devops", "release", "ci"]);
  });

  it("keeps the file description in the note and refreshes it when it changes", async () => {
    const { reconciler, stored } = setup();
    await reconciler.sync([skill("a", false, [], "Publica a versao")]);
    expect(stored[0]?.data).toMatchObject({ description: "Publica a versao" });
    await reconciler.sync([skill("a", false, [], "Publica a versao em producao")]);
    expect(stored[0]?.data).toMatchObject({ description: "Publica a versao em producao" });
  });

  it("updates the note when the file changes or disappears, and does not duplicate it", async () => {
    const { reconciler, stored, updates } = setup();
    await reconciler.sync([skill("a")]);
    await reconciler.sync([skill("c")]);
    await reconciler.sync([skill("c", true)]);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.data as AgentFileNote).toMatchObject({ hash: hash("c"), missing: true });
    expect(updates).toEqual([1, 2]);
  });

  it("skips files that are already missing and have no note", async () => {
    const { reconciler, stored } = setup();
    await reconciler.sync([skill("a", true)]);
    expect(stored).toHaveLength(0);
  });

  it("does nothing without an owner", async () => {
    const { reconciler, stored } = setup(null);
    await reconciler.sync([skill("a")]);
    expect(stored).toHaveLength(0);
  });

  it("start syncs the current files and follows later reads", async () => {
    const { reconciler, stored, listeners, setEntries } = setup();
    setEntries([skill("a")]);
    await reconciler.start();
    expect(stored).toHaveLength(1);
    listeners[0]?.([skill("a"), agent]);
    await reconciler.sync([skill("a"), agent]);
    expect(stored).toHaveLength(2);
  });
});
