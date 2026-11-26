import "reflect-metadata";
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import type { GatewayRequest } from "../../http/request-identity/gateway-identity.guard";
import { TranscriptionWorkerGuard } from "../../http/request-identity/transcription-worker.guard";
import { RenewTranscriptionLeaseController } from "./renew-transcription-lease.controller";

const owner = { userId: "owner-1", permissions: ["transcription:work"] };
const GATEWAY_KEY = "gateway-key-with-at-least-32-characters";

describe("rota de renovar o lease", () => {
  test("valida o corpo e entrega ao caso de uso", async () => {
    const renew = vi.fn(async () => ({ leaseExpiresAt: "2026-08-17T15:05:00.000Z" }));
    const controller = new RenewTranscriptionLeaseController({ renew } as unknown as TranscriptionWorkerUseCase);
    const body = { requestId: "p1", leaseToken: "l", stage: "download", percent: 10 };

    await expect(controller.execute(body, owner)).resolves.toEqual({ leaseExpiresAt: "2026-08-17T15:05:00.000Z" });
    expect(renew).toHaveBeenCalledWith(body, owner);
    expect(() => controller.execute({ ...body, percent: 101 }, owner)).toThrow(InvalidInputError);
  });
});

describe("a chave sem a permissão de transcrição", () => {
  beforeEach(() => vi.stubEnv("AUTH_INTERNAL_SERVICE_KEY", GATEWAY_KEY));
  afterEach(() => vi.unstubAllEnvs());

  const contextWith = (headers: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ header: (name: string) => headers[name] }) as unknown as GatewayRequest }) }) as unknown as ExecutionContext;
  const session = { "x-auth-gateway-key": GATEWAY_KEY, "x-auth-user-id": "user-1", "x-auth-session-id": "session-1" };

  test("a rota só abre com a guarda da permissão, que recusa a sessão comum e a chave sem permissão", () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RenewTranscriptionLeaseController.prototype.execute) as unknown[] | undefined;
    const classGuards = Reflect.getMetadata(GUARDS_METADATA, RenewTranscriptionLeaseController) as unknown[] | undefined;
    expect([...(guards ?? []), ...(classGuards ?? [])]).toEqual([TranscriptionWorkerGuard]);

    const guard = new TranscriptionWorkerGuard();
    expect(() => guard.canActivate(contextWith(session))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith({ ...session, "x-auth-permissions": "task:manage" }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });
});
