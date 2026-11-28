import { afterEach, describe, expect, test, vi } from "vitest";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { AgentFileNotFoundError, type AgentFilesService } from "../../api-core/agent/config/agent-files.service";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { agentFileEditPrompt, requestAgentFileEditRoute } from "./request-agent-file-edit.route";

const KEY = "gateway-key-with-at-least-32-characters";
const OWNER = "owner-1";
const PATH = "hermes/agents/revisor.md";
const BODY = { path: PATH, request: "seja mais curto", clientMessageId: "edit-1" };

const headers = (userId: string) => ({ "x-auth-gateway-key": KEY, "x-auth-user-id": userId });

async function setup() {
  const read = vi.fn((path: string) => {
    if (path !== PATH) throw new AgentFileNotFoundError(path);
    return { path, text: "# revisor" };
  });
  const startHermes = vi.fn(async (input: { userId: string; text: string; clientMessageId: string }, actor: { userId: string }) => ({
    id: "request-1",
    userId: input.userId,
    route: "hermes",
    status: "preparing",
    text: input.text,
    actor: actor.userId,
  }));
  const app = createFastifyInstance();
  registerApiRoutes(
    app,
    [
      requestAgentFileEditRoute(
        { read } as unknown as Pick<AgentFilesService, "read">,
        { startHermes } as unknown as Pick<RequestOperations, "startHermes">,
      ),
    ],
    { authInternalServiceKey: KEY, idempotencyStore: new InMemoryIdempotencyStore() },
  );
  return { app, read, startHermes };
}

afterEach(() => vi.unstubAllEnvs());

describe("agentFileEditPrompt", () => {
  test("nomes o arquivo, leva o pedido e pede ao Hermes para avaliar o impacto antes de editar", () => {
    const text = agentFileEditPrompt("hermes/agents/revisor.md", "seja mais curto");
    expect(text).toContain("`hermes/agents/revisor.md`");
    expect(text).toContain("seja mais curto");
    expect(text).toMatch(/avalie o impacto/);
    expect(text).toMatch(/NÃO edite/);
  });
});

describe("POST /api/ai/config/edit-request", () => {
  test("o dono abre um pedido da rota do Hermes e recebe 202 com o pedido", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    vi.stubEnv("AI_AUTOMATION", "on");
    const { app, read, startHermes } = await setup();

    const response = await app.inject({ method: "POST", url: "/api/ai/config/edit-request", headers: headers(OWNER), payload: BODY });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ id: "request-1", route: "hermes" });
    expect(read).toHaveBeenCalledWith(PATH);
    expect(startHermes).toHaveBeenCalledWith(
      { userId: OWNER, text: agentFileEditPrompt(PATH, BODY.request), clientMessageId: BODY.clientMessageId },
      expect.objectContaining({ userId: OWNER }),
    );
    await app.close();
  });

  test("com a automacao desligada a rota e 404, como hoje", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    vi.stubEnv("AI_AUTOMATION", "off");
    const { app, read, startHermes } = await setup();

    const response = await app.inject({ method: "POST", url: "/api/ai/config/edit-request", headers: headers(OWNER), payload: BODY });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not Found" });
    expect(read).not.toHaveBeenCalled();
    expect(startHermes).not.toHaveBeenCalled();
    await app.close();
  });

  test("arquivo que nao existe e 404 sem abrir o pedido; corpo invalido e 400", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    vi.stubEnv("AI_AUTOMATION", "on");
    const { app, startHermes } = await setup();

    const missing = await app.inject({
      method: "POST",
      url: "/api/ai/config/edit-request",
      headers: headers(OWNER),
      payload: { ...BODY, path: "hermes/skills/b/SKILL.md" },
    });
    expect(missing.statusCode).toBe(404);

    for (const payload of [
      { ...BODY, request: "   " },
      { ...BODY, clientMessageId: "id com espaco" },
      { path: PATH, clientMessageId: "edit-1" },
      {},
    ]) {
      const response = await app.inject({ method: "POST", url: "/api/ai/config/edit-request", headers: headers(OWNER), payload });
      expect(response.statusCode, JSON.stringify(payload)).toBe(400);
    }
    expect(startHermes).not.toHaveBeenCalled();
    await app.close();
  });

  test("quem nao e o dono recebe 403 antes de qualquer leitura", async () => {
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", OWNER);
    vi.stubEnv("AI_AUTOMATION", "on");
    const { app, read, startHermes } = await setup();

    const response = await app.inject({
      method: "POST",
      url: "/api/ai/config/edit-request",
      headers: headers("someone-else"),
      payload: BODY,
    });

    expect(response.statusCode).toBe(403);
    expect(read).not.toHaveBeenCalled();
    expect(startHermes).not.toHaveBeenCalled();
    await app.close();
  });
});
