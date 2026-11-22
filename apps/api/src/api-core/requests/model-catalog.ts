import type { ModelEffort, ModelOptionsDto, ModelProvider, ModelProviderOptionDto, ModelSelection } from "@repo/contracts";
import { getServerEnv, type ServerEnv } from "../../config/env";

/**
 * Os modelos que o seletor do modo modelo oferece (ADR 0019), por provedor, na ordem em que aparecem. A lista e
 * fechada: o pedido so aceita um modelo daqui, para ninguem mandar um id qualquer que custe caro. Atualizar e
 * editar esta lista.
 */
const CATALOG: Record<ModelProvider, Omit<ModelProviderOptionDto, "id">> = {
  anthropic: {
    name: "Anthropic",
    defaultModel: "claude-opus-5-5",
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

/** `GET /api/requests/model/options`; `undefined` sem nenhum provedor. */
export function modelOptions(env: ServerEnv = getServerEnv()): ModelOptionsDto | undefined {
  const providers = enabledProviders(env).map((id): ModelProviderOptionDto => ({
    id, ...CATALOG[id], models: CATALOG[id].models.map((model) => ({ ...model })),
  }));
  const first = providers[0];
  if (!first) return undefined;
  return { providers, efforts: [...EFFORTS], default: { provider: first.id, model: first.defaultModel, effort: DEFAULT_EFFORT } };
}

/** Por que uma escolha nao vale aqui; `undefined` quando vale. */
export function selectionProblem(selection: ModelSelection, env: ServerEnv = getServerEnv()): string | undefined {
  if (!enabledProviders(env).includes(selection.provider)) return `O provedor ${selection.provider} não está ligado neste ambiente.`;
  if (!CATALOG[selection.provider].models.some((model) => model.id === selection.model)) {
    return `O modelo ${selection.model} não está na lista de ${CATALOG[selection.provider].name}.`;
  }
  return undefined;
}

/** O nome que o seletor mostra para um modelo; o id quando ele saiu da lista. */
export function modelName(selection: Pick<ModelSelection, "provider" | "model">): string {
  return CATALOG[selection.provider]?.models.find((model) => model.id === selection.model)?.name ?? selection.model;
}
