import { describe, expect, test } from "vitest";
import { getServerEnv } from "../../config/env";
import { enabledProviders, modelModeEnabled, modelName, modelOptions, selectionProblem } from "./model-catalog";

const env = (keys: Record<string, string>) => getServerEnv({ ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", OPENROUTER_API_KEY: "", ...keys });

describe("o catalogo do modo modelo", () => {
  test("so os provedores com chave entram, na ordem do seletor; o padrao e o primeiro deles", () => {
    const only = env({ OPENROUTER_API_KEY: "or", OPENAI_API_KEY: "oa" });
    expect(enabledProviders(only)).toEqual(["openai", "openrouter"]);
    const options = modelOptions(only);
    expect(options?.providers.map((provider) => provider.id)).toEqual(["openai", "openrouter"]);
    expect(options?.efforts).toEqual(["low", "medium", "high", "max"]);
    expect(options?.default).toEqual({ provider: "openai", model: "gpt-6.2-sol", effort: "medium" });
    // Cada provedor marca um modelo da propria lista.
    for (const provider of options?.providers ?? []) {
      expect(provider.models.map((model) => model.id)).toContain(provider.defaultModel);
    }
  });

  test("sem nenhuma chave o modo nao existe", () => {
    const none = env({});
    expect(modelModeEnabled(none)).toBe(false);
    expect(modelOptions(none)).toBeUndefined();
  });

  test("a escolha so vale com o provedor ligado e um modelo da lista dele", () => {
    const anthropic = env({ ANTHROPIC_API_KEY: "sk" });
    expect(selectionProblem({ provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" }, anthropic)).toBeUndefined();
    expect(selectionProblem({ provider: "openai", model: "gpt-6.2-sol", effort: "high" }, anthropic)).toContain("não está ligado");
    expect(selectionProblem({ provider: "anthropic", model: "claude-opus-1", effort: "high" }, anthropic)).toContain("não está na lista");
  });

  test("o nome curto do modelo, ou o id quando saiu da lista", () => {
    expect(modelName({ provider: "anthropic", model: "claude-opus-5-5" })).toBe("Opus 5.5");
    expect(modelName({ provider: "openrouter", model: "x/y" })).toBe("x/y");
  });
});
