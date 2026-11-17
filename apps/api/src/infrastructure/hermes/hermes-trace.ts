import type { AgentTraceDto, AgentTraceEntryDto, AgentTraceField, AgentTraceSection } from "@repo/contracts";
import { toolLabel } from "./hermes-tool-labels";

/** Um evento de `GET /v1/runs/{id}/events`, inteiro: o rastro guarda o que o Hermes mandou. */
export type HermesTraceEvent = Record<string, unknown>;

const MAX_ENTRIES = 150;
const MAX_TEXT = 4_000;
const MAX_SUMMARY = 160;

const USAGE_LABELS: ReadonlyArray<[key: string, label: string]> = [
  ["input_tokens", "Tokens de entrada"],
  ["output_tokens", "Tokens de saída"],
  ["total_tokens", "Tokens no total"],
  ["cache_read_tokens", "Tokens lidos do cache"],
  ["cache_write_tokens", "Tokens gravados no cache"],
];

const SUBAGENT_FIELDS: ReadonlyArray<[key: string, label: string]> = [
  ["model", "Modelo"],
  ["tool_count", "Ferramentas usadas"],
  ["api_calls", "Chamadas ao modelo"],
  ["input_tokens", "Tokens de entrada"],
  ["output_tokens", "Tokens de saída"],
  ["reasoning_tokens", "Tokens de raciocínio"],
  ["cost_usd", "Custo (US$)"],
];

