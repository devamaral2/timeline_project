import { afterEach, describe, expect, test, vi } from "vitest";
import { AgentFileNotFoundError, type AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { listAgentFileBackupsRoute } from "./list-agent-file-backups.route";

const KEY = "gateway-key-with-at-least-32-characters";
const OWNER = "owner-1";
const PATH = "hermes/skills/a/SKILL.md";

const headers = (userId: string) => ({ "x-auth-gateway-key": KEY, "x-auth-user-id": userId });

async function setup() {
  const listBackups = vi.fn(async (path: string) => {
    if (path !== PATH) throw new AgentFileNotFoundError(path);
    return [{ id: "20260101T000000000Z.bak", path, createdAt: new Date("2026-01-01T00:00:00Z"), sizeBytes: 4 }];
  });
  const app = createFastifyInstance();
  registerApiRoutes(app, [listAgentFileBackupsRoute({ listBackups } as unknown as Pick<AgentFilesService, "listBackups">)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, listBackups };
}

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/ai/config/backups", () => {
  test("o dono lista os backups do arquivo, do mais novo para o mais antigo", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app, listBackups } = await setup();

    const response = await app.inject({ method: "GET", url: `/api/ai/config/backups?path=${PATH}`, headers: headers(OWNER) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ backups: [expect.objectContaining({ id: "20260101T000000000Z.bak", path: PATH })] });
    expect(listBackups).toHaveBeenCalledWith(PATH);
    await app.close();
  });

  test("arquivo desconhecido e 404; caminho invalido e 400", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app } = await setup();

    const missing = await app.inject({ method: "GET", url: "/api/ai/config/backups?path=hermes/agents/x.md", headers: headers(OWNER) });
    expect(missing.statusCode).toBe(404);

    const invalid = await app.inject({ method: "GET", url: "/api/ai/config/backups", headers: headers(OWNER) });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });

  test("quem nao e o dono recebe 403 sem o servico ser chamado", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app, listBackups } = await setup();

    const response = await app.inject({ method: "GET", url: `/api/ai/config/backups?path=${PATH}`, headers: headers("someone-else") });

    expect(response.statusCode).toBe(403);
    expect(listBackups).not.toHaveBeenCalled();
    await app.close();
  });
});
