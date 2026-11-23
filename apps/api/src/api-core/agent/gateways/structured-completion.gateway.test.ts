import { describe, expect, it, vi } from "vitest";
import { isRetryableJobError } from "../../../infrastructure/jobs/jobs.service";
import { AgentRunCancelledError, FastStageError, LlmUnavailableError } from "../errors/agent.errors";
import {
  jsonReply, OpenRouterStructuredCompletionGateway, SelectedModelCompletionGateway, withSchemaInstruction,
  type StructuredCompletionGateway, type StructuredCompletionInput,
} from "./structured-completion.gateway";

const input: StructuredCompletionInput = {
  system: "sys", user: "usr", schemaName: "plan", schema: { type: "object" }, timeoutMs: 1000,
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

  it("com raciocinio pedido, manda o esforco e devolve o que o modelo pensou", async () => {
    const request = vi.fn(async () => reply({
      choices: [{ message: { content: JSON.stringify({ ok: true }), reasoning: "  O pedido fala de um almoço.  " } }],
    }));

    const result = await new OpenRouterStructuredCompletionGateway("k", "m", request as unknown as typeof fetch)
      .complete({ ...input, reasoning: "low" });

    expect(result).toEqual({ value: { ok: true }, modelName: "m", reasoning: "O pedido fala de um almoço." });
    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).reasoning).toEqual({ effort: "low" });
  });

  it("sem o texto pronto, o raciocinio sai dos blocos legiveis; sem pedir, nao volta", async () => {
    const message = {
      content: JSON.stringify({ ok: true }),
      reasoning: null,
      reasoning_details: [
        { type: "reasoning.summary", summary: "Resumo do que pensei." },
        { type: "reasoning.encrypted", data: "x" },
        { type: "reasoning.text", text: "Segundo bloco." },
      ],
    };
    const request = (async () => reply({ choices: [{ message }] })) as unknown as typeof fetch;

    const asked = await new OpenRouterStructuredCompletionGateway("k", "m", request).complete({ ...input, reasoning: "high" });
    expect(asked.reasoning).toBe("Resumo do que pensei.\n\nSegundo bloco.");

    const silent = await new OpenRouterStructuredCompletionGateway("k", "m", request).complete(input);
    expect(silent).toEqual({ value: { ok: true }, modelName: "m" });
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
    expect(error).toMatchObject({ reason: "timeout" });
    expect(isRetryableJobError(error)).toBe(false);
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

    expect(isRetryableJobError(await failWith(429))).toBe(true);
    expect(isRetryableJobError(await failWith(503))).toBe(true);
    expect(isRetryableJobError(await failWith(400))).toBe(false);
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

describe("o modelo que o usuario escolheu para o pedido", () => {
  const chosen = { provider: "openrouter", model: "google/gemini-4-neon", effort: "max" } as const;

  it("no OpenRouter, a chamada vai ao modelo escolhido, no esforco dele, e devolve o que ele pensou", async () => {
    const request = vi.fn(async () => reply({
      choices: [{ message: { content: JSON.stringify({ ok: true }), reasoning: "Pensei bastante." } }],
    }));

    const result = await new OpenRouterStructuredCompletionGateway("k", "modelo-fixo", request as unknown as typeof fetch)
      .complete({ ...input, model: chosen });

    expect(result).toEqual({ value: { ok: true }, modelName: "google/gemini-4-neon", reasoning: "Pensei bastante." });
    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    // Maximo e o `xhigh`, o mais alto que o OpenRouter traduz para todo modelo.
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "google/gemini-4-neon", reasoning: { effort: "xhigh" } });
  });

  it("no OpenRouter, o modelo escolhido recebe o formato tambem por escrito e a resposta cercada de crases e lida", async () => {
    const request = vi.fn(async () => reply({ choices: [{ message: { content: "```json\n{\"ok\":true}\n```" } }] }));

    const result = await new OpenRouterStructuredCompletionGateway("k", "modelo-fixo", request as unknown as typeof fetch)
      .complete({ ...input, model: chosen });

    expect(result.value).toEqual({ ok: true });
    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].content).toBe(withSchemaInstruction("sys", { type: "object" }));
    expect(body.response_format).toMatchObject({ type: "json_schema" });
  });

  it("a escolha no OpenRouter dispensa o modelo fixo do servidor", async () => {
    const request = vi.fn(async () => content({ ok: true }));
    const gateway = new OpenRouterStructuredCompletionGateway("k", undefined, request as unknown as typeof fetch);
    await expect(gateway.complete({ ...input, model: chosen })).resolves.toMatchObject({ modelName: "google/gemini-4-neon" });
    await expect(gateway.complete(input)).rejects.toBeInstanceOf(LlmUnavailableError);
  });

  it("sem escolha vale o modelo fixo; com ela, o gateway do provedor; provedor sem chave falha em vez de trocar de modelo", async () => {
    const stub = (name: string): StructuredCompletionGateway & { complete: ReturnType<typeof vi.fn> } =>
      ({ complete: vi.fn(async () => ({ value: {}, modelName: name })) });
    const fixed = stub("fixo");
    const anthropic = stub("anthropic");
    const gateway = new SelectedModelCompletionGateway(fixed, { anthropic });

    await expect(gateway.complete(input)).resolves.toMatchObject({ modelName: "fixo" });
    const selected = { ...input, model: { provider: "anthropic", model: "claude-haiku-5-5", effort: "low" } as const };
    await expect(gateway.complete(selected)).resolves.toMatchObject({ modelName: "anthropic" });
    expect(anthropic.complete).toHaveBeenCalledWith(selected);
    expect(() => gateway.complete({ ...input, model: chosen })).toThrow(LlmUnavailableError);
    expect(fixed.complete).toHaveBeenCalledTimes(1);
  });

  it("le o JSON de uma resposta em texto, com ou sem cerca, e o formato pedido por escrito leva o schema", () => {
    expect(jsonReply("{\"a\":1}")).toEqual({ a: 1 });
    expect(jsonReply("Segue:\n```json\n{\"a\":{\"b\":[1,2]}}\n```\n")).toEqual({ a: { b: [1, 2] } });
    expect(() => jsonReply("sem objeto")).toThrow();
    expect(() => jsonReply("{\"a\":")).toThrow();
    expect(withSchemaInstruction("# Papel\nConsulta.", { type: "object" })).toBe(
      "# Papel\nConsulta.\n\n# Formato da resposta\nResponda só com um objeto JSON, sem texto antes ou depois e sem cercas de código, que siga este JSON Schema:\n{\"type\":\"object\"}",
    );
  });
});
