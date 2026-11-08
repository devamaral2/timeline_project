import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidInputError } from "../errors/agent.errors";
import { FACTORY_AGENT_CONFIG, activeAgentConfig, type AgentConfigDocuments } from "./agent-config";
import { API_FILES, AgentFileNotFoundError, AgentFilesService } from "./agent-files.service";

const KNOWN_SKILLS = Object.keys(FACTORY_AGENT_CONFIG.skills as Record<string, unknown>);
const factoryCopy = () => structuredClone(FACTORY_AGENT_CONFIG) as AgentConfigDocuments;

let dir: string;
let service: AgentFilesService;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "agent-files-"));
  service = new AgentFilesService(dir, KNOWN_SKILLS, { pollMs: 0, retention: 3 });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  service.stop();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

const editSkillsText = (documents: AgentConfigDocuments, text: string) => {
  const skills = documents.skills as Record<string, { description: string }>;
  const first = Object.keys(skills)[0] as string;
  (skills[first] as { description: string }).description = text;
  return first;
};

describe("AgentFilesService", () => {
  it("seeds the api files from the factory default on first start", async () => {
    await service.start();
    for (const path of Object.values(API_FILES)) {
      expect(JSON.parse(await readFile(join(dir, path), "utf8"))).toBeTruthy();
    }
    expect(service.entries().map((entry) => entry.path)).toEqual(Object.values(API_FILES).sort());
  });

  it("picks up a valid edit made on disk, and keeps the previous text as a backup", async () => {
    await service.start();
    const documents = factoryCopy();
    const name = editSkillsText(documents, "texto editado pelo Hermes");
    const before = await readFile(join(dir, API_FILES.skills), "utf8");
    await writeFile(join(dir, API_FILES.skills), JSON.stringify(documents.skills));
    await service.reload();
    expect(activeAgentConfig().skills[name]?.description).toBe("texto editado pelo Hermes");
    const backups = await service.listBackups(API_FILES.skills);
    expect(backups).toHaveLength(1);
    expect(await readFile(join(dir, ".backups", API_FILES.skills, backups[0]!.id), "utf8")).toBe(before);
  });

  it("undoes an invalid edit, keeps the bad text as rejected, and flags the file", async () => {
    await service.start();
    const good = await readFile(join(dir, API_FILES.prompts), "utf8");
    await writeFile(join(dir, API_FILES.prompts), "{ nao e json");
    await service.reload();
    expect(await readFile(join(dir, API_FILES.prompts), "utf8")).toBe(good);
    const entry = service.entries().find((candidate) => candidate.path === API_FILES.prompts);
    expect(entry?.rejection?.reason).toMatch(/JSON inválido/);
    expect((await service.listBackups(API_FILES.prompts)).map((backup) => backup.kind)).toEqual(["rejected"]);
  });

  it("refuses an edit that touches a pinned field", async () => {
    await service.start();
    const documents = factoryCopy();
    (documents.jevRouting as { model: string }).model = "outro/modelo";
    const good = await readFile(join(dir, API_FILES.jevRouting), "utf8");
    await writeFile(join(dir, API_FILES.jevRouting), JSON.stringify(documents.jevRouting));
    await service.reload();
    expect(await readFile(join(dir, API_FILES.jevRouting), "utf8")).toBe(good);
    expect(service.entries().find((entry) => entry.path === API_FILES.jevRouting)?.rejection).not.toBeNull();
  });

  it("publish validates, writes the files and backs up what was there", async () => {
    await service.start();
    const documents = factoryCopy();
    const name = editSkillsText(documents, "publicado pelo dono");
    await service.publish(documents);
    expect(activeAgentConfig().skills[name]?.description).toBe("publicado pelo dono");
    expect(await service.listBackups(API_FILES.skills)).toHaveLength(1);
    const broken = factoryCopy();
    (broken.agents as { limits: { maxSteps: number } }).limits.maxSteps = -1;
    await expect(service.publish(broken)).rejects.toBeInstanceOf(InvalidInputError);
  });

  it("restores a backup and the factory default", async () => {
    await service.start();
    const original = await readFile(join(dir, API_FILES.skills), "utf8");
    const documents = factoryCopy();
    const name = editSkillsText(documents, "outra coisa");
    await service.publish(documents);
    const [backup] = await service.listBackups(API_FILES.skills);
    await service.restoreBackup(API_FILES.skills, backup!.id);
    expect(await readFile(join(dir, API_FILES.skills), "utf8")).toBe(original);
    await service.publish(documents);
    await service.restoreFactory();
    expect(activeAgentConfig().skills[name]?.description).toBe(
      (FACTORY_AGENT_CONFIG.skills as Record<string, { description: string }>)[name]?.description,
    );
  });

  it("keeps only the newest backups per file", async () => {
    await service.start();
    for (let i = 0; i < 6; i += 1) {
      const documents = factoryCopy();
      editSkillsText(documents, `versao ${i}`);
      await service.publish(documents);
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    expect(await service.listBackups(API_FILES.skills)).toHaveLength(3);
  });

  it("tracks hermes files: new, edited (backup) and removed (restorable)", async () => {
    await service.start();
    const path = "hermes/skills/cafe/SKILL.md";
    await mkdir(join(dir, "hermes/skills/cafe"), { recursive: true });
    await writeFile(join(dir, path), "# cafe v1");
    await service.reload();
    expect(service.entries().find((entry) => entry.path === path)).toMatchObject({ scope: "hermes", kind: "skill" });
    await writeFile(join(dir, path), "# cafe v2");
    await service.reload();
    const [backup] = await service.listBackups(path);
    expect(await readFile(join(dir, ".backups", path, backup!.id), "utf8")).toBe("# cafe v1");
    await rm(join(dir, path));
    await service.reload();
    expect(service.entries().find((entry) => entry.path === path)?.missing).toBe(true);
    await service.restoreBackup(path, backup!.id);
    expect(await readFile(join(dir, path), "utf8")).toBe("# cafe v1");
  });

  it("classifies hermes agents and rejects paths it does not track", async () => {
    await service.start();
    await writeFile(join(dir, "hermes/agents/revisor.md"), "# revisor");
    await service.reload();
    expect(service.entries().find((entry) => entry.path === "hermes/agents/revisor.md")?.kind).toBe("agent");
    expect(() => service.read("../etc/passwd")).toThrow(AgentFileNotFoundError);
    await expect(service.listBackups("../../etc")).rejects.toBeInstanceOf(AgentFileNotFoundError);
    await expect(service.restoreBackup(API_FILES.skills, "../../x.bak")).rejects.toBeInstanceOf(AgentFileNotFoundError);
  });

  it("falls back to the factory default when the folder starts with a broken file", async () => {
    await mkdir(join(dir, "api"), { recursive: true });
    for (const path of Object.values(API_FILES)) await writeFile(join(dir, path), "{}");
    await service.start();
    expect(JSON.parse(await readFile(join(dir, API_FILES.agents), "utf8"))).toEqual(FACTORY_AGENT_CONFIG.agents);
    expect((await readdir(join(dir, ".backups", API_FILES.agents))).some((name) => name.endsWith(".rejected"))).toBe(true);
  });
});
