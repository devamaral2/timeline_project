import "reflect-metadata";
import { afterEach, describe, expect, test, vi } from "vitest";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import type { RequestOperations } from "../../api-core/requests/request-operations";
import { StartRequestController } from "./start-request.controller";

const owner = { userId: "owner-1" };
const body = { userId: "owner-1", text: "o que tenho amanhã?", context: { screen: "agenda" } };

function setup() {
  const start = vi.fn(async () => "request-1");
  return { start, controller: new StartRequestController({ start } as unknown as RequestOperations) };
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/requests", () => {
  test("sem modelo, o pedido segue como antes e nenhuma chave de provedor e conferida", async () => {
    const { start, controller } = setup();
    await expect(controller.start(body, owner)).resolves.toEqual({ requestId: "request-1" });
    expect(start).toHaveBeenCalledWith(body, owner);
  });

  test("aceita o modelo que o campo do chat mostra, quando o provedor esta ligado e o modelo e da lista dele", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const { start, controller } = setup();
    const model = { provider: "anthropic", model: "claude-haiku-5-5", effort: "medium" };
    await expect(controller.start({ ...body, model }, owner)).resolves.toEqual({ requestId: "request-1" });
    expect(start).toHaveBeenCalledWith({ ...body, model }, owner);
  });

  test.each([
    ["de um provedor sem chave", { provider: "openai", model: "gpt-6.2-sol", effort: "low" }, { ANTHROPIC_API_KEY: "sk-test", OPENAI_API_KEY: "" }],
    ["fora da lista do provedor", { provider: "anthropic", model: "claude-3", effort: "low" }, { ANTHROPIC_API_KEY: "sk-test" }],
    ["sem esforco", { provider: "anthropic", model: "claude-haiku-5-5" }, { ANTHROPIC_API_KEY: "sk-test" }],
  ])("recusa o modelo %s", async (_label, model, env) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
    const { start, controller } = setup();
    await expect(controller.start({ ...body, model }, owner)).rejects.toBeInstanceOf(InvalidInputError);
    expect(start).not.toHaveBeenCalled();
  });
});
