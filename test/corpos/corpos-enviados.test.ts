import {
  createArtifactRequestSchema,
  createTaskInputSchema,
  updateArtifactRequestSchema,
  updateTaskInputSchema,
} from "@repo/contracts/schemas";
import { describe, expect, test } from "vitest";
import { assertArtifactRequest, assertExpectedRevision, assertTaskFields } from "../../apps/api/src/api-core/http-input-validation";
import { registerTools } from "../../apps/mcp/src/tools";

/**
 * Todo corpo que um cliente de verdade manda passa na validacao de entrada da
 * API. O MCP e exercitado pelas proprias ferramentas (so o `fetch` e falso). O
 * web monta os corpos com os tipos do contrato e o fake da API dos testes dele
 * confere cada um contra os mesmos esquemas que a API usa aqui.
 */

type Handler = (args: Record<string, unknown>) => Promise<unknown>;
interface Sent { method: "POST" | "PATCH"; path: string; body: Record<string, unknown> }

function mcp() {
  const handlers = new Map<string, { schema: Record<string, { parse(value: unknown): unknown }>; run: Handler }>();
  const sent: Sent[] = [];
  const server = {
    registerTool(name: string, config: { inputSchema?: Record<string, { parse(value: unknown): unknown }> }, run: Handler) {
      handlers.set(name, { schema: config.inputSchema ?? {}, run });
    },
  };
  const api = {
    async post(path: string, body: Record<string, unknown>) { sent.push({ method: "POST", path, body }); return {}; },
    async patch(path: string, body: Record<string, unknown>) { sent.push({ method: "PATCH", path, body }); return { ok: true }; },
    async get() { return {}; },
  };
  registerTools(server as never, api as never);
  /** Chama a ferramenta como o cliente MCP: os argumentos passam pelo esquema da ferramenta antes do handler. */
  async function call(name: string, args: Record<string, unknown>): Promise<Sent> {
    const tool = handlers.get(name);
    if (!tool) throw new Error(`no tool ${name}`);
    const parsed = Object.fromEntries(Object.entries(args).map(([key, value]) => [key, tool.schema[key].parse(value)]));
    await tool.run(parsed);
    const last = sent.at(-1);
    if (!last) throw new Error("nothing sent");
    return last;
  }
  return { call };
}

describe("o que o MCP manda passa na API", () => {
  const key = "chave-de-teste";

  test.each(["common", "meal", "sleep", "training"])("create_task com kind %s", async (kind) => {
    const { body } = await mcp().call("create_task", {
      name: "Correr", description: "5 km", location: "Parque", kind, status: "todo", priority: "high",
      startedAt: "2026-11-03T07:00:00-03:00", estimatedFinishAt: "2026-11-03T08:00:00-03:00",
      finishedAt: "2026-11-03T08:05:00-03:00", longRunning: false, tags: ["saude"], idempotencyKey: key,
    });
    expect(() => assertTaskFields(body, false)).not.toThrow();
    expect(createTaskInputSchema.safeParse(body).success).toBe(true);
  });

  test("update_task manda so o que mudou, com null para limpar", async () => {
    const { body } = await mcp().call("update_task", {
      taskId: "t1", expectedRevision: 2, name: "Novo", status: null, startedAt: null, estimatedFinishAt: null, finishedAt: null,
      kind: "common", priority: "low", longRunning: true, tags: [], location: "", description: "",
    });
    expect(() => assertTaskFields(body, true)).not.toThrow();
    expect(() => assertExpectedRevision(body)).not.toThrow();
    expect(updateTaskInputSchema.omit({ taskId: true }).safeParse(body).success).toBe(true);
  });

  test("create_artifact, com e sem taskIds", async () => {
    for (const extra of [{}, { taskIds: ["t1"], tags: ["a"], name: "Nota" }]) {
      const { body } = await mcp().call("create_artifact", { body: "texto", idempotencyKey: key, ...extra });
      expect(() => assertArtifactRequest(body, true)).not.toThrow();
      expect(createArtifactRequestSchema.safeParse(body).success).toBe(true);
    }
  });

  test("update_artifact, com e sem o texto novo", async () => {
    for (const extra of [{ name: "Outro" }, { body: "novo texto", tags: ["b"] }]) {
      const { body } = await mcp().call("update_artifact", { artifactId: "a1", expectedRevision: 3, ...extra });
      expect(() => assertArtifactRequest(body as never, false)).not.toThrow();
      expect(() => assertExpectedRevision(body)).not.toThrow();
      expect(updateArtifactRequestSchema.safeParse(body).success).toBe(true);
    }
  });
});
