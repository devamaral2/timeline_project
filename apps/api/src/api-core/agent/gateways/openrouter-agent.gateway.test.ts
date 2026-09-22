import { expect, test } from "vitest";
import { z } from "zod";
import { AgentRunCancelledError, LlmUnavailableError } from "../errors/agent.errors";
import type { AgentTool } from "./agent.gateway";
import {
  FINAL_RESPONSE_DIRECTIVE,
  MAX_TOOL_RESULT_CHARS,
  OpenRouterAgentGateway,
  capToolResult,
} from "./openrouter-agent.gateway";

interface CapturedTool {
  function: { name: string; execute?: (args: unknown) => unknown };
}

interface CapturedRequest {
  model: string;
  instructions: string;
  input: string;
  tools: CapturedTool[];
  stopWhen: Array<(options: { steps: unknown[] }) => Promise<boolean> | boolean>;
  allowFinalResponse: unknown;
  toolConcurrency: unknown;
}

/** Captura a requisicao montada para o SDK e deixa o teste agir como o loop do agente. */
function fakeClient(drive: (request: CapturedRequest) => Promise<string> = async () => "resposta") {
  const requests: CapturedRequest[] = [];
  const factory = () => ({
    callModel: (request: CapturedRequest) => {
      requests.push(request);
      const text = drive(request);
      return { getText: () => text };
    },
  });
  return { factory: factory as never, requests };
}

const echoTool: AgentTool = {
  name: "echo",
  description: "devolve os argumentos",
  parameters: z.object({ value: z.string() }),
  execute: async (args) => args,
};

test("sends the prompt, the tools and the loop options, and returns the final text", async () => {
  const client = fakeClient(async () => "Pronto.");
  const gateway = new OpenRouterAgentGateway("key", "test/model", client.factory);

  const result = await gateway.run({ systemPrompt: "PROMPT", text: "pedido", tools: [echoTool] });

  expect(result).toEqual({ text: "Pronto.", modelName: "test/model", stoppedByLimit: false });
  expect(client.requests[0]).toMatchObject({
    model: "test/model",
    instructions: "PROMPT",
    input: "pedido",
    allowFinalResponse: FINAL_RESPONSE_DIRECTIVE,
    toolConcurrency: 1,
  });
  expect(client.requests[0].tools.map((tool) => tool.function.name)).toEqual(["echo"]);
});

test("runs the bound tool when the model calls it", async () => {
  const client = fakeClient(async (request) => {
    const result = await request.tools[0].function.execute?.({ value: "oi" });
    return JSON.stringify(result);
  });

  const result = await new OpenRouterAgentGateway("key", "test/model", client.factory).run({
    systemPrompt: "PROMPT",
    text: "pedido",
    tools: [echoTool],
  });

  expect(result.text).toBe('{"value":"oi"}');
});

test("flags a run that stopped on the step limit", async () => {
  const client = fakeClient(async (request) => {
    const steps = Array.from({ length: 50 }, () => ({}));
    for (const condition of request.stopWhen) await condition({ steps });
    return "parei";
  });

  const result = await new OpenRouterAgentGateway("key", "test/model", client.factory).run({
    systemPrompt: "PROMPT",
    text: "pedido",
    tools: [],
  });

  expect(result.stoppedByLimit).toBe(true);
});

test("caps a tool result that is too large for the context", () => {
  const huge = { rows: ["x".repeat(MAX_TOOL_RESULT_CHARS + 10)] };

  expect(capToolResult(huge)).toMatchObject({ truncated: true });
  expect(capToolResult({ ok: true })).toEqual({ ok: true });
});

test("announces each tool before running it", async () => {
  const announced: string[] = [];
  const client = fakeClient(async (request) => {
    await request.tools[0].function.execute?.({ value: "oi" });
    return "ok";
  });

  await new OpenRouterAgentGateway("key", "test/model", client.factory).run({
    systemPrompt: "PROMPT",
    text: "pedido",
    tools: [echoTool],
    onToolCall: (name) => announced.push(name),
  });

  expect(announced).toEqual(["echo"]);
});

test("a caller abort is a cancellation, not a provider failure", async () => {
  const controller = new AbortController();
  const client = fakeClient(async () => {
    controller.abort();
    throw new Error("This operation was aborted");
  });

  await expect(
    new OpenRouterAgentGateway("key", "m", client.factory).run({
      systemPrompt: "PROMPT",
      text: "pedido",
      tools: [],
      signal: controller.signal,
    }),
  ).rejects.toThrow(AgentRunCancelledError);
});

test("reports missing configuration and provider failures as an unavailable LLM", async () => {
  const input = { systemPrompt: "PROMPT", text: "pedido", tools: [] };

  await expect(new OpenRouterAgentGateway(undefined, "m", fakeClient().factory).run(input)).rejects.toThrow(
    LlmUnavailableError,
  );
  await expect(new OpenRouterAgentGateway("key", undefined, fakeClient().factory).run(input)).rejects.toThrow(
    LlmUnavailableError,
  );

  const failing = fakeClient(async () => {
    throw new Error("500 from provider");
  });
  await expect(new OpenRouterAgentGateway("key", "m", failing.factory).run(input)).rejects.toThrow(
    LlmUnavailableError,
  );
});
