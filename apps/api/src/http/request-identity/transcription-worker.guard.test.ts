import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GatewayIdentityGuard, type GatewayRequest } from "./gateway-identity.guard";
import { TranscriptionWorkerGuard } from "./transcription-worker.guard";

const GATEWAY_KEY = "gateway-key-with-at-least-32-characters";

function contextWith(headers: Record<string, string>) {
  const request = { header: (name: string) => headers[name] } as unknown as GatewayRequest;
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { request, context };
}

const session = { "x-auth-gateway-key": GATEWAY_KEY, "x-auth-user-id": "user-1", "x-auth-session-id": "session-1" };
const deviceKey = { "x-auth-gateway-key": GATEWAY_KEY, "x-auth-user-id": "user-1", "x-auth-permissions": "transcription:work", "x-auth-device-key-id": "key-1" };

beforeEach(() => vi.stubEnv("AUTH_INTERNAL_SERVICE_KEY", GATEWAY_KEY));
afterEach(() => vi.unstubAllEnvs());

describe("TranscriptionWorkerGuard", () => {
  test("aceita a chave de dispositivo com a permissao de transcricao e expoe o dono e a permissao", () => {
    const { request, context } = contextWith(deviceKey);

    expect(new TranscriptionWorkerGuard().canActivate(context)).toBe(true);
    expect(request.actor).toEqual({ userId: "user-1", permissions: ["transcription:work"] });
  });

  test("recusa uma sessao comum, mesmo vinda do gateway", () => {
    const { context } = contextWith(session);

    expect(() => new TranscriptionWorkerGuard().canActivate(context)).toThrow(ForbiddenException);
  });

  test("recusa uma permissao que nao e a de transcricao", () => {
    const { context } = contextWith({ ...deviceKey, "x-auth-permissions": "task:manage" });

    expect(() => new TranscriptionWorkerGuard().canActivate(context)).toThrow(ForbiddenException);
  });

  test("recusa quem nao veio pelo gateway", () => {
    expect(() => new TranscriptionWorkerGuard().canActivate(contextWith({ ...deviceKey, "x-auth-gateway-key": "x".repeat(GATEWAY_KEY.length) }).context)).toThrow(ForbiddenException);
    expect(() => new TranscriptionWorkerGuard().canActivate(contextWith({ "x-auth-permissions": "transcription:work", "x-auth-user-id": "user-1" }).context)).toThrow(UnauthorizedException);
  });

  test("recusa sem a identidade do dono", () => {
    const { "x-auth-user-id": _omitted, ...withoutUser } = deviceKey;

    expect(() => new TranscriptionWorkerGuard().canActivate(contextWith(withoutUser).context)).toThrow(UnauthorizedException);
  });
});

describe("GatewayIdentityGuard e a chave de dispositivo", () => {
  test("continua aceitando a sessao comum", () => {
    const { request, context } = contextWith(session);

    expect(new GatewayIdentityGuard().canActivate(context)).toBe(true);
    expect(request.actor).toEqual({ userId: "user-1", sessionId: "session-1" });
  });

  test("nenhuma rota existente aceita a chave de dispositivo", () => {
    const { context } = contextWith(deviceKey);

    expect(() => new GatewayIdentityGuard().canActivate(context)).toThrow(ForbiddenException);
  });
});
