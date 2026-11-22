import type { ModelEffort, ModelOptionsDto, ModelProvider, ModelProviderOptionDto, ModelSelection } from "@repo/contracts";

/** Onde o aparelho guarda a escolha do modo modelo. */
export const MODEL_SELECTION_KEY = "braid.model-selection";

export const EFFORT_LABELS: Record<ModelEffort, string> = { low: "Baixo", medium: "Médio", high: "Alto", max: "Máximo" };

/** O que o aparelho guarda: a escolha atual e o ultimo modelo de cada provedor (a troca de provedor o retoma). */
export interface StoredModelSelection {
  current: ModelSelection;
  models: Partial<Record<ModelProvider, string>>;
}

const PROVIDERS: readonly ModelProvider[] = ["anthropic", "openai", "openrouter"];
const EFFORTS: readonly ModelEffort[] = ["low", "medium", "high", "max"];

/** "A OpenAI não está ligada neste ambiente.": o aviso de um comando de provedor sem chave. */
export function providerOffText(provider: ModelProvider): string {
  return provider === "openrouter"
    ? "O OpenRouter não está ligado neste ambiente."
    : `A ${provider === "openai" ? "OpenAI" : "Anthropic"} não está ligada neste ambiente.`;
}

export function providerOf(options: ModelOptionsDto, id: ModelProvider): ModelProviderOptionDto | undefined {
  return options.providers.find((provider) => provider.id === id);
}

/** O nome curto do modelo ("Sonnet 5.5"); sem ele na lista, o proprio id. */
export function modelName(options: ModelOptionsDto | null, selection: Pick<ModelSelection, "provider" | "model">): string {
  const found = options && providerOf(options, selection.provider)?.models.find((model) => model.id === selection.model);
  return found?.name ?? selection.model;
}

/** O nome do provedor ("Anthropic"); sem ele na lista, o proprio id. */
export function providerName(options: ModelOptionsDto | null, id: ModelProvider): string {
  return (options && providerOf(options, id)?.name) || id;
}

/** O rodape de uma resposta: "sonnet 5.5 · médio · anthropic". */
export function modelFooter(options: ModelOptionsDto | null, selection: ModelSelection): string {
  return `${modelName(options, selection)} · ${EFFORT_LABELS[selection.effort]} · ${selection.provider}`.toLowerCase();
}

function isProvider(value: unknown): value is ModelProvider {
  return typeof value === "string" && (PROVIDERS as readonly string[]).includes(value);
}

function isEffort(value: unknown): value is ModelEffort {
  return typeof value === "string" && (EFFORTS as readonly string[]).includes(value);
}

/** Le a escolha guardada. Qualquer falha (sem armazenamento, texto quebrado, forma errada) vira `null`. */
export function readStoredSelection(): StoredModelSelection | null {
  try {
    const raw = window.localStorage.getItem(MODEL_SELECTION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { current, models } = parsed as { current?: Partial<ModelSelection>; models?: Record<string, unknown> };
    if (!current || !isProvider(current.provider) || typeof current.model !== "string" || !isEffort(current.effort)) return null;
    const remembered: StoredModelSelection["models"] = {};
    for (const provider of PROVIDERS) {
      const model = models?.[provider];
      if (typeof model === "string") remembered[provider] = model;
    }
    return { current: { provider: current.provider, model: current.model, effort: current.effort }, models: remembered };
  } catch {
    return null;
  }
}

export function writeStoredSelection(state: StoredModelSelection): void {
  try {
    window.localStorage.setItem(MODEL_SELECTION_KEY, JSON.stringify(state));
  } catch {
    // Sem armazenamento a escolha vale so ate fechar a pagina.
  }
}

/**
 * Confere a escolha guardada contra o que o servidor oferece: provedor desconhecido volta ao padrao do servidor;
 * modelo desconhecido vira o padrao do provedor; esforco desconhecido, o do padrao. Sem nada guardado, o padrao.
 */
export function resolveSelection(options: ModelOptionsDto, stored: StoredModelSelection | null): StoredModelSelection {
  const models = stored?.models ?? {};
  const current = stored?.current;
  const provider = current && providerOf(options, current.provider);
  if (!current || !provider) return { current: options.default, models: { ...models, [options.default.provider]: options.default.model } };
  const model = provider.models.some((entry) => entry.id === current.model) ? current.model : provider.defaultModel;
  const effort = options.efforts.includes(current.effort) ? current.effort : options.default.effort;
  return { current: { provider: current.provider, model, effort }, models: { ...models, [current.provider]: model } };
}

/** Troca de provedor: usa o modelo que ele tinha na ultima vez (se ainda existe) ou o padrao dele. */
export function withProvider(options: ModelOptionsDto, state: StoredModelSelection, id: ModelProvider): StoredModelSelection {
  const provider = providerOf(options, id);
  if (!provider) return state;
  const remembered = state.models[id];
  const model = remembered && provider.models.some((entry) => entry.id === remembered) ? remembered : provider.defaultModel;
  return { current: { ...state.current, provider: id, model }, models: { ...state.models, [id]: model } };
}

export function withModel(state: StoredModelSelection, model: string): StoredModelSelection {
  return { current: { ...state.current, model }, models: { ...state.models, [state.current.provider]: model } };
}

export function withEffort(state: StoredModelSelection, effort: ModelEffort): StoredModelSelection {
  return { ...state, current: { ...state.current, effort } };
}
