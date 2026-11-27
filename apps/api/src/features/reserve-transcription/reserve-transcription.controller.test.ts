import "reflect-metadata";
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import type { GatewayRequest } from "../../http/request-identity/gateway-identity.guard";
import { TranscriptionWorkerGuard } from "../../http/request-identity/transcription-worker.guard";
import { ReserveTranscriptionController } from "./reserve-transcription.controller";

const owner = { userId: "owner-1", permissions: ["transcription:work"] };
const GATEWAY_KEY = "gateway-key-with-at-least-32-characters";

function useCase(reserve: unknown) {
  return { reserve } as unknown as TranscriptionWorkerUseCase;
}

function response() {
  const calls: number[] = [];
  return {
    calls,
    res: { status: (code: number) => void calls.push(code) } as unknown as Parameters<ReserveTranscriptionController["execute"]>[1],
  };
}

describe("rota de reservar o próximo pedido", () => {
  test("sem pedido na fila responde 204 sem corpo", async () => {
    const { calls, res } = response();
    const controller = new ReserveTranscriptionController(useCase(vi.fn(async () => undefined)));

    await expect(controller.execute(owner, res)).resolves.toBeUndefined();
    expect(calls).toEqual([204]);
  });

  test("com pedido devolve a reserva", async () => {
    const reservation = { requestId: "p1", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", leaseToken: "l", leaseExpiresAt: "2026-08-17T15:05:00.000Z" };
    const { calls, res } = response();
    const controller = new ReserveTranscriptionController(useCase(vi.fn(async () => reservation)));

    await expect(controller.execute(owner, res)).resolves.toEqual(reservation);
    expect(calls).toEqual([]);
  });
});

describe("a chave sem a permissão de transcrição", () => {
  beforeEach(() => vi.stubEnv("AUTH_INTERNAL_SERVICE_KEY", GATEWAY_KEY));
  afterEach(() => vi.unstubAllEnvs());

  const contextWith = (headers: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ header: (name: string) => headers[name] }) as unknown as GatewayRequest }) }) as unknown as ExecutionContext;
  const session = { "x-auth-gateway-key": GATEWAY_KEY, "x-auth-user-id": "user-1", "x-auth-session-id": "session-1" };

  test("a rota só abre com a guarda da permissão, que recusa a sessão comum e a chave sem permissão", () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ReserveTranscriptionController.prototype.execute) as unknown[] | undefined;
    const classGuards = Reflect.getMetadata(GUARDS_METADATA, ReserveTranscriptionController) as unknown[] | undefined;
    expect([...(guards ?? []), ...(classGuards ?? [])]).toEqual([TranscriptionWorkerGuard]);

    const guard = new TranscriptionWorkerGuard();
    expect(() => guard.canActivate(contextWith(session))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith({ ...session, "x-auth-permissions": "task:manage" }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });
});
