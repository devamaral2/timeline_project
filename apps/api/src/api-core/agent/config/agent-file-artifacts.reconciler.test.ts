import { describe, expect, it } from "vitest";
import { Artifact, type AgentFileData } from "../../../domain";
import type { AgentFileEntry } from "./agent-files.service";
import { AgentFileArtifactsReconciler, agentFileArtifactName } from "./agent-file-artifacts.reconciler";

const hash = (char: string) => char.repeat(64);
const skill = (hashChar: string, missing = false, tags: string[] = [], description = ""): AgentFileEntry => ({
  path: "hermes/skills/devops/deploy/SKILL.md", kind: "skill", hash: hash(hashChar), missing, tags, description,
});
const agent: AgentFileEntry = { path: "hermes/agents/revisor.md", kind: "agent", hash: hash("b"), missing: false, tags: [], description: "" };

function setup(owner: string | null = "owner") {
  const stored: Artifact[] = [];
  const updates: number[] = [];
  const artifacts = {
    async save(artifact: Artifact) { stored.push(artifact); },
    async update(artifact: Artifact, _actor: string, expectedRevision: number) {
      updates.push(expectedRevision);
      stored.splice(stored.findIndex((item) => item.id === artifact.id), 1, artifact);
    },
    async listByUserId(userId: string, filter?: { types?: readonly string[] }) {
      return stored.filter((artifact) => artifact.userId === userId && (!filter?.types || filter.types.includes(artifact.type)));
    },
  };
  const listeners: Array<(entries: AgentFileEntry[]) => void> = [];
  let entries: AgentFileEntry[] = [];
  const files = { entries: () => entries, onReconciled: (listener: (entries: AgentFileEntry[]) => void) => { listeners.push(listener); } };
  const reconciler = new AgentFileArtifactsReconciler(files, artifacts, () => owner ?? undefined);
  return { reconciler, stored, updates, listeners, setEntries: (next: AgentFileEntry[]) => { entries = next; } };
}

describe("AgentFileArtifactsReconciler", () => {
  it("names a skill after its folder and an agent after its file", () => {
    expect(agentFileArtifactName(skill("a"))).toBe("deploy");
    expect(agentFileArtifactName(agent)).toBe("revisor");
  });

  it("creates one reference artifact per file, without the file text", async () => {
    const { reconciler, stored } = setup();
    await reconciler.sync([skill("a"), agent]);
    expect(stored.map((artifact) => [artifact.type, artifact.name, artifact.userId])).toEqual([
      ["skill", "deploy", "owner"], ["agent", "revisor", "owner"],
    ]);
    expect(stored[0]?.data).toEqual({ path: skill("a").path, hash: hash("a"), missing: false });
  });

  it("tags every artifact with its kind, including artifacts created before the tag existed", async () => {
    const created = setup();
    await created.reconciler.sync([skill("a"), agent]);
    expect(created.stored.map((artifact) => artifact.tags)).toEqual([["skill"], ["agent"]]);

    const legacy = setup();
    legacy.stored.push(Artifact.create({ userId: "owner", type: "skill", name: "deploy", data: { path: skill("a").path, hash: hash("a"), missing: false } }));
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

  it("keeps the file description in the artifact and refreshes it when it changes", async () => {
    const { reconciler, stored } = setup();
    await reconciler.sync([skill("a", false, [], "Publica a versao")]);
    expect(stored[0]?.data).toMatchObject({ description: "Publica a versao" });
    await reconciler.sync([skill("a", false, [], "Publica a versao em producao")]);
    expect(stored[0]?.data).toMatchObject({ description: "Publica a versao em producao" });
  });

  it("updates the artifact when the file changes or disappears, and does not duplicate it", async () => {
    const { reconciler, stored, updates } = setup();
    await reconciler.sync([skill("a")]);
    await reconciler.sync([skill("c")]);
    await reconciler.sync([skill("c", true)]);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.data as AgentFileData).toMatchObject({ hash: hash("c"), missing: true });
    expect(updates).toEqual([1, 2]);
  });

  it("skips files that are already missing and have no artifact", async () => {
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
