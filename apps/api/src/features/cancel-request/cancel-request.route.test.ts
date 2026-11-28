import { expect, test, vi } from "vitest";
import { InMemoryIdempotencyStore } from "../../http/idempotency/testing/in-memory-idempotency-store";
import { createFastifyInstance, registerApiRoutes } from "../../server/route-registrar";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import type { CancelTranscriptionUseCase } from "../request-transcription/cancel-transcription.usecase";
import { cancelRequestRoute } from "./cancel-request.route";

const KEY = "gateway-key-with-at-least-32-characters";
const session = { "x-auth-gateway-key": KEY, "x-auth-user-id": "owner-1" };

function setup(kind: string) {
  const order: string[] = [];
  const requests = {
    view: vi.fn(async () => ({ id: "r1", kind })),
    cancel: vi.fn(async () => {
      order.push("cancel");
      return { id: "r1", status: "cancelled" };
    }),
  };
  const transcription = {
    execute: vi.fn(async () => {
      order.push("transcription");
      return true;
    }),
  };
  const app = createFastifyInstance();
  registerApiRoutes(app, [
    cancelRequestRoute(requests as unknown as RequestOperations, transcription as unknown as CancelTranscriptionUseCase),
  ], {
    authInternalServiceKey: KEY,
    idempotencyStore: new InMemoryIdempotencyStore(),
  });
  return { app, requests, transcription, order };
}

async function post(app: Awaited<ReturnType<typeof setup>>["app"]) {
  const response = await app.inject({ method: "POST", url: "/api/requests/r1/cancel", headers: session });
  return { status: response.statusCode, body: response.body ? JSON.parse(response.body) : undefined };
}

test("POST /api/requests/:requestId/cancel responde 200 com o pedido cancelado", async () => {
  const { app, requests, order } = setup("request");

  const response = await post(app);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({ id: "r1", status: "cancelled" });
  expect(requests.cancel).toHaveBeenCalledWith("r1", { userId: "owner-1" });
  expect(order).toEqual(["cancel"]);
  await app.close();
});

test("o pedido de transcricao acerta o documento e a leitura antes de o pedido ser devolvido", async () => {
  const { app, transcription, order } = setup("save_content_with_transcription");

  await post(app);

  expect(transcription.execute).toHaveBeenCalledWith("r1", { userId: "owner-1" });
  expect(order).toEqual(["transcription", "cancel"]);
  await app.close();
});

test.each(["request", "save_content"])("o pedido do tipo %s so cancela o pedido", async (kind) => {
  const { app, requests, transcription } = setup(kind);

  await post(app);

  expect(transcription.execute).not.toHaveBeenCalled();
  expect(requests.cancel).toHaveBeenCalledWith("r1", { userId: "owner-1" });
  await app.close();
});
