import { expect, test } from "vitest";
import { EntityBatchConflictError } from "../../../domain";
import type { AgentChatServerFrame, RunAgentResponse } from "@repo/contracts";
import { AgentRunCancelledError, LlmUnavailableError } from "../errors/agent.errors";
import type {
  RunChatTurnOptions,
  RunChatTurnRequest,
  RunChatTurnResponse,
} from "../usecases/run-chat-turn.usecase";
import { AgentChatConnection, type AgentChatClock } from "./agent-chat-connection";

const grant = { actor: { userId: "admin", sessionId: "session-1" }, targetUserId: "user-1" };

const CONVERSATION_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

const EMPTY: RunChatTurnResponse = {
  agentResponse: "Feito.",
  createdEntities: [],
  updatedEntities: [],
  deletedEntities: [],
  conversationId: CONVERSATION_ID,
  assistantSeq: 2,
};

/** Relogio manual: `advance` dispara os timers vencidos. */
function manualClock() {
  let now = Date.parse("2026-09-17T12:00:00.000Z");
  let nextHandle = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: AgentChatClock = {
    now: () => now,
    setTimeout: (callback, ms) => {
      nextHandle += 1;
      timers.set(nextHandle, { at: now + ms, callback });
      return nextHandle;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number);
    },
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [handle, timer] of [...timers]) {
      if (timer.at <= now) {
        timers.delete(handle);
        timer.callback();
      }
    }
  };
  return { clock, advance };
}

type Execute = (
  input: RunChatTurnRequest,
  actor: unknown,
  options: RunChatTurnOptions,
) => Promise<RunChatTurnResponse>;

function setup(execute: Execute = async () => EMPTY, limits = { lifetimeMs: 60_000, idleMs: 10_000 }) {
  const frames: AgentChatServerFrame[] = [];
  const closes: Array<{ code: number; reason: string }> = [];
  const errors: unknown[] = [];
  const calls: Array<{ input: RunChatTurnRequest; actor: unknown; options: RunChatTurnOptions }> = [];
  const { clock, advance } = manualClock();
  const connection = new AgentChatConnection(
    { send: (frame) => frames.push(frame), close: (code, reason) => closes.push({ code, reason }) },
    grant,
    {
      execute: (input, actor, options = {}) => {
        calls.push({ input, actor, options });
        return execute(input, actor, options);
      },
    },
    { error: (...args: unknown[]) => errors.push(args) },
    clock,
    limits,
  );
  connection.start();
  return { connection, frames, closes, errors, calls, advance };
}

const message = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "message", id, text: "crie a tarefa", ...extra });

/** Uma execucao que so termina quando o teste manda — ou quando e abortada. */
function heldRun() {
  let finish: (response: RunChatTurnResponse) => void = () => {};
  const execute: Execute = (_input, _actor, options) =>
    new Promise((resolve, reject) => {
      finish = resolve;
      options.signal?.addEventListener("abort", () => reject(new AgentRunCancelledError()), { once: true });
    });
  return { execute, finish: (response = EMPTY) => finish(response) };
}

test("announces the target user and when the connection must re-authenticate", () => {
  const { frames } = setup();

  expect(frames).toEqual([{ type: "ready", userId: "user-1", expiresAt: "2026-09-17T12:01:00.000Z" }]);
});

test("runs a message as the ticket's actor on the ticket's target, in the frame's conversation", async () => {
  const { connection, calls } = setup();

  await connection.handleMessage(
    message("m1", {
      text: "  mude a prioridade  ",
      context: { screen: "agenda" },
      conversationId: CONVERSATION_ID,
    }),
  );

  expect(calls[0].input).toEqual({
    userId: "user-1",
    text: "mude a prioridade",
    context: { screen: "agenda" },
    conversationId: CONVERSATION_ID,
  });
  expect(calls[0].actor).toEqual(grant.actor);
});

test("a message without a conversation starts one: the server decides the id", async () => {
  const { connection, calls, frames } = setup();

  await connection.handleMessage(message("m1"));

  expect(calls[0].input.conversationId).toBeUndefined();
  expect(frames.at(-1)).toMatchObject({ type: "reply", conversationId: CONVERSATION_ID, assistantSeq: 2 });
});

// O histórico deixou de trafegar, mas uma aba aberta durante o deploy continua
// mandando o campo: ele é ignorado, e não vira `invalid_frame`.
test("a legacy frame carrying history is accepted, and the history is ignored", async () => {
  const { connection, calls, frames } = setup();

  await connection.handleMessage(
    message("m1", { history: Array.from({ length: 21 }, () => ({ role: "user", text: "a" })) }),
  );

  expect(frames.at(-1)).toMatchObject({ type: "reply", id: "m1" });
  expect(calls[0].input).not.toHaveProperty("history");
});

