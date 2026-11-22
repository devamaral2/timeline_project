import type Anthropic from "@anthropic-ai/sdk";
import type { AgentTraceDto, ModelSelection } from "@repo/contracts";
import { describe, expect, test, vi } from "vitest";
import type { AgendaToolSession, AgendaTools, ToolOutcome } from "./agenda-tools";
import { AnthropicProvider } from "./anthropic-provider";
import { ModelAgent, ModelRequestError } from "./model-agent";

type Block = Record<string, unknown>;

function response(content: Block[], stop_reason = "end_turn"): unknown {
  return {
    model: "claude-opus-5-5", content, stop_reason,
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
  };
}

const TOOLS = [{ name: "create_task", inputSchema: { type: "object" } }, { name: "list_agenda_tasks", inputSchema: { type: "object" } }];
const API_TOOLS = [{ name: "create_task", input_schema: { type: "object" } }, { name: "list_agenda_tasks", input_schema: { type: "object" } }];

function setup(
  replies: Array<unknown | Error>,
  outcomes: Record<string, ToolOutcome> = {},
  options: { tools?: boolean; selection?: Partial<ModelSelection> } = {},
) {
  const requests: Array<Record<string, unknown>> = [];
  const create = vi.fn(async (body: Record<string, unknown>) => {
    // A mensagem muda depois da chamada: guarda como ela foi.
    requests.push(structuredClone(body));
    const next = replies.shift();
    if (next instanceof Error) throw next;
    if (!next) throw new Error("sem resposta combinada");
    return next;
  });
  const calls: Array<{ name: string; input: unknown }> = [];
  const close = vi.fn(async () => {});
  const session: AgendaToolSession = {
    tools: TOOLS,
    call: async (name, input) => {
      calls.push({ name, input });
      return outcomes[name] ?? { content: `${name} ok`, isError: false };
    },
    close,
  };
  const tools: AgendaTools = { open: vi.fn(async () => session) };
  const anthropic = new AnthropicProvider("sk-test", { beta: { messages: { create } } } as unknown as Pick<Anthropic, "beta">);
  const client = new ModelAgent({
    providers: { anthropic }, system: "prompt fixo",
    ...(options.tools === false ? {} : { tools }),
  });
  const selection: ModelSelection = { provider: "anthropic", model: "claude-opus-5-5", effort: "medium", ...options.selection };
  const traces: AgentTraceDto[] = [];
  const chat = (signal = new AbortController().signal) => client.chat({
    selection,
    text: "marque dentista amanhã às 9h",
    history: [{ role: "user", text: "oi" }, { role: "assistant", text: "Olá!" }],
    context: "Agora: quarta-feira.",
    signal,
    onTrace: (trace) => traces.push(trace),
  });
  return { chat, create, requests, calls, close, traces, tools };
}

describe("o turno", () => {
  test("o modelo pede ferramentas, elas rodam no MCP e a resposta final volta com o rastro", async () => {
    const { chat, requests, calls, close, traces } = setup([
      response([
        { type: "thinking", thinking: "Preciso ver a agenda de amanhã.", signature: "s1" },
        { type: "tool_use", id: "toolu_1", name: "list_agenda_tasks", input: { from: "2026-11-19T00:00:00-03:00" } },
        { type: "tool_use", id: "toolu_2", name: "create_task", input: { name: "Dentista" } },
      ], "tool_use"),
      response([{ type: "text", text: "Marquei o dentista amanhã às 9h." }]),
    ], { create_task: { content: "{\"taskId\":\"t1\"}", isError: false } });

    const reply = await chat();

    expect(reply.text).toBe("Marquei o dentista amanhã às 9h.");
    expect(calls).toEqual([
      { name: "list_agenda_tasks", input: { from: "2026-11-19T00:00:00-03:00" } },
      { name: "create_task", input: { name: "Dentista" } },
    ]);
    // O prompt fixo, as ferramentas, o raciocinio resumido e o cache: o que muda por pedido vai na mensagem.
    expect(requests[0]).toMatchObject({
      model: "claude-opus-5-5", system: "prompt fixo", tools: API_TOOLS,
      thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" }, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"],
      messages: [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Olá!" },
        { role: "user", content: [{ type: "text", text: "Agora: quarta-feira." }, { type: "text", text: "marque dentista amanhã às 9h" }] },
      ],
    });
    // A resposta do modelo volta inteira (o raciocinio junto) e os dois resultados numa mensagem so.
    const second = requests[1]?.messages as Array<{ role: string; content: unknown }>;
    expect(second.at(-2)).toMatchObject({ role: "assistant", content: [{ type: "thinking", signature: "s1" }, { type: "tool_use" }, { type: "tool_use" }] });
    expect(second.at(-1)).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_1", content: "list_agenda_tasks ok" },
        { type: "tool_result", tool_use_id: "toolu_2", content: "{\"taskId\":\"t1\"}" },
      ],
    });
    expect(close).toHaveBeenCalledOnce();

    expect(reply.trace).toMatchObject({ route: "model", status: "done" });
    expect(reply.trace.entries.map((entry) => [entry.kind, entry.label, entry.status])).toEqual([
      ["request", "Pedido", "done"],
      ["thought", "Pensou", "done"],
      ["tool", "Listou a agenda", "done"],
      ["tool", "Criou uma tarefa", "done"],
      ["answer", "Respondeu", "done"],
    ]);
    expect(reply.trace.fields).toEqual(expect.arrayContaining([
      { label: "Modelo", value: "claude-opus-5-5" },
      { label: "Provedor", value: "Anthropic" },
      { label: "Esforço", value: "Médio" },
      { label: "Chamadas ao modelo", value: "2" },
      { label: "Tokens de entrada", value: "200" },
    ]));
    // O chat ve a ferramenta rodando antes do fim do turno.
    expect(traces.some((trace) => trace.entries.some((entry) => entry.kind === "tool" && entry.status === "running"))).toBe(true);
  });

  test("uma ferramenta que falha volta ao modelo como erro, e o rastro marca a falha", async () => {
    const { chat, requests } = setup([
      response([{ type: "tool_use", id: "toolu_1", name: "create_task", input: {} }], "tool_use"),
      response([{ type: "text", text: "Não consegui criar." }]),
    ], { create_task: { content: "name is required", isError: true } });

    const reply = await chat();

    const messages = requests[1]?.messages as Array<{ content: unknown }>;
    expect(messages.at(-1)?.content).toEqual([{ type: "tool_result", tool_use_id: "toolu_1", content: "name is required", is_error: true }]);
    expect(reply.trace.entries.find((entry) => entry.kind === "tool")?.status).toBe("failed");
  });

  test("sem as ferramentas da agenda, o modelo so conversa", async () => {
    const { chat, requests } = setup([response([{ type: "text", text: "Oi!" }])], {}, { tools: false });
    expect((await chat()).text).toBe("Oi!");
    expect(requests[0]).not.toHaveProperty("tools");
  });
});

