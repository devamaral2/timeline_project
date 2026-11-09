import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { ProcessOperations } from "../../api-core/process/process-operations";
import { InMemoryProcessStore } from "../../api-core/process/testing/in-memory-process-store";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { StartProcessEditController } from "./start-process-edit.controller";

const owner = { userId: "owner-1" };
const body = { userId: "owner-1", text: "mude para 19h", entityType: "event", entityId: "01H0EVENT" };

function setup() {
  const store = new InMemoryProcessStore();
  // So `startEdit` roda aqui: os workers e as filas nao entram.
  const operations = Object.assign(Object.create(ProcessOperations.prototype), { store }) as ProcessOperations;
  return { store, controller: new StartProcessEditController(operations) };
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ai/process/edit", () => {
  test("exige a identidade do gateway e responde 202", () => {
    const handler = StartProcessEditController.prototype.start;
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(GatewayIdentityGuard);
    expect(Reflect.getMetadata("__httpCode__", handler)).toBe(202);
  });

  test("grava o processo com o alvo e devolve o processId", async () => {
    const { store, controller } = setup();
    const { processId } = await controller.start(body, owner);
    expect(store.processes.get(processId)).toMatchObject({ userId: "owner-1", prompt: "mude para 19h", status: "dispatching" });
    expect(store.editJobs).toEqual([{ processId, entityType: "event", entityId: "01H0EVENT" }]);
    expect(store.jobs).toEqual([{ kind: "process-edit-target", processId }]);
  });

  test.each([
    ["texto vazio", { ...body, text: "   " }],
    ["tipo desconhecido", { ...body, entityType: "recurrence" }],
    ["id com caracteres invalidos", { ...body, entityId: "../x" }],
    ["sem tipo", { userId: "owner-1", text: "x", entityId: "a" }],
  ])("recusa %s", async (_label, payload) => {
    const { store, controller } = setup();
    await expect(controller.start(payload, owner)).rejects.toBeInstanceOf(InvalidInputError);
    expect(store.processes.size).toBe(0);
  });

  test("nao edita em nome de outro usuario", async () => {
    const { store, controller } = setup();
    await expect(controller.start({ ...body, userId: "outro" }, owner)).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.processes.size).toBe(0);
  });

  test.each(["skill_note", "agent_note"])("%s: so o dono da configuracao edita (ADR 0004)", async (entityType) => {
    const { store, controller } = setup();
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", "owner-1");
    await expect(controller.start({ ...body, userId: "visitante", entityType }, { userId: "visitante" })).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.processes.size).toBe(0);
    await expect(controller.start({ ...body, entityType }, owner)).resolves.toHaveProperty("processId");
  });

  test("sem dono configurado, ninguem edita skill", async () => {
    const { controller } = setup();
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", "");
    await expect(controller.start({ ...body, entityType: "skill_note" }, owner)).rejects.toBeInstanceOf(ForbiddenException);
  });

  test("evento, tarefa e nota comuns nao dependem do dono da configuracao", async () => {
    const { controller } = setup();
    vi.stubEnv("AGENT_CONFIG_OWNER_USER_ID", "");
    for (const entityType of ["event", "task", "note", "meal_note", "sleep_note", "training_note"]) {
      await expect(controller.start({ ...body, entityType }, owner)).resolves.toHaveProperty("processId");
    }
  });
});