test("streams the progress and sends the reply with the entity refs", async () => {
  const task = { kind: "task", id: "01TASK", name: "Limpar a casa" } as RunAgentResponse["createdEntities"][number];
  const { connection, frames } = setup(async (_input, _actor, options) => {
    options.onProgress?.("Preparando tarefa");
    options.onProgress?.("Salvando");
    return { ...EMPTY, createdEntities: [task] };
  });

  await connection.handleMessage(message("m1"));

  expect(frames.slice(1)).toEqual([
    { type: "status", id: "m1", label: "Preparando tarefa" },
    { type: "status", id: "m1", label: "Salvando" },
    {
      type: "reply",
      id: "m1",
      ...EMPTY,
      createdEntities: [task],
      entities: [{ kind: "task", id: "01TASK", change: "created", label: "Limpar a casa" }],
    },
  ]);
});

test("answers busy to a second message while the first is running", async () => {
  const held = heldRun();
  const { connection, frames, calls } = setup(held.execute);

  const first = connection.handleMessage(message("m1"));
  await connection.handleMessage(message("m2"));
  held.finish();
  await first;

  expect(calls).toHaveLength(1);
  expect(frames).toContainEqual({ type: "error", id: "m2", code: "busy" });
  expect(frames.at(-1)).toMatchObject({ type: "reply", id: "m1" });
});

test("cancel aborts the running message and reports it as cancelled", async () => {
  const held = heldRun();
  const { connection, frames } = setup(held.execute);

  const running = connection.handleMessage(message("m1"));
  await connection.handleMessage(JSON.stringify({ type: "cancel", id: "other" }));
  await connection.handleMessage(JSON.stringify({ type: "cancel", id: "m1" }));
  await running;

  expect(frames.at(-1)).toEqual({ type: "error", id: "m1", code: "cancelled" });
});

test("a closed socket aborts the run and nothing more is sent", async () => {
  const held = heldRun();
  let signal: AbortSignal | undefined;
  const { connection, frames } = setup((input, actor, options) => {
    signal = options.signal;
    return held.execute(input, actor, options);
  });

  const running = connection.handleMessage(message("m1"));
  connection.handleClose();
  await running;

  expect(signal?.aborted).toBe(true);
  expect(frames).toHaveLength(1);
});

test.each([
  [new EntityBatchConflictError("mudou"), "conflict"],
  [new LlmUnavailableError("fora"), "unavailable"],
])("maps %s to a chat error code", async (error, code) => {
  const { connection, frames, errors } = setup(async () => {
    throw error;
  });

  await connection.handleMessage(message("m1"));

  expect(frames.at(-1)).toEqual({ type: "error", id: "m1", code });
  expect(errors).toEqual([]);
});

test("an unexpected failure is logged and reported as internal", async () => {
  const { connection, frames, errors } = setup(async () => {
    throw new Error("bug");
  });

  await connection.handleMessage(message("m1"));

  expect(frames.at(-1)).toEqual({ type: "error", id: "m1", code: "internal" });
  expect(errors).toHaveLength(1);
});

test.each([
  ["not JSON", "{", undefined],
  ["unknown type", JSON.stringify({ type: "hello", id: "m1" }), "m1"],
  ["blank text", JSON.stringify({ type: "message", id: "m1", text: "  " }), "m1"],
  ["a malformed conversation id", message("m1", { conversationId: "nope" }), "m1"],
  ["an id with spaces", JSON.stringify({ type: "message", id: "a b", text: "oi" }), undefined],
])("refuses a frame with %s", async (_label, raw, id) => {
  const { connection, frames, calls } = setup();

  await connection.handleMessage(raw);

  expect(frames.at(-1)).toEqual({ type: "error", id, code: "invalid_frame" });
  expect(calls).toEqual([]);
});

test("closes an idle connection, but never while a message is running", async () => {
  const held = heldRun();
  const { connection, closes, advance } = setup(held.execute);

  const running = connection.handleMessage(message("m1"));
  advance(20_000);
  expect(closes).toEqual([]);

  held.finish();
  await running;
  advance(9_999);
  expect(closes).toEqual([]);
  advance(1);
  expect(closes).toEqual([{ code: 4002, reason: "idle" }]);
});

test("at the end of its lifetime the connection closes after the running reply", async () => {
  const held = heldRun();
  const { connection, frames, closes, advance } = setup(held.execute, { lifetimeMs: 60_000, idleMs: 120_000 });

  const running = connection.handleMessage(message("m1"));
  advance(60_000);
  expect(closes).toEqual([]);

  held.finish();
  await running;

  expect(frames.at(-1)).toMatchObject({ type: "reply", id: "m1" });
  expect(closes).toEqual([{ code: 4001, reason: "reauthenticate" }]);
});

test("an idle connection that reaches its lifetime closes right away", () => {
  const { closes, advance } = setup(undefined, { lifetimeMs: 60_000, idleMs: 120_000 });

  advance(60_000);

  expect(closes).toEqual([{ code: 4001, reason: "reauthenticate" }]);
});