describe("falhas", () => {
  test("antes de qualquer acao, o erro da API segue como veio: a fila repete 429 e 5xx", async () => {
    const overloaded = Object.assign(new Error("overloaded"), { status: 529 });
    const { chat, close, traces } = setup([overloaded]);
    await expect(chat()).rejects.toBe(overloaded);
    expect(close).toHaveBeenCalledOnce();
    expect(traces.at(-1)).toMatchObject({ status: "failed" });
  });

  test("depois de uma ferramenta de escrita, toda falha e definitiva: repetir o turno repetiria a acao", async () => {
    const { chat } = setup([
      response([{ type: "tool_use", id: "toolu_1", name: "create_task", input: { name: "x" } }], "tool_use"),
      Object.assign(new Error("overloaded"), { status: 529 }),
    ]);
    await expect(chat()).rejects.toBeInstanceOf(ModelRequestError);
  });

  test("depois de so ler, o erro ainda pode ser repetido", async () => {
    const overloaded = Object.assign(new Error("overloaded"), { status: 529 });
    const { chat } = setup([
      response([{ type: "tool_use", id: "toolu_1", name: "list_agenda_tasks", input: {} }], "tool_use"),
      overloaded,
    ]);
    await expect(chat()).rejects.toBe(overloaded);
  });

  test("a recusa termina o turno sem repetir", async () => {
    const { chat } = setup([response([], "refusal")]);
    await expect(chat()).rejects.toThrow("O modelo recusou este pedido.");
  });

  test("um pedido de ferramenta cortado no limite de tokens nao roda", async () => {
    const { chat, calls } = setup([
      response([{ type: "tool_use", id: "toolu_1", name: "create_task", input: { name: "Den" } }], "max_tokens"),
    ]);
    await expect(chat()).rejects.toBeInstanceOf(ModelRequestError);
    expect(calls).toEqual([]);
  });

  test("o MCP fora do ar nao deixa o turno comecar", async () => {
    const { chat, tools, create } = setup([]);
    vi.mocked(tools.open).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(chat()).rejects.toThrow("As ferramentas da agenda estão fora do ar.");
    expect(create).not.toHaveBeenCalled();
  });

  test("um provedor sem chave neste ambiente nao comeca o turno", async () => {
    const { chat, create } = setup([], {}, { selection: { provider: "openai", model: "gpt-6.2-sol" } });
    await expect(chat()).rejects.toThrow("Este provedor não está ligado neste ambiente.");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("a Anthropic", () => {
  test("o esforco escolhido vai em output_config; o Haiku vai sem o fallback do servidor, que ele nao tem", async () => {
    const { chat, requests } = setup([response([{ type: "text", text: "Oi!" }])], {}, {
      selection: { model: "claude-haiku-5-5", effort: "max" },
    });
    await chat();
    expect(requests[0]).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "max" } });
    expect(requests[0]).not.toHaveProperty("fallbacks");
    expect(requests[0]).not.toHaveProperty("betas");
  });

  test("pause_turn chama de novo com a mesma conversa", async () => {
    const { chat, requests } = setup([
      response([{ type: "text", text: "Pensando" }], "pause_turn"),
      response([{ type: "text", text: "Pronto." }]),
    ]);
    expect((await chat()).text).toBe("Pronto.");
    expect((requests[1]?.messages as unknown[]).at(-1)).toMatchObject({ role: "assistant" });
  });
});

