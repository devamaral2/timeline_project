import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiClient } from "./api-client";
import { readConfig, type McpConfig } from "./config";
import { createMcpHttpServer } from "./server";

const env = {
  MCP_TOKEN: "t".repeat(40),
  AUTH_INTERNAL_SERVICE_KEY: "k".repeat(40),
  MCP_OWNER_USER_ID: "owner-1",
  API_SERVICE_URL: "http://api.test:3001/",
};

describe("readConfig", () => {
  test("trims the trailing slash and applies defaults", () => {
    const config = readConfig(env);
    expect(config.API_SERVICE_URL).toBe("http://api.test:3001");
    expect(config.MCP_HOST).toBe("127.0.0.1");
    expect(config.MCP_PORT).toBe(3003);
  });

  test("refuses a short token and names the field, never the value", () => {
    expect(() => readConfig({ ...env, MCP_TOKEN: "short" })).toThrow("MCP_TOKEN");
    expect(() => readConfig({ ...env, MCP_TOKEN: "short" })).not.toThrow(/short/);
  });
});

describe("MCP over HTTP", () => {
  let server: Server;
  let baseUrl: string;
  const config: McpConfig = readConfig(env);
  const fetchApi = vi.fn<typeof fetch>();

  beforeAll(async () => {
    server = createMcpHttpServer(config, new ApiClient(config, fetchApi));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    fetchApi.mockReset();
  });

  async function connect(): Promise<Client> {
    const client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
        requestInit: { headers: { authorization: `Bearer ${config.MCP_TOKEN}` } },
      }),
    );
    return client;
  }

  test("health is open, everything else needs the bearer", async () => {
    expect((await fetch(`${baseUrl}/health`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/mcp`, { method: "POST" })).status).toBe(401);
    expect(
      (await fetch(`${baseUrl}/mcp`, { method: "POST", headers: { authorization: `Bearer ${"x".repeat(40)}` } })).status,
    ).toBe(401);
    expect((await fetch(`${baseUrl}/other`)).status).toBe(404);
  });

  test("exposes creation, read and edit tools, none that delete", async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "create_event",
      "create_note",
      "create_recurrence",
      "create_task",
      "get_event",
      "get_note",
      "get_recurrence",
      "get_task",
      "list_notes",
      "list_tasks",
      "list_timeline_events",
      "update_event",
      "update_note",
      "update_recurrence",
      "update_task",
    ]);
    for (const tool of tools) {
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toContain("userId");
      if (tool.name.startsWith("create_")) expect(tool.inputSchema.required).toContain("idempotencyKey");
      if (tool.name.startsWith("update_")) expect(tool.inputSchema.required).toContain("expectedRevision");
    }
    await client.close();
  });

  test("create_event posts as the owner with the idempotency key and without it in the body", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ eventId: "event-1" }), { status: 201 }));
    const client = await connect();

    const result = await client.callTool({
      name: "create_event",
      arguments: { name: "Resumo", idempotencyKey: "resumo:2026-11-03", priority: "normal" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: '{"eventId":"event-1"}' }]);
    const [url, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/api/events");
    expect(init.headers).toMatchObject({
      "x-auth-gateway-key": env.AUTH_INTERNAL_SERVICE_KEY,
      "x-auth-user-id": "owner-1",
      "idempotency-key": "resumo:2026-11-03",
    });
    expect(JSON.parse(init.body as string)).toEqual({ name: "Resumo", priority: "normal" });
    await client.close();
  });

  test("create_note sends a text note linked to the given events", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ noteId: "note-1" }), { status: 201 }));
    const client = await connect();

    await client.callTool({
      name: "create_note",
      arguments: { body: "Beber agua", eventIds: ["e1"], idempotencyKey: "agua:1" },
    });

    const [, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ type: "text", data: { body: "Beber agua" }, eventIds: ["e1"] });
    await client.close();
  });

  test("create_recurrence turns weekday names into the Sunday-first bitmask", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ recurrenceId: "r1" }), { status: 201 }));
    const client = await connect();

    await client.callTool({
      name: "create_recurrence",
      arguments: {
        target: "task",
        name: "Revisar semana",
        frequency: "weekly",
        weekdays: ["mon", "fri"],
        timeOfDay: "08:00",
        timeZone: "America/Sao_Paulo",
        startsOn: "2026-11-09",
        idempotencyKey: "revisao-semanal",
      },
    });

    const [url, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/api/recurrences");
    expect(JSON.parse(init.body as string)).toMatchObject({
      target: "task",
      frequency: "weekly",
      interval: 1,
      byWeekday: (1 << 1) | (1 << 5),
      timeOfDay: "08:00",
      template: { name: "Revisar semana" },
    });
    await client.close();
  });

  test("update_event patches only the given fields and reports ok on the empty 204", async () => {
    fetchApi.mockResolvedValue(new Response(null, { status: 204 }));
    const client = await connect();

    const result = await client.callTool({
      name: "update_event",
      arguments: { eventId: "e 1", expectedRevision: 3, name: "Novo nome" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: '{"ok":true}' }]);
    const [url, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/api/events/e%201");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ expectedRevision: 3, name: "Novo nome" });
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBeUndefined();
    await client.close();
  });

  test("update_note wraps a new body as text data", async () => {
    fetchApi.mockResolvedValue(new Response(null, { status: 204 }));
    const client = await connect();

    await client.callTool({ name: "update_note", arguments: { noteId: "n1", expectedRevision: 2, body: "texto" } });

    const [, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ expectedRevision: 2, type: "text", data: { body: "texto" } });
    await client.close();
  });

  test("update_recurrence does not invent an interval when none is given", async () => {
    fetchApi.mockResolvedValue(new Response(null, { status: 204 }));
    const client = await connect();

    await client.callTool({
      name: "update_recurrence",
      arguments: { recurrenceId: "r1", expectedRevision: 1, weekdays: ["tue"], timeOfDay: "09:30" },
    });

    const [url, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/api/recurrences/r1");
    expect(JSON.parse(init.body as string)).toEqual({ expectedRevision: 1, timeOfDay: "09:30", byWeekday: 1 << 2 });
    await client.close();
  });

  test("get_task reads one entity and a stale revision comes back as a tool error", async () => {
    fetchApi.mockResolvedValueOnce(new Response(JSON.stringify({ id: "t1", revision: 4 }), { status: 200 }));
    fetchApi.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Revision conflict" }), { status: 409 }));
    const client = await connect();

    const read = await client.callTool({ name: "get_task", arguments: { id: "t1" } });
    const stale = await client.callTool({ name: "update_task", arguments: { taskId: "t1", expectedRevision: 3, name: "x" } });

    expect(read.content).toEqual([{ type: "text", text: '{"id":"t1","revision":4}' }]);
    expect(fetchApi.mock.calls[0]?.[0]).toBe("http://api.test:3001/api/tasks/t1");
    expect(stale.isError).toBe(true);
    expect(JSON.stringify(stale.content)).toContain("API 409: Revision conflict");
    await client.close();
  });

  test("list_timeline_events forwards the filters as a query string", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const client = await connect();

    await client.callTool({ name: "list_timeline_events", arguments: { tag: "saude", limit: 5 } });

    const [url, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/api/events?tag=saude&limit=5");
    expect(init.method).toBe("GET");
    await client.close();
  });

  test("an API error comes back to the model as a tool error without secrets", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ message: "Invalid time zone" }), { status: 400 }));
    const client = await connect();

    const result = await client.callTool({
      name: "create_task",
      arguments: { name: "x", idempotencyKey: "k1" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("API 400: Invalid time zone");
    expect(JSON.stringify(result.content)).not.toContain(env.AUTH_INTERNAL_SERVICE_KEY);
    await client.close();
  });
});
