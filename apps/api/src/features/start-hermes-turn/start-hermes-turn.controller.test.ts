import "reflect-metadata";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { QueuedAiOperations } from "../../api-core/agent/queued-ai-operations";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import { StartHermesTurnController } from "./start-hermes-turn.controller";

const actor = { userId: "owner-1" };
const job = {
  id: "job-1", kind: "hermes-turn", status: "queued", userId: "owner-1", actorId: "owner-1",
  createdAt: new Date("2026-11-07T10:00:00Z"), updatedAt: new Date("2026-11-07T10:00:00Z"),
  payload: { mode: "hermes", input: { userId: "owner-1", text: "oi" }, actor, clientMessageId: "m1" },
  progress: null, result: null, error: null, attempts: 0, leaseToken: null,
} as Awaited<ReturnType<AiJobsService["get"]>>;

function setup() {
  const operations = { submitHermes: vi.fn(async () => "job-1") };
  const jobs = { get: vi.fn(async () => job) };
  return {
    operations,
    controller: new StartHermesTurnController(operations as unknown as QueuedAiOperations, jobs as unknown as AiJobsService),
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ai/automation", () => {
  test("requires the gateway identity", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, StartHermesTurnController.prototype.start)).toContain(
      GatewayIdentityGuard,
    );
  });

  test("is a 404 while the flag is off, before the body is even read", async () => {
    vi.stubEnv("AI_AUTOMATION", "off");
    const { controller, operations } = setup();

    await expect(controller.start({ garbage: true }, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(operations.submitHermes).not.toHaveBeenCalled();
  });

  test("accepts a message and returns the queued job", async () => {
    vi.stubEnv("AI_AUTOMATION", "on");
    const { controller, operations } = setup();

    const accepted = await controller.start(
      { userId: "owner-1", text: "  crie uma nota  ", clientMessageId: "m1" },
      actor,
    );

    expect(operations.submitHermes).toHaveBeenCalledWith({ userId: "owner-1", text: "crie uma nota" }, actor, "m1");
    expect(accepted).toMatchObject({ id: "job-1", kind: "hermes-turn", status: "queued", request: { text: "oi" } });
  });

  test("never talks to Hermes on behalf of another user", async () => {
    vi.stubEnv("AI_AUTOMATION", "on");
    const { controller, operations } = setup();

    await expect(
      controller.start({ userId: "someone-else", text: "oi", clientMessageId: "m1" }, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(operations.submitHermes).not.toHaveBeenCalled();
  });

  test.each([
    { userId: "owner-1", text: "oi" },
    { userId: "owner-1", text: " ", clientMessageId: "m1" },
    { userId: "owner-1", text: "oi", clientMessageId: "bad id" },
  ])("rejects an invalid body %#", async (body) => {
    vi.stubEnv("AI_AUTOMATION", "on");
    const { controller } = setup();

    await expect(controller.start(body, actor)).rejects.toBeInstanceOf(InvalidInputError);
  });
});
