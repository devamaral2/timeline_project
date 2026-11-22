import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterEach, expect, test } from "vitest";
import { z } from "zod";
import { McpAgendaTools } from "./agenda-tools";

const TOKEN = "t".repeat(40);
let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

/** Um MCP como o apps/mcp: sem estado, so `POST /mcp` com o Bearer certo. */
async function startMcp(): Promise<{ url: string; seen: string[] }> {
  const seen: string[] = [];
  server = createServer(async (req, res) => {
    seen.push(req.headers.authorization ?? "");
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return void res.writeHead(401).end();
    if (req.method !== "POST") return void res.writeHead(405).end();
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const mcp = new McpServer({ name: "braid", version: "0.1.0" });
    mcp.registerTool("list_agenda_tasks", { description: "List the agenda.", inputSchema: { limit: z.number().optional() } },
      async ({ limit }) => ({ content: [{ type: "text", text: JSON.stringify({ items: [], limit: limit ?? 20 }) }] }));
    mcp.registerTool("create_task", { description: "Create a task.", inputSchema: { name: z.string() } },
      async () => ({ content: [{ type: "text", text: "conflict: idempotency key reused" }], isError: true }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, JSON.parse(Buffer.concat(chunks).toString("utf8")));
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}/mcp`, seen };
}

test("lista as ferramentas do MCP em ordem fixa e devolve o texto do resultado, com o erro marcado", async () => {
  const { url, seen } = await startMcp();
  const signal = new AbortController().signal;
  const session = await new McpAgendaTools({ url, token: TOKEN }).open(signal);

  expect(session.tools.map((tool) => tool.name)).toEqual(["create_task", "list_agenda_tasks"]);
  expect(session.tools[1]).toMatchObject({ description: "List the agenda.", inputSchema: { type: "object", properties: { limit: { type: "number" } } } });

  await expect(session.call("list_agenda_tasks", { limit: 5 }, signal)).resolves.toEqual({ content: "{\"items\":[],\"limit\":5}", isError: false });
  await expect(session.call("create_task", { name: "x" }, signal)).resolves.toEqual({ content: "conflict: idempotency key reused", isError: true });
  // Ferramenta que nao existe volta ao modelo como erro, sem derrubar o turno.
  await expect(session.call("delete_task", {}, signal)).resolves.toMatchObject({ isError: true });

  await session.close();
  expect(new Set(seen)).toEqual(new Set([`Bearer ${TOKEN}`]));
});

test("token errado nao abre a sessao", async () => {
  const { url } = await startMcp();
  await expect(new McpAgendaTools({ url, token: "x".repeat(40) }).open(new AbortController().signal)).rejects.toThrow();
});
