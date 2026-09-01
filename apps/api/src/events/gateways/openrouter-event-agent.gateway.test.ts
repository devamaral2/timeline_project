import { expect, test, vi } from "vitest";
import type { SkillExecutionResult } from "./event-agent.gateway";
import { LlmUnavailableError } from "../errors/event-agent.errors";
import { EVENT_SKILLS } from "../skills/event-skill-registry";
import { OpenRouterEventAgentGateway } from "./openrouter-event-agent.gateway";

/**
 * Captura a requisição montada para o SDK e permite acionar as tools como o
 * agente real faria, sem simular o protocolo de rede do OpenRouter.
 */
function fakeClientFactory() {
  const calls: { model?: string; instructions?: string; input?: unknown; tools?: unknown[] }[] = [];
  let driveTools: (tools: CapturedTool[]) => Promise<void> = async () => {};

  const factory = () => ({
    callModel: (request: Record<string, unknown>) => {
      calls.push(request as (typeof calls)[number]);
      const tools = (request.tools ?? []) as CapturedTool[];
      const finished = driveTools(tools);
      return { getResponse: async () => finished.then(() => ({})) };
    },
  });

  return {
    factory: factory as never,
    calls,
    onRun(handler: (tools: CapturedTool[]) => Promise<void>) {
      driveTools = handler;
    },
  };
}

interface CapturedTool {
  function: { name: string; description?: string | null; execute?: (args: unknown) => unknown };
}

function runTool(tools: CapturedTool[], name: string, args: unknown) {
  const target = tools.find((candidate) => candidate.function.name === name);
  if (!target?.function.execute) throw new Error(`tool ${name} not found`);
  return target.function.execute(args) as Promise<SkillExecutionResult>;
}

test("exposes every skill as a tool and forwards model and prompt", async () => {
  const client = fakeClientFactory();
  const gateway = new OpenRouterEventAgentGateway("key", "test/model", client.factory);

  const result = await gateway.run({
    text: "Corri 5 km",
    systemPrompt: "PROMPT",
    skills: EVENT_SKILLS,
    execute: async () => ({ ok: true, eventId: "01J" }),
  });

  expect(result.modelName).toBe("test/model");
  expect(client.calls).toHaveLength(1);
  expect(client.calls[0]).toMatchObject({
    model: "test/model",
    instructions: "PROMPT",
    input: "Corri 5 km",
    // Sem isto o SDK faria uma chamada extra ao modelo só para o texto final.
    allowFinalResponse: false,
  });
  expect((client.calls[0].tools as CapturedTool[]).map((tool) => tool.function.name)).toEqual([
    "create_training_event",
    "create_meal_event",
    "create_sleep_event",
    "create_routine_event",
  ]);
});

test("dispatches a tool call to the injected executor", async () => {
  const client = fakeClientFactory();
  const execute = vi.fn(async () => ({ ok: true as const, eventId: "01JEVENT" }));
  const args = { workouts: [{ type: "running", distance: 5, duration: 90, pace: 18, calories: 300 }] };

  client.onRun(async (tools) => {
    await expect(runTool(tools, "create_training_event", args)).resolves.toEqual({
      ok: true,
      eventId: "01JEVENT",
    });
  });

  await new OpenRouterEventAgentGateway("key", "test/model", client.factory).run({
    text: "Corri 5 km",
    systemPrompt: "PROMPT",
    skills: EVENT_SKILLS,
    execute,
  });

  expect(execute).toHaveBeenCalledWith({ name: "create_training_event", args });
});

test("stop condition flips only after a skill reports success", async () => {
  const client = fakeClientFactory();
  const stopWhenFor = () =>
    (client.calls[0] as unknown as { stopWhen: Array<() => boolean> }).stopWhen[0];

  client.onRun(async (tools) => {
    expect(stopWhenFor()()).toBe(false);
    await runTool(tools, "create_training_event", {});
    // Falha de skill mantém o loop vivo, para o modelo poder se corrigir.
    expect(stopWhenFor()()).toBe(false);
    await runTool(tools, "create_training_event", {});
    expect(stopWhenFor()()).toBe(true);
  });

  let attempt = 0;
  await new OpenRouterEventAgentGateway("key", "test/model", client.factory).run({
    text: "Corri 5 km",
    systemPrompt: "PROMPT",
    skills: EVENT_SKILLS,
    execute: async () =>
      ++attempt === 1 ? { ok: false, error: "duration inválido" } : { ok: true, eventId: "01J" },
  });

  expect(attempt).toBe(2);
});

test("reports missing configuration as an unavailable LLM", async () => {
  const client = fakeClientFactory();
  const run = {
    text: "Corri 5 km",
    systemPrompt: "PROMPT",
    skills: EVENT_SKILLS,
    execute: async () => ({ ok: true as const, eventId: "01J" }),
  };

  await expect(
    new OpenRouterEventAgentGateway(undefined, "test/model", client.factory).run(run),
  ).rejects.toThrow(LlmUnavailableError);
  await expect(
    new OpenRouterEventAgentGateway("key", undefined, client.factory).run(run),
  ).rejects.toThrow(LlmUnavailableError);
  expect(client.calls).toHaveLength(0);
});

test("wraps a provider failure as an unavailable LLM", async () => {
  const failingFactory = (() => ({
    callModel: () => ({
      getResponse: async () => {
        throw new Error("502 Bad Gateway");
      },
    }),
  })) as never;

  await expect(
    new OpenRouterEventAgentGateway("key", "test/model", failingFactory).run({
      text: "Corri 5 km",
      systemPrompt: "PROMPT",
      skills: EVENT_SKILLS,
      execute: async () => ({ ok: true, eventId: "01J" }),
    }),
  ).rejects.toThrow(LlmUnavailableError);
});
