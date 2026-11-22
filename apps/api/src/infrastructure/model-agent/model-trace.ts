import type { AgentTraceDto, AgentTraceEntryDto, AgentTraceField } from "@repo/contracts";
import { agendaToolLabel } from "../hermes/hermes-tool-labels";

const MAX_ENTRIES = 150;
const MAX_TEXT = 4_000;
const MAX_SUMMARY = 160;

/** O consumo somado das chamadas de um turno. */
export interface ModelUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  /** Quantas chamadas ao modelo o turno fez. */
  calls: number;
}

export function emptyUsage(): ModelUsage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, calls: 0 };
}

function clip(value: string | undefined, max = MAX_TEXT): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function firstLine(value: string | undefined): string | undefined {
  const text = clip(value);
  return text ? clip(text.split("\n", 1)[0], MAX_SUMMARY) : undefined;
}

function count(value: number): string {
  return value.toLocaleString("pt-BR");
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * O rastro de um turno do modo modelo (ADR 0019), no mesmo formato do Hermes: o pedido, cada resumo de raciocinio,
 * cada ferramenta da agenda com o que entrou e o que saiu e, no fim, a resposta com modelo e tokens. O chat
 * mostra pensamentos e ferramentas como passos; a aba "Processo" mostra o resto.
 */
export class ModelTraceTracker {
  private readonly entries: AgentTraceEntryDto[] = [];
  private readonly started = new Map<string, number>();
  private status: AgentTraceDto["status"] = "running";
  private finishedAt?: Date;
  private fields: AgentTraceField[] = [];
  private counter = 0;

  constructor(
    request: string,
    /** "Anthropic", "OpenAI", "OpenRouter": o campo Provedor do fecho. */
    private readonly provider: string,
    private readonly startedAt: Date = new Date(),
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.entries.push({
      id: "request", kind: "request", label: "Pedido", status: "done", startedAt: startedAt.toISOString(),
      ...(firstLine(request) ? { summary: firstLine(request) } : {}),
      sections: [{ title: "Mensagem", text: clip(request) ?? "" }],
    });
  }

  /** O resumo do raciocinio de uma chamada. Vazio (o modelo nao resumiu) nao entra. */
  thought(text: string): boolean {
    const thought = clip(text);
    if (!thought) return false;
    this.push({
      id: this.nextId("thought"), kind: "thought", label: "Pensou", status: "done", startedAt: this.clock().toISOString(),
      summary: firstLine(thought), sections: [{ title: "Raciocínio", text: thought }],
    });
    return true;
  }

  toolStarted(callId: string, tool: string, input: unknown): void {
    const now = this.clock();
    this.started.set(callId, now.getTime());
    const preview = clip(json(input));
    this.push({
      id: callId, kind: "tool", label: agendaToolLabel(tool), source: tool, status: "running", startedAt: now.toISOString(),
      ...(preview ? { summary: firstLine(preview.replace(/\s+/g, " ")), sections: [{ title: "Entrada", text: preview, code: true }] } : {}),
      fields: [{ label: "Chamada", value: callId }],
    });
  }

  toolCompleted(callId: string, outcome: { content: string; isError: boolean }): void {
    const entry = this.entries.find((candidate) => candidate.kind === "tool" && candidate.id === callId);
    if (!entry) return;
    entry.status = outcome.isError ? "failed" : "done";
    const began = this.started.get(callId);
    if (began !== undefined) entry.durationMs = Math.max(0, this.clock().getTime() - began);
    const result = clip(outcome.content);
    if (result) entry.sections = [...(entry.sections ?? []), { title: "Resultado", text: result, code: true }];
  }

  /** O fecho do turno: a resposta (ou o erro), com o modelo e o consumo de tokens. */
  finish(
    outcome: { output: string } | { error: string },
    details: { model?: string; effort?: string; usage?: ModelUsage } = {},
  ): AgentTraceDto {
    if (this.status !== "running") return this.snapshot();
    const failed = "error" in outcome;
    this.status = failed ? "failed" : "done";
    this.finishedAt = this.clock();
    for (const entry of this.entries) {
      if (entry.status === "running") entry.status = failed ? "failed" : "done";
    }
    const fields: AgentTraceField[] = [];
    if (details.model) fields.push({ label: "Modelo", value: details.model });
    fields.push({ label: "Provedor", value: this.provider });
    if (details.effort) fields.push({ label: "Esforço", value: details.effort });
    const usage = details.usage;
    if (usage) {
      const pairs: Array<[number, string]> = [
        [usage.calls, "Chamadas ao modelo"],
        [usage.input, "Tokens de entrada"],
        [usage.output, "Tokens de saída"],
        [usage.cacheRead, "Tokens lidos do cache"],
        [usage.cacheWrite, "Tokens gravados no cache"],
      ];
      for (const [value, label] of pairs) if (value > 0) fields.push({ label, value: count(value) });
    }
    this.fields = fields;
    const body = failed ? clip(outcome.error) : clip(outcome.output);
    const title = failed ? "Erro" : "Resposta";
    this.push({
      id: "answer", kind: "answer", label: failed ? "Falhou" : "Respondeu", status: this.status,
      startedAt: this.finishedAt.toISOString(),
      ...(firstLine(body) ? { summary: firstLine(body) } : {}),
      ...(fields.length > 0 ? { fields: fields.map((field) => ({ ...field })) } : {}),
      ...(body ? { sections: [{ title, text: body }] } : {}),
    });
    return this.snapshot();
  }

  snapshot(): AgentTraceDto {
    const end = this.finishedAt;
    return {
      route: "model",
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

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  private push(entry: AgentTraceEntryDto): void {
    this.entries.push(entry);
    // O pedido fica: quando o rastro estoura, sai o passo mais antigo depois dele.
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(1, 1);
  }
}
