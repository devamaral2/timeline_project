import "reflect-metadata";
import { NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { StartHermesRequestController } from "./start-hermes-request.controller";

const actor = { userId: "owner-1" };
const accepted = { id: "request-1", route: "hermes", status: "queued" };

function setup() {
  const startHermes = vi.fn(async () => accepted);
  return { startHermes, controller: new StartHermesRequestController({ startHermes } as unknown as RequestOperations) };
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/requests/hermes", () => {
  test("exige a identidade do gateway e responde 202", () => {
    const handler = StartHermesRequestController.prototype.start;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(GatewayIdentityGuard);
    expect(Reflect.getMetadata("__httpCode__", handler)).toBe(202);
  });

  test("e um 404 enquanto a rota esta desligada, antes mesmo de ler o corpo", async () => {
    vi.stubEnv("AI_AUTOMATION", "off");
    const { controller, startHermes } = setup();
    await expect(controller.start({ garbage: true }, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(startHermes).not.toHaveBeenCalled();
  });

  test("aceita a mensagem e devolve o pedido", async () => {
    vi.stubEnv("AI_AUTOMATION", "on");
    const { controller, startHermes } = setup();
    const sessionId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

    await expect(controller.start({ userId: "owner-1", text: "  crie uma tarefa  ", sessionId, clientMessageId: "m1" }, actor))
      .resolves.toBe(accepted);

    expect(startHermes).toHaveBeenCalledWith({ userId: "owner-1", text: "crie uma tarefa", sessionId, clientMessageId: "m1" }, actor);
  });

  test("aceita o projectId opcional", async () => {
    vi.stubEnv("AI_AUTOMATION", "on");
    const { controller, startHermes } = setup();
    const projectId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

    await controller.start({ userId: "owner-1", text: "oi", clientMessageId: "m1", projectId }, actor);

    expect(startHermes).toHaveBeenCalledWith({ userId: "owner-1", text: "oi", clientMessageId: "m1", projectId }, actor);
  });

  test.each([
    { userId: "owner-1", text: "oi", clientMessageId: "m1", projectId: "nao-e-ulid" },
    { userId: "owner-1", text: "oi" },
    { userId: "owner-1", text: " ", clientMessageId: "m1" },
    { userId: "owner-1", text: "oi", clientMessageId: "bad id" },
    { userId: "owner-1", text: "oi", clientMessageId: "m1", sessionId: "nao-e-ulid" },
  ])("recusa um corpo invalido %#", async (body) => {
    vi.stubEnv("AI_AUTOMATION", "on");
    const { controller, startHermes } = setup();
    await expect(controller.start(body, actor)).rejects.toBeInstanceOf(InvalidInputError);
    expect(startHermes).not.toHaveBeenCalled();
  });
});
