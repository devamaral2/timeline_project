import { expect, test, vi } from "vitest";
import { QueuedAiOperations } from "./queued-ai-operations";
import type { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import type { RunAgentUseCase } from "./run-agent.usecase";
import type { RunChatTurnUseCase } from "./run-chat-turn.usecase";
import type { CreateEventFromTranscriptUseCase } from "../events/create-event-from-transcript.usecase";
import type { GenerateMealNoteUseCase } from "../notes/generate-meal-note.usecase";

const response = {
  agentResponse: "Registrado", createdEntities: [], updatedEntities: [], deletedEntities: [],
  conversationId: "01ARZ3NDEKTSV4RRFFQ69G5FAV", assistantSeq: 2,
};
const actor = { userId: "u1", sessionId: "s1" };
const input = { userId: "u1", text: "Almocei arroz" };

type Handler = (payload: unknown, context: unknown) => Promise<unknown>;

function setup() {
  const handlers = new Map<string, Handler>();
  const jobs = {
    register: vi.fn((kind: string, handler: Handler) => { handlers.set(kind, handler); }),
    enqueue: vi.fn(async (_input: { kind: string }) => "job-1"),
    wait: vi.fn(async () => response),
    cancel: vi.fn(async () => {}),
  };
  const agent = { execute: vi.fn(async () => response) };
  const chat = { execute: vi.fn(async (_input: unknown, _actor: unknown, _options: {
    signal?: AbortSignal; onProgress?(label: string): void;
  }) => response) };
  const transcript = { execute: vi.fn(async () => ({ eventId: "event-1", kind: "meal" })) };
  const meal = { execute: vi.fn(async () => ({ noteId: "note-1" })), fail: vi.fn() };
  const operations = new QueuedAiOperations(
    jobs as unknown as AiJobsService,
    agent as unknown as RunAgentUseCase,
    chat as unknown as RunChatTurnUseCase,
    transcript as unknown as CreateEventFromTranscriptUseCase,
    meal as unknown as GenerateMealNoteUseCase,
  );
  operations.onModuleInit();
  return { operations, jobs, handlers, agent, chat, transcript, meal };
}

test("submitting chat only persists work, with actor-scoped stable dedupe key", async () => {
  const { operations, jobs, agent, chat } = setup();
  expect(await operations.submitChat(input, actor, "client-1")).toBe("job-1");
  expect(jobs.enqueue).toHaveBeenCalledWith({
    kind: "agent-turn", userId: "u1", actorId: "u1", dedupeKey: "chat:u1:client-1",
    payload: { mode: "chat", input, actor, clientMessageId: "client-1" },
  });
  expect(agent.execute).not.toHaveBeenCalled();
  expect(chat.execute).not.toHaveBeenCalled();
});

test("workers, not transports, execute chat with their own cancellation signal", async () => {
  const { handlers, chat } = setup();
  const signal = new AbortController().signal;
  const progress = vi.fn(async () => {});
  const handler = handlers.get("agent-turn");
  if (!handler) throw new Error("agent-turn handler was not registered");
  await handler({ mode: "chat", input, actor }, { signal, progress });
  expect(chat.execute).toHaveBeenCalledWith(input, actor, { signal, onProgress: expect.any(Function) });
  chat.execute.mock.calls[0][2].onProgress?.("Preparando");
  expect(progress).toHaveBeenCalledWith("Preparando");
});

test("compatibility REST and transcript endpoints also enqueue before waiting", async () => {
  const { operations, jobs, agent, transcript } = setup();
  await operations.executeAgent(input, actor);
  await operations.executeTranscript("Almocei arroz", actor);
  expect(jobs.enqueue.mock.calls.map(([job]) => job.kind)).toEqual(["agent-turn", "transcript-event"]);
  expect(jobs.wait).toHaveBeenCalledTimes(2);
  expect(agent.execute).not.toHaveBeenCalled();
  expect(transcript.execute).not.toHaveBeenCalled();
});

test("explicit cancel is separate from observer disconnect", async () => {
  const { operations, jobs } = setup();
  let finish!: (value: typeof response) => void;
  jobs.wait.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const cancel = new AbortController();
  const observer = new AbortController();
  const onQueued = vi.fn();
  const waiting = operations.execute(input, actor, {
    requestId: "client-1", signal: cancel.signal, observerSignal: observer.signal, onQueued,
  });
  await Promise.resolve();
  expect(onQueued).toHaveBeenCalledWith("job-1");
  observer.abort();
  expect(jobs.cancel).not.toHaveBeenCalled();
  cancel.abort();
  expect(jobs.cancel).toHaveBeenCalledWith("job-1", "u1");
  finish(response);
  await waiting;
});
