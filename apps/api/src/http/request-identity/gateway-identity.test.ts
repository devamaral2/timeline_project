import { describe, expect, test } from "vitest";
import { HttpError } from "../../common/http-errors";
import { authenticateRequest } from "./gateway-identity";

const GATEWAY_KEY = "gateway-key-with-at-least-32-characters";

const session = { "x-auth-gateway-key": GATEWAY_KEY, "x-auth-user-id": "user-1", "x-auth-session-id": "session-1" };
const device = {
  "x-auth-gateway-key": GATEWAY_KEY,
  "x-auth-user-id": "user-1",
  "x-auth-permissions": "transcription:work",
  "x-auth-device-key-id": "key-1",
};

const statusOf = (headers: Record<string, string>, authentication: "gateway-session" | "transcription-device-key"): number => {
  try {
    authenticateRequest(authentication, headers, GATEWAY_KEY);
    return 200;
  } catch (error) {
    if (error instanceof HttpError) return error.status;
    throw error;
  }
};

describe("a sessão do gateway", () => {
  test("aceita a sessão comum e expõe o usuário e a sessão", () => {
    expect(authenticateRequest("gateway-session", session, GATEWAY_KEY)).toEqual({ userId: "user-1", sessionId: "session-1" });
  });

  test("nenhuma rota de sessão aceita a chave de dispositivo", () => {
    expect(statusOf(device, "gateway-session")).toBe(403);
  });

  test("sem a chave do gateway, com a chave errada ou sem o usuário responde como a linha de base", () => {
    expect(statusOf({ "x-auth-user-id": "user-1" }, "gateway-session")).toBe(401);
    expect(statusOf({ ...session, "x-auth-gateway-key": "x".repeat(GATEWAY_KEY.length) }, "gateway-session")).toBe(403);
    expect(statusOf({ "x-auth-gateway-key": GATEWAY_KEY }, "gateway-session")).toBe(401);
  });
});

describe("a chave de dispositivo do serviço local", () => {
  test("aceita a chave com a permissão de transcrição e expõe o dono e a permissão", () => {
    expect(authenticateRequest("transcription-device-key", device, GATEWAY_KEY)).toEqual({
      userId: "user-1",
      permissions: ["transcription:work"],
    });
  });

  test("recusa uma sessão comum, mesmo vinda do gateway", () => {
    expect(statusOf(session, "transcription-device-key")).toBe(403);
  });

  test("recusa uma permissão que não é a de transcrição", () => {
    expect(statusOf({ ...device, "x-auth-permissions": "task:manage" }, "transcription-device-key")).toBe(403);
  });

  test("recusa quem não veio pelo gateway ou chegou sem o dono", () => {
    expect(statusOf({ ...device, "x-auth-gateway-key": "x".repeat(GATEWAY_KEY.length) }, "transcription-device-key")).toBe(403);
    expect(statusOf({ "x-auth-permissions": "transcription:work", "x-auth-user-id": "user-1" }, "transcription-device-key")).toBe(401);
    const { "x-auth-user-id": _omitted, ...withoutUser } = device;
    expect(statusOf(withoutUser, "transcription-device-key")).toBe(401);
  });
});
