import { describe, expect, test, vi } from "vitest";
import { getServerEnv } from "../../config/env";
import { CatalogModelLists, enabledProviders, modelModeEnabled, modelOptions, selectionProblem } from "./model-catalog";

const env = (keys: Record<string, string>) => getServerEnv({ ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", OPENROUTER_API_KEY: "", ...keys });

const ROUTER_MODELS = {
  data: [
    { id: "x-ai/grok-4.7", name: "SpaceXAI: Grok 4.7", supported_parameters: ["tools", "reasoning"] },
    { id: "anthropic/claude-sonnet-5.5", name: "Anthropic: Claude Sonnet 5.5", supported_parameters: ["tools"] },
    { id: "anthropic/claude-sonnet-5.5:batch", name: "Anthropic: Claude Sonnet 5.5 (batch)", supported_parameters: ["tools"] },
    { id: "google/gemini-omni-1.2-flash", name: "Google: Gemini Omni 1.2 Flash", supported_parameters: ["reasoning"] },
  ],
};

function routerLists(reply: () => Promise<Response>) {
  let now = 0;
  const request = vi.fn(reply);
  const lists = new CatalogModelLists(request as unknown as typeof fetch, () => now);
  return { lists, request, advance: (ms: number) => { now += ms; } };
}

const ok = () => Promise.resolve(new Response(JSON.stringify(ROUTER_MODELS)));

describe("o catalogo do modo modelo", () => {
  test("so os provedores com chave entram, na ordem do seletor; o padrao e o primeiro deles", async () => {
    const only = env({ OPENROUTER_API_KEY: "or", OPENAI_API_KEY: "oa" });
    expect(enabledProviders(only)).toEqual(["openai", "openrouter"]);
    const options = await modelOptions(only, routerLists(ok).lists);
    expect(options?.providers.map((provider) => provider.id)).toEqual(["openai", "openrouter"]);
    expect(options?.efforts).toEqual(["low", "medium", "high", "max"]);
    expect(options?.default).toEqual({ provider: "openai", model: "gpt-6.2-sol", effort: "medium" });
    for (const provider of options?.providers ?? []) {
      expect(provider.models.map((model) => model.id)).toContain(provider.defaultModel);
    }
  });

  test("na Anthropic o padrao, antes de alguem escolher um modelo, e o Haiku", async () => {
    const options = await modelOptions(env({ ANTHROPIC_API_KEY: "sk" }), routerLists(ok).lists);
    expect(options?.default).toEqual({ provider: "anthropic", model: "claude-haiku-5-5", effort: "medium" });
    expect(options?.providers[0]?.defaultModel).toBe("claude-haiku-5-5");
  });

  test("sem nenhuma chave o modo nao existe", async () => {
    const none = env({});
    expect(modelModeEnabled(none)).toBe(false);
    expect(await modelOptions(none, routerLists(ok).lists)).toBeUndefined();
  });

  test("a Anthropic e a OpenAI aceitam so a lista curada", async () => {
    const both = env({ ANTHROPIC_API_KEY: "sk" });
    const { lists } = routerLists(ok);
    expect(await selectionProblem({ provider: "anthropic", model: "claude-sonnet-5-5", effort: "high" }, both, lists)).toBeUndefined();
    expect(await selectionProblem({ provider: "openai", model: "gpt-6.2-sol", effort: "high" }, both, lists)).toContain("não está ligado");
    expect(await selectionProblem({ provider: "anthropic", model: "claude-opus-1", effort: "high" }, both, lists)).toContain("não está na lista");
  });
});

describe("a lista do OpenRouter", () => {
  test("vem da API dele: so os modelos com ferramentas, sem as variantes batch, em ordem alfabetica, por uma hora", async () => {
    const { lists, request, advance } = routerLists(ok);
    const models = await lists.models("openrouter");
    expect(models).toEqual([
      { id: "anthropic/claude-sonnet-5.5", name: "Anthropic: Claude Sonnet 5.5" },
      { id: "x-ai/grok-4.7", name: "SpaceXAI: Grok 4.7" },
    ]);
    await lists.models("openrouter");
    expect(request).toHaveBeenCalledTimes(1);
    advance(60 * 60 * 1000 + 1);
    await lists.models("openrouter");
    expect(request).toHaveBeenCalledTimes(2);
  });

  test("qualquer modelo da lista dele vale no pedido; o padrao e o curado quando existe, senao o primeiro", async () => {
    const router = env({ OPENROUTER_API_KEY: "or" });
    const { lists } = routerLists(ok);
    expect(await selectionProblem({ provider: "openrouter", model: "anthropic/claude-sonnet-5.5", effort: "max" }, router, lists)).toBeUndefined();
    expect(await selectionProblem({ provider: "openrouter", model: "google/gemini-omni-1.2-flash", effort: "max" }, router, lists)).toContain("não está na lista");
    expect((await modelOptions(router, lists))?.default.model).toBe("anthropic/claude-sonnet-5.5");
  });

  test("fora do ar, vale a lista curada e a consulta volta em um minuto", async () => {
    const { lists, request, advance } = routerLists(() => Promise.resolve(new Response("erro", { status: 503 })));
    const models = await lists.models("openrouter");
    expect(models.map((model) => model.id)).toContain("google/gemini-4-neon");
    advance(61 * 1000);
    await lists.models("openrouter");
    expect(request).toHaveBeenCalledTimes(2);
  });
});
