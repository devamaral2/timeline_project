import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { describe, expect, test, vi } from "vitest";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { MAX_TRANSCRIPT_LENGTH } from "../../api-core/requests/voice-task-worker";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { StartVoiceRequestController } from "./start-voice-request.controller";

const actor = { userId: "user-1" };

function setup() {
  const startVoice = vi.fn(async () => "request-1");
  return { startVoice, controller: new StartVoiceRequestController({ startVoice } as unknown as RequestOperations) };
}

describe("POST /api/requests/voice", () => {
  test("exige a identidade do gateway e responde 202: nao ha mais rota de voz que espera o evento", () => {
    const handler = StartVoiceRequestController.prototype.start;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(GatewayIdentityGuard);
    expect(Reflect.getMetadata("__httpCode__", handler)).toBe(202);
  });

  test("a fala, sem os espacos das pontas, vira um pedido", async () => {
    const { startVoice, controller } = setup();
    await expect(controller.start({ transcript: "  comecei a estudar ", clientMessageId: "v1" }, actor)).resolves.toEqual({ requestId: "request-1" });
    expect(startVoice).toHaveBeenCalledWith({ transcript: "comecei a estudar", clientMessageId: "v1" }, actor);
  });

  test.each([
    ["fala vazia", { transcript: "   " }],
    ["fala longa demais", { transcript: "a".repeat(MAX_TRANSCRIPT_LENGTH + 1) }],
    ["sem fala", {}],
    ["id de mensagem invalido", { transcript: "oi", clientMessageId: "bad id" }],
  ])("recusa %s", async (_label, body) => {
    const { startVoice, controller } = setup();
    await expect(controller.start(body, actor)).rejects.toBeInstanceOf(InvalidInputError);
    expect(startVoice).not.toHaveBeenCalled();
  });
});
