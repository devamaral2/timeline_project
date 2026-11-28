import { expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { MAX_TRANSCRIPT_LENGTH } from "../../api-core/requests/voice-task-worker";
import { startVoiceRequestRoute } from "./start-voice-request.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "user-1" };

function setup() {
  const startVoice = vi.fn(async () => "request-1");
  const app = createFastifyInstance();
  registerApiRoutes(app, [startVoiceRequestRoute({ startVoice } as unknown as RequestOperations)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, startVoice };
}

async function post(app: Awaited<ReturnType<typeof setup>>["app"], payload: unknown) {
  const response = await app.inject({ method: "POST", url: "/api/requests/voice", headers: session, payload: payload as string });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

test("a fala, sem os espacos das pontas, vira um pedido e responde 202 com o requestId", async () => {
  const { app, startVoice } = setup();

  const response = await post(app, { transcript: "  comecei a estudar ", clientMessageId: "v1" });

  expect(response.status).toBe(202);
  expect(response.body).toEqual({ requestId: "request-1" });
  expect(startVoice).toHaveBeenCalledWith({ transcript: "comecei a estudar", clientMessageId: "v1" }, { userId: "user-1" });
  await app.close();
});

test.each([
  ["fala vazia", { transcript: "   " }],
  ["fala longa demais", { transcript: "a".repeat(MAX_TRANSCRIPT_LENGTH + 1) }],
  ["sem fala", {}],
  ["id de mensagem invalido", { transcript: "oi", clientMessageId: "bad id" }],
])("recusa %s com 400", async (_label, payload) => {
  const { app, startVoice } = setup();

  expect((await post(app, payload)).status).toBe(400);
  expect(startVoice).not.toHaveBeenCalled();
  await app.close();
});
