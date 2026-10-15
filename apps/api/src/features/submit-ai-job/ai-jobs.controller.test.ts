import "reflect-metadata";
import { expect, test, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { SubmitAiJobController } from "./submit-ai-job.controller";
import { GetAiJobController } from "../get-ai-job/get-ai-job.controller";
import { ListAiJobsController } from "../list-ai-jobs/list-ai-jobs.controller";
import { CancelAiJobController } from "../cancel-ai-job/cancel-ai-job.controller";
import { toAiJobDto } from "../../api-core/dto/ai-job.dto";
import type { QueuedAiOperations } from "../../api-core/agent/queued-ai-operations";
import type { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";

const actor = { userId: "u1" };
const job = {
  id: "job-1", kind: "agent-turn", status: "queued", userId: "u1", actorId: "u1",
  createdAt: new Date("2026-10-01T10:00:00Z"), updatedAt: new Date("2026-10-01T10:00:00Z"),
  payload: { mode: "chat", input: { text: "Almocei", userId: "u1" }, actor, clientMessageId: "m1" },
  progress: null, result: null, error: null, attempts: 0, leaseToken: null,
} as Awaited<ReturnType<AiJobsService["get"]>>;

function setup() {
  const operations = { submitChat: vi.fn(async () => job.id) };
  const jobs = {
    get: vi.fn(async (_id: string, userId: string) => {
      if (userId !== job.userId) throw new NotFoundException();
      return job;
    }),
    list: vi.fn(async () => [job]),
    cancel: vi.fn(async () => {}),
  };
  return {
    operations, jobs,
    controller: new SubmitAiJobController(
      operations as unknown as QueuedAiOperations, jobs as unknown as AiJobsService,
    ),
    get: new GetAiJobController(jobs as unknown as AiJobsService),
    list: new ListAiJobsController(jobs as unknown as AiJobsService),
    cancel: new CancelAiJobController(jobs as unknown as AiJobsService),
  };
}

test("all durable job routes require gateway identity", () => {
  for (const controller of [SubmitAiJobController, GetAiJobController, ListAiJobsController, CancelAiJobController]) {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toContain(GatewayIdentityGuard);
  }
});

test("submission validates and trims text before enqueuing with the stable client ID", async () => {
  const { controller, operations } = setup();
  const accepted = await controller.submit({ userId: "u1", text: "  Almocei  ", clientMessageId: "m1" }, actor);
  expect(operations.submitChat).toHaveBeenCalledWith({ userId: "u1", text: "Almocei" }, actor, "m1");
  expect(accepted).toMatchObject({ id: job.id, status: "queued", request: { text: "Almocei", clientMessageId: "m1" } });
});

test.each([
  { userId: "u1", text: "Almocei" },
  { userId: "u1", text: " ", clientMessageId: "m1" },
  { userId: "u1", text: "Almocei", clientMessageId: "bad id" },
  { userId: "u1", text: "Almocei", clientMessageId: "m1", conversationId: "invalid" },
])("invalid submission never reaches the queue: %j", async (body) => {
  const { controller, operations } = setup();
  await expect(controller.submit(body, actor)).rejects.toBeInstanceOf(InvalidInputError);
  expect(operations.submitChat).not.toHaveBeenCalled();
});

test("get, list and cancellation always use the authenticated owner", async () => {
  const { get, list, cancel, jobs } = setup();
  await get.get(job.id, actor);
  await list.list(actor);
  await cancel.cancel(job.id, actor);
  expect(jobs.get).toHaveBeenCalledWith(job.id, "u1");
  expect(jobs.list).toHaveBeenCalledWith("u1");
  expect(jobs.cancel).toHaveBeenCalledWith(job.id, "u1");
  await expect(get.get(job.id, { userId: "u2" })).rejects.toBeInstanceOf(NotFoundException);
});

test("public job DTO excludes actor snapshots, input context, leases and private errors", () => {
  const dto = toAiJobDto(job);
  expect(dto).not.toHaveProperty("actorId");
  expect(dto).not.toHaveProperty("payload");
  expect(dto).not.toHaveProperty("leaseToken");
  expect(dto).not.toHaveProperty("error");
  expect(dto.createdAt).toBe("2026-10-01T10:00:00.000Z");
});

test("voice receipts expose the stable request ID needed for reload deduplication", () => {
  expect(toAiJobDto({
    ...job, kind: "transcript-event",
    payload: { transcript: "Almocei", actor, requestId: "voice-1" },
  }).request).toEqual({ text: "Almocei", clientMessageId: "voice-1" });
});
