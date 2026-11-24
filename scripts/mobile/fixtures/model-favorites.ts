/**
 * Fixtures da folha da escolha do modelo: as funções puras de `model-favorites.ts` do web (os favoritos, a busca e as
 * linhas de cada aba) com as entradas e as saídas que o Kotlin precisa reproduzir, e a leitura tolerante dos favoritos
 * guardados (`readStoredFavorites`, que o Node roda contra um `localStorage` de mentira).
 */
import { modelOptionsSchema } from "../../../packages/contracts/src/schemas";
import {
  type ModelFavorite, type ModelTab, filterModels, isFavorite, modelRows, readStoredFavorites, toggleFavorite,
} from "../../../apps/web/src/lib/agent-chat/model-favorites";

const SELECTION = { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" } as const;

const FULL = modelOptionsSchema.parse({
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      models: [
        { id: "claude-fable-5-2", name: "Fable 5.2" },
        { id: "claude-opus-5-5", name: "Opus 5.5" },
        { id: "claude-sonnet-5-5", name: "Sonnet 5.5" },
        { id: "claude-haiku-5-5", name: "Haiku 5.5" },
      ],
      defaultModel: "claude-sonnet-5-5",
    },
    {
      id: "openai",
      name: "OpenAI",
      models: [{ id: "gpt-6.2-sol", name: "GPT-6.2 Sol" }, { id: "gpt-6.2-mini", name: "GPT-6.2 Mini" }],
      defaultModel: "gpt-6.2-sol",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      models: [
        { id: "deepseek/deepseek-v4-pro", name: "DeepSeek: DeepSeek V4 Pro" },
        { id: "google/gemini-4-neon", name: "Google: Gemini 4 Neon" },
        { id: "baidu/ernie-5.5", name: "Baidu: ERNIÊ 5.5" },
        { id: "x-ai/grok-4.7", name: "xAI: Grok 4.7" },
        // O mesmo id do modelo da Anthropic, atendido por outro provedor: favorito e escolha são pares.
        { id: "claude-sonnet-5-5", name: "Sonnet 5.5 (via OpenRouter)" },
        { id: "anthropic/claude-sonnet-5.5", name: "Anthropic: Claude Sonnet 5.5" },
      ],
      defaultModel: "google/gemini-4-neon",
    },
  ],
  efforts: ["low", "medium", "high", "max"],
  default: SELECTION,
});

/** O servidor sem a OpenAI: os favoritos dela deixam de ser oferecidos e a aba dela fica vazia. */
const NO_OPENAI = { ...FULL, providers: FULL.providers.filter((provider) => provider.id !== "openai") };

const OPTIONS = { full: FULL, noOpenai: NO_OPENAI } as const;

const FAVORITES: ModelFavorite[][] = [
  [],
  [
    { provider: "anthropic", model: "claude-sonnet-5-5" },
    { provider: "openrouter", model: "google/gemini-4-neon" },
    { provider: "openai", model: "gpt-6.2-sol" },
  ],
  [
    { provider: "openrouter", model: "claude-sonnet-5-5" },
    { provider: "anthropic", model: "claude-haiku-5-5" },
    // Saiu da lista do servidor: a aba não o mostra, mas ele continua guardado.
    { provider: "anthropic", model: "claude-velho" },
    { provider: "openrouter", model: "baidu/ernie-5.5" },
  ],
];

const SELECTIONS = [
  { provider: "anthropic", model: "claude-sonnet-5-5" },
  { provider: "openrouter", model: "claude-sonnet-5-5" },
  { provider: "openrouter", model: "google/gemini-4-neon" },
] as const;

const TABS: ModelTab[] = ["favorites", "anthropic", "openai", "openrouter"];

const QUERIES = ["", "   ", "sonnet", "  CLAUDE  sonnet ", "ernie", "x-ai", "zzz"];

const TOGGLES: { provider: ModelFavorite["provider"]; model: string }[] = [
  { provider: "anthropic", model: "claude-sonnet-5-5" },
  { provider: "openrouter", model: "claude-sonnet-5-5" },
  { provider: "openai", model: "gpt-6.2-mini" },
  { provider: "openrouter", model: "baidu/ernie-5.5" },
];

/** Os textos que o aparelho pode ter guardado em `braid.model-favorites`, do bom ao quebrado. */
const STORED_TEXTS: (string | null)[] = [
  null,
  "",
  "{",
  "[]",
  "{}",
  "null",
  '"texto"',
  "42",
  '[{"provider":"anthropic","model":"claude-sonnet-5-5"}]',
  '[{"provider":"openrouter","model":"google/gemini-4-neon"},{"provider":"anthropic","model":"claude-haiku-5-5"}]',
  // Repetido: fica o primeiro; o mesmo modelo em outro provedor é outro favorito.
  '[{"provider":"anthropic","model":"a"},{"provider":"anthropic","model":"a"},{"provider":"openai","model":"a"}]',
  // Provedor desconhecido, ausente ou que não é texto; modelo vazio, ausente ou que não é texto.
  '[{"provider":"x","model":"a"},{"model":"a"},{"provider":1,"model":"a"},{"provider":"openai","model":""},{"provider":"openai"},{"provider":"openai","model":7}]',
  // Entradas que não são objetos.
  '[null,1,"openai",[],true,{"provider":"openai","model":"gpt-6.2-sol"}]',
  // Campos a mais são ignorados.
  '[{"provider":"openai","model":"gpt-6.2-sol","extra":true}]',
];

function readStored(raw: string | null): ModelFavorite[] {
  const holder = globalThis as unknown as { window?: unknown };
  const had = "window" in holder;
  const before = holder.window;
  holder.window = { localStorage: { getItem: () => raw } };
  try {
    return readStoredFavorites();
  } finally {
    if (had) holder.window = before;
    else delete holder.window;
  }
}

function rowCases(name: keyof typeof OPTIONS, favorites: ModelFavorite[], selection: (typeof SELECTIONS)[number]) {
  return TABS.flatMap((tab) =>
    QUERIES.map((query) => ({ args: [name, favorites, selection, tab, query], result: modelRows(OPTIONS[name], favorites, selection, tab, query) })));
}

export function modelFavoritesFixtures(): Record<string, unknown> {
  const openrouter = FULL.providers.find((provider) => provider.id === "openrouter")?.models ?? [];
  return {
    "model-favorites": {
      options: OPTIONS,
      isFavorite: FAVORITES.flatMap((favorites) =>
        TOGGLES.map(({ provider, model }) => ({ args: [favorites, provider, model], result: isFavorite(favorites, provider, model) }))),
      toggleFavorite: FAVORITES.flatMap((favorites) =>
        TOGGLES.map(({ provider, model }) => ({ args: [favorites, provider, model], result: toggleFavorite(favorites, provider, model) }))),
      filterModels: QUERIES.map((query) => ({ args: [openrouter, query], result: filterModels(openrouter, query) })),
      modelRows: [
        ...FAVORITES.flatMap((favorites) => SELECTIONS.flatMap((selection) => rowCases("full", favorites, selection))),
        // Sem a OpenAI: os favoritos dela somem e a aba dela fica vazia.
        ...rowCases("noOpenai", FAVORITES[1], SELECTIONS[0]),
      ],
      readStoredFavorites: STORED_TEXTS.map((raw) => ({ args: [raw], result: readStored(raw) })),
    },
  };
}
