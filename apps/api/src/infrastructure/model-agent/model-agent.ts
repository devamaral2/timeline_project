import type { AgentTraceDto, ModelEffort, ModelProvider, ModelSelection } from "@repo/contracts";
import type { AgendaToolSession, AgendaToolSpec, AgendaTools, ToolOutcome } from "./agenda-tools";
import { ModelTraceTracker, emptyUsage, type ModelUsage } from "./model-trace";

/** Uma troca anterior da conversa, so o texto: o que o usuario disse ou o que o agente respondeu. */
export interface ModelHistoryMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ModelChatInput {
  /** O provedor, o modelo e o esforco que o usuario escolheu para este pedido. */
  selection: ModelSelection;
  text: string;
  /** As trocas anteriores da sessao, da mais antiga para a mais nova. */
  history: readonly ModelHistoryMessage[];
  /** O que o servidor sabe e o modelo nao: data, hora e fuso. Entra junto da mensagem, fora do prompt fixo. */
  context: string;
  signal: AbortSignal;
  /** Chamado a cada mudanca no rastro do turno (pensamentos, ferramentas) enquanto o modelo trabalha. */
  onTrace?(trace: AgentTraceDto): void;
}

export interface ModelReply {
  text: string;
  trace: AgentTraceDto;
}

/** O que a fila de jobs precisa do modo modelo: uma mensagem entra; o rastro sai durante o turno e o texto no fim. */
export interface ModelChat {
  chat(input: ModelChatInput): Promise<ModelReply>;
}

/** Recusa, configuracao ou falha depois que uma ferramenta ja agiu: repetir o turno nao ajuda ou repetiria acoes. */
export class ModelRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRequestError";
  }
}

/** Um pedido de ferramenta do modelo, ja no formato comum aos provedores. */
export interface ModelToolCall {
  id: string;
  name: string;
  input: unknown;
  /** A entrada chegou como texto que nao e JSON: a ferramenta nao roda e o erro volta ao modelo. */
  invalid?: boolean;
}

/**
 * Uma ida ao modelo, traduzida: o que ele pensou, o texto, as ferramentas pedidas e por que parou.
 * `paused`: o provedor interrompeu o turno e espera ser chamado de novo com a mesma conversa.
 */
export interface ModelStep {
  model: string;
  usage: Partial<ModelUsage>;
  thoughts: string[];
  text: string;
  calls: ModelToolCall[];
  stop: "done" | "tools" | "truncated" | "refused" | "paused";
}

export interface ModelConversationInput {
  system: string;
  history: readonly ModelHistoryMessage[];
  context: string;
  text: string;
  tools: readonly AgendaToolSpec[];
  model: string;
  effort: ModelEffort;
}

/**
 * Uma conversa com um provedor durante um turno. Ela guarda as mensagens no formato do provedor: a resposta de cada
 * ida (com o raciocinio que o provedor pede de volta) e os resultados das ferramentas.
 */
export interface ModelConversation {
  next(signal: AbortSignal): Promise<ModelStep>;
  answer(results: ReadonlyArray<{ call: ModelToolCall; outcome: ToolOutcome }>): void;
}

/** Um provedor: abre a conversa de um turno. */
export interface ModelProviderClient {
  /** "Anthropic", "OpenAI", "OpenRouter". */
  readonly name: string;
  open(input: ModelConversationInput): ModelConversation;
}

export interface ModelAgentConfig {
  /** Os provedores com chave neste ambiente. */
  providers: Partial<Record<ModelProvider, ModelProviderClient>>;
  /** O prompt fixo: papel, regras e formato. Nada que mude por pedido, para o cache valer entre turnos. */
  system: string;
  /** As ferramentas da agenda; ausentes, o modelo so conversa. */
  tools?: AgendaTools;
  /** Teto de idas ao modelo num turno: cada rodada de ferramentas custa uma. */
  maxIterations?: number;
  /** Teto do turno inteiro. */
  timeoutMs?: number;
}

const DEFAULT_MAX_ITERATIONS = 16;
/** Como o Hermes: abaixo dos 180 s que o chat espera um pedido antes de desistir dele. */
const DEFAULT_TIMEOUT_MS = 150_000;

const EFFORT_NAMES: Record<ModelEffort, string> = { low: "Baixo", medium: "Médio", high: "Alto", max: "Máximo" };

/**
 * O turno do modo modelo (ADR 0019), igual para os tres provedores: o prompt fixo, as trocas anteriores da sessao
 * como texto e a mensagem nova. Quando o modelo pede ferramentas da agenda, elas rodam no MCP e o resultado volta a
 * ele, ate a resposta final. O raciocinio que o provedor entrega e cada ferramenta viram o rastro que o chat mostra.
 */
export class ModelAgent implements ModelChat {
  constructor(private readonly config: ModelAgentConfig) {}

