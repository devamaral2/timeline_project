import { describe, expect, test } from "vitest";
import { stepLabel } from "./request-config";
import type { DispatchRecord, RequestEntityRecord, RequestRecord, StepRecord } from "./request-store";
import { formatDuration, toRequestTrace } from "./request-trace";

const CREATED = new Date("2026-11-11T12:00:00.000Z");
const plus = (ms: number) => new Date(CREATED.getTime() + ms);

function request(partial: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: "r1", userId: "u1", kind: "request", route: "steps", title: "almoço ao meio-dia e o cardápio",
    prompt: "almoço ao meio-dia e o cardápio", context: { screen: "agenda" }, status: "running", createdAt: CREATED,
    updatedAt: CREATED, failedSteps: [], ...partial,
  };
}

type StepSeed = Omit<StepRecord, "requestId" | "label">;
const step = (seed: StepSeed): StepRecord => ({ ...seed, requestId: "r1", label: stepLabel(seed.agent) });

const dispatch: DispatchRecord = {
  model: "jev-latest", latencyMs: 412,
  answers: {
    event_create: { choice: "one", confidence: 0.98, probability: 0.97 },
    artifact_create: { choice: "one", confidence: 0.95, probability: 0.94 },
    event_edit: { choice: "none", confidence: 0.99, probability: 0.99 },
  },
  uncertain: [], unsupported: [],
};

const steps: StepRecord[] = [
  step({
    id: "s1", agent: "event-create", expected: "one", status: "done",
    startedAt: plus(500), finishedAt: plus(1700), timings: { total: 1150 },
  }),
  step({ id: "s2", agent: "artifact-create", expected: "many", status: "running", startedAt: plus(520) }),
];

const entities: RequestEntityRecord[] = [
  {
    requestId: "r1", kind: "event", id: "e1", stepId: "s1", operation: "create",
    summary: { name: "Almoço" }, finalized: true, links: [],
  },
];

describe("formatDuration", () => {
  test("milliseconds under a second, seconds with a comma above", () => {
    expect(formatDuration(412)).toBe("412 ms");
    expect(formatDuration(1234)).toBe("1,2 s");
  });
});

