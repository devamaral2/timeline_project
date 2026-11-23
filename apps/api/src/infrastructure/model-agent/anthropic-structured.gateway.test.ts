import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test, vi } from "vitest";
import { AgentRunCancelledError, FastStageError, LlmUnavailableError } from "../../api-core/agent/errors/agent.errors";
import type { StructuredCompletionInput } from "../../api-core/agent/gateways/structured-completion.gateway";
import { AnthropicStructuredCompletionGateway } from "./anthropic-structured.gateway";

const INPUT: StructuredCompletionInput = {
  system: "Você é o agente de consulta.", user: "Pedido:\no que tenho amanhã?", schemaName: "query",
  schema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, timeoutMs: 1000,
  model: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" },
};

function reply(content: unknown[], extra: Record<string, unknown> = {}): unknown {
  return {
    model: "claude-sonnet-5-5", stop_reason: "end_turn", content,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 40, cache_creation_input_tokens: 10 },
    ...extra,
  };
}

function setup(next: unknown | Error | (() => Promise<unknown>)) {
  const bodies: Array<Record<string, unknown>> = [];
  const create = vi.fn(async (body: Record<string, unknown>, _options?: unknown) => {
    bodies.push(structuredClone(body));
    if (typeof next === "function") return (next as () => Promise<unknown>)();
    if (next instanceof Error) throw next;
    return next;
  });
  const gateway = new AnthropicStructuredCompletionGateway("sk-test", { beta: { messages: { create } } } as unknown as Pick<Anthropic, "beta">);
  return { gateway, bodies, create };
}

describe("a chamada estruturada na Anthropic", () => {
  test("vai ao modelo e ao esforco escolhidos, com o schema escrito no prompt, e devolve o JSON, o raciocinio e os tokens", async () => {
    const { gateway, bodies } = setup(reply([
      { type: "thinking", thinking: " Amanhã é quinta. ", signature: "s" },
      { type: "text", text: "```json\n{\"sql\":\"select 1\"}\n```" },
    ]));

    await expect(gateway.complete(INPUT)).resolves.toEqual({
      value: { sql: "select 1" }, modelName: "claude-sonnet-5-5", reasoning: "Amanhã é quinta.",
      usage: { input: 150, output: 20 },
    });
    expect(bodies[0]).toMatchObject({
      model: "claude-sonnet-5-5", messages: [{ role: "user", content: INPUT.user }],
      thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "high" },
      betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
    });
    // A saida presa ao schema nao cabe nos schemas dos agentes: o formato vai por escrito.
    expect(bodies[0]?.output_config).not.toHaveProperty("format");
    expect(String(bodies[0]?.system)).toContain(INPUT.system);
    expect(String(bodies[0]?.system)).toContain(JSON.stringify(INPUT.schema));
  });

  test("o Haiku nao tem o fallback do servidor: a chamada vai sem ele", async () => {
    const { gateway, bodies } = setup(reply([{ type: "text", text: "{\"sql\":\"select 1\"}" }]));
    await gateway.complete({ ...INPUT, model: { provider: "anthropic", model: "claude-haiku-5-5", effort: "low" } });
    expect(bodies[0]).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "low" } });
    expect(bodies[0]).not.toHaveProperty("fallbacks");
    expect(bodies[0]).not.toHaveProperty("betas");
  });

  test.each([
    ["recusa", reply([{ type: "text", text: "Não posso." }], { stop_reason: "refusal" })],
    ["resposta cortada", reply([{ type: "text", text: "{\"sql\":\"sel" }], { stop_reason: "max_tokens" })],
    ["texto sem JSON", reply([{ type: "text", text: "Não entendi o pedido." }])],
  ])("%s vira falha de resposta invalida", async (_label, response) => {
    const { gateway } = setup(response);
    await expect(gateway.complete(INPUT)).rejects.toMatchObject({ name: "FastStageError", reason: "invalid" });
  });

  test("o erro do provedor leva o status; estourar o orcamento e timeout; cancelar nao e falha", async () => {
    const overloaded = new Anthropic.APIError(529, undefined, "overloaded", new Headers());
    await expect(setup(overloaded).gateway.complete(INPUT)).rejects.toMatchObject({ reason: "provider", status: 529 });

    const slow = setup(() => new Promise((_resolve, reject) => setTimeout(() => reject(new Error("aborted")), 30)));
    await expect(slow.gateway.complete({ ...INPUT, timeoutMs: 5 })).rejects.toMatchObject({ reason: "timeout" });

    const controller = new AbortController();
    controller.abort();
    const cancelled = setup(new Error("aborted"));
    await expect(cancelled.gateway.complete({ ...INPUT, signal: controller.signal })).rejects.toBeInstanceOf(AgentRunCancelledError);
  });

  test("sem a escolha de um modelo da Anthropic a chamada nem sai", async () => {
    const { gateway, create } = setup(reply([]));
    await expect(gateway.complete({ ...INPUT, model: undefined })).rejects.toBeInstanceOf(LlmUnavailableError);
    await expect(gateway.complete({ ...INPUT, model: { provider: "openai", model: "gpt-6.2-sol", effort: "low" } }))
      .rejects.toBeInstanceOf(LlmUnavailableError);
    expect(create).not.toHaveBeenCalled();
    expect(new FastStageError("invalid")).toBeInstanceOf(Error);
  });
});
