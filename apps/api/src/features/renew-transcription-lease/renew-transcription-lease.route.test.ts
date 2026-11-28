import { expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { TranscriptionLeaseLostError } from "../../api-core/transcription/transcription-requests";
import type { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import { renewTranscriptionLeaseRoute } from "./renew-transcription-lease.route";

const KEY = "gateway-key-with-at-least-32-characters";
const device = {
  "x-auth-gateway-key": KEY,
  "x-auth-user-id": "owner-1",
  "x-auth-device-key-id": "device-key-1",
  "x-auth-permissions": "transcription:work",
};
const body = { requestId: "p1", leaseToken: "lease-1", stage: "download", percent: 10 };

function setup(renew: () => Promise<unknown>) {
  const app = createFastifyInstance();
  registerApiRoutes(app, [renewTranscriptionLeaseRoute({ renew } as unknown as TranscriptionWorkerUseCase)], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
    logger: { warn() {}, error() {} },
  });
  return app;
}

async function post(app: ReturnType<typeof setup>, payload: unknown) {
  const response = await app.inject({
    method: "POST",
    url: "/api/transcription-worker/lease",
    headers: { ...device, "content-type": "application/json" },
    payload: JSON.stringify(payload),
  });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

test("POST /api/transcription-worker/lease valida o corpo e devolve o novo vencimento", async () => {
  const renew = vi.fn(async () => ({ leaseExpiresAt: "2026-08-17T15:05:00.000Z" }));
  const app = setup(renew);

  const response = await post(app, body);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ leaseExpiresAt: "2026-08-17T15:05:00.000Z" });
  expect(renew).toHaveBeenCalledWith(body, { userId: "owner-1", permissions: ["transcription:work"] });
  await app.close();
});

test.each([
  ["percent acima de 100", { ...body, percent: 101 }],
  ["etapa desconhecida", { ...body, stage: "dancing" }],
  ["sem o token do lease", { requestId: "p1", stage: "download", percent: 10 }],
  ["campo desconhecido", { ...body, extra: true }],
])("recusa o corpo %s com 400 sem chamar o caso de uso", async (_case, payload) => {
  const renew = vi.fn(async () => ({ leaseExpiresAt: "2026-08-17T15:05:00.000Z" }));
  const app = setup(renew);

  const response = await post(app, payload);

  expect(response.status).toBe(400);
  expect(typeof (response.body as { error: string }).error).toBe("string");
  expect(renew).not.toHaveBeenCalled();
  await app.close();
});

test("o lease perdido continua 409 com a mensagem que o serviço já conhece", async () => {
  const app = setup(async () => {
    throw new TranscriptionLeaseLostError();
  });

  const response = await post(app, body);

  expect(response.status).toBe(409);
  expect(response.body).toEqual({ error: "O lease do pedido de transcrição não vale mais" });
  await app.close();
});

test("a sessão comum e a chave sem a permissão de transcrição não renovam o lease", async () => {
  const renew = vi.fn(async () => ({ leaseExpiresAt: "2026-08-17T15:05:00.000Z" }));
  const app = setup(renew);

  const session = await app.inject({
    method: "POST",
    url: "/api/transcription-worker/lease",
    headers: { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1", "content-type": "application/json" },
    payload: JSON.stringify(body),
  });
  expect(session.statusCode).toBe(403);

  const withoutPermission = await app.inject({
    method: "POST",
    url: "/api/transcription-worker/lease",
    headers: { ...device, "x-auth-permissions": "task:manage", "content-type": "application/json" },
    payload: JSON.stringify(body),
  });
  expect(withoutPermission.statusCode).toBe(403);
  expect(renew).not.toHaveBeenCalled();
  await app.close();
});
