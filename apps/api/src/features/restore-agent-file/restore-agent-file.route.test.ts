import { afterEach, describe, expect, test, vi } from "vitest";
import { AgentFileNotFoundError, type AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { restoreAgentFileRoute } from "./restore-agent-file.route";

const KEY = "gateway-key-with-at-least-32-characters";
const OWNER = "owner-1";
const PATH = "hermes/skills/a/SKILL.md";
const BODY = { path: PATH, backupId: "20260101T000000000Z.bak" };

const headers = (userId: string) => ({ "x-auth-gateway-key": KEY, "x-auth-user-id": userId });

async function setup() {
  const restoreBackup = vi.fn(async (path: string, id: string) => {
    if (path !== PATH || id !== BODY.backupId) throw new AgentFileNotFoundError(id);
    return [{ path, kind: "skill" as const, hash: "h", missing: false, tags: [], description: "old" }];
  });
  const app = createFastifyInstance();
  registerApiRoutes(app, [restoreAgentFileRoute({ restoreBackup } as unknown as Pick<AgentFilesService, "restoreBackup">)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, restoreBackup };
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ai/config/restore", () => {
  test("o dono restaura um backup e recebe 201 com a listagem atualizada", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app, restoreBackup } = await setup();

    const response = await app.inject({ method: "POST", url: "/api/ai/config/restore", headers: headers(OWNER), payload: BODY });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ files: [expect.objectContaining({ description: "old" })] });
    expect(restoreBackup).toHaveBeenCalledWith(PATH, BODY.backupId);
    await app.close();
  });

  test("backup que nao existe e 404; corpo invalido e 400", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app, restoreBackup } = await setup();

    const missing = await app.inject({
      method: "POST",
      url: "/api/ai/config/restore",
      headers: headers(OWNER),
      payload: { ...BODY, backupId: "outro.bak" },
    });
    expect(missing.statusCode).toBe(404);

    for (const payload of [{}, { path: PATH }, { path: "", backupId: "a.bak" }, { path: 7, backupId: "a.bak" }]) {
      const response = await app.inject({ method: "POST", url: "/api/ai/config/restore", headers: headers(OWNER), payload });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(restoreBackup).toHaveBeenCalledTimes(1);
    await app.close();
  });

  test("quem nao e o dono recebe 403 sem restaurar", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app, restoreBackup } = await setup();

    const response = await app.inject({ method: "POST", url: "/api/ai/config/restore", headers: headers("someone-else"), payload: BODY });

    expect(response.statusCode).toBe(403);
    expect(restoreBackup).not.toHaveBeenCalled();
    await app.close();
  });
});
