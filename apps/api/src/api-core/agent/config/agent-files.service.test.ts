import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentFileNotFoundError, AgentFilesService, parseFrontmatterDescription, parseFrontmatterTags } from "./agent-files.service";

let dir: string;
let service: AgentFilesService;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-files-"));
  service = new AgentFilesService(dir, { pollMs: 0, retention: 3 });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  service.stop();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

const SKILL = "hermes/skills/cafe/SKILL.md";

async function writeSkill(text: string, path = SKILL) {
  await mkdir(join(dir, path, ".."), { recursive: true });
  await writeFile(join(dir, path), text);
}

describe("AgentFilesService (pasta do Hermes)", () => {
  it("creates the folders and registers what is already there", async () => {
    await writeSkill("# cafe");
    await service.start();
    expect((await readdir(join(dir, "hermes"))).sort()).toEqual(["agents", "skills"]);
    expect(service.entries()).toEqual([
      expect.objectContaining({ path: SKILL, kind: "skill", missing: false }),
    ]);
    expect(service.read(SKILL).text).toBe("# cafe");
  });

  it("registers a new file, backs up an edit and flags a removal", async () => {
    await service.start();
    await writeSkill("# v1");
    await service.reload();
    expect(service.entries().map((entry) => entry.path)).toEqual([SKILL]);
    await writeSkill("# v2");
    await service.reload();
    const [backup] = await service.listBackups(SKILL);
    expect(await readFile(join(dir, ".backups", SKILL, backup!.id), "utf8")).toBe("# v1");
    await rm(join(dir, SKILL));
    await service.reload();
    expect(service.entries()[0]?.missing).toBe(true);
    expect(service.read(SKILL).text).toBe("# v2");
  });

  it("restores a backup, also after the file was removed, and keeps the replaced text as a backup", async () => {
    await service.start();
    await writeSkill("# v1");
    await service.reload();
    await writeSkill("# v2");
    await service.reload();
    const [first] = await service.listBackups(SKILL);
    await service.restoreBackup(SKILL, first!.id);
    expect(await readFile(join(dir, SKILL), "utf8")).toBe("# v1");
    expect((await service.listBackups(SKILL)).length).toBe(2);
    await rm(join(dir, SKILL));
    await service.reload();
    await service.restoreBackup(SKILL, first!.id);
    expect(await readFile(join(dir, SKILL), "utf8")).toBe("# v1");
    expect(service.entries()[0]?.missing).toBe(false);
  });

  it("keeps only the newest backups per file", async () => {
    await service.start();
    for (let i = 0; i < 6; i += 1) {
      await writeSkill(`# v${i}`);
      await service.reload();
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    expect(await service.listBackups(SKILL)).toHaveLength(3);
  });

  it("classifies agents, ignores non-markdown files and notifies listeners", async () => {
    await service.start();
    const seen = vi.fn();
    service.onReconciled(seen);
    await writeSkill("# revisor", "hermes/agents/revisor.md");
    await writeSkill("x", "hermes/skills/cafe/run.sh");
    await service.reload();
    expect(service.entries()).toEqual([expect.objectContaining({ path: "hermes/agents/revisor.md", kind: "agent" })]);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("tracks only SKILL.md in the skills folder and skips Hermes' own state", async () => {
    await service.start();
    await writeSkill("# cafe", "hermes/skills/web/cafe/SKILL.md");
    await writeSkill("# apoio", "hermes/skills/web/cafe/references/apoio.md");
    await writeSkill("# categoria", "hermes/skills/web/DESCRIPTION.md");
    await writeSkill("# oculto", "hermes/skills/.locks/SKILL.md");
    await service.reload();
    expect(service.entries().map((entry) => entry.path)).toEqual(["hermes/skills/web/cafe/SKILL.md"]);
  });

  it("rejects paths it does not track", async () => {
    await service.start();
    expect(() => service.read("../etc/passwd")).toThrow(AgentFileNotFoundError);
    await expect(service.listBackups("../../etc")).rejects.toBeInstanceOf(AgentFileNotFoundError);
    await writeSkill("# v1");
    await service.reload();
    await expect(service.restoreBackup(SKILL, "../../x.bak")).rejects.toBeInstanceOf(AgentFileNotFoundError);
  });
});

describe("parseFrontmatterTags", () => {
  it("reads tags from metadata, inline lists, block lists and plain text", () => {
    expect(parseFrontmatterTags("---\nname: x\nmetadata:\n  hermes:\n    tags: [DevOps, \"release\"]\n---\n# x")).toEqual(["devops", "release"]);
    expect(parseFrontmatterTags("---\ntags:\n  - a\n  - b # extra\nname: x\n---\n")).toEqual(["a", "b"]);
    expect(parseFrontmatterTags("---\ntags: a, b, a\n---\n")).toEqual(["a", "b"]);
  });

  it("returns nothing without a header or tags", () => {
    expect(parseFrontmatterTags("# so texto\ntags: x")).toEqual([]);
    expect(parseFrontmatterTags("---\nname: x\n---\n")).toEqual([]);
  });
});

describe("parseFrontmatterDescription", () => {
  it("reads a one-line, quoted and block description", () => {
    expect(parseFrontmatterDescription("---\nname: x\ndescription: Publica a versao\n---\n")).toBe("Publica a versao");
    expect(parseFrontmatterDescription("---\ndescription: \"Com aspas\"\n---\n")).toBe("Com aspas");
    expect(parseFrontmatterDescription("---\ndescription: >-\n  primeira linha\n  segunda linha\nname: x\n---\n")).toBe("primeira linha segunda linha");
  });

  it("returns an empty text without a header or description", () => {
    expect(parseFrontmatterDescription("# so texto")).toBe("");
    expect(parseFrontmatterDescription("---\nname: x\n---\n")).toBe("");
  });
  describe("write", () => {
    it("replaces the text, keeps a backup and tells the listeners", async () => {
      await writeSkill("# v1");
      await service.start();
      const heard = vi.fn();
      service.onReconciled(heard);
      const entries = await service.write(SKILL, "# v2");
      expect(await readFile(join(dir, SKILL), "utf8")).toBe("# v2");
      expect(service.read(SKILL).text).toBe("# v2");
      expect(entries[0]?.hash).not.toBe("");
      expect(heard).toHaveBeenCalledTimes(1);
      const backups = await service.listBackups(SKILL);
      expect(backups).toHaveLength(1);
      expect(await readFile(join(dir, ".backups", SKILL, backups[0]!.id), "utf8")).toBe("# v1");
    });

    it("does nothing when the text is the same", async () => {
      await writeSkill("# v1");
      await service.start();
      await service.write(SKILL, "# v1");
      expect(await service.listBackups(SKILL)).toHaveLength(0);
    });

    it("refuses unknown paths, paths outside the folder and files over the limit", async () => {
      await writeSkill("# v1");
      await service.start();
      await expect(service.write("hermes/skills/nova/SKILL.md", "x")).rejects.toBeInstanceOf(AgentFileNotFoundError);
      await expect(service.write("../../etc/passwd", "x")).rejects.toBeInstanceOf(AgentFileNotFoundError);
      await expect(service.write(SKILL, "x".repeat(256 * 1024 + 1))).rejects.toThrow(/256 KB/);
      expect(service.read(SKILL).text).toBe("# v1");
    });
  });
});
