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
      "create_artifact",
      "create_recurrence",
      "create_task",
      "get_artifact",
      "get_recurrence",
      "get_task",
      "list_agenda_tasks",
      "list_artifacts",
      "list_recurrences",
      "list_tracked_tasks",
      "search_places",
      "update_artifact",
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

  test("create_task posts as the owner with the idempotency key and without it in the body", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ taskId: "task-1" }), { status: 201 }));
    const client = await connect();

    const result = await client.callTool({
      name: "create_task",
      arguments: { name: "Resumo", idempotencyKey: "resumo:2026-11-03", priority: "medium" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: '{"taskId":"task-1"}' }]);
    const [url, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/api/tasks");
    expect(init.headers).toMatchObject({
      "x-auth-gateway-key": env.AUTH_INTERNAL_SERVICE_KEY,
      "x-auth-user-id": "owner-1",
      "idempotency-key": "resumo:2026-11-03",
    });
    expect(JSON.parse(init.body as string)).toEqual({ name: "Resumo", priority: "medium" });
    await client.close();
  });

  test("create_task with a status creates a tracked task, and refuses a status the API does not have", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ taskId: "task-2" }), { status: 201 }));
    const client = await connect();

    await client.callTool({
      name: "create_task",
      arguments: {
        name: "Pagar a conta",
        status: "todo",
        priority: "high",
        estimatedFinishAt: "2026-11-20T18:00:00-03:00",
        longRunning: true,
        idempotencyKey: "conta:2026-11",
      },
    });
    const refused = await client.callTool({
      name: "create_task",
      arguments: { name: "x", status: "scheduled", idempotencyKey: "k2" },
    });

    expect(fetchApi).toHaveBeenCalledTimes(1);
    const [url, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/api/tasks");
    expect(JSON.parse(init.body as string)).toEqual({
      name: "Pagar a conta",
      status: "todo",
      priority: "high",
      estimatedFinishAt: "2026-11-20T18:00:00-03:00",
      longRunning: true,
    });
    expect(refused.isError).toBe(true);
    await client.close();
  });

  test("create_artifact sends a text artifact that appears in the given tasks", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ artifactId: "artifact-1" }), { status: 201 }));
    const client = await connect();

    await client.callTool({
      name: "create_artifact",
      arguments: { body: "Beber agua", taskIds: ["e1"], idempotencyKey: "agua:1" },
    });

    const [url, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/api/artifacts");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("agua:1");
    expect(JSON.parse(init.body as string)).toEqual({ type: "text", data: { body: "Beber agua" }, taskIds: ["e1"] });
    await client.close();
  });

  test("create_recurrence turns weekday names into the Sunday-first bitmask and puts the task fields in the template", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ recurrenceId: "r1" }), { status: 201 }));
    const client = await connect();

    await client.callTool({
      name: "create_recurrence",
      arguments: {
        name: "Revisar semana",
        status: "todo",
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
    expect(JSON.parse(init.body as string)).toEqual({
      frequency: "weekly",
      interval: 1,
      byWeekday: (1 << 1) | (1 << 5),
      timeOfDay: "08:00",
      timeZone: "America/Sao_Paulo",
      startsOn: "2026-11-09",
      template: { name: "Revisar semana", status: "todo" },
    });
    await client.close();
  });

  test("update_task patches only the given fields and reports ok on the empty 204", async () => {
    fetchApi.mockResolvedValue(new Response(null, { status: 204 }));
    const client = await connect();

    const result = await client.callTool({
      name: "update_task",
      arguments: { taskId: "e 1", expectedRevision: 3, name: "Novo nome" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: '{"ok":true}' }]);
    const [url, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/api/tasks/e%201");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ expectedRevision: 3, name: "Novo nome" });
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBeUndefined();
    await client.close();
  });

  test("update_task changes the status and clears a date with null", async () => {
    fetchApi.mockResolvedValue(new Response(null, { status: 204 }));
    const client = await connect();

    await client.callTool({
      name: "update_task",
      arguments: { taskId: "e1", expectedRevision: 2, status: "done", finishedAt: "2026-11-14T10:00:00-03:00", estimatedFinishAt: null },
    });

    const [, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      expectedRevision: 2,
      status: "done",
      finishedAt: "2026-11-14T10:00:00-03:00",
      estimatedFinishAt: null,
    });
    await client.close();
  });

  test.each(["news", "email_summary", "youtube_transcript"])("create_artifact creates a %s artifact when the type is given", async (type) => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ artifactId: "artifact-1" }), { status: 201 }));
    const client = await connect();

    await client.callTool({
      name: "create_artifact",
      arguments: { type, name: "Resumo do dia", body: "# Resumo", tags: ["leitura"], taskIds: ["e1"], idempotencyKey: `${type}:1` },
    });

    const [, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      type,
      name: "Resumo do dia",
      data: { body: "# Resumo" },
      tags: ["leitura"],
      taskIds: ["e1"],
    });
    await client.close();
  });

  test("create_artifact refuses a type that is not free text before calling the API, naming the ones it takes", async () => {
    const client = await connect();

    const result = await client.callTool({ name: "create_artifact", arguments: { type: "food", body: "arroz", idempotencyKey: "food:1" } });

    expect(result.isError).toBe(true);
    const message = JSON.stringify(result.content);
    for (const type of ["text", "news", "email_summary", "youtube_transcript"]) expect(message).toContain(type);
    expect(fetchApi).not.toHaveBeenCalled();
    await client.close();
  });

  test.each(["text", "news", "email_summary", "youtube_transcript"])("update_artifact sends a new body with the type the %s artifact already has", async (type) => {
    fetchApi.mockImplementation(async (_url, init) =>
      init?.method === "PATCH" ? new Response(null, { status: 204 }) : new Response(JSON.stringify({ id: "a1", type, revision: 2 }), { status: 200 }),
    );
    const client = await connect();

    await client.callTool({ name: "update_artifact", arguments: { artifactId: "a1", expectedRevision: 2, body: "texto" } });

    const [[readUrl, readInit], [url, init]] = fetchApi.mock.calls as [string, RequestInit][];
    expect(readUrl).toBe("http://api.test:3001/api/artifacts/a1");
    expect(readInit.method ?? "GET").toBe("GET");
    expect(url).toBe("http://api.test:3001/api/artifacts/a1");
    expect(JSON.parse(init.body as string)).toEqual({ expectedRevision: 2, type, data: { body: "texto" } });
    await client.close();
  });

  test("update_artifact without a body patches the name and tags without reading the artifact", async () => {
    fetchApi.mockResolvedValue(new Response(null, { status: 204 }));
    const client = await connect();

    await client.callTool({ name: "update_artifact", arguments: { artifactId: "a1", expectedRevision: 2, name: "Novo nome", tags: ["casa"] } });

    expect(fetchApi).toHaveBeenCalledTimes(1);
    const [, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ expectedRevision: 2, name: "Novo nome", tags: ["casa"] });
    await client.close();
  });

  test("update_artifact does not rewrite the body of an artifact that is not free text", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ id: "a1", type: "food", revision: 2 }), { status: 200 }));
    const client = await connect();

    const result = await client.callTool({ name: "update_artifact", arguments: { artifactId: "a1", expectedRevision: 2, body: "texto" } });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("food");
    expect(fetchApi).toHaveBeenCalledTimes(1);
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

  test("list_agenda_tasks forwards the filters as a query string", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const client = await connect();

    await client.callTool({ name: "list_agenda_tasks", arguments: { tag: "saude", limit: 5 } });

    const [url, init] = fetchApi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test:3001/api/tasks?tag=saude&limit=5");
    expect(init.method).toBe("GET");
    await client.close();
  });

  test("list_agenda_tasks forwards the kind, the actor and the cursor", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const client = await connect();

    await client.callTool({ name: "list_agenda_tasks", arguments: { kind: "meal", actor: "human", cursor: "abc", limit: 10 } });

    const url = new URL(fetchApi.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/api/tasks");
    expect(Object.fromEntries(url.searchParams)).toEqual({ kind: "meal", actor: "human", cursor: "abc", limit: "10" });
    await client.close();
  });

  test("search_places asks the API for the places matching the text", async () => {
    fetchApi.mockResolvedValue(new Response('[{"name":"Padaria","address":"Campinas","label":"Padaria, Campinas"}]', { status: 200 }));
    const client = await connect();

    const result = await client.callTool({ name: "search_places", arguments: { query: "padaria campinas" } });

    const url = new URL(fetchApi.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/api/places");
    expect(Object.fromEntries(url.searchParams)).toEqual({ query: "padaria campinas", limit: "6" });
    expect(result.content).toEqual([{ type: "text", text: '[{"name":"Padaria","address":"Campinas","label":"Padaria, Campinas"}]' }]);
    await client.close();
  });

  test("list_tracked_tasks sends list filters as comma-separated query values", async () => {
    fetchApi.mockResolvedValue(new Response("[]", { status: 200 }));
    const client = await connect();

    await client.callTool({
      name: "list_tracked_tasks",
      arguments: {
        status: ["todo", "doing"],
        priority: ["urgent"],
        tag: "casa",
        q: "conta",
        from: "2026-11-01T00:00:00-03:00",
        longRunning: false,
        limit: 5,
      },
    });

    const url = new URL(fetchApi.mock.calls[0]?.[0] as string);
    expect(url.pathname).toBe("/api/tasks/tracked");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: "todo,doing",
      priority: "urgent",
      tag: "casa",
      q: "conta",
      from: "2026-11-01T00:00:00-03:00",
      longRunning: "false",
      limit: "5",
    });
    await client.close();
  });

  test("list_tracked_tasks refuses an unknown status before calling the API", async () => {
    const client = await connect();

    const result = await client.callTool({ name: "list_tracked_tasks", arguments: { status: ["nope"] } });

    expect(result.isError).toBe(true);
    expect(fetchApi).not.toHaveBeenCalled();
    await client.close();
  });

  test("list_artifacts forwards its filters and list_recurrences takes none", async () => {
    fetchApi.mockImplementation(async () => new Response("[]", { status: 200 }));
    const client = await connect();

    await client.callTool({ name: "list_artifacts", arguments: { type: "text", q: "tinta", taskId: "e1" } });
    await client.callTool({ name: "list_recurrences", arguments: {} });
    for (const type of ["news", "email_summary", "youtube_transcript"]) await client.callTool({ name: "list_artifacts", arguments: { type } });

    const [artifacts, series] = fetchApi.mock.calls.map(([url]) => new URL(url as string));
    expect(artifacts?.pathname).toBe("/api/artifacts");
    expect(Object.fromEntries(artifacts?.searchParams ?? [])).toEqual({ type: "text", q: "tinta", taskId: "e1" });
    expect(series?.pathname).toBe("/api/recurrences");
    expect(series?.search).toBe("");
    const filtered = fetchApi.mock.calls.slice(2).map(([url]) => new URL(url as string).searchParams.get("type"));
    expect(filtered).toEqual(["news", "email_summary", "youtube_transcript"]);
    await client.close();
  });

  test("an API error comes back to the model as a tool error without secrets", async () => {
    fetchApi.mockResolvedValue(new Response(JSON.stringify({ message: "Invalid time zone" }), { status: 400 }));
    const client = await connect();

    const result = await client.callTool({
      name: "create_recurrence",
      arguments: { name: "x", frequency: "daily", timeOfDay: "08:00", timeZone: "Marte/Olimpo", startsOn: "2026-11-09", idempotencyKey: "k1" },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("API 400: Invalid time zone");
    expect(JSON.stringify(result.content)).not.toContain(env.AUTH_INTERNAL_SERVICE_KEY);
    await client.close();
  });
});
