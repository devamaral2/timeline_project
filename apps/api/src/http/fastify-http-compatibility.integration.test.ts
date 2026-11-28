import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { idempotencyRequestHash } from "../http/idempotency/idempotency-key";
import { createPostgresTestContext, type PostgresTestContext } from "../infrastructure/persistence/testing/postgres-test-context";
import { type ApiTestApp, createApiTestApp } from "../testing/create-api-test-app";

/**
 * A compatibilidade HTTP do servidor Fastify: trailing slash, HEAD, CORS,
 * metodos e rotas desconhecidas respondem como na linha de base do Express.
 */

const GATEWAY_KEY = "compatibility-gateway-key-with-32-ch";
const ORIGIN = "https://app.example.com";
const OWNER = "compatibility-owner";

let ctx: PostgresTestContext;
let app: ApiTestApp;
let agentFilesDir: string;

const session = (userId: string): Record<string, string> => ({
  "x-auth-gateway-key": GATEWAY_KEY,
  "x-auth-user-id": userId,
  "x-auth-session-id": `session-${userId}`,
});

interface Response {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

async function call(method: string, path: string, options: { headers?: Record<string, string>; body?: unknown; raw?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = { ...options.headers };
  const body = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  if (body !== undefined) headers["content-type"] ??= "application/json";
  const response = await fetch(`${app.url}${path}`, { method, headers, body });
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: response.status, headers: response.headers, text, json };
}

const newUser = () => `compatibility-user-${randomUUID()}`;

beforeAll(async () => {
  ctx = await createPostgresTestContext();
  agentFilesDir = await mkdtemp(join(tmpdir(), "api-compatibility-"));
  await mkdir(join(agentFilesDir, "hermes/skills/foo"), { recursive: true });
  await writeFile(join(agentFilesDir, "hermes/skills/foo/SKILL.md"), "---\ndescription: foo\n---\n\n# foo\n");
  await mkdir(join(agentFilesDir, ".backups/hermes/skills/foo/SKILL.md"), { recursive: true });
  await writeFile(
    join(agentFilesDir, ".backups/hermes/skills/foo/SKILL.md/20260101T000000000Z.bak"),
    "---\ndescription: old\n---\n\n# old\n",
  );

  app = await createApiTestApp({
    DATABASE_URL: ctx.connectionString,
    AUTH_INTERNAL_SERVICE_KEY: GATEWAY_KEY,
    // Fora do loopback o CORS liga, como no main.ts.
    API_HOST: "0.0.0.0",
    AI_AUTOMATION: "off",
    AGENT_CONFIG_OWNER_USER_ID: OWNER,
    AGENT_FILES_DIR: agentFilesDir,
    AI_JOBS_POLL_MS: "60000",
    OPENROUTER_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
  });
}, 120_000);

afterAll(async () => {
  await app?.close();
  await ctx?.stop();
});

describe("servidor Fastify", () => {
  test("as operacoes de tarefas, projetos, tags e locais respondem pelo mesmo servidor", async () => {
    const user = newUser();

    const agenda = await call("GET", "/api/tasks", { headers: session(user) });
    expect(agenda.status).toBe(200);
    expect(agenda.json).toEqual({ items: [] });

    const tracked = await call("GET", "/api/tasks/tracked?actor=human", { headers: session(user) });
    expect(tracked.status).toBe(200);
    expect(tracked.json).toEqual([]);

    const project = await call("POST", "/api/projects", { headers: session(user), body: { name: "casa" } });
    expect(project.status).toBe(201);

    const projects = await call("GET", "/api/projects", { headers: session(user) });
    expect(projects.status).toBe(200);
    expect(projects.json).toEqual([
      { id: expect.any(String), name: "diario", personal: true },
      project.json,
    ]);

    // Tags tambem e uma rota declarada; e um metodo que nenhuma rota declarou.
    const tags = await call("GET", "/api/tags?query=cas", { headers: session(user) });
    expect(tags.status).toBe(200);

    const unknownMethod = await call("PUT", "/api/tasks", { headers: session(user), body: {} });
    expect(unknownMethod.status).toBe(404);
    expect(unknownMethod.json).toEqual({ error: "Cannot PUT /api/tasks" });
  });

  test("o trailing slash, o HEAD e o CORS seguem a linha de base", async () => {
    const user = newUser();

    const slash = await call("GET", "/api/tasks/", { headers: session(user) });
    expect(slash.status).toBe(200);
    expect(slash.json).toEqual({ items: [] });

    const head = await call("HEAD", "/api/tasks", { headers: session(user) });
    expect(head.status).toBe(200);
    expect(head.text).toBe("");

    const preflight = await call("OPTIONS", "/api/tasks", {
      headers: { origin: ORIGIN, "access-control-request-method": "GET" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");

    const migrated = await call("GET", "/api/tasks", { headers: { ...session(user), origin: ORIGIN } });
    expect(migrated.headers.get("access-control-allow-origin")).toBe("*");

    const tags = await call("GET", "/api/tags?query=cas", { headers: { ...session(user), origin: ORIGIN } });
    expect(tags.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("arquivos do agente (skills e agentes)", () => {
  const SKILL = "hermes/skills/foo/SKILL.md";

  test("o dono lista, le, ve backups e restaura pelo Fastify; o resto do fluxo e o mesmo", async () => {
    const owner = session(OWNER);

    const list = await call("GET", "/api/ai/config", { headers: owner });
    expect(list.status).toBe(200);
    expect(list.json).toEqual({
      files: [expect.objectContaining({ path: SKILL, kind: "skill", description: "foo", missing: false })],
    });

    const text = await call("GET", `/api/ai/config/file?path=${SKILL}`, { headers: owner });
    expect(text.status).toBe(200);
    expect(text.json).toEqual({ path: SKILL, text: "---\ndescription: foo\n---\n\n# foo\n" });

    const backups = await call("GET", `/api/ai/config/backups?path=${SKILL}`, { headers: owner });
    expect(backups.status).toBe(200);
    expect((backups.json as { backups: Array<{ id: string }> }).backups.map((backup) => backup.id)).toContain(
      "20260101T000000000Z.bak",
    );

    const restored = await call("POST", "/api/ai/config/restore", {
      headers: owner,
      body: { path: SKILL, backupId: "20260101T000000000Z.bak" },
    });
    expect(restored.status).toBe(201);
    expect(restored.json).toEqual({ files: [expect.objectContaining({ path: SKILL, description: "old" })] });

    // Com a automacao desligada, a edicao por IA responde 404 sem abrir pedido.
    const edit = await call("POST", "/api/ai/config/edit-request", {
      headers: owner,
      body: { path: SKILL, request: "mais curto", clientMessageId: "compatibility-edit-1" },
    });
    expect(edit.status).toBe(404);
    expect(edit.json).toEqual({ error: "Not Found" });

    // So o dono configurado passa (ADR 0004).
    const stranger = await call("GET", "/api/ai/config", { headers: session(newUser()) });
    expect(stranger.status).toBe(403);
    expect(stranger.json).toEqual({ error: "Só o dono altera a configuração do agente." });

    const missing = await call("GET", "/api/ai/config/file?path=hermes/skills/nada/SKILL.md", { headers: owner });
    expect(missing.status).toBe(404);
  });
});

describe("idempotencia da criacao de tarefa", () => {
  const body = { name: "idempotente" };

  test("claim, replay, divergencia e concorrencia", async () => {
    const user = newUser();
    const key = `key-${randomUUID()}`;
    const headers = { ...session(user), "idempotency-key": key };

    const first = await call("POST", "/api/tasks", { headers, body });
    expect(first.status).toBe(201);
    expect(first.headers.get("idempotent-replayed")).toBeNull();
    const taskId = (first.json as { taskId: string }).taskId;

    const replay = await call("POST", "/api/tasks", { headers, body });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(replay.json).toEqual({ taskId });

    const mismatch = await call("POST", "/api/tasks", { headers, body: { name: "outra" } });
    expect(mismatch.status).toBe(422);
    expect(mismatch.json).toEqual({ error: "Idempotency-Key was already used with a different request" });

    const inProgressKey = `key-${randomUUID()}`;
    const inProgressBody = { name: "em andamento" };
    await ctx.pool.query(
      "INSERT INTO idempotency_keys (user_id, scope, key, request_hash) VALUES ($1, $2, $3, $4)",
      [user, "/api/tasks", inProgressKey, idempotencyRequestHash(inProgressBody)],
    );
    const inProgress = await call("POST", "/api/tasks", {
      headers: { ...session(user), "idempotency-key": inProgressKey },
      body: inProgressBody,
    });
    expect(inProgress.status).toBe(409);
    expect(inProgress.json).toEqual({ error: "A request with this Idempotency-Key is in progress" });
  });

  test("quando a criacao falha a chave e liberada e pode ser usada de novo", async () => {
    const user = newUser();
    const key = `key-${randomUUID()}`;
    const headers = { ...session(user), "idempotency-key": key };

    const failed = await call("POST", "/api/tasks", {
      headers,
      body: { name: "sem projeto", projectId: "missing-project" },
    });
    expect(failed.status).toBe(404);

    const retried = await call("POST", "/api/tasks", { headers, body: { name: "com projeto" } });
    expect(retried.status).toBe(201);
    expect(retried.json).toEqual({ taskId: expect.any(String) });
  });
});

describe("artefatos e recorrencias", () => {
  test("as operacoes de artefatos respondem pelo Fastify com os mesmos contratos", async () => {
    const user = newUser();
    const headers = session(user);

    const created = await call("POST", "/api/artifacts", {
      headers,
      body: { data: { body: "Ideias para o quintal" }, tags: ["Casa"], taskIds: [] },
    });
    expect(created.status).toBe(201);
    const { artifactId } = created.json as { artifactId: string };

    const detail = await call("GET", `/api/artifacts/${artifactId}`, { headers });
    expect(detail.status).toBe(200);
    expect(detail.json).toMatchObject({ id: artifactId, type: "text", name: "Ideias para o quintal", tags: ["casa"] });

    const list = await call("GET", "/api/artifacts", { headers });
    expect(list.status).toBe(200);
    expect(list.json).toEqual([expect.objectContaining({ id: artifactId, tasks: [] })]);

    const patched = await call("PATCH", `/api/artifacts/${artifactId}`, {
      headers,
      body: { expectedRevision: 1, name: "Ideias do quintal" },
    });
    expect(patched.status).toBe(204);
    expect(patched.text).toBe("");
    expect(patched.headers.get("content-type")).toBeNull();

    const stale = await call("PATCH", `/api/artifacts/${artifactId}`, {
      headers,
      body: { expectedRevision: 1, name: "Outra" },
    });
    expect(stale.status).toBe(409);

    const deleted = await call("DELETE", `/api/artifacts/${artifactId}`, { headers });
    expect(deleted.status).toBe(204);

    const missing = await call("GET", `/api/artifacts/${artifactId}`, { headers });
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({ error: "Artifact not found" });
  });

  test("as operacoes de recorrencias respondem pelo Fastify com os mesmos contratos", async () => {
    const user = newUser();
    const headers = session(user);
    const body = {
      frequency: "weekly",
      interval: 1,
      byWeekday: 0b0101010,
      timeOfDay: "18:30",
      timeZone: "America/Sao_Paulo",
      startsOn: "2026-09-14",
      template: { name: "Academia", kind: "common" },
    };

    const created = await call("POST", "/api/recurrences", { headers, body });
    expect(created.status).toBe(201);
    const { recurrenceId } = created.json as { recurrenceId: string };

    const detail = await call("GET", `/api/recurrences/${recurrenceId}`, { headers });
    expect(detail.status).toBe(200);
    expect(detail.json).toMatchObject({
      id: recurrenceId,
      frequency: "weekly",
      byWeekday: 0b0101010,
      revision: 1,
      template: expect.objectContaining({ name: "Academia", priority: "medium", artifactIds: [] }),
    });

    const list = await call("GET", "/api/recurrences", { headers });
    expect(list.status).toBe(200);
    expect(list.json).toEqual([expect.objectContaining({ id: recurrenceId })]);

    const patched = await call("PATCH", `/api/recurrences/${recurrenceId}`, {
      headers,
      body: { expectedRevision: 1, interval: 2 },
    });
    expect(patched.status).toBe(204);
    expect(patched.text).toBe("");
    expect(patched.headers.get("content-type")).toBeNull();

    const stale = await call("PATCH", `/api/recurrences/${recurrenceId}`, {
      headers,
      body: { expectedRevision: 1, interval: 3 },
    });
    expect(stale.status).toBe(409);

    const updated = await call("GET", `/api/recurrences/${recurrenceId}`, { headers });
    expect(updated.json).toMatchObject({ interval: 2, revision: 2 });

    const deleted = await call("DELETE", `/api/recurrences/${recurrenceId}`, { headers });
    expect(deleted.status).toBe(204);

    const missing = await call("GET", `/api/recurrences/${recurrenceId}`, { headers });
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({ error: "Recurrence not found" });
  });

  test("a criacao de artefato e de recorrencia preserva a idempotencia", async () => {
    const user = newUser();
    const artifactBody = { data: { body: "repetido" } };
    const artifactKey = `key-${randomUUID()}`;
    const artifactHeaders = { ...session(user), "idempotency-key": artifactKey };

    const artifactFirst = await call("POST", "/api/artifacts", { headers: artifactHeaders, body: artifactBody });
    expect(artifactFirst.status).toBe(201);
    const artifactReplay = await call("POST", "/api/artifacts", { headers: artifactHeaders, body: artifactBody });
    expect(artifactReplay.status).toBe(201);
    expect(artifactReplay.headers.get("idempotent-replayed")).toBe("true");
    expect(artifactReplay.json).toEqual(artifactFirst.json);

    const artifactMismatch = await call("POST", "/api/artifacts", {
      headers: artifactHeaders,
      body: { data: { body: "outro" } },
    });
    expect(artifactMismatch.status).toBe(422);

    const recurrenceBody = {
      frequency: "daily",
      interval: 1,
      timeOfDay: "07:00",
      timeZone: "America/Sao_Paulo",
      startsOn: "2026-09-14",
      template: { name: "Meditar" },
    };
    const recurrenceKey = `key-${randomUUID()}`;
    const recurrenceHeaders = { ...session(user), "idempotency-key": recurrenceKey };

    const recurrenceFirst = await call("POST", "/api/recurrences", {
      headers: recurrenceHeaders,
      body: recurrenceBody,
    });
    expect(recurrenceFirst.status).toBe(201);
    const recurrenceReplay = await call("POST", "/api/recurrences", {
      headers: recurrenceHeaders,
      body: recurrenceBody,
    });
    expect(recurrenceReplay.status).toBe(201);
    expect(recurrenceReplay.headers.get("idempotent-replayed")).toBe("true");
    expect(recurrenceReplay.json).toEqual(recurrenceFirst.json);

    const recurrenceMismatch = await call("POST", "/api/recurrences", {
      headers: recurrenceHeaders,
      body: { ...recurrenceBody, interval: 2 },
    });
    expect(recurrenceMismatch.status).toBe(422);
  });
});
