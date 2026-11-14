import { describe, expect, test } from "vitest";
import { HermesTraceTracker } from "./hermes-trace";

const START = new Date("2026-11-11T18:17:56.000Z");
const at = (seconds: number) => START.getTime() / 1000 + seconds;

describe("HermesTraceTracker", () => {
  test("the trace opens with the request", () => {
    const trace = new HermesTraceTracker("crie um artefato\ncom o resumo da reunião", START).snapshot();

    expect(trace).toMatchObject({ route: "hermes", status: "running", startedAt: START.toISOString(), fields: [] });
    expect(trace.durationMs).toBeUndefined();
    expect(trace.entries).toEqual([
      {
        id: "request", kind: "request", label: "Pedido", status: "done", startedAt: START.toISOString(),
        summary: "crie um artefato",
        sections: [{ title: "Mensagem", text: "crie um artefato\ncom o resumo da reunião" }],
      },
    ]);
  });

  test("a tool keeps what went in, what came out, its timing and the raw events", () => {
    const tracker = new HermesTraceTracker("liste", START);
    const started = { event: "tool.started", tool: "terminal", preview: "ls -la", tool_call_id: "c1", timestamp: at(1) };
    const completed = {
      event: "tool.completed", tool: "terminal", duration: 1.234, error: false, tool_call_id: "c1",
      preview: "total 8\nREADME.md", timestamp: at(2.234),
    };

    expect(tracker.apply(started)).toBe(true);
    expect(tracker.snapshot().entries[1]).toMatchObject({ id: "c1", kind: "tool", status: "running", summary: "ls -la" });
    expect(tracker.apply(completed)).toBe(true);

    expect(tracker.snapshot().entries[1]).toEqual({
      id: "c1", kind: "tool", label: "Executou um comando", source: "terminal", status: "done",
      startedAt: new Date(at(1) * 1000).toISOString(), durationMs: 1234, summary: "ls -la",
      fields: [{ label: "Chamada", value: "c1" }],
      sections: [
        { title: "Entrada", text: "ls -la", code: true },
        { title: "Resultado", text: "total 8\nREADME.md", code: true },
      ],
      raw: { started, completed },
    });
  });

  test("a failed tool is marked failed; without a call id the latest running call of that tool closes", () => {
    const tracker = new HermesTraceTracker("busque", START);
    tracker.apply({ event: "tool.started", tool: "web_search" });
    tracker.apply({ event: "tool.started", tool: "web_search" });

    tracker.apply({ event: "tool.completed", tool: "web_search", error: true });

    expect(tracker.snapshot().entries.slice(1).map((entry) => entry.status)).toEqual(["running", "failed"]);
  });

  test("reasoning and mid-turn commentary become their own entries, with the whole text", () => {
    const tracker = new HermesTraceTracker("pense", START);

    tracker.apply({ event: "reasoning.available", text: "  Preciso ler a agenda.\nDepois crio o artefato.  ", timestamp: at(1) });
    tracker.apply({ event: "message.interim", text: "Vou conferir a agenda primeiro.", timestamp: at(2) });
    expect(tracker.apply({ event: "reasoning.available", text: "   " })).toBe(false);
    expect(tracker.apply({ event: "message.delta", delta: "Olá" })).toBe(false);

    expect(tracker.snapshot().entries.slice(1).map((entry) => [entry.kind, entry.label, entry.summary, entry.sections?.[0]?.text])).toEqual([
      ["thought", "Pensou", "Preciso ler a agenda.", "Preciso ler a agenda.\nDepois crio o artefato."],
      ["message", "Comentou", "Vou conferir a agenda primeiro.", "Vou conferir a agenda primeiro."],
    ]);
  });

  test("a subagent carries its goal, model, tokens and summary", () => {
    const tracker = new HermesTraceTracker("delegue", START);
    tracker.apply({ event: "subagent.start", subagent_id: "a1", goal: "Pesquisar voos", model: "gpt-x", timestamp: at(1) });

    tracker.apply({
      event: "subagent.complete", subagent_id: "a1", status: "completed", duration_seconds: 12.5,
      input_tokens: 1200, output_tokens: 340, tool_count: 3, summary: "Achei três voos.",
    });

    expect(tracker.snapshot().entries[1]).toMatchObject({
      id: "subagent-a1", kind: "agent", label: "Subagente", source: "gpt-x", status: "done", durationMs: 12500,
      summary: "Pesquisar voos",
      fields: [
        { label: "Ferramentas usadas", value: "3" },
        { label: "Tokens de entrada", value: "1.200" },
        { label: "Tokens de saída", value: "340" },
      ],
      sections: [{ title: "Objetivo", text: "Pesquisar voos" }, { title: "Resumo", text: "Achei três voos." }],
    });
  });

  test("the run closes with the answer, the model that served it and the token usage", () => {
    const tracker = new HermesTraceTracker("oi", START);
    tracker.apply({ event: "tool.started", tool: "memory", tool_call_id: "c1", timestamp: at(1) });

    tracker.apply({
      event: "run.completed", output: "Olá!\nComo posso ajudar?", timestamp: at(6.78),
      usage: { input_tokens: 5120, output_tokens: 626, total_tokens: 5746, cache_read_tokens: 0 },
      runtime: { provider: "openrouter", model: "deepseek/deepseek-chat" },
    });

    const trace = tracker.snapshot();
    const totals = [
      { label: "Modelo", value: "deepseek/deepseek-chat" },
      { label: "Provedor", value: "openrouter" },
      { label: "Tokens de entrada", value: "5.120" },
      { label: "Tokens de saída", value: "626" },
      { label: "Tokens no total", value: "5.746" },
    ];
    expect(trace).toMatchObject({ status: "done", durationMs: 6780, fields: totals });
    // Uma ferramenta que ficou aberta nao sobrevive ao fim do turno.
    expect(trace.entries[1]?.status).toBe("done");
    expect(trace.entries.at(-1)).toMatchObject({
      id: "answer", kind: "answer", label: "Respondeu", status: "done", summary: "Olá!",
      fields: totals, sections: [{ title: "Resposta", text: "Olá!\nComo posso ajudar?" }],
    });
  });

  test("a failed run closes the trace as failed, with the error", () => {
    const tracker = new HermesTraceTracker("oi", START);
    tracker.apply({ event: "tool.started", tool: "terminal", tool_call_id: "c1" });

    tracker.apply({ event: "run.failed", error: "model unavailable" });

    const trace = tracker.snapshot();
    expect(trace.status).toBe("failed");
    expect(trace.entries[1]?.status).toBe("failed");
    expect(trace.entries.at(-1)).toMatchObject({ kind: "answer", label: "Falhou", status: "failed", summary: "model unavailable" });
  });

  test("finish closes a trace that never saw the final event, and never closes it twice", () => {
    const tracker = new HermesTraceTracker("oi", START);

    expect(tracker.finish({ output: "Pronto." }).entries.at(-1)).toMatchObject({ label: "Respondeu", summary: "Pronto." });
    expect(tracker.finish({ error: "tarde demais" }).entries.filter((entry) => entry.kind === "answer")).toHaveLength(1);
  });

  test("long texts are cut and the trace never grows past its limit, keeping the request", () => {
    const tracker = new HermesTraceTracker("oi", START);
    tracker.apply({ event: "reasoning.available", text: "x".repeat(5_000) });
    for (let index = 0; index < 200; index += 1) tracker.apply({ event: "tool.started", tool: "terminal", tool_call_id: `c${index}` });

    const { entries } = tracker.snapshot();
    expect(entries).toHaveLength(150);
    expect(entries[0]?.id).toBe("request");
    expect(entries.at(-1)?.id).toBe("c199");
    const cut = new HermesTraceTracker("oi", START);
    cut.apply({ event: "reasoning.available", text: "x".repeat(5_000) });
    expect(cut.snapshot().entries[1]?.sections?.[0]?.text).toHaveLength(4_001);
  });
});
