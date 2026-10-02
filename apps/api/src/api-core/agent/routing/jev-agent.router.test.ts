import { expect, test } from "vitest";
import { JevAgentRouter } from "./jev-agent.router";

const answer = (choice: string, confidence = 0.99, probability = 0.99) => ({
  type: "choice", choice, confidence, probabilities: { [choice]: probability },
});

function router(answers: Record<string, unknown>, status = 200) {
  let requestBody: unknown;
  const request = async (_url: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ model: "jev-1.13.0", answers }, { status });
  };
  return { router: new JevAgentRouter("test-key", request as typeof fetch), body: () => requestBody };
}

test("routes a certain single update to its specialist with one batched JEV request", async () => {
  const fake = router({ goal: answer("write"), count: answer("one"), target: answer("routine") });
  const route = await fake.router.route({ text: "Parei de trabalhar", now: new Date("2026-09-16T20:00:00Z") });
  expect(route).toEqual({ kind: "single", skill: "save_routine_event" });
  expect(Object.keys((fake.body() as { questions: object }).questions)).toEqual(["goal", "count", "target"]);
});

test("read route ignores speculative count and target judgments", async () => {
  const fake = router({ goal: answer("read"), count: answer("unclear", 0.2), target: answer("other", 0.2) });
  expect(await fake.router.route({ text: "O que fiz hoje?", now: new Date() })).toEqual({ kind: "read" });
});

test.each([
  { goal: answer("write", 0.92), count: answer("one"), target: answer("task") },
  { goal: answer("write", 0.99, 0.92), count: answer("one"), target: answer("task") },
  { goal: answer("write"), count: answer("one", 0.92), target: answer("task") },
  { goal: answer("write"), count: answer("one"), target: answer("task", 0.99, 0.92) },
])("requires both numbers strictly above 92% for each used judgment", async (answers) => {
  expect(await router(answers).router.route({ text: "Crie tarefa", now: new Date() })).toEqual({ kind: "complex" });
});

test("provider failure falls back to complex", async () => {
  const fake = router({}, 529);
  expect(await fake.router.route({ text: "pedido", now: new Date() })).toEqual({ kind: "complex" });
});

test("invalid provider response falls back to complex", async () => {
  expect(await router({}).router.route({ text: "pedido", now: new Date() })).toEqual({ kind: "complex" });
});

test("provider timeout falls back while user cancellation propagates", async () => {
  const request = async () => { throw new DOMException("timed out", "TimeoutError"); };
  const instance = new JevAgentRouter("test-key", request as typeof fetch);
  expect(await instance.route({ text: "pedido", now: new Date() })).toEqual({ kind: "complex" });
  const controller = new AbortController();
  controller.abort();
  await expect(instance.route({ text: "pedido", now: new Date(), signal: controller.signal })).rejects.toThrow("timed out");
});