describe("toRequestTrace", () => {
  test("while dispatching, the trace has the request and the routing in progress", () => {
    const trace = toRequestTrace(request({ status: "queued" }), [], []);

    expect(trace).toMatchObject({ route: "steps", status: "running", startedAt: CREATED.toISOString() });
    expect(trace.durationMs).toBeUndefined();
    expect(trace.entries.map((entry) => [entry.kind, entry.label, entry.status])).toEqual([
      ["request", "Pedido", "done"],
      ["routing", "Roteamento do pedido", "running"],
    ]);
    expect(trace.entries[0]).toMatchObject({
      summary: "almoço ao meio-dia e o cardápio",
      fields: [{ label: "Tela", value: "agenda" }],
      sections: [{ title: "Mensagem", text: "almoço ao meio-dia e o cardápio" }],
    });
  });

  test("the routing shows the model, its latency and what was done with every answer", () => {
    const trace = toRequestTrace(request({ dispatch }), steps, entities);

    const routing = trace.entries[1];
    expect(routing).toMatchObject({
      kind: "routing", status: "done", source: "jev-latest", durationMs: 412,
      summary: "Aciona: Criando eventos, Criando artefatos", raw: dispatch,
    });
    expect(routing?.fields?.slice(0, 2)).toEqual([
      { label: "Modelo", value: "jev-latest" }, { label: "Latência", value: "412 ms" },
    ]);
    expect(routing?.sections?.[0]).toEqual({
      title: "Respostas do roteador", code: true,
      text: [
        "event_create: one · confiança 98% · probabilidade 97% · aciona um agente",
        "artifact_create: one · confiança 95% · probabilidade 94% · aciona um agente",
        "event_edit: none · confiança 99% · probabilidade 99% · ignorada",
      ].join("\n"),
    });
    expect(trace.fields).toEqual([
      { label: "Roteador", value: "jev-latest" }, { label: "Agentes", value: "2" }, { label: "Registros", value: "1" },
    ]);
  });

  test("each agent carries its state, timing and what it wrote", () => {
    const trace = toRequestTrace(request({ dispatch }), steps, entities);

    expect(trace.entries[2]).toMatchObject({
      id: "s1", kind: "agent", label: "Criando eventos", source: "event-create", status: "done",
      startedAt: plus(500).toISOString(), durationMs: 1200, summary: "Almoço",
      fields: [
        { label: "Quantidade esperada", value: "um" },
        { label: "Tempo do agente", value: "1,1 s" },
      ],
      sections: [{ title: "Registros", text: "Evento criado · Almoço" }],
    });
    expect(trace.entries[3]).toMatchObject({ id: "s2", status: "running", fields: [{ label: "Quantidade esperada", value: "vários" }] });
    expect(trace.entries[3]?.durationMs).toBeUndefined();
    expect(trace.entries).toHaveLength(4);
  });

  test("what the model thought comes right after the agent that thought it, one entry per call", () => {
    const at = plus(1600).toISOString();
    const thoughts = [
      { text: "O pedido fala de um almoço ao meio-dia.\nCrio um evento só.", at, model: "modelo-x" },
      { text: "Confiro o horário.", at: plus(1650).toISOString() },
    ];
    const trace = toRequestTrace(
      request({ dispatch }), steps.map((step) => (step.id === "s1" ? { ...step, thoughts } : step)), entities,
    );

    expect(trace.entries.map((entry) => entry.id)).toEqual(["r1-request", "r1-routing", "s1", "s1-thought-1", "s1-thought-2", "s2"]);
    expect(trace.entries[3]).toEqual({
      id: "s1-thought-1", kind: "thought", label: "Pensou", source: "event-create", status: "done",
      summary: "O pedido fala de um almoço ao meio-dia.", startedAt: at,
      fields: [{ label: "Agente", value: "Criando eventos" }, { label: "Modelo", value: "modelo-x" }],
      sections: [{ title: "Raciocínio", text: "O pedido fala de um almoço ao meio-dia.\nCrio um evento só." }],
      raw: { stepId: "s1", agent: "event-create", at, model: "modelo-x", chars: 58 },
    });
    expect(trace.entries[4]?.fields).toEqual([{ label: "Agente", value: "Criando eventos" }]);
    expect(trace.entries[2]?.raw).toMatchObject({ thoughts: 2 });
    // Os totais contam agentes, nao os pensamentos deles.
    expect(trace.fields).toContainEqual({ label: "Agentes", value: "2" });
  });

  test("a fallback routing explains why; an edit request without dispatch has no routing entry", () => {
    const fallback = toRequestTrace(
      request({ dispatch: { answers: {}, uncertain: [], unsupported: [], fallbackReason: "no_step" } satisfies DispatchRecord }),
      [step({ id: "f1", agent: "fallback", expected: "one", status: "running" })], [],
    );
    expect(fallback.entries[1]).toMatchObject({ kind: "routing", summary: "Fallback: nenhum agente reconhecido para o pedido" });

    const edit = toRequestTrace(request({ context: { screen: "detail", entityId: "a1" } }), [step({
      id: "s1", agent: "sleep-edit", expected: "one", status: "running",
      input: { target: { entityType: "sleep_artifact", id: "a1", snapshot: { name: "Sono" } } },
    })], []);
    expect(edit.entries.map((entry) => entry.kind)).toEqual(["request", "agent"]);
    expect(edit.entries[1]?.sections?.[0]).toMatchObject({ title: "Alvo", code: true });
    expect(edit.entries[1]?.sections?.[0]?.text).toContain('"name": "Sono"');
  });

  test("a query step shows the rows it returned; a failed step shows its error code", () => {
    const trace = toRequestTrace(request({ dispatch }), [
      step({
        id: "q1", agent: "query", expected: "one", status: "done",
        result: { columns: ["name"], rows: [["Almoço"], ["Jantar"]], truncated: false },
      }),
      step({ id: "s2", agent: "artifact-create", expected: "one", status: "failed", errorCode: "agent_timeout" }),
    ], []);

    expect(trace.entries[2]).toMatchObject({ summary: "2 linhas", status: "done" });
    expect(trace.entries[2]?.sections?.[0]).toMatchObject({ title: "Resultado da consulta", code: true });
    expect(trace.entries[3]).toMatchObject({ status: "failed", summary: "Falhou: agent_timeout" });
    expect(trace.entries[3]?.fields).toContainEqual({ label: "Erro", value: "agent_timeout" });
  });

  test("a finished request closes with the answer and the total duration", () => {
    const done = toRequestTrace(
      request({ dispatch, status: "done", finishedAt: plus(2500) }), steps, entities,
    );
    expect(done).toMatchObject({ status: "done", durationMs: 2500 });
    expect(done.entries.at(-1)).toMatchObject({
      kind: "answer", label: "Concluiu", status: "done", summary: "1 registro gravado", startedAt: plus(2500).toISOString(),
    });

    const failed = toRequestTrace(
      request({
        dispatch, status: "failed", finishedAt: plus(900),
        failedSteps: [{ agent: "artifact-create", errorCode: "agent_timeout" }],
      }), steps, [], "Não consegui concluir: criando artefatos.",
    );
    expect(failed.status).toBe("failed");
    expect(failed.entries.at(-1)).toMatchObject({
      label: "Encerrou com falha", status: "failed", summary: "Não consegui concluir: criando artefatos.",
      sections: [{ title: "Mensagem", text: "Não consegui concluir: criando artefatos." }],
    });
    expect(failed.entries.at(-1)?.fields).toContainEqual({ label: "Passos com falha", value: "artifact-create (agent_timeout)" });

    const explained = toRequestTrace(
      request({
        dispatch, status: "failed", finishedAt: plus(900),
        failedSteps: [{ agent: "artifact-create", errorCode: "agent_timeout" }],
        answer: "O artefato não foi criado.", answerThought: "O passo de artefatos estourou o tempo.",
      }), steps, [], "O artefato não foi criado.",
    );
    expect(explained.entries.at(-1)?.sections).toEqual([
      { title: "Mensagem", text: "O artefato não foi criado." },
      { title: "Raciocínio da explicação", text: "O passo de artefatos estourou o tempo." },
    ]);
  });
});

describe("um pedido cancelado", () => {
  test("fecha o rastro como falha, com o passo cancelado em vermelho", () => {
    const trace = toRequestTrace(
      request({ status: "cancel", errorCode: "cancelled", finishedAt: plus(300) }),
      [step({ id: "s1", agent: "event-create", expected: "one", status: "cancel" })], [],
    );
    expect(trace.status).toBe("failed");
    expect(trace.entries.at(-1)).toMatchObject({ kind: "answer", label: "Cancelado", status: "failed" });
    expect(trace.entries.find((entry) => entry.id === "s1")?.status).toBe("failed");
  });
});
