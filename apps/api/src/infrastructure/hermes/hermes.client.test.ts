import { describe, expect, test, vi } from "vitest";
import { RetryableAiJobError } from "../ai-jobs/ai-jobs.service";
import { HermesClient, HermesRequestError, hermesSessionId } from "./hermes.client";

const reply = (content: unknown) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

function client(fetchImpl: typeof fetch, extra: { apiKey?: string | undefined; timeoutMs?: number } = {}) {
  return new HermesClient({
    url: "http://hermes.test:8642/",
    apiKey: "apiKey" in extra ? extra.apiKey : "k".repeat(32),
    timeoutMs: extra.timeoutMs,
    fetch: fetchImpl,
  });
}

describe("HermesClient", () => {
  test("posts the message with the bearer and the session header, and returns the text", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => reply("Feito."));

    await expect(client(fetchImpl).chat({ text: "crie uma nota", sessionId: "braid-u1-main" })).resolves.toEqual({
      text: "Feito.",
    });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://hermes.test:8642/v1/chat/completions");
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${"k".repeat(32)}`,
      "x-hermes-session-id": "braid-u1-main",
    });
    expect(JSON.parse(init.body as string)).toEqual({
      model: "hermes-agent",
      stream: false,
      messages: [{ role: "user", content: "crie uma nota" }],
    });
  });

  test("without a key it fails before touching the network", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(client(fetchImpl, { apiKey: undefined }).chat({ text: "oi", sessionId: "s" })).rejects.toBeInstanceOf(
      HermesRequestError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test("429 and 503 are retried by the queue; other statuses are not", async () => {
    for (const status of [429, 503]) {
      const failing = client(async () => new Response("", { status }));
      await expect(failing.chat({ text: "oi", sessionId: "s" })).rejects.toBeInstanceOf(RetryableAiJobError);
    }
    for (const status of [400, 401, 500, 502]) {
      const failing = client(async () => new Response("", { status }));
      const error = await failing.chat({ text: "oi", sessionId: "s" }).catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(HermesRequestError);
      expect(error).not.toBeInstanceOf(RetryableAiJobError);
    }
  });

  test("a reply without text is an error", async () => {
    await expect(client(async () => reply(null)).chat({ text: "oi", sessionId: "s" })).rejects.toBeInstanceOf(
      HermesRequestError,
    );
  });

  test("a timeout is final, because Hermes may already have acted", async () => {
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });

    const error = await client(hanging, { timeoutMs: 20 })
      .chat({ text: "oi", sessionId: "s" })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(HermesRequestError);
    expect((error as Error).message).toContain("timed out");
  });

  test("the session id keeps only header-safe characters", () => {
    expect(hermesSessionId("u 1", undefined)).toBe("braid-u_1-main");
    expect(hermesSessionId("u1", "01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe("braid-u1-01ARZ3NDEKTSV4RRFFQ69G5FAV");
  });
});
