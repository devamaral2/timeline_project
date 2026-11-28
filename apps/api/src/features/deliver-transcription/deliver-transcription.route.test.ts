import { expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { TranscriptionLeaseLostError } from "../../api-core/transcription/transcription-requests";
import type { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { deliverTranscriptionRoute } from "./deliver-transcription.route";

const KEY = "gateway-key-with-at-least-32-characters";
const device = {
  "x-auth-gateway-key": KEY,
  "x-auth-user-id": "owner-1",
  "x-auth-device-key-id": "device-key-1",
  "x-auth-permissions": "transcription:work",
};

const result = {
  video: { title: "Um vídeo", channel: "Um canal", durationSeconds: 120, description: "", chapters: [] },
  source: "subtitles",
  segments: [{ startSeconds: 0, endSeconds: 4, speaker: "A", text: "olá" }],
  hotMoments: [],
  comments: [],
};

function setup(deliver: () => Promise<unknown>) {
  const app = createFastifyInstance();
  registerApiRoutes(app, [deliverTranscriptionRoute({ deliver } as unknown as TranscriptionWorkerUseCase)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
    logger: { warn() {}, error() {} },
  });
  return app;
}

async function post(app: ReturnType<typeof setup>, payload: unknown) {
  const response = await app.inject({
    method: "POST",
    url: "/api/transcription-worker/deliver",
    headers: { ...device, "content-type": "application/json" },
    payload: JSON.stringify(payload),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

test("POST /api/transcription-worker/deliver entrega o resultado e a identidade do serviço local", async () => {
  const deliver = vi.fn(async () => ({ requestId: "p1", status: "running" }));
  const app = setup(deliver);
  const body = { requestId: "p1", leaseToken: "lease-1", outcome: "completed", result };

  const response = await post(app, body);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ requestId: "p1", status: "running" });
  expect(deliver).toHaveBeenCalledWith(body, { userId: "owner-1", permissions: ["transcription:work"] });
  await app.close();
});

test("a falha com código fechado também é 200 com o estado do pedido", async () => {
  const deliver = vi.fn(async () => ({ requestId: "p1", status: "failed", code: "private" }));
  const app = setup(deliver);
  const body = { requestId: "p1", leaseToken: "lease-1", outcome: "failed", code: "private" };

  const response = await post(app, body);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ requestId: "p1", status: "failed", code: "private" });
  expect(deliver).toHaveBeenCalledWith(body, { userId: "owner-1", permissions: ["transcription:work"] });
  await app.close();
});

test.each([
  ["vazio", {}],
  ["com texto livre no lugar do código", { requestId: "p1", leaseToken: "lease-1", outcome: "failed", code: "boom do yt-dlp" }],
  ["concluído sem o resultado", { requestId: "p1", leaseToken: "lease-1", outcome: "completed" }],
  ["campo desconhecido", { requestId: "p1", leaseToken: "lease-1", outcome: "failed", code: "failed", extra: true }],
])("recusa o corpo %s com 400 sem chamar o caso de uso", async (_case, payload) => {
  const deliver = vi.fn(async () => ({ requestId: "p1", status: "running" }));
  const app = setup(deliver);

  const response = await post(app, payload);

  expect(response.status).toBe(400);
  expect(typeof (response.body as { error: string }).error).toBe("string");
  expect(deliver).not.toHaveBeenCalled();
  await app.close();
});

test("o lease perdido continua 409 com a mensagem que o serviço já conhece", async () => {
  const app = setup(async () => {
    throw new TranscriptionLeaseLostError();
  });

  const response = await post(app, { requestId: "p1", leaseToken: "lease-1", outcome: "failed", code: "failed" });

  expect(response.status).toBe(409);
  expect(response.body).toEqual({ error: "O lease do pedido de transcrição não vale mais" });
  await app.close();
});

test("a entrega só abre para a chave de dispositivo com a permissão de transcrição", async () => {
  const deliver = vi.fn(async () => ({ requestId: "p1", status: "running" }));
  const app = setup(deliver);
  const payload = JSON.stringify({ requestId: "p1", leaseToken: "lease-1", outcome: "failed", code: "failed" });

  const session = await app.inject({
    method: "POST",
    url: "/api/transcription-worker/deliver",
    headers: { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1", "content-type": "application/json" },
    payload,
  });
  expect(session.statusCode).toBe(403);

  const withoutPermission = await app.inject({
    method: "POST",
    url: "/api/transcription-worker/deliver",
    headers: { ...device, "x-auth-permissions": "task:manage", "content-type": "application/json" },
    payload,
  });
  expect(withoutPermission.statusCode).toBe(403);

  const anonymous = await app.inject({ method: "POST", url: "/api/transcription-worker/deliver" });
  expect(anonymous.statusCode).toBe(401);
  expect(deliver).not.toHaveBeenCalled();
  await app.close();
});
