/** Um passo do agente, como o chat o mostra: "Pensou", "Leu uma página", "Criou uma nota"... */
export interface HermesStep {
  id: string;
  kind: "thought" | "tool";
  label: string;
  /** O que o Hermes mostrou para a ferramenta (comando, caminho, busca) ou o texto do pensamento. */
  detail?: string;
  status: "running" | "done" | "failed";
  durationMs?: number;
}

/** Um evento de `GET /v1/runs/{id}/events` do Hermes, no que interessa aos passos. */
export interface HermesRunEvent {
  event?: unknown;
  tool?: unknown;
  preview?: unknown;
  text?: unknown;
  duration?: unknown;
  error?: unknown;
  tool_call_id?: unknown;
}

const MAX_STEPS = 80;
const MAX_DETAIL = 2_000;

const EXACT_LABELS: Record<string, string> = {
  terminal: "Executou um comando",
  shell: "Executou um comando",
  run_command: "Executou um comando",
  execute_code: "Executou código",
  read_file: "Leu um arquivo",
  write_file: "Escreveu um arquivo",
  patch: "Editou um arquivo",
  search_files: "Buscou nos arquivos",
  web_search: "Pesquisou na web",
  web_extract: "Leu uma página",
  browser: "Navegou na web",
  skill_view: "Carregou uma skill",
  skills_list: "Listou as skills",
  memory: "Consultou a memória",
  delegate_task: "Delegou uma tarefa",
};

const MCP_LABELS: Record<string, string> = {
  create_event: "Criou um evento",
  create_task: "Criou uma tarefa",
  create_note: "Criou uma nota",
  create_recurrence: "Criou uma recorrência",
  update_event: "Editou um evento",
  update_task: "Editou uma tarefa",
  update_note: "Editou uma nota",
  update_recurrence: "Editou uma recorrência",
  get_event: "Leu um evento",
  get_task: "Leu uma tarefa",
  get_note: "Leu uma nota",
  get_recurrence: "Leu uma recorrência",
  list_timeline_events: "Listou os eventos",
  list_tasks: "Listou as tarefas",
  list_notes: "Listou as notas",
};

/** O nome de uma ferramenta vira um rotulo legivel; as do MCP da agenda (`mcp_braid_*`) ficam em portugues. */
export function toolLabel(tool: string): string {
  const exact = EXACT_LABELS[tool];
  if (exact) return exact;
  const mcp = /^mcp_braid_(.+)$/.exec(tool)?.[1];
  if (mcp && MCP_LABELS[mcp]) return MCP_LABELS[mcp];
  return `Usou ${tool.replace(/_/g, " ")}`;
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * Monta a lista de passos a partir dos eventos do Hermes. So guarda o que ajuda a acompanhar o trabalho: o resultado
 * das ferramentas nao entra (pode ter o conteudo de arquivos), so o que o Hermes mostrou ao iniciar cada uma.
 */
export class HermesStepsTracker {
  private steps: HermesStep[] = [];
  private counter = 0;

  /** Devolve `true` quando o evento mudou a lista. */
  apply(event: HermesRunEvent): boolean {
    switch (event.event) {
      case "tool.started": {
        if (typeof event.tool !== "string") return false;
        this.push({
          id: typeof event.tool_call_id === "string" ? event.tool_call_id : `s${this.counter}`,
          kind: "tool",
          label: toolLabel(event.tool),
          detail: text(event.preview, 300),
          status: "running",
          tool: event.tool,
        });
        return true;
      }
      case "tool.completed":
      case "tool.failed": {
        const step = this.find(event);
        if (!step) return false;
        step.status = event.event === "tool.failed" || event.error === true ? "failed" : "done";
        if (typeof event.duration === "number") step.durationMs = Math.round(event.duration * 1000);
        return true;
      }
      case "reasoning.available": {
        const detail = text(event.text, MAX_DETAIL);
        if (!detail) return false;
        this.push({ id: `s${this.counter}`, kind: "thought", label: "Pensou", detail, status: "done" });
        return true;
      }
      default:
        return false;
    }
  }

  /** Um passo ainda em curso quando o turno termina nao ficou para tras: fecha como feito. */
  finish(): HermesStep[] {
    for (const step of this.steps) if (step.status === "running") step.status = "done";
    return this.snapshot();
  }

  snapshot(): HermesStep[] {
    return this.steps.map(({ ...step }) => stripInternal(step));
  }

  private push(step: HermesStep & { tool?: string }): void {
    this.counter += 1;
    this.steps.push(step);
    if (this.steps.length > MAX_STEPS) this.steps.shift();
  }

  private find(event: HermesRunEvent): (HermesStep & { tool?: string }) | undefined {
    const steps = this.steps as (HermesStep & { tool?: string })[];
    if (typeof event.tool_call_id === "string") return steps.find((step) => step.id === event.tool_call_id);
    for (let index = steps.length - 1; index >= 0; index -= 1) {
      const step = steps[index];
      if (step?.status === "running" && step.tool === event.tool) return step;
    }
    return undefined;
  }
}

function stripInternal(step: HermesStep & { tool?: string }): HermesStep {
  const { tool: _tool, ...rest } = step;
  return rest;
}
