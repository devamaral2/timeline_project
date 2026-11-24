import type { ModelOptionsDto } from "@repo/contracts";
import { beforeEach, expect, test } from "vitest";
import {
  MODEL_FAVORITES_KEY, type ModelFavorite, filterModels, isFavorite, modelRows, readStoredFavorites, toggleFavorite, writeStoredFavorites,
} from "./model-favorites";

const OPTIONS: ModelOptionsDto = {
  providers: [
    {
      id: "anthropic",
      name: "Anthropic",
      models: [{ id: "claude-opus-5-5", name: "Opus 5.5" }, { id: "claude-sonnet-5-5", name: "Sonnet 5.5" }],
      defaultModel: "claude-sonnet-5-5",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      models: [
        { id: "google/gemini-4-neon", name: "Google: Gemini 4 Neon" },
        { id: "anthropic/claude-sonnet-5.5", name: "Anthropic: Claude Sonnet 5.5" },
        { id: "baidu/ernie-5.5", name: "Baidu: ERNIÊ 5.5" },
      ],
      defaultModel: "google/gemini-4-neon",
    },
  ],
  efforts: ["low", "medium", "high", "max"],
  default: { provider: "anthropic", model: "claude-sonnet-5-5", effort: "medium" },
};
const SELECTION = { provider: "anthropic", model: "claude-sonnet-5-5" } as const;
const names = (rows: readonly { name: string }[]) => rows.map((row) => row.name);

beforeEach(() => {
  window.localStorage.clear();
});

test("toggling adds a favorite at the end and removes the one already kept, per provider", () => {
  const one = toggleFavorite([], "anthropic", "claude-opus-5-5");
  const two = toggleFavorite(one, "openrouter", "google/gemini-4-neon");
  expect(two).toEqual([{ provider: "anthropic", model: "claude-opus-5-5" }, { provider: "openrouter", model: "google/gemini-4-neon" }]);
  expect(isFavorite(two, "openrouter", "google/gemini-4-neon")).toBe(true);
  // O mesmo id em outro provedor é outro favorito.
  expect(isFavorite(two, "anthropic", "google/gemini-4-neon")).toBe(false);
  expect(toggleFavorite(two, "anthropic", "claude-opus-5-5")).toEqual([{ provider: "openrouter", model: "google/gemini-4-neon" }]);
});

test("a provider tab lists its models in the server order, marking the favorites and the current choice", () => {
  const favorites: ModelFavorite[] = [{ provider: "anthropic", model: "claude-opus-5-5" }];
  expect(modelRows(OPTIONS, favorites, SELECTION, "anthropic", "")).toEqual([
    { provider: "anthropic", id: "claude-opus-5-5", name: "Opus 5.5", favorite: true, selected: false },
    { provider: "anthropic", id: "claude-sonnet-5-5", name: "Sonnet 5.5", favorite: false, selected: true },
  ]);
  // Um provedor que o servidor não oferece não tem linhas.
  expect(modelRows(OPTIONS, favorites, SELECTION, "openai", "")).toEqual([]);
});

test("the favorites tab joins the providers in the order kept and leaves out what the server no longer offers", () => {
  const favorites: ModelFavorite[] = [
    { provider: "openrouter", model: "baidu/ernie-5.5" },
    { provider: "openai", model: "gpt-6.2-sol" },
    { provider: "anthropic", model: "claude-sonnet-5-5" },
    { provider: "anthropic", model: "claude-antigo" },
  ];
  expect(modelRows(OPTIONS, favorites, SELECTION, "favorites", "")).toEqual([
    { provider: "openrouter", id: "baidu/ernie-5.5", name: "Baidu: ERNIÊ 5.5", favorite: true, selected: false },
    { provider: "anthropic", id: "claude-sonnet-5-5", name: "Sonnet 5.5", favorite: true, selected: true },
  ]);
  // A escolha é o par provedor e modelo: o mesmo modelo pelo OpenRouter não é a escolha atual.
  expect(modelRows(OPTIONS, [], { provider: "anthropic", model: "anthropic/claude-sonnet-5.5" }, "openrouter", "claude")[0]?.selected).toBe(false);
});

test("the search matches every word in the name or the id, without accents or case, inside the open tab", () => {
  const router = OPTIONS.providers[1]?.models ?? [];
  expect(names(filterModels(router, "  "))).toEqual(names(router));
  expect(names(filterModels(router, "CLAUDE sonnet"))).toEqual(["Anthropic: Claude Sonnet 5.5"]);
  expect(names(filterModels(router, "ernie"))).toEqual(["Baidu: ERNIÊ 5.5"]);
  expect(names(filterModels(router, "google/"))).toEqual(["Google: Gemini 4 Neon"]);
  expect(names(filterModels(router, "claude gemini"))).toEqual([]);
  expect(names(modelRows(OPTIONS, [], SELECTION, "anthropic", "sonnet"))).toEqual(["Sonnet 5.5"]);
  expect(names(modelRows(OPTIONS, [{ provider: "openrouter", model: "baidu/ernie-5.5" }], SELECTION, "favorites", "sonnet"))).toEqual([]);
});

test("the favorites are kept on the device; broken or unknown data reads as none", () => {
  expect(readStoredFavorites()).toEqual([]);
  writeStoredFavorites([{ provider: "anthropic", model: "claude-opus-5-5" }]);
  expect(readStoredFavorites()).toEqual([{ provider: "anthropic", model: "claude-opus-5-5" }]);

  window.localStorage.setItem(MODEL_FAVORITES_KEY, "{quebrado");
  expect(readStoredFavorites()).toEqual([]);
  window.localStorage.setItem(MODEL_FAVORITES_KEY, JSON.stringify({ provider: "anthropic" }));
  expect(readStoredFavorites()).toEqual([]);
  // Provedor desconhecido, modelo vazio, entrada que não é objeto e repetição ficam de fora.
  window.localStorage.setItem(MODEL_FAVORITES_KEY, JSON.stringify([
    { provider: "openai", model: "gpt-6.2-sol" }, { provider: "outro", model: "x" }, { provider: "openai", model: "" }, null, "texto",
    { provider: "openai", model: "gpt-6.2-sol" },
  ]));
  expect(readStoredFavorites()).toEqual([{ provider: "openai", model: "gpt-6.2-sol" }]);
});
