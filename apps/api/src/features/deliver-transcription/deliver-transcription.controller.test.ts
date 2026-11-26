import "reflect-metadata";
import { type ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import type { GatewayRequest } from "../../http/request-identity/gateway-identity.guard";
import { TranscriptionWorkerGuard } from "../../http/request-identity/transcription-worker.guard";
import { DeliverTranscriptionController } from "./deliver-transcription.controller";

const owner = { userId: "owner-1", permissions: ["transcription:work"] };
const GATEWAY_KEY = "gateway-key-with-at-least-32-characters";

function useCase(deliver: unknown) {
  return { deliver } as unknown as TranscriptionWorkerUseCase;
}

describe("rota de entregar o resultado", () => {
  test.each([
    {},
    { requestId: "p1", leaseToken: "l", outcome: "failed", code: "boom do yt-dlp" },
    { requestId: "p1", leaseToken: "l", outcome: "completed" },
  ])("recusa o corpo %j sem chamar o caso de uso", (body) => {
    const deliver = vi.fn();
    const controller = new DeliverTranscriptionController(useCase(deliver));

    expect(() => controller.execute(body, owner)).toThrow(InvalidInputError);
    expect(deliver).not.toHaveBeenCalled();
  });

  test("com a falha, chama o caso de uso e devolve o resultado dele", async () => {
    const deliver = vi.fn(async () => ({ requestId: "p1", status: "failed", code: "private" }));
    const controller = new DeliverTranscriptionController(useCase(deliver));
    const body = { requestId: "p1", leaseToken: "l", outcome: "failed", code: "private" };

    await expect(controller.execute(body, owner)).resolves.toEqual({ requestId: "p1", status: "failed", code: "private" });
    expect(deliver).toHaveBeenCalledWith(body, owner);
  });
});

describe("a chave sem a permissão de transcrição", () => {
  beforeEach(() => vi.stubEnv("AUTH_INTERNAL_SERVICE_KEY", GATEWAY_KEY));
  afterEach(() => vi.unstubAllEnvs());

  const contextWith = (headers: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ header: (name: string) => headers[name] }) as unknown as GatewayRequest }) }) as unknown as ExecutionContext;
  const session = { "x-auth-gateway-key": GATEWAY_KEY, "x-auth-user-id": "user-1", "x-auth-session-id": "session-1" };

  test("a rota só abre com a guarda da permissão, que recusa a sessão comum e a chave sem permissão", () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, DeliverTranscriptionController.prototype.execute) as unknown[] | undefined;
    const classGuards = Reflect.getMetadata(GUARDS_METADATA, DeliverTranscriptionController) as unknown[] | undefined;
    expect([...(guards ?? []), ...(classGuards ?? [])]).toEqual([TranscriptionWorkerGuard]);

    const guard = new TranscriptionWorkerGuard();
    expect(() => guard.canActivate(contextWith(session))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith({ ...session, "x-auth-permissions": "task:manage" }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextWith({}))).toThrow(UnauthorizedException);
  });
});
