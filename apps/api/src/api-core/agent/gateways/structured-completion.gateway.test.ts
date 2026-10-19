import { describe, expect, it, vi } from "vitest";
import { isRetryableAiJobError } from "../../../infrastructure/ai-jobs/ai-jobs.service";
import { AgentRunCancelledError, FastStageError, LlmUnavailableError } from "../errors/agent.errors";
import { OpenRouterStructuredCompletionGateway, type StructuredCompletionInput } from "./structured-completion.gateway";

const input: StructuredCompletionInput = {
  stage: "planner", system: "sys", user: "usr", schemaName: "plan", schema: { type: "object" }, timeoutMs: 1000,
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const content = (value: unknown) => reply({ choices: [{ message: { content: JSON.stringify(value) } }] });

describe("OpenRouterStructuredCompletionGateway", () => {
  it("envia o schema como json_schema, sem ferramentas, e devolve o JSON parseado", async () => {
    const request = vi.fn(async () => content({ ok: true }));

    const result = await new OpenRouterStructuredCompletionGateway("key", "modelo-x", request as unknown as typeof fetch).complete(input);

    expect(result).toEqual({ value: { ok: true }, modelName: "modelo-x" });
    const [url, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer key");
    expect(body).toMatchObject({
      model: "modelo-x", temperature: 0, reasoning: { enabled: false }, provider: { sort: "latency" },
      messages: [{ role: "system", content: "sys" }, { role: "user", content: "usr" }],
      response_format: { type: "json_schema", json_schema: { name: "plan", schema: { type: "object" } } },
    });
    expect(body).not.toHaveProperty("tools");
  });

  it("sem chave ou modelo, a indisponibilidade e do provedor", async () => {
    await expect(new OpenRouterStructuredCompletionGateway(undefined, "m").complete(input)).rejects.toBeInstanceOf(LlmUnavailableError);
    await expect(new OpenRouterStructuredCompletionGateway("k", undefined).complete(input)).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("estourar o orcamento falha como timeout e NAO e retentavel", async () => {
    const request = vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError")));
    }));

    const error = await new OpenRouterStructuredCompletionGateway("k", "m", request as unknown as typeof fetch)
      .complete({ ...input, timeoutMs: 20 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(FastStageError);
    expect(error).toMatchObject({ stage: "planner", reason: "timeout" });
    expect(isRetryableAiJobError(error)).toBe(false);
  });

  it("uma chamada que trava e refeita com o que sobrou do orcamento", async () => {
    let calls = 0;
    const request = vi.fn((_url: unknown, init: RequestInit) => {
      calls += 1;
      if (calls > 1) return Promise.resolve(content({ ok: true }));
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError")));
      });
    });
    const startedAt = performance.now();

    const result = await new OpenRouterStructuredCompletionGateway("k", "m", request as unknown as typeof fetch, 10)
      .complete({ ...input, timeoutMs: 100 });

    expect(result.value).toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(2);
    expect(performance.now() - startedAt).toBeLessThan(200);
  });

  it("duas tentativas travadas falham dentro do orcamento da etapa", async () => {
    const request = vi.fn((_url: unknown, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "TimeoutError")));
    }));
    const startedAt = performance.now();

    const error = await new OpenRouterStructuredCompletionGateway("k", "m", request as unknown as typeof fetch, 10)
      .complete({ ...input, timeoutMs: 150 }).catch((e: unknown) => e);

    expect(error).toMatchObject({ name: "FastStageError", reason: "timeout" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(performance.now() - startedAt).toBeLessThan(300);
  });

  it("falha do provedor nao e refeita aqui: o status segue para a fila decidir", async () => {
    const request = vi.fn(async () => reply({}, 503));

    await new OpenRouterStructuredCompletionGateway("k", "m", request as unknown as typeof fetch).complete(input).catch(() => {});

    expect(request).toHaveBeenCalledTimes(1);
  });

  it("429 e 5xx guardam o status e sao retentaveis; 4xx nao", async () => {
    const failWith = (status: number) =>
      new OpenRouterStructuredCompletionGateway("k", "m", (async () => reply({}, status)) as unknown as typeof fetch)
        .complete(input).catch((e: unknown) => e);

    expect(isRetryableAiJobError(await failWith(429))).toBe(true);
    expect(isRetryableAiJobError(await failWith(503))).toBe(true);
    expect(isRetryableAiJobError(await failWith(400))).toBe(false);
    expect(await failWith(400)).toMatchObject({ reason: "provider", status: 400 });
  });

  it.each([
    ["corpo sem conteudo", reply({ choices: [] })],
    ["conteudo que nao e JSON", reply({ choices: [{ message: { content: "nao e json" } }] })],
  ])("resposta inutilizavel: %s", async (_name, response) => {
    const gateway = new OpenRouterStructuredCompletionGateway("k", "m", (async () => response) as unknown as typeof fetch);

    await expect(gateway.complete(input)).rejects.toMatchObject({ name: "FastStageError", reason: "invalid" });
  });

  it("cancelamento de quem pediu nao e falha do provedor", async () => {
    const controller = new AbortController();
    const request = vi.fn(async () => { controller.abort(); throw new DOMException("aborted", "AbortError"); });

    await expect(new OpenRouterStructuredCompletionGateway("k", "m", request as unknown as typeof fetch)
      .complete({ ...input, signal: controller.signal })).rejects.toBeInstanceOf(AgentRunCancelledError);
  });
});
