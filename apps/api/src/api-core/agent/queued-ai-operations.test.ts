import { expect, test, vi } from "vitest";
import { QueuedAiOperations } from "./queued-ai-operations";
import type { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import type { CreateEventFromTranscriptUseCase } from "../events/create-event-from-transcript.usecase";
import type { GenerateMealNoteUseCase } from "../notes/generate-meal-note.usecase";

const actor = { userId: "u1", sessionId: "s1" };
const input = { userId: "u1", text: "Almocei arroz" };

type Handler = (payload: unknown, context: unknown) => Promise<unknown>;

function setup(hermes?: { chat: ReturnType<typeof vi.fn> }) {
  const handlers = new Map<string, Handler>();
  const jobs = {
    register: vi.fn((kind: string, handler: Handler) => { handlers.set(kind, handler); }),
    enqueue: vi.fn(async (_input: { kind: string }) => "job-1"),
    wait: vi.fn(async () => ({ eventId: "event-1", kind: "meal" })),
    cancel: vi.fn(async () => {}),
  };
  const transcript = { execute: vi.fn(async () => ({ eventId: "event-1", kind: "meal" })) };
  const meal = { execute: vi.fn(async () => ({ noteId: "note-1" })), fail: vi.fn() };
  const operations = new QueuedAiOperations(
    jobs as unknown as AiJobsService,
    transcript as unknown as CreateEventFromTranscriptUseCase,
    meal as unknown as GenerateMealNoteUseCase,
    hermes as unknown as ConstructorParameters<typeof QueuedAiOperations>[3],
  );
  operations.onModuleInit();
  return { operations, jobs, handlers, transcript, meal };
}

test("the transcript endpoint also enqueues before waiting", async () => {
  const { operations, jobs, transcript } = setup();
  await operations.executeTranscript("Almocei arroz", actor);
  expect(jobs.enqueue.mock.calls.map(([job]) => job.kind)).toEqual(["transcript-event"]);
  expect(jobs.wait).toHaveBeenCalledTimes(1);
  expect(transcript.execute).not.toHaveBeenCalled();
});

test("the legacy agent-turn handler is gone", () => {
  const { handlers } = setup();
  expect([...handlers.keys()].sort()).toEqual(["hermes-turn", "meal-note", "transcript-event"]);
});

test("a Hermes turn is persisted with its own dedupe key and never calls Hermes at submission", async () => {
  const hermes = { chat: vi.fn(async () => ({ text: "ok", steps: [] })) };
  const { operations, jobs } = setup(hermes);

  expect(await operations.submitHermes(input, actor, "client-9")).toBe("job-1");

  expect(jobs.enqueue).toHaveBeenCalledWith({
    kind: "hermes-turn", userId: "u1", actorId: "u1", dedupeKey: "hermes:u1:client-9",
    payload: { mode: "hermes", input, actor, clientMessageId: "client-9" },
  });
  expect(hermes.chat).not.toHaveBeenCalled();
});

test("the hermes-turn handler sends the text on the conversation's session, stores the steps as progress and returns the reply", async () => {
  const steps = [{ id: "c1", kind: "tool", label: "Criou uma nota", status: "done" }];
  const hermes = {
    chat: vi.fn(async (call: { onSteps?(steps: unknown[]): void }) => {
      call.onSteps?.(steps);
      return { text: "Feito.", steps };
    }),
  };
  const { handlers } = setup(hermes);
  const signal = new AbortController().signal;
  const progress = vi.fn(async () => {});

  const result = await handlers.get("hermes-turn")!(
    { mode: "hermes", input: { userId: "u1", text: "crie", conversationId: "C1" }, actor },
    { signal, progress },
  );

  expect(result).toEqual({ text: "Feito.", steps });
  expect(hermes.chat).toHaveBeenCalledWith(expect.objectContaining({ text: "crie", sessionId: "braid-u1-C1", signal }));
  expect(progress).toHaveBeenCalledWith({ steps });
});

test("step updates are written at most once per interval, and a failing write never breaks the turn", async () => {
  const hermes = {
    chat: vi.fn(async (call: { onSteps?(steps: unknown[]): void }) => {
      for (let index = 0; index < 5; index += 1) call.onSteps?.([{ id: `s${index}` }]);
      return { text: "ok", steps: [] };
    }),
  };
  const { handlers } = setup(hermes);
  const progress = vi.fn(async () => {
    throw new Error("db down");
  });

  await expect(
    handlers.get("hermes-turn")!({ mode: "hermes", input: { userId: "u1", text: "oi" } }, { signal: new AbortController().signal, progress }),
  ).resolves.toEqual({ text: "ok", steps: [] });
  expect(progress).toHaveBeenCalledTimes(1);
});

test("without a configured Hermes the job fails instead of waiting", async () => {
  const { handlers } = setup(undefined);

  await expect(
    handlers.get("hermes-turn")!({ mode: "hermes", input: { userId: "u1", text: "oi" } }, { signal: new AbortController().signal, progress: vi.fn() }),
  ).rejects.toThrow("Hermes is not configured");
});
