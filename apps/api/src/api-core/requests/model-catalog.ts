import type {
  ModelEffort, ModelOptionDto, ModelOptionsDto, ModelProvider, ModelProviderOptionDto, ModelSelection,
} from "@repo/contracts";
import { getServerEnv, type ServerEnv } from "../../config/env";

/**
 * Os modelos que o seletor do modo modelo oferece (ADR 0019), por provedor, na ordem em que aparecem. Na Anthropic e
 * na OpenAI a lista e fechada: o pedido so aceita um modelo daqui. No OpenRouter ela vem da API dele (todo modelo que
 * usa ferramentas), e esta lista curta so vale quando a dele nao responde.
 */
const CATALOG: Record<ModelProvider, Omit<ModelProviderOptionDto, "id">> = {
  anthropic: {
    name: "Anthropic",
    defaultModel: "claude-haiku-5-5",
    models: [
      { id: "claude-fable-5-2", name: "Fable 5.2" },
      { id: "claude-opus-5-5", name: "Opus 5.5" },
      { id: "claude-sonnet-5-5", name: "Sonnet 5.5" },
      { id: "claude-haiku-5-5", name: "Haiku 5.5" },
    ],
  },
  openai: {
    name: "OpenAI",
    defaultModel: "gpt-6.2-sol",
    models: [
      { id: "gpt-6.2-astra", name: "GPT-6.2 Astra" },
      { id: "gpt-6.2-sol", name: "GPT-6.2 Sol" },
      { id: "gpt-6.1-terra", name: "GPT-6.1 Terra" },
      { id: "gpt-6-luna", name: "GPT-6 Luna" },
    ],
  },
  openrouter: {
    name: "OpenRouter",
    defaultModel: "google/gemini-4-neon",
    models: [
      { id: "google/gemini-4-neon", name: "Gemini 4 Neon" },
      { id: "x-ai/grok-4.7", name: "Grok 4.7" },
      { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "moonshotai/kimi-k3.1-pro", name: "Kimi K3.1 Pro" },
      { id: "qwen/qwen4-max", name: "Qwen4 Max" },
      { id: "z-ai/glm-5.3", name: "GLM 5.3" },
    ],
  },
};

const PROVIDER_ORDER: ModelProvider[] = ["anthropic", "openai", "openrouter"];
const EFFORTS: ModelEffort[] = ["low", "medium", "high", "max"];
const DEFAULT_EFFORT: ModelEffort = "medium";

/** A chave de cada provedor. O OpenRouter usa a mesma chave da rota por passos. */
export function providerKeys(env: ServerEnv = getServerEnv()): Partial<Record<ModelProvider, string>> {
  return {
    ...(env.ANTHROPIC_API_KEY ? { anthropic: env.ANTHROPIC_API_KEY } : {}),
    ...(env.OPENAI_API_KEY ? { openai: env.OPENAI_API_KEY } : {}),
    ...(env.OPENROUTER_API_KEY ? { openrouter: env.OPENROUTER_API_KEY } : {}),
  };
}

/** Os provedores com chave neste ambiente, na ordem do seletor. */
export function enabledProviders(env: ServerEnv = getServerEnv()): ModelProvider[] {
  const keys = providerKeys(env);
  return PROVIDER_ORDER.filter((provider) => keys[provider] !== undefined);
}

/** O modo modelo existe neste ambiente: sem nenhuma chave, as rotas do modo respondem 404. */
export function modelModeEnabled(env: ServerEnv = getServerEnv()): boolean {
  return enabledProviders(env).length > 0;
}

/** De onde vem a lista de modelos de cada provedor. */
export interface ModelLists {
  models(provider: ModelProvider): Promise<ModelOptionDto[]>;
}

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
/** A lista do OpenRouter muda devagar: uma consulta por hora basta. Sem resposta, tenta de novo em um minuto. */
const OPENROUTER_TTL_MS = 60 * 60 * 1000;
const OPENROUTER_RETRY_MS = 60 * 1000;
const OPENROUTER_TIMEOUT_MS = 5_000;

interface OpenRouterModel {
  id?: unknown;
  name?: unknown;
  supported_parameters?: unknown;
}

/**
 * A Anthropic e a OpenAI pela lista curada; o OpenRouter pela API publica de modelos dele, filtrada aos que aceitam
 * ferramentas (o modo usa as da agenda), sem as variantes `:batch`, que nao conversam. Em ordem alfabetica do nome.
 */
export class CatalogModelLists implements ModelLists {
  private cached?: { models: ModelOptionDto[]; until: number };
  private loading?: Promise<ModelOptionDto[]>;

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly clock: () => number = Date.now,
  ) {}

  async models(provider: ModelProvider): Promise<ModelOptionDto[]> {
    if (provider !== "openrouter") return CATALOG[provider].models.map((model) => ({ ...model }));
    if (this.cached && this.cached.until > this.clock()) return this.cached.models;
    this.loading ??= this.loadOpenRouter().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  private async loadOpenRouter(): Promise<ModelOptionDto[]> {
    try {
      const response = await this.request(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
      const payload = (await response.json()) as { data?: OpenRouterModel[] };
      const models = (payload.data ?? [])
        .flatMap((model): ModelOptionDto[] => {
          if (typeof model.id !== "string" || model.id.endsWith(":batch")) return [];
          const parameters = Array.isArray(model.supported_parameters) ? model.supported_parameters : [];
          if (!parameters.includes("tools")) return [];
          return [{ id: model.id, name: typeof model.name === "string" && model.name.trim() ? model.name.trim() : model.id }];
        })
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
      if (models.length === 0) throw new Error("OpenRouter sem modelos com ferramentas");
      this.cached = { models, until: this.clock() + OPENROUTER_TTL_MS };
      return models;
    } catch {
      const fallback = CATALOG.openrouter.models.map((model) => ({ ...model }));
      this.cached = { models: fallback, until: this.clock() + OPENROUTER_RETRY_MS };
      return fallback;
    }
  }
}

const sharedLists = new CatalogModelLists();

/** `GET /api/requests/model/options`; `undefined` sem nenhum provedor. */
export async function modelOptions(
  env: ServerEnv = getServerEnv(),
  lists: ModelLists = sharedLists,
): Promise<ModelOptionsDto | undefined> {
  const providers = await Promise.all(enabledProviders(env).map(async (id): Promise<ModelProviderOptionDto> => {
    const models = await lists.models(id);
    const preferred = CATALOG[id].defaultModel;
    const defaultModel = models.some((model) => model.id === preferred) ? preferred : (models[0]?.id ?? preferred);
    return { id, name: CATALOG[id].name, defaultModel, models };
  }));
  const first = providers[0];
  if (!first) return undefined;
  return { providers, efforts: [...EFFORTS], default: { provider: first.id, model: first.defaultModel, effort: DEFAULT_EFFORT } };
}

/** Por que uma escolha nao vale aqui; `undefined` quando vale. */
export async function selectionProblem(
  selection: ModelSelection,
  env: ServerEnv = getServerEnv(),
  lists: ModelLists = sharedLists,
): Promise<string | undefined> {
  if (!enabledProviders(env).includes(selection.provider)) return `O provedor ${selection.provider} não está ligado neste ambiente.`;
  const models = await lists.models(selection.provider);
  if (!models.some((model) => model.id === selection.model)) {
    return `O modelo ${selection.model} não está na lista de ${CATALOG[selection.provider].name}.`;
  }
  return undefined;
}
