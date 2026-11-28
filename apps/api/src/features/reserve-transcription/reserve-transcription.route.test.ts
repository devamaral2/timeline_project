import { expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import type { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import { reserveTranscriptionRoute } from "./reserve-transcription.route";

const KEY = "gateway-key-with-at-least-32-characters";
const device = {
  "x-auth-gateway-key": KEY,
  "x-auth-user-id": "owner-1",
  "x-auth-device-key-id": "device-key-1",
  "x-auth-permissions": "transcription:work",
};

const reservation = {
  requestId: "p1",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  leaseToken: "lease-1",
  leaseExpiresAt: "2026-08-17T15:05:00.000Z",
};

function setup(reserve: () => Promise<unknown>) {
  const app = createFastifyInstance();
  registerApiRoutes(app, [reserveTranscriptionRoute({ reserve } as unknown as TranscriptionWorkerUseCase)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
    logger: { warn() {}, error() {} },
  });
  return app;
}

test("POST /api/transcription-worker/next responde 200 com o pedido reservado e a identidade do serviço local", async () => {
  const reserve = vi.fn(async () => reservation);
  const app = setup(reserve);

  const response = await app.inject({ method: "POST", url: "/api/transcription-worker/next", headers: device });

  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body)).toEqual(reservation);
  expect(reserve).toHaveBeenCalledWith({ userId: "owner-1", permissions: ["transcription:work"] });
  await app.close();
});

test("com a fila vazia responde 204 sem corpo nem content-type", async () => {
  const app = setup(async () => undefined);

  const response = await app.inject({ method: "POST", url: "/api/transcription-worker/next", headers: device });

  expect(response.statusCode).toBe(204);
  expect(response.body).toBe("");
  expect(response.headers["content-type"]).toBeUndefined();
  await app.close();
});

test("a sessão comum e a chave sem a permissão de transcrição são 403, e sem a chave é 401", async () => {
  const app = setup(async () => reservation);

  const session = await app.inject({
    method: "POST",
    url: "/api/transcription-worker/next",
    headers: { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" },
  });
  expect(session.statusCode).toBe(403);
  expect(JSON.parse(session.body)).toEqual({ error: "Forbidden" });

  const withoutPermission = await app.inject({
    method: "POST",
    url: "/api/transcription-worker/next",
    headers: { ...device, "x-auth-permissions": "task:manage" },
  });
  expect(withoutPermission.statusCode).toBe(403);

  const anonymous = await app.inject({ method: "POST", url: "/api/transcription-worker/next" });
  expect(anonymous.statusCode).toBe(401);
  await app.close();
});
