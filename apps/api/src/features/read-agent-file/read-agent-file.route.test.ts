import { afterEach, describe, expect, test, vi } from "vitest";
import { AgentFileNotFoundError, type AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { readAgentFileRoute } from "./read-agent-file.route";

const KEY = "gateway-key-with-at-least-32-characters";
const OWNER = "owner-1";
const PATH = "hermes/skills/a/SKILL.md";

const headers = (userId: string) => ({ "x-auth-gateway-key": KEY, "x-auth-user-id": userId });

async function setup() {
  const read = vi.fn((path: string) => {
    if (path !== PATH) throw new AgentFileNotFoundError(path);
    return { path, text: "# a" };
  });
  const app = createFastifyInstance();
  registerApiRoutes(app, [readAgentFileRoute({ read } as unknown as Pick<AgentFilesService, "read">)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, read };
}

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/ai/config/file", () => {
  test("o dono le o texto do arquivo pelo caminho da listagem", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app, read } = await setup();

    const response = await app.inject({ method: "GET", url: `/api/ai/config/file?path=${PATH}`, headers: headers(OWNER) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ path: PATH, text: "# a" });
    expect(read).toHaveBeenCalledWith(PATH);
    await app.close();
  });

  test("um arquivo que nao existe e 404 com a mensagem do servico", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app } = await setup();

    const response = await app.inject({ method: "GET", url: "/api/ai/config/file?path=hermes/skills/b/SKILL.md", headers: headers(OWNER) });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Arquivo ou backup não encontrado: hermes/skills/b/SKILL.md" });
    await app.close();
  });

  test("caminho ausente, vazio ou repetido e 400", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app, read } = await setup();

    for (const url of ["/api/ai/config/file", `/api/ai/config/file?path=${PATH}&path=${PATH}`]) {
      const response = await app.inject({ method: "GET", url, headers: headers(OWNER) });
      expect(response.statusCode, url).toBe(400);
    }
    expect(read).not.toHaveBeenCalled();
    await app.close();
  });

  test("quem nao e o dono recebe 403 sem o servico ser chamado", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    const { app, read } = await setup();

    const response = await app.inject({ method: "GET", url: `/api/ai/config/file?path=${PATH}`, headers: headers("someone-else") });

    expect(response.statusCode).toBe(403);
    expect(read).not.toHaveBeenCalled();
    await app.close();
  });
});
