import { expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { requestTranscriptionRoute } from "./request-transcription.route";
import type { RequestTranscriptionUseCase } from "./request-transcription.usecase";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" };
const body = { url: "https://youtu.be/dQw4w9WgXcQ" };

function setup() {
  const execute = vi.fn(async () => ({ requestId: "r1", taskId: "t1", artifactId: "a1", created: true }));
  const app = createFastifyInstance();
  registerApiRoutes(app, [requestTranscriptionRoute({ execute } as unknown as RequestTranscriptionUseCase)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
    logger: { warn() {}, error() {} },
  });
  return { app, execute };
}

async function post(app: ReturnType<typeof setup>["app"], payload: unknown) {
  const response = await app.inject({
    method: "POST",
    url: "/api/tasks/transcription-requests",
    headers: { ...session, "content-type": "application/json" },
    payload: JSON.stringify(payload),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

test("POST /api/tasks/transcription-requests entrega o link e a identidade ao caso de uso", async () => {
  const { app, execute } = setup();

  const response = await post(app, body);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ requestId: "r1", taskId: "t1", artifactId: "a1", created: true });
  expect(execute).toHaveBeenCalledWith(body, { userId: "owner-1" });
  await app.close();
});

test.each([
  ["sem url", {}],
  ["url vazia", { url: "" }],
  ["url que não é http", { url: "javascript:alert(1)" }],
  ["campo desconhecido", { ...body, extra: true }],
])("recusa o corpo %s com 400 sem chamar o caso de uso", async (_case, payload) => {
  const { app, execute } = setup();

  const response = await post(app, payload);

  expect(response.status).toBe(400);
  expect(typeof (response.body as { error: string }).error).toBe("string");
  expect(execute).not.toHaveBeenCalled();
  await app.close();
});
