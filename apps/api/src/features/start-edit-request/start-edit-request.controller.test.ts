import "reflect-metadata";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { describe, expect, test, vi } from "vitest";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { StartEditRequestController } from "./start-edit-request.controller";

const owner = { userId: "owner-1" };
const body = { userId: "owner-1", text: "mude para 19h", entityType: "task", entityId: "01H0TASK" };

function setup() {
  const startEdit = vi.fn(async () => "request-1");
  return { startEdit, controller: new StartEditRequestController({ startEdit } as unknown as RequestOperations) };
}

describe("POST /api/requests/edit", () => {
  test("exige a identidade do gateway e responde 202", () => {
    const handler = StartEditRequestController.prototype.start;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(GatewayIdentityGuard);
    expect(Reflect.getMetadata("__httpCode__", handler)).toBe(202);
  });

  test.each(["task", "artifact", "food_artifact", "sleep_artifact", "training_artifact", "skill_artifact", "agent_artifact"])(
    "aceita o alvo %s e devolve o requestId", async (entityType) => {
      const { startEdit, controller } = setup();
      await expect(controller.start({ ...body, entityType }, owner)).resolves.toEqual({ requestId: "request-1" });
      expect(startEdit).toHaveBeenCalledWith({ ...body, entityType }, owner);
    },
  );

  test.each([
    ["texto vazio", { ...body, text: "   " }],
    ["tipo desconhecido", { ...body, entityType: "recurrence" }],
    ["id com caracteres invalidos", { ...body, entityId: "../x" }],
    ["sem tipo", { userId: "owner-1", text: "x", entityId: "a" }],
  ])("recusa %s", async (_label, payload) => {
    const { startEdit, controller } = setup();
    await expect(controller.start(payload, owner)).rejects.toBeInstanceOf(InvalidInputError);
    expect(startEdit).not.toHaveBeenCalled();
  });
});
