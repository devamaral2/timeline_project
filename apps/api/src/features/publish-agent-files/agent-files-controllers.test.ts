import "reflect-metadata";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AgentFileNotFoundError, type AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { ListAgentFileBackupsController } from "../list-agent-file-backups/list-agent-file-backups.controller";
import { ListAgentFilesController } from "../list-agent-files/list-agent-files.controller";
import { ReadAgentFileController } from "../read-agent-file/read-agent-file.controller";
import { ReloadAgentFilesController } from "../reload-agent-files/reload-agent-files.controller";
import { RestoreAgentFileController } from "../restore-agent-file/restore-agent-file.controller";
import { RestoreAgentFilesFactoryController } from "../restore-agent-files-factory/restore-agent-files-factory.controller";
import { PublishAgentFilesController } from "./publish-agent-files.controller";

const owner = { userId: "owner-1" };
const stranger = { userId: "someone-else" };

function service() {
  return {
    entries: vi.fn(() => []),
    read: vi.fn(() => {
      throw new AgentFileNotFoundError("x");
    }),
    listBackups: vi.fn(async () => []),
    publish: vi.fn(async () => []),
    restoreBackup: vi.fn(async () => []),
    restoreFactory: vi.fn(async () => []),
    reload: vi.fn(async () => undefined),
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("/api/ai/config (arquivos)", () => {
  test("every route requires the gateway identity", () => {
    for (const controller of [
      ListAgentFilesController,
      ReadAgentFileController,
      ListAgentFileBackupsController,
      PublishAgentFilesController,
      RestoreAgentFileController,
      RestoreAgentFilesFactoryController,
      ReloadAgentFilesController,
    ]) {
      const handler = Object.getOwnPropertyNames(controller.prototype).find((name) => name !== "constructor") as string;
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller.prototype[handler as keyof typeof controller.prototype]);
      expect(guards, controller.name).toContain(GatewayIdentityGuard);
    }
  });

  test("nobody but the configured owner gets through", async () => {
    const files = service();
    const asFiles = files as unknown as AgentFilesService;
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", "");
    expect(() => new ListAgentFilesController(asFiles).list(owner)).toThrow(ForbiddenException);
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", owner.userId);
    expect(() => new ListAgentFilesController(asFiles).list(stranger)).toThrow(ForbiddenException);
    await expect(new PublishAgentFilesController(asFiles).execute({}, stranger)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(new RestoreAgentFilesFactoryController(asFiles).execute(stranger)).rejects.toBeInstanceOf(ForbiddenException);
    expect(files.publish).not.toHaveBeenCalled();
    expect(files.restoreFactory).not.toHaveBeenCalled();
  });

  test("the owner reads, publishes and restores; a missing file is a 404 and a bad body a 400", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", owner.userId);
    const files = service();
    const asFiles = files as unknown as AgentFilesService;
    expect(new ListAgentFilesController(asFiles).list(owner)).toEqual({ files: [] });
    await expect(new ReadAgentFileController(asFiles).execute("api/skills.json", owner)).rejects.toBeInstanceOf(NotFoundException);
    await expect(new PublishAgentFilesController(asFiles).execute({ agents: 1, jevRouting: 1, prompts: 1, skills: 1 }, owner)).resolves.toEqual({ files: [] });
    await expect(new PublishAgentFilesController(asFiles).execute("nope", owner)).rejects.toBeInstanceOf(InvalidInputError);
    await expect(
      new RestoreAgentFileController(asFiles).execute({ path: "api/skills.json", backupId: "a.bak" }, owner),
    ).resolves.toEqual({ files: [] });
    expect(files.restoreBackup).toHaveBeenCalledWith("api/skills.json", "a.bak");
  });
});
