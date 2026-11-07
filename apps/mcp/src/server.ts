import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ApiClient } from "./api-client";
import type { McpConfig } from "./config";
import { registerTools } from "./tools";

export const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 256 * 1024;

function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (!presented?.startsWith("Bearer ")) return false;
  const received = Buffer.from(presented.slice("Bearer ".length));
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

function reply(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return chunks.length === 0 ? undefined : JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * MCP por HTTP, sem estado: cada chamada monta o servidor e o transporte e os
 * descarta. So `POST /mcp` com o Bearer certo; `/health` e o unico caminho aberto.
 */
export function createMcpHttpServer(config: McpConfig, api = new ApiClient(config)): Server {
  return createServer(async (req, res) => {
    try {
      const path = (req.url ?? "").split("?")[0];
      if (req.method === "GET" && path === "/health") return reply(res, 200, { status: "ok" });
      if (path !== MCP_PATH) return reply(res, 404, { error: "not_found" });
      if (!tokenMatches(req.headers.authorization, config.MCP_TOKEN)) return reply(res, 401, { error: "unauthorized" });
      if (req.method !== "POST") {
        res.setHeader("allow", "POST");
        return reply(res, 405, { error: "method_not_allowed" });
      }

      const body = await readJson(req);
      const server = new McpServer({ name: "braid", version: "0.1.0" });
      registerTools(server, api);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) reply(res, 400, { error: "bad_request" });
      else res.end();
    }
  });
}
