import type OpenAI from "openai";
import { describe, expect, test, vi } from "vitest";
import type { ModelConversationInput } from "./model-agent";
import { OpenRouterProvider } from "./openrouter-provider";

const INPUT: ModelConversationInput = {
  system: "prompt fixo",
  history: [{ role: "user", text: "oi" }, { role: "assistant", text: "Olá!" }],
  context: "Agora: quarta-feira.",
  text: "o que tenho amanhã?",
  tools: [{ name: "list_agenda_tasks", inputSchema: { type: "object" } }],
  model: "google/gemini-4-neon",
  effort: "max",
};

function completion(message: Record<string, unknown>, finish = "stop"): unknown {
  return {
    model: "google/gemini-4-neon",
    choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content: null, ...message } }],
    usage: { prompt_tokens: 90, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 40 } },
  };
}

function setup(replies: unknown[]) {
  const bodies: Array<Record<string, unknown>> = [];
  const create = vi.fn(async (body: Record<string, unknown>) => {
    bodies.push(structuredClone(body));
    return replies.shift();
  });
  const provider = new OpenRouterProvider("sk-or", { chat: { completions: { create } } } as unknown as Pick<OpenAI, "chat">);
  return { provider, bodies };
}

describe("o OpenRouter", () => {
  test("ferramentas no formato da OpenAI, o esforco Maximo como xhigh e o raciocinio devolvido na proxima ida", async () => {
    const details = [{ type: "reasoning.text", text: "Ler a agenda." }];
    const { provider, bodies } = setup([
      completion({
        reasoning_details: details,
        tool_calls: [{ id: "call_1", type: "function", function: { name: "list_agenda_tasks", arguments: "{\"day\":\"amanhã\"}" } }],
      }, "tool_calls"),
      completion({ content: "Dentista às 9h." }),
    ]);
    const conversation = provider.open(INPUT);
    const signal = new AbortController().signal;

    const first = await conversation.next(signal);
    expect(first).toMatchObject({
      stop: "tools", thoughts: ["Ler a agenda."],
      calls: [{ id: "call_1", name: "list_agenda_tasks", input: { day: "amanhã" } }],
      usage: { input: 90, output: 12, cacheRead: 40 },
    });
    expect(bodies[0]).toMatchObject({
      model: "google/gemini-4-neon", reasoning: { effort: "xhigh" },
      tools: [{ type: "function", function: { name: "list_agenda_tasks", parameters: { type: "object" } } }],
      messages: [
        { role: "system", content: "prompt fixo" },
        { role: "user", content: "oi" },
        { role: "assistant", content: "Olá!" },
        { role: "user", content: "Agora: quarta-feira.\n\no que tenho amanhã?" },
      ],
    });

    conversation.answer([{ call: first.calls[0] as never, outcome: { content: "[]", isError: false } }]);
    expect(await conversation.next(signal)).toMatchObject({ stop: "done", text: "Dentista às 9h." });
    expect(((bodies[1]?.messages ?? []) as unknown[]).slice(-2)).toEqual([
      expect.objectContaining({ role: "assistant", reasoning_details: details, tool_calls: [expect.objectContaining({ id: "call_1" })] }),
      { role: "tool", tool_call_id: "call_1", content: "[]" },
    ]);
  });

  test("o corte por tamanho e o filtro de conteudo", async () => {
    const { provider } = setup([completion({ content: "meia resp" }, "length"), completion({ content: "" }, "content_filter")]);
    expect(await provider.open(INPUT).next(new AbortController().signal)).toMatchObject({ stop: "truncated" });
    expect(await provider.open(INPUT).next(new AbortController().signal)).toMatchObject({ stop: "refused" });
  });
});
