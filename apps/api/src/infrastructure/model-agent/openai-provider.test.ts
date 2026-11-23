import OpenAI from "openai";
import { describe, expect, test, vi } from "vitest";
import type { ModelConversationInput } from "./model-agent";
import { OpenAIProvider } from "./openai-provider";

const INPUT: ModelConversationInput = {
  system: "prompt fixo",
  history: [{ role: "user", text: "oi" }, { role: "assistant", text: "Olá!" }],
  context: "Agora: quarta-feira.",
  text: "marque dentista amanhã",
  tools: [{ name: "create_task", description: "Cria", inputSchema: { type: "object" } }],
  model: "gpt-6.2-sol",
  effort: "max",
};

function reply(output: unknown[], extra: Record<string, unknown> = {}): unknown {
  const text = output
    .flatMap((item) => ((item as { type: string }).type === "message" ? (item as { content: Array<{ type: string; text?: string }> }).content : []))
    .map((part) => (part.type === "output_text" ? part.text : ""))
    .join("");
  return {
    model: "gpt-6.2-sol-2026-11-17", output, output_text: text, incomplete_details: null,
    usage: { input_tokens: 120, output_tokens: 30, input_tokens_details: { cached_tokens: 80, cache_write_tokens: 0 } },
    ...extra,
  };
}

function setup(replies: Array<unknown | Error>) {
  const bodies: Array<Record<string, unknown>> = [];
  const create = vi.fn(async (body: Record<string, unknown>) => {
    bodies.push(structuredClone(body));
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  });
  const provider = new OpenAIProvider("sk-test", { responses: { create } } as unknown as Pick<OpenAI, "responses">);
  return { provider, bodies, create };
}

describe("a OpenAI pela Responses API", () => {
  test("ferramentas, raciocinio resumido e a conversa sem guardar nada na OpenAI", async () => {
    const { provider, bodies } = setup([
      reply([
        { type: "reasoning", id: "rs_1", summary: [{ type: "summary_text", text: "Vou criar a tarefa." }], encrypted_content: "enc" },
        { type: "function_call", id: "fc_1", call_id: "call_1", name: "create_task", arguments: "{\"name\":\"Dentista\"}" },
      ]),
      reply([{ type: "message", id: "m_1", role: "assistant", content: [{ type: "output_text", text: "Marquei.", annotations: [] }] }]),
    ]);
    const conversation = provider.open(INPUT);
    const signal = new AbortController().signal;

    const first = await conversation.next(signal);
    expect(first).toMatchObject({
      model: "gpt-6.2-sol-2026-11-17", stop: "tools", thoughts: ["Vou criar a tarefa."],
      calls: [{ id: "call_1", name: "create_task", input: { name: "Dentista" } }],
      usage: { input: 120, output: 30, cacheRead: 80 },
    });
    expect(bodies[0]).toMatchObject({
      model: "gpt-6.2-sol", instructions: "prompt fixo", store: false, include: ["reasoning.encrypted_content"],
      reasoning: { effort: "max", summary: "auto" },
      tools: [{ type: "function", name: "create_task", description: "Cria", parameters: { type: "object" }, strict: false }],
      input: [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Olá!" },
        { role: "user", content: [{ type: "input_text", text: "Agora: quarta-feira." }, { type: "input_text", text: "marque dentista amanhã" }] },
      ],
    });

    conversation.answer([{ call: first.calls[0] as never, outcome: { content: "nome curto demais", isError: true } }]);
    const second = await conversation.next(signal);
    expect(second).toMatchObject({ stop: "done", text: "Marquei.", calls: [] });
    // O raciocinio cifrado e o pedido voltam inteiros, seguidos do resultado.
    expect((bodies[1]?.input as unknown[]).slice(-3)).toEqual([
      expect.objectContaining({ type: "reasoning", encrypted_content: "enc" }),
      expect.objectContaining({ type: "function_call", call_id: "call_1" }),
      { type: "function_call_output", call_id: "call_1", output: "Erro: nome curto demais" },
    ]);
  });

  test("sem o resumo liberado para a organizacao, refaz a chamada sem ele e nao pede mais", async () => {
    const refused = new OpenAI.BadRequestError(400, { message: "Your organization must be verified to generate reasoning summaries." }, "Your organization must be verified to generate reasoning summaries.", new Headers());
    const ok = reply([{ type: "message", id: "m_1", role: "assistant", content: [{ type: "output_text", text: "Oi.", annotations: [] }] }]);
    const { provider, bodies } = setup([refused, ok, ok]);

    expect((await provider.open(INPUT).next(new AbortController().signal)).text).toBe("Oi.");
    await provider.open(INPUT).next(new AbortController().signal);

    expect(bodies.map((body) => body.reasoning)).toEqual([
      { effort: "max", summary: "auto" }, { effort: "max" }, { effort: "max" },
    ]);
  });

  test("entrada de ferramenta que nao e JSON volta marcada, e o limite de tokens corta o turno", async () => {
    const { provider } = setup([reply(
      [{ type: "function_call", id: "fc_1", call_id: "call_1", name: "create_task", arguments: "{\"name\":" }],
      { incomplete_details: { reason: "max_output_tokens" } },
    )]);
    const step = await provider.open(INPUT).next(new AbortController().signal);
    expect(step).toMatchObject({ stop: "truncated", calls: [{ id: "call_1", invalid: true }] });
  });

  test("a recusa do modelo vira recusa do turno, com o texto dela", async () => {
    const { provider } = setup([reply([{ type: "message", id: "m_1", role: "assistant", content: [{ type: "refusal", refusal: "Não posso ajudar." }] }])]);
    expect(await provider.open(INPUT).next(new AbortController().signal)).toMatchObject({ stop: "refused", text: "Não posso ajudar." });
  });
});
