import { afterEach, describe, expect, test, vi } from "vitest";
import type { AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { listAgentFilesRoute } from "./list-agent-files.route";

const KEY = "gateway-key-with-at-least-32-characters";
const OWNER = "owner-1";

const headers = (userId: string) => ({ "x-auth-gateway-key": KEY, "x-auth-user-id": userId });

async function setup() {
  const entries = vi.fn(() => [{ path: "hermes/skills/a/SKILL.md", kind: "skill" as const, hash: "h", missing: false, tags: [], description: "a" }]);
  const app = createFastifyInstance();
  registerApiRoutes(app, [listAgentFilesRoute({ entries } as unknown as Pick<AgentFilesService, "entries">)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, entries };
}

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/ai/config (arquivos do Hermes)", () => {
  test("o dono lista as skills e os agentes sem o texto", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app, entries } = await setup();

    const response = await app.inject({ method: "GET", url: "/api/ai/config", headers: headers(OWNER) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ files: [expect.objectContaining({ path: "hermes/skills/a/SKILL.md" })] });
    expect(entries).toHaveBeenCalledTimes(1);
    await app.close();
  });

  test("quem nao e o dono recebe 403; sem dono configurado ninguem passa", async () => {
    const { app, entries } = await setup();

    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", "");
    const noOwner = await app.inject({ method: "GET", url: "/api/ai/config", headers: headers(OWNER) });
    expect(noOwner.statusCode).toBe(403);
    expect(noOwner.json()).toEqual({ error: "Só o dono altera a configuração do agente." });

    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const stranger = await app.inject({ method: "GET", url: "/api/ai/config", headers: headers("someone-else") });
    expect(stranger.statusCode).toBe(403);
    expect(entries).not.toHaveBeenCalled();
    await app.close();
  });

  test("sem a identidade do gateway a rota e 401", async () => {
    const { app } = await setup();

    const response = await app.inject({ method: "GET", url: "/api/ai/config" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Unauthorized" });
    await app.close();
  });
});