function clip(value: unknown, max = MAX_TEXT): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function firstLine(value: unknown): string | undefined {
  const text = clip(value);
  return text ? clip(text.split("\n", 1)[0], MAX_SUMMARY) : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function count(value: number): string {
  return value.toLocaleString("pt-BR");
}

/**
 * Monta o rastro de um turno do Hermes (ADR 004) a partir dos eventos da execucao: cada pensamento, cada
 * ferramenta com o que entrou e o que saiu, os subagentes e, no fim, a resposta com modelo e tokens. Ao
 * contrario da lista de passos do chat, aqui o resumo do resultado de cada ferramenta entra: e o que o proprio
 * Hermes publica no stream, ja cortado em 500 caracteres e com segredos mascarados por ele.
 */
export class HermesTraceTracker {
  private readonly entries: AgentTraceEntryDto[] = [];
  private readonly startedAt: Date;
  private status: AgentTraceDto["status"] = "running";
  private finishedAt?: Date;
  private fields: AgentTraceField[] = [];
  private counter = 0;

  constructor(request: string, startedAt: Date = new Date()) {
    this.startedAt = startedAt;
    this.entries.push({
      id: "request", kind: "request", label: "Pedido", status: "done", startedAt: startedAt.toISOString(),
      ...(firstLine(request) ? { summary: firstLine(request) } : {}),
      sections: [{ title: "Mensagem", text: clip(request) ?? "" }],
    });
  }

  /** Devolve `true` quando o evento mudou o rastro. */
  apply(event: HermesTraceEvent): boolean {
    switch (event.event) {
      case "tool.started":
        return this.toolStarted(event);
      case "tool.completed":
      case "tool.failed":
        return this.toolCompleted(event);
      case "reasoning.available": {
        const thought = clip(event.text);
        if (!thought) return false;
        this.push({
          id: this.nextId("thought"), kind: "thought", label: "Pensou", status: "done", startedAt: this.at(event),
          summary: firstLine(thought), sections: [{ title: "Raciocínio", text: thought }], raw: event,
        });
        return true;
      }
      case "message.interim": {
        const comment = clip(event.text);
        if (!comment) return false;
        this.push({
          id: this.nextId("message"), kind: "message", label: "Comentou", status: "done", startedAt: this.at(event),
          summary: firstLine(comment), sections: [{ title: "Mensagem", text: comment }], raw: event,
        });
        return true;
      }
      case "subagent.start":
        return this.subagentStarted(event);
      case "subagent.complete":
        return this.subagentCompleted(event);
      case "run.completed":
        this.close("done", event, "Respondeu", clip(event.output), "Resposta");
        return true;
      case "run.failed":
        this.close("failed", event, "Falhou", clip(event.error) ?? "A execução falhou.", "Erro");
        return true;
      case "run.cancelled":
      case "run.interrupted":
        this.close("failed", event, "Interrompido", "A execução foi interrompida.", "Erro");
        return true;
      default:
        return false;
    }
  }

  /**
   * O turno terminou sem o evento final (o stream caiu e a resposta veio por consulta, ou a chamada falhou):
   * fecha o que ficou aberto.
   */
  finish(outcome: { output: string } | { error: string }): AgentTraceDto {
    if (this.status === "running") {
      if ("output" in outcome) this.close("done", {}, "Respondeu", clip(outcome.output), "Resposta");
      else this.close("failed", {}, "Falhou", clip(outcome.error) ?? "A execução falhou.", "Erro");
    }
    return this.snapshot();
  }

  snapshot(): AgentTraceDto {
    const end = this.finishedAt ?? (this.status === "running" ? undefined : new Date());
    return {
      route: "hermes",
      status: this.status,
      startedAt: this.startedAt.toISOString(),
      ...(end ? { durationMs: Math.max(0, end.getTime() - this.startedAt.getTime()) } : {}),
      fields: this.fields.map((field) => ({ ...field })),
      entries: this.entries.map((entry) => ({
        ...entry,
        ...(entry.fields ? { fields: entry.fields.map((field) => ({ ...field })) } : {}),
        ...(entry.sections ? { sections: entry.sections.map((section) => ({ ...section })) } : {}),
      })),
    };
  }

  private toolStarted(event: HermesTraceEvent): boolean {
    const tool = text(event.tool);
    if (!tool) return false;
    const preview = clip(event.preview);
    const callId = text(event.tool_call_id);
    this.push({
      id: callId ?? this.nextId("tool"), kind: "tool", label: toolLabel(tool), source: tool, status: "running",
      startedAt: this.at(event),
      ...(preview ? { summary: firstLine(preview), sections: [{ title: "Entrada", text: preview, code: true }] } : {}),
      ...(callId ? { fields: [{ label: "Chamada", value: callId }] } : {}),
      raw: { started: event },
    });
    return true;
  }

  private toolCompleted(event: HermesTraceEvent): boolean {
    const entry = this.findTool(event);
    if (!entry) return false;
    entry.status = event.event === "tool.failed" || event.error === true ? "failed" : "done";
    if (typeof event.duration === "number") entry.durationMs = Math.round(event.duration * 1000);
    const result = clip(event.preview);
    if (result) entry.sections = [...(entry.sections ?? []), { title: "Resultado", text: result, code: true }];
    entry.raw = { ...(entry.raw as Record<string, unknown>), completed: event };
    return true;
  }

  private subagentStarted(event: HermesTraceEvent): boolean {
    const goal = clip(event.goal) ?? clip(event.preview);
    const id = text(event.subagent_id);
    this.push({
      id: id ? `subagent-${id}` : this.nextId("subagent"), kind: "agent", label: "Subagente", status: "running",
      startedAt: this.at(event),
      ...(text(event.model) ? { source: text(event.model) } : {}),
      ...(goal ? { summary: firstLine(goal), sections: [{ title: "Objetivo", text: goal }] } : {}),
      raw: { started: event },
    });
    return true;
  }

  private subagentCompleted(event: HermesTraceEvent): boolean {
    const id = text(event.subagent_id);
    const entry = (id ? this.entries.find((candidate) => candidate.id === `subagent-${id}`) : undefined)
      ?? this.lastWhere((candidate) => candidate.kind === "agent" && candidate.status === "running");
    if (!entry) return false;
    entry.status = event.status === "failed" || event.status === "error" ? "failed" : "done";
    if (typeof event.duration_seconds === "number") entry.durationMs = Math.round(event.duration_seconds * 1000);
    const fields: AgentTraceField[] = [];
    for (const [key, label] of SUBAGENT_FIELDS) {
      const value = event[key];
      if (typeof value === "number") fields.push({ label, value: count(value) });
      else if (text(value)) fields.push({ label, value: value as string });
    }
    if (fields.length > 0) entry.fields = fields;
    const sections: AgentTraceSection[] = [...(entry.sections ?? [])];
    const summary = clip(event.summary);
    if (summary) sections.push({ title: "Resumo", text: summary });
    const tail = clip(event.output_tail);
    if (tail) sections.push({ title: "Fim da saída", text: tail, code: true });
    if (sections.length > 0) entry.sections = sections;
    entry.raw = { ...(entry.raw as Record<string, unknown>), completed: event };
    return true;
  }

  /** O fecho do turno: a resposta (ou o erro), com o modelo que respondeu e o consumo de tokens. */
  private close(
    status: "done" | "failed",
    event: HermesTraceEvent,
    label: string,
    body: string | undefined,
    title: string,
  ): void {
    if (this.status !== "running") return;
    this.status = status;
    this.finishedAt = typeof event.timestamp === "number" ? new Date(event.timestamp * 1000) : new Date();
    for (const entry of this.entries) {
      if (entry.status === "running") entry.status = status === "failed" ? "failed" : "done";
    }
    const runtime = (typeof event.runtime === "object" && event.runtime !== null ? event.runtime : {}) as Record<string, unknown>;
    const usage = (typeof event.usage === "object" && event.usage !== null ? event.usage : {}) as Record<string, unknown>;
    const fields: AgentTraceField[] = [];
    if (text(runtime.model)) fields.push({ label: "Modelo", value: runtime.model as string });
    if (text(runtime.provider)) fields.push({ label: "Provedor", value: runtime.provider as string });
    for (const [key, name] of USAGE_LABELS) {
      const value = usage[key];
      if (typeof value === "number" && value > 0) fields.push({ label: name, value: count(value) });
    }
    this.fields = fields;
    this.push({
      id: "answer", kind: "answer", label, status, startedAt: this.finishedAt.toISOString(),
      ...(firstLine(body) ? { summary: firstLine(body) } : {}),
      ...(fields.length > 0 ? { fields: fields.map((field) => ({ ...field })) } : {}),
      ...(body ? { sections: [{ title, text: body }] } : {}),
      ...(Object.keys(event).length > 0 ? { raw: { ...event, ...(typeof event.output === "string" ? { output: clip(event.output) } : {}) } } : {}),
    });
  }

  private findTool(event: HermesTraceEvent): AgentTraceEntryDto | undefined {
    const callId = text(event.tool_call_id);
    if (callId) return this.entries.find((entry) => entry.kind === "tool" && entry.id === callId);
    return this.lastWhere((entry) => entry.kind === "tool" && entry.status === "running" && entry.source === event.tool);
  }

  private lastWhere(matches: (entry: AgentTraceEntryDto) => boolean): AgentTraceEntryDto | undefined {
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (entry && matches(entry)) return entry;
    }
    return undefined;
  }

  private push(entry: AgentTraceEntryDto): void {
    this.entries.push(entry);
    // O pedido fica: quando o rastro estoura, sai o passo mais antigo depois dele.
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(1, 1);
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  private at(event: HermesTraceEvent): string {
    return (typeof event.timestamp === "number" ? new Date(event.timestamp * 1000) : new Date()).toISOString();
  }
}
