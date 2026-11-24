import type { ModelOptionsDto, ModelProvider, ModelSelection } from "@repo/contracts";
import { providerOf } from "./model-selection";

/**
 * A lista da folha da escolha do modelo (canvas "Modal de provedor, modelo e esforço", opção A · Folha): as abas
 * (os favoritos e cada provedor), a busca e os favoritos, que ficam no aparelho como a própria escolha.
 */

/** Onde o aparelho guarda os modelos favoritos. */
export const MODEL_FAVORITES_KEY = "braid.model-favorites";

/** Um modelo favorito: o id dele e o provedor que o atende (o mesmo modelo pode existir em dois provedores). */
export interface ModelFavorite {
  provider: ModelProvider;
  model: string;
}

/** A aba aberta na folha: os favoritos ou os modelos de um provedor. Trocar de aba não troca a escolha. */
export type ModelTab = "favorites" | ModelProvider;

/** Uma linha da lista de modelos. */
export interface ModelRow {
  provider: ModelProvider;
  id: string;
  name: string;
  favorite: boolean;
  /** É a escolha atual: o mesmo provedor e o mesmo modelo. */
  selected: boolean;
}

const PROVIDERS: readonly ModelProvider[] = ["anthropic", "openai", "openrouter"];

export function isFavorite(favorites: readonly ModelFavorite[], provider: ModelProvider, model: string): boolean {
  return favorites.some((entry) => entry.provider === provider && entry.model === model);
}

/** Guarda ou tira o favorito. O novo vai para o fim: a aba mostra na ordem em que foram guardados. */
export function toggleFavorite(favorites: readonly ModelFavorite[], provider: ModelProvider, model: string): ModelFavorite[] {
  return isFavorite(favorites, provider, model)
    ? favorites.filter((entry) => !(entry.provider === provider && entry.model === model))
    : [...favorites, { provider, model }];
}

/** Sem acento e sem caixa: "gemini" acha "Google: Gemini 4 Neon", e o id (`google/gemini-4-neon`) também conta. */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** A busca da lista: toda palavra tem que estar no nome ou no id. Vazia, devolve a lista inteira. */
export function filterModels<T extends { id: string; name: string }>(models: readonly T[], query: string): readonly T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return models;
  return models.filter((model) => {
    const haystack = normalize(`${model.name} ${model.id}`);
    return words.every((word) => haystack.includes(word));
  });
}

/**
 * As linhas da aba. Nos favoritos, os guardados que o servidor ainda oferece, na ordem em que foram guardados; num
 * provedor, os modelos dele na ordem do servidor. A busca vale dentro da aba.
 */
export function modelRows(
  options: ModelOptionsDto,
  favorites: readonly ModelFavorite[],
  selection: Pick<ModelSelection, "provider" | "model">,
  tab: ModelTab,
  query: string,
): ModelRow[] {
  const offered = tab === "favorites"
    ? favorites.flatMap((entry) => {
        const model = providerOf(options, entry.provider)?.models.find((option) => option.id === entry.model);
        return model ? [{ provider: entry.provider, id: model.id, name: model.name }] : [];
      })
    : (providerOf(options, tab)?.models ?? []).map((model) => ({ provider: tab, id: model.id, name: model.name }));
  return filterModels(offered, query).map((model) => ({
    ...model,
    favorite: isFavorite(favorites, model.provider, model.id),
    selected: model.provider === selection.provider && model.id === selection.model,
  }));
}

/** Lê os favoritos guardados. Qualquer falha (sem armazenamento, texto quebrado, forma errada) vira lista vazia. */
export function readStoredFavorites(): ModelFavorite[] {
  try {
    const raw = window.localStorage.getItem(MODEL_FAVORITES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    const favorites: ModelFavorite[] = [];
    for (const entry of parsed as { provider?: unknown; model?: unknown }[]) {
      const provider = PROVIDERS.find((id) => id === entry?.provider);
      if (provider && typeof entry.model === "string" && entry.model && !isFavorite(favorites, provider, entry.model)) {
        favorites.push({ provider, model: entry.model });
      }
    }
    return favorites;
  } catch {
    return [];
  }
}

export function writeStoredFavorites(favorites: readonly ModelFavorite[]): void {
  try {
    window.localStorage.setItem(MODEL_FAVORITES_KEY, JSON.stringify(favorites));
  } catch {
    // Sem armazenamento os favoritos valem só até fechar a página.
  }
}
