import OpenAI from "openai";
import { describe, expect, test, vi } from "vitest";
import { AgentRunCancelledError, LlmUnavailableError } from "../../api-core/agent/errors/agent.errors";
import type { StructuredCompletionInput } from "../../api-core/agent/gateways/structured-completion.gateway";
import { OpenAIStructuredCompletionGateway } from "./openai-structured.gateway";

const INPUT: StructuredCompletionInput = {
  system: "Você é o agente de consulta.", user: "Pedido:\no que tenho amanhã?", schemaName: "query",
  schema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, timeoutMs: 1000,
  model: { provider: "openai", model: "gpt-6.2-sol", effort: "max" },
};

function reply(output: unknown[], extra: Record<string, unknown> = {}): unknown {
  const text = output
    .flatMap((item) => ((item as { type: string }).type === "message" ? (item as { content: Array<{ type: string; text?: string }> }).content : []))
    .map((part) => (part.type === "output_text" ? part.text : ""))
    .join("");
  return {
    model: "gpt-6.2-sol-2026-11-17", output, output_text: text, incomplete_details: null,
    usage: { input_tokens: 120, output_tokens: 30 },
    ...extra,
  };
}

const answer = (text: string) => ({ type: "message", id: "m_1", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] });

function setup(replies: Array<unknown | Error>) {
  const bodies: Array<Record<string, unknown>> = [];
  const create = vi.fn(async (body: Record<string, unknown>, _options?: unknown) => {
    bodies.push(structuredClone(body));
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  const gateway = new OpenAIStructuredCompletionGateway("sk-test", { responses: { create } } as unknown as Pick<OpenAI, "responses">);
  return { gateway, bodies, create };
}

describe("a chamada estruturada na OpenAI", () => {
  test("vai ao modelo e ao esforco escolhidos pela Responses API, com o schema como formato, sem guardar nada", async () => {
    const { gateway, bodies } = setup([reply([
      { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "Amanhã é quinta." }] },
      answer("{\"sql\":\"select 1\"}"),
    ])]);

    await expect(gateway.complete(INPUT)).resolves.toEqual({
      value: { sql: "select 1" }, modelName: "gpt-6.2-sol-2026-11-17", reasoning: "Amanhã é quinta.",
      usage: { input: 120, output: 30 },
    });
    expect(bodies[0]).toMatchObject({
      model: "gpt-6.2-sol", instructions: INPUT.system, input: INPUT.user, store: false,
      reasoning: { effort: "max", summary: "auto" },
      text: { format: { type: "json_schema", name: "query", schema: INPUT.schema, strict: false } },
    });
    expect(bodies[0]).not.toHaveProperty("tools");
  });

  test("o resumo do raciocinio recusado: a chamada se repete sem ele, e as proximas nem pedem", async () => {
    const refusal = new OpenAI.APIError(400, undefined, "Your organization must be verified to use reasoning summaries.", new Headers());
    const { gateway, bodies } = setup([refusal, reply([answer("{\"sql\":\"select 1\"}")]), reply([answer("{\"sql\":\"select 2\"}")])]);

    await expect(gateway.complete(INPUT)).resolves.toMatchObject({ value: { sql: "select 1" } });
    await expect(gateway.complete(INPUT)).resolves.toMatchObject({ value: { sql: "select 2" } });
    expect(bodies.map((body) => body.reasoning)).toEqual([
      { effort: "max", summary: "auto" }, { effort: "max" }, { effort: "max" },
    ]);
  });

  test.each([
    ["recusa", reply([{ type: "message", id: "m", role: "assistant", content: [{ type: "refusal", refusal: "Não posso." }] }])],
    ["resposta cortada", reply([answer("{\"sql\":\"sel")], { incomplete_details: { reason: "max_output_tokens" } })],
    ["texto sem JSON", reply([answer("Não entendi o pedido.")])],
  ])("%s vira falha de resposta invalida", async (_label, response) => {
    const { gateway } = setup([response]);
    await expect(gateway.complete(INPUT)).rejects.toMatchObject({ name: "FastStageError", reason: "invalid" });
  });

  test("o erro do provedor leva o status; cancelar nao e falha; sem a escolha de um modelo da OpenAI a chamada nem sai", async () => {
    const limited = new OpenAI.APIError(429, undefined, "rate limited", new Headers());
    await expect(setup([limited]).gateway.complete(INPUT)).rejects.toMatchObject({ reason: "provider", status: 429 });

    const controller = new AbortController();
    controller.abort();
    await expect(setup([new Error("aborted")]).gateway.complete({ ...INPUT, signal: controller.signal }))
      .rejects.toBeInstanceOf(AgentRunCancelledError);

    const { gateway, create } = setup([]);
    await expect(gateway.complete({ ...INPUT, model: undefined })).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(create).not.toHaveBeenCalled();
  });
});
