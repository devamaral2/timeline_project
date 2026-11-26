import "reflect-metadata";
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { TranscriptionWorkerGuard } from "../../http/request-identity/transcription-worker.guard";
import type { GatewayRequest } from "../../http/request-identity/gateway-identity.guard";
import { TranscriptionWorkerController } from "./transcription-worker.controller";
import type { TranscriptionWorkerUseCase } from "./transcription-worker.usecase";

const owner = { userId: "owner-1", permissions: ["transcription:work"] };
const GATEWAY_KEY = "gateway-key-with-at-least-32-characters";

function useCase(overrides: Partial<Record<"reserve" | "renew" | "deliver", unknown>> = {}) {
  return { reserve: vi.fn(), renew: vi.fn(), deliver: vi.fn(), ...overrides } as unknown as TranscriptionWorkerUseCase;
}

function response() {
  const calls: number[] = [];
  return { calls, res: { status: (code: number) => void calls.push(code) } as unknown as Parameters<TranscriptionWorkerController["next"]>[1] };
}

describe("rotas do serviço local de transcrição", () => {
  test("reservar: sem pedido na fila responde 204 sem corpo", async () => {
    const { calls, res } = response();
    const controller = new TranscriptionWorkerController(useCase({ reserve: vi.fn(async () => undefined) }));

    await expect(controller.next(owner, res)).resolves.toBeUndefined();
    expect(calls).toEqual([204]);
  });

  test("reservar: com pedido devolve a reserva", async () => {
    const reservation = { requestId: "p1", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", leaseToken: "l", leaseExpiresAt: "2026-08-17T15:05:00.000Z" };
    const { calls, res } = response();
    const controller = new TranscriptionWorkerController(useCase({ reserve: vi.fn(async () => reservation) }));

    await expect(controller.next(owner, res)).resolves.toEqual(reservation);
    expect(calls).toEqual([]);
  });

  test("renovar: valida o corpo e entrega ao caso de uso", async () => {
    const renew = vi.fn(async () => ({ leaseExpiresAt: "2026-08-17T15:05:00.000Z" }));
    const controller = new TranscriptionWorkerController(useCase({ renew }));
    const body = { requestId: "p1", leaseToken: "l", stage: "download", percent: 10 };

    await expect(controller.lease(body, owner)).resolves.toEqual({ leaseExpiresAt: "2026-08-17T15:05:00.000Z" });
    expect(renew).toHaveBeenCalledWith(body, owner);
    expect(() => controller.lease({ ...body, percent: 101 }, owner)).toThrow(InvalidInputError);
  });

  test.each([
    {},
    { requestId: "p1", leaseToken: "l", outcome: "failed", code: "boom do yt-dlp" },
    { requestId: "p1", leaseToken: "l", outcome: "completed" },
  ])("entregar: recusa o corpo %j sem chamar o caso de uso", (body) => {
    const deliver = vi.fn();
    const controller = new TranscriptionWorkerController(useCase({ deliver }));

    expect(() => controller.deliver(body, owner)).toThrow(InvalidInputError);
    expect(deliver).not.toHaveBeenCalled();
  });

  test("entregar: com a falha, chama o caso de uso e devolve o resultado dele", async () => {
    const deliver = vi.fn(async () => ({ requestId: "p1", status: "failed", code: "private" }));
    const controller = new TranscriptionWorkerController(useCase({ deliver }));
    const body = { requestId: "p1", leaseToken: "l", outcome: "failed", code: "private" };

    await expect(controller.deliver(body, owner)).resolves.toEqual({ requestId: "p1", status: "failed", code: "private" });
    expect(deliver).toHaveBeenCalledWith(body, owner);
  });
});

describe("a chave sem a permissão de transcrição", () => {
  beforeEach(() => vi.stubEnv("AUTH_INTERNAL_SERVICE_KEY", GATEWAY_KEY));
  afterEach(() => vi.unstubAllEnvs());

  const contextWith = (headers: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ header: (name: string) => headers[name] }) as unknown as GatewayRequest }) }) as unknown as ExecutionContext;
  const session = { "x-auth-gateway-key": GATEWAY_KEY, "x-auth-user-id": "user-1", "x-auth-session-id": "session-1" };

  test.each(["next", "lease", "deliver"] as const)("a rota %s só abre com a guarda da permissão, que recusa a sessão comum e a chave sem permissão", (route) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, TranscriptionWorkerController.prototype[route]) as unknown[] | undefined;
    const classGuards = Reflect.getMetadata(GUARDS_METADATA, TranscriptionWorkerController) as unknown[] | undefined;
    expect([...(guards ?? []), ...(classGuards ?? [])]).toEqual([TranscriptionWorkerGuard]);

    const guard = new TranscriptionWorkerGuard();
    expect(() => guard.canActivate(contextWith(session))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith({ ...session, "x-auth-permissions": "task:manage" }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });
});