  async chat({ selection, text, history, context, signal, onTrace }: ModelChatInput): Promise<ModelReply> {
    const provider = this.config.providers[selection.provider];
    if (!provider) throw new ModelRequestError("Este provedor não está ligado neste ambiente.");
    const timeout = AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const combined = AbortSignal.any([signal, timeout]);
    const trace = new ModelTraceTracker(text, provider.name);
    const usage = emptyUsage();
    const effort = EFFORT_NAMES[selection.effort];
    let model: string | undefined;
    // Depois que uma ferramenta de escrita roda, nenhuma falha e repetida pela fila: o turno repetiria a acao.
    let acted = false;

    const fail = (error: unknown): never => {
      const reason = signal.aborted ? "A execução foi cancelada."
        : timeout.aborted ? "O modelo demorou demais para responder."
          : error instanceof ModelRequestError ? error.message
            : `Não foi possível falar com ${provider.name}.`;
      onTrace?.(trace.finish({ error: reason }, { model, effort, usage }));
      if (signal.aborted) throw error;
      if (error instanceof ModelRequestError) throw error;
      if (acted || timeout.aborted) throw new ModelRequestError(reason);
      // Antes de qualquer acao, o erro do SDK segue como veio: 429 e 5xx sao repetidos pela fila.
      throw error;
    };

    let session: AgendaToolSession | undefined;
    try {
      session = this.config.tools ? await this.config.tools.open(combined) : undefined;
    } catch (error) {
      // Sem o MCP o turno nao comeca: a agenda faz parte do modo, e responder sem ela enganaria o usuario.
      return fail(error instanceof Error && !combined.aborted ? new ModelRequestError("As ferramentas da agenda estão fora do ar.") : error);
    }

    try {
      const conversation = provider.open({
        system: this.config.system, history, context, text, tools: session?.tools ?? [],
        model: selection.model, effort: selection.effort,
      });
      const maxIterations = this.config.maxIterations ?? DEFAULT_MAX_ITERATIONS;

      for (let iteration = 0; ; iteration += 1) {
        if (iteration >= maxIterations) throw new ModelRequestError("O modelo usou ferramentas demais neste pedido e parou.");
        const step = await conversation.next(combined);
        model = step.model;
        addUsage(usage, step.usage);
        let changed = false;
        for (const thought of step.thoughts) if (trace.thought(thought)) changed = true;
        if (changed) onTrace?.(trace.snapshot());

        if (step.stop === "refused") throw new ModelRequestError(step.text || "O modelo recusou este pedido.");
        if (step.stop === "paused") continue;
        if (step.calls.length === 0 || !session) {
          if (!step.text) throw new ModelRequestError(step.stop === "truncated" ? "A resposta do modelo ficou longa demais." : "O modelo não respondeu.");
          return { text: step.text, trace: trace.finish({ output: step.text }, { model, effort, usage }) };
        }
        // Uma entrada cortada no limite de tokens parece um objeto valido: nao roda a ferramenta com ela.
        if (step.stop === "truncated") throw new ModelRequestError("O pedido de ferramenta do modelo veio cortado.");

        for (const call of step.calls) trace.toolStarted(call.id, call.name, call.input);
        onTrace?.(trace.snapshot());
        if (step.calls.some((call) => !isReadOnly(call.name))) acted = true;

        const tools = session;
        const outcomes = await Promise.all(step.calls.map((call) => (call.invalid
          ? Promise.resolve({ content: "A entrada da ferramenta não é um JSON válido. Mande de novo.", isError: true })
          : tools.call(call.name, call.input, combined))));
        const results = step.calls.map((call, index) => {
          const outcome = outcomes[index] as ToolOutcome;
          trace.toolCompleted(call.id, outcome);
          return { call, outcome };
        });
        onTrace?.(trace.snapshot());
        conversation.answer(results);
      }
    } catch (error) {
      return fail(error);
    } finally {
      await session?.close().catch(() => undefined);
    }
  }
}

/** As ferramentas que so leem: repetir o turno depois delas nao duplica nada. */
function isReadOnly(tool: string): boolean {
  return tool.startsWith("list_") || tool.startsWith("get_") || tool.startsWith("search_");
}

function addUsage(total: ModelUsage, usage: Partial<ModelUsage>): void {
  total.calls += 1;
  total.input += usage.input ?? 0;
  total.output += usage.output ?? 0;
  total.cacheRead += usage.cacheRead ?? 0;
  total.cacheWrite += usage.cacheWrite ?? 0;
}

/** Um pedido de ferramenta cuja entrada chega como texto JSON (OpenAI, OpenRouter). */
export function toolCallOf(id: string, name: string, raw: string | undefined): ModelToolCall {
  if (!raw?.trim()) return { id, name, input: {} };
  try {
    return { id, name, input: JSON.parse(raw) as unknown };
  } catch {
    return { id, name, input: raw, invalid: true };
  }
}
