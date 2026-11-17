import { describe, expect, test, vi } from "vitest";
import { RetryableJobError } from "../jobs/jobs.service";
import { HermesClient, HermesRequestError, hermesSessionId } from "./hermes.client";
import type { AgentTraceDto } from "@repo/contracts";

const KEY = "k".repeat(32);

const sse = (events: object[], { tail = "" }: { tail?: string } = {}) =>
  new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(": open\n\n"));
        for (const [index, event] of events.entries()) controller.enqueue(encoder.encode(`id: ${index}\ndata: ${JSON.stringify(event)}\n\n`));
        if (tail) controller.enqueue(encoder.encode(tail));
        controller.close();
      },
    }),
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** Um Hermes de mentira: roteia por metodo e caminho. */
function hermes(routes: {
  start?: () => Response | Promise<Response>;
  events?: () => Response | Promise<Response>;
  status?: () => Response | Promise<Response>;
}) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (method === "POST" && url.endsWith("/v1/runs")) return (routes.start ?? (() => json({ run_id: "run_1" }, 202)))();
    if (method === "GET" && url.endsWith("/events")) return (routes.events ?? (() => sse([])))();
    if (method === "POST" && url.endsWith("/stop")) return json({ status: "stopping" });
    if (method === "GET") return (routes.status ?? (() => json({ status: "running" })))();
    throw new Error(`unexpected ${method} ${url}`);
  });
}

function client(fetchImpl: typeof fetch, extra: { apiKey?: string | undefined; timeoutMs?: number; pollMs?: number } = {}) {
  return new HermesClient({
    url: "http://hermes.test:8642/",
    apiKey: "apiKey" in extra ? extra.apiKey : KEY,
    timeoutMs: extra.timeoutMs,
    pollMs: extra.pollMs ?? 5,
    fetch: fetchImpl,
  });
}

const completed = (output: string) => ({ event: "run.completed", run_id: "run_1", output });

describe("HermesClient", () => {
  test("starts a run on the session and returns the final text with the trace", async () => {
    const fetchImpl = hermes({
      events: () =>
        sse([
          { event: "reasoning.available", text: "Vou criar o artefato." },
          { event: "tool.started", tool: "mcp_braid_create_artifact", preview: "teste", tool_call_id: "c1" },
          { event: "tool.completed", tool: "mcp_braid_create_artifact", duration: 0.5, error: false, tool_call_id: "c1" },
          completed("Artefato criado."),
        ]),
    });
    const seen: AgentTraceDto[] = [];

    const reply = await client(fetchImpl).chat({ text: "crie um artefato", sessionId: "braid-u1-main", onTrace: (trace) => seen.push(trace) });

    expect(reply.text).toBe("Artefato criado.");
    expect(seen.some((trace) => trace.entries.some((entry) => entry.kind === "tool" && entry.status === "running"))).toBe(true);
    expect(reply.trace.status).toBe("done");
    expect(reply.trace.entries.map((entry) => [entry.kind, entry.label, entry.status])).toEqual([
      ["request", "Pedido", "done"],
      ["thought", "Pensou", "done"],
      ["tool", "Criou um artefato", "done"],
      ["answer", "Respondeu", "done"],
    ]);

    const [startUrl, startInit] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(startUrl).toBe("http://hermes.test:8642/v1/runs");
    expect(startInit.headers).toMatchObject({ authorization: `Bearer ${KEY}` });
    expect(JSON.parse(startInit.body as string)).toEqual({ input: "crie um artefato", session_id: "braid-u1-main" });
  });

  test("frames split across chunks and keepalive comments are handled", async () => {
    const payload = JSON.stringify(completed("ok"));
    const fetchImpl = hermes({
      events: () => {
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(": keepalive\n\ndata: " + payload.slice(0, 10)));
              controller.enqueue(encoder.encode(payload.slice(10) + "\n\n"));
              controller.close();
            },
          }),
        );
      },
    });

    await expect(client(fetchImpl).chat({ text: "oi", sessionId: "s" })).resolves.toMatchObject({ text: "ok" });
  });

  test("without a key it fails before touching the network", async () => {
    const fetchImpl = hermes({});

    await expect(client(fetchImpl, { apiKey: undefined }).chat({ text: "oi", sessionId: "s" })).rejects.toBeInstanceOf(HermesRequestError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("when starting, 429 and 503 are retried by the queue; other statuses are not", async () => {
    for (const status of [429, 503]) {
      const failing = client(hermes({ start: () => json({}, status) }));
      await expect(failing.chat({ text: "oi", sessionId: "s" })).rejects.toBeInstanceOf(RetryableJobError);
    }
    for (const status of [400, 401, 500, 502]) {
      const failing = client(hermes({ start: () => json({}, status) }));
      const error = await failing.chat({ text: "oi", sessionId: "s" }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(HermesRequestError);
      expect(error).not.toBeInstanceOf(RetryableJobError);
    }
  });

  test("a refused connection while starting is left to the queue, which may retry it", async () => {
    const refused = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });

    const error = await client(refused).chat({ text: "oi", sessionId: "s" }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(TypeError);
  });

  test("a run that fails reports Hermes' error, never retried", async () => {
    const fetchImpl = hermes({ events: () => sse([{ event: "run.failed", error: "provider exploded" }]) });

    const error = await client(fetchImpl).chat({ text: "oi", sessionId: "s" }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(HermesRequestError);
    expect((error as Error).message).toBe("provider exploded");
  });

  test("if the event stream drops, the result is read by polling the run", async () => {
    const statuses = [json({ status: "running" }), json({ status: "completed", output: "feito" })];
    const fetchImpl = hermes({
      events: () => sse([{ event: "tool.started", tool: "terminal", tool_call_id: "c1" }]),
      status: () => statuses.shift() as Response,
    });

    const reply = await client(fetchImpl).chat({ text: "oi", sessionId: "s" });

    expect(reply.text).toBe("feito");
    expect(reply.trace.entries.filter((entry) => entry.kind === "tool").map((entry) => entry.status)).toEqual(["done"]);
  });

  test("a lost connection after the run started is final, because Hermes may already have acted", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if ((init?.method ?? "GET") === "POST" && url.endsWith("/v1/runs")) return json({ run_id: "run_1" }, 202);
      if ((init?.method ?? "GET") === "POST") return json({});
      throw new TypeError("fetch failed");
    });

    const error = await client(fetchImpl).chat({ text: "oi", sessionId: "s" }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(HermesRequestError);
    expect(error).not.toBeInstanceOf(TypeError);
  });

  test("a timeout is final and asks Hermes to stop the run", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (method === "POST" && url.endsWith("/v1/runs")) return json({ run_id: "run_1" }, 202);
      if (method === "POST") return json({});
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    });

    const error = await client(fetchImpl, { timeoutMs: 30 }).chat({ text: "oi", sessionId: "s" }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(HermesRequestError);
    expect((error as Error).message).toContain("timed out");
    await vi.waitFor(() =>
      expect(fetchImpl.mock.calls.some(([url, init]) => String(url).endsWith("/stop") && init?.method === "POST")).toBe(true),
    );
  });

  test("the session id keeps only header-safe characters", () => {
    expect(hermesSessionId("u 1", "01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe("braid-u_1-01ARZ3NDEKTSV4RRFFQ69G5FAV");
    expect(hermesSessionId("u1", "01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe("braid-u1-01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });
});
