import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AiJobDto, SubmitAiJobRequest } from "../../../packages/contracts/src/agent/contracts/ai-job.dto";

const fixture = JSON.parse(
  readFileSync(new URL("../app/src/test/resources/fixtures/ai-jobs.json", import.meta.url), "utf8"),
) as AiJobDto[];

describe("Android durable job wire fixtures", () => {
  it("covers every status and result variant used by Kotlin's strict decoder", () => {
    expect([...new Set(fixture.map((job) => job.status))].sort()).toEqual([
      "cancelled", "failed", "queued", "running", "succeeded",
    ]);
    expect(fixture.find((job) => job.id === "chat")?.result).toEqual({
      agentResponse: "Pronto.", conversationId: "conversation-1", assistantSeq: 2,
      createdEntities: [], updatedEntities: [], deletedEntities: [],
    });
    expect(fixture.find((job) => job.id === "voice")?.result).toEqual({ eventId: "event-1", kind: "meal" });
    expect(fixture.find((job) => job.id === "meal")?.result).toEqual({ noteId: "note-1", skipped: true });
  });

  it("preserves the same idempotency key in submit and recovery request", () => {
    const request = {
      userId: "user-1", text: "Criar almoço", clientMessageId: "request-1",
    } satisfies SubmitAiJobRequest;
    const queued = fixture.find((job) => job.id === "queued");
    expect(queued?.request?.clientMessageId).toBe(request.clientMessageId);
    expect(queued?.request?.text).toBe(request.text);
    expect(queued?.userId).toBe(request.userId);
  });
});
