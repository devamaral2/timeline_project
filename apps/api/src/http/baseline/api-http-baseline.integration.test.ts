import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { createPostgresTestContext, type PostgresTestContext } from "../../infrastructure/persistence/testing/postgres-test-context";
import { createApiTestApp, type ApiTestApp } from "../../testing/create-api-test-app";
import { API_HTTP_OPERATIONS, operationKey } from "./api-http-operations";

/**
 * A linha de base do comportamento HTTP da API, rodando contra a implementação
 * Nest atual. Cada expectativa aqui é uma fotografia do que os clientes veem
 * hoje; depois da migração para Fastify, esta mesma suíte precisa continuar
 * verde sem mudar nenhuma expectativa.
 */

const GATEWAY_KEY = "baseline-gateway-key-with-32-characters";
const OWNER = "baseline-owner";

let ctx: PostgresTestContext;
let app: ApiTestApp;
let agentFilesDir: string;

const sessionHeaders = (userId: string): Record<string, string> => ({
  "x-auth-gateway-key": GATEWAY_KEY,
  "x-auth-user-id": userId,
  "x-auth-session-id": `session-${userId}`,
});

const deviceHeaders = (userId = OWNER): Record<string, string> => ({
  "x-auth-gateway-key": GATEWAY_KEY,
  "x-auth-user-id": userId,
  "x-auth-device-key-id": "device-key-1",
  "x-auth-permissions": "transcription:work",
});

interface ApiResponse {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  raw?: string;
}

async function call(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
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

const concrete = (path: string) => path.replace(/\{(\w+)\}/g, (_match, name: string) => `missing-${name}`);

/** Um usuário novo por cenário: os testes não dependem da ordem nem do estado um do outro. */
const newUser = () => `baseline-user-${randomUUID()}`;

beforeAll(async () => {
  ctx = await createPostgresTestContext();
  agentFilesDir = await mkdtemp(join(tmpdir(), "api-baseline-"));
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
    AI_AUTOMATION: "off",
    AGENT_CONFIG_OWNER_USER_ID: OWNER,
    AGENT_FILES_DIR: agentFilesDir,
    // O worker não deve reclamar os jobs criados durante a linha de base.
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

describe("inventário e autenticação", () => {
  test("toda operação inventariada recusa quem não veio pelo gateway, com 401", async () => {
    for (const operation of API_HTTP_OPERATIONS) {
      const response = await call(operation.method, concrete(operation.path));
      expect(response.status, operationKey(operation)).toBe(401);
      expect(response.json, operationKey(operation)).toEqual({ error: "Unauthorized" });
    }
  });

  test("a documentação é pública: o documento OpenAPI e a referência não exigem identidade", async () => {
    const documented = await call("GET", "/openapi.json");
    expect(documented.status).toBe(200);
    expect(documented.headers.get("content-type")).toContain("application/json");
    const document = documented.json as { paths: Record<string, unknown> };
    // O documento agrupa os métodos de um mesmo caminho numa entrada só.
    expect(Object.keys(document.paths).sort()).toEqual(
      [...new Set(API_HTTP_OPERATIONS.map((operation) => operation.path))].sort(),
    );

    const docs = await call("GET", "/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
    expect(docs.text).toContain("Braid API");
  });

  test("a chave errada é 403, a identidade sem usuário é 401 e a chave de dispositivo não serve nas rotas de sessão", async () => {
    const wrongKey = await call("GET", "/api/tasks", {
      headers: { "x-auth-gateway-key": "x".repeat(GATEWAY_KEY.length), "x-auth-user-id": OWNER },
    });
    expect(wrongKey.status).toBe(403);
    expect(wrongKey.json).toEqual({ error: "Forbidden" });

    const shortKey = await call("GET", "/api/tasks", {
      headers: { "x-auth-gateway-key": "short", "x-auth-user-id": OWNER },
    });
    expect(shortKey.status).toBe(403);

    const noUser = await call("GET", "/api/tasks", { headers: { "x-auth-gateway-key": GATEWAY_KEY } });
    expect(noUser.status).toBe(401);

    const deviceOnSession = await call("GET", "/api/tasks", {
      headers: { ...sessionHeaders(OWNER), "x-auth-permissions": "transcription:work" },
    });
    expect(deviceOnSession.status).toBe(403);
  });

  test("o serviço de transcrição só aceita a chave de dispositivo com a permissão dele", async () => {
    const sessionOnWorker = await call("POST", "/api/transcription-worker/next", { headers: sessionHeaders(OWNER) });
    expect(sessionOnWorker.status).toBe(403);
    expect(sessionOnWorker.json).toEqual({ error: "Forbidden" });

    const deviceWithoutPermission = await call("POST", "/api/transcription-worker/next", {
      headers: { ...deviceHeaders(), "x-auth-permissions": "task:manage" },
    });
    expect(deviceWithoutPermission.status).toBe(403);
  });
});

describe("status de sucesso", () => {
  test("200 devolve JSON: agenda sem janela devolve a página vazia", async () => {
    const response = await call("GET", "/api/tasks", { headers: sessionHeaders(newUser()) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.json).toEqual({ items: [] });
  });

  test("201 é a criação padrão do Nest e também o 201 implícito de /api/ai/config/restore", async () => {
    const user = newUser();
    const task = await call("POST", "/api/tasks", { headers: sessionHeaders(user), body: { name: "tarefa" } });
    expect(task.status).toBe(201);
    expect(task.json).toEqual({ taskId: expect.any(String) });

    const project = await call("POST", "/api/projects", { headers: sessionHeaders(user), body: { name: "casa" } });
    expect(project.status).toBe(201);
    expect(project.json).toMatchObject({ name: "casa", personal: false });

    // Restore não declara @HttpCode: o 201 vem do padrão do Nest para POST.
    const restore = await call("POST", "/api/ai/config/restore", {
      headers: sessionHeaders(OWNER),
      body: { path: "hermes/skills/foo/SKILL.md", backupId: "20260101T000000000Z.bak" },
    });
    expect(restore.status).toBe(201);
    expect(restore.json).toMatchObject({
      files: [expect.objectContaining({ path: "hermes/skills/foo/SKILL.md", description: "old" })],
    });
  });

  test("202 é a aceitação dos pedidos ao agente", async () => {
    const user = newUser();
    const response = await call("POST", "/api/requests", {
      headers: sessionHeaders(user),
      body: { userId: user, text: "crie uma tarefa" },
    });
    expect(response.status).toBe(202);
    expect(response.json).toEqual({ requestId: expect.any(String) });

    const edit = await call("POST", "/api/requests/edit", {
      headers: sessionHeaders(user),
      body: { userId: user, text: "mude a tarefa", entityType: "task", entityId: "task-1" },
    });
    expect(edit.status).toBe(202);

    const voice = await call("POST", "/api/requests/voice", {
      headers: sessionHeaders(user),
      body: { transcript: "crie uma tarefa amanhã" },
    });
    expect(voice.status).toBe(202);
  });

  test("204 responde sem corpo nem content-type nas edições e remoções", async () => {
    const user = newUser();
    const created = await call("POST", "/api/tasks", { headers: sessionHeaders(user), body: { name: "apagar" } });
    const taskId = (created.json as { taskId: string }).taskId;

    const patched = await call("PATCH", `/api/tasks/${taskId}`, {
      headers: sessionHeaders(user),
      body: { expectedRevision: 1, name: "editada" },
    });
    expect(patched.status).toBe(204);
    expect(patched.text).toBe("");
    expect(patched.headers.get("content-type")).toBeNull();

    const deleted = await call("DELETE", `/api/tasks/${taskId}`, { headers: sessionHeaders(user) });
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe("");
  });

  test("a reserva de transcrição responde 204 vazia com a fila limpa e 200 com um pedido", async () => {
    const user = newUser();
    const empty = await call("POST", "/api/transcription-worker/next", { headers: deviceHeaders(user) });
    expect(empty.status).toBe(204);
    expect(empty.text).toBe("");
    expect(empty.headers.get("content-type")).toBeNull();

    const requested = await call("POST", "/api/tasks/transcription-requests", {
      headers: sessionHeaders(user),
      body: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    });
    expect(requested.status).toBe(200);
    expect(requested.json).toMatchObject({ requestId: expect.any(String), created: true });

    const reserved = await call("POST", "/api/transcription-worker/next", { headers: deviceHeaders(user) });
    expect(reserved.status).toBe(200);
    expect(reserved.json).toMatchObject({
      requestId: (requested.json as { requestId: string }).requestId,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      leaseToken: expect.any(String),
      leaseExpiresAt: expect.any(String),
    });
  });

  test("o fluxo do serviço local de transcrição usa 200 na reserva, no lease e na entrega", async () => {
    const user = newUser();
    await call("POST", "/api/tasks/transcription-requests", {
      headers: sessionHeaders(user),
      body: { url: "https://youtu.be/dQw4w9WgXcQ" },
    });
    const reserved = await call("POST", "/api/transcription-worker/next", { headers: deviceHeaders(user) });
    const reservation = reserved.json as { requestId: string; leaseToken: string };

    const leased = await call("POST", "/api/transcription-worker/lease", {
      headers: deviceHeaders(user),
      body: { requestId: reservation.requestId, leaseToken: reservation.leaseToken, stage: "download", percent: 10 },
    });
    expect(leased.status).toBe(200);
    expect(leased.json).toEqual({ leaseExpiresAt: expect.any(String) });

    const delivered = await call("POST", "/api/transcription-worker/deliver", {
      headers: deviceHeaders(user),
      body: { requestId: reservation.requestId, leaseToken: reservation.leaseToken, outcome: "failed", code: "failed" },
    });
    expect(delivered.status).toBe(200);
    expect(delivered.json).toEqual({ requestId: reservation.requestId, status: "failed", code: "failed" });
  });
});

describe("compatibilidade HTTP", () => {
  test("o trailing slash não muda a rota", async () => {
    const user = newUser();
    const plain = await call("GET", "/api/tasks?actor=human", { headers: sessionHeaders(user) });
    const slash = await call("GET", "/api/tasks/?actor=human", { headers: sessionHeaders(user) });

    expect(plain.status).toBe(200);
    expect(slash.status).toBe(200);
    expect(slash.json).toEqual(plain.json);

    const openapiSlash = await call("GET", "/openapi.json/");
    expect(openapiSlash.status).toBe(200);
  });

  test("corpo vazio de JSON cai na validação; sem content-type o corpo ausente reproduz o 500 atual", async () => {
    const emptyJsonBody = await call("POST", "/api/tasks", { headers: sessionHeaders(newUser()), raw: "" });
    expect(emptyJsonBody.status).toBe(400);
    expect(emptyJsonBody.json).toEqual({ error: "Task requires a name" });

    const emptyObject = await call("POST", "/api/tasks", { headers: sessionHeaders(newUser()), body: {} });
    expect(emptyObject.status).toBe(400);
    expect(emptyObject.json).toEqual({ error: "Task requires a name" });

    // Sem `content-type: application/json` o Express não popula o corpo e o
    // caso de uso recebe `undefined`; a linha de base registra o 500 acidental.
    const withoutContentType = await call("POST", "/api/tasks", { headers: sessionHeaders(newUser()) });
    expect(withoutContentType.status).toBe(500);
    expect(withoutContentType.json).toEqual({ error: "Cannot read properties of undefined (reading 'kind')" });
  });

  test("rota desconhecida e método não registrado respondem 404 no mesmo corpo de erro", async () => {
    const unknown = await call("GET", "/api/nao-existe", { headers: sessionHeaders(newUser()) });
    expect(unknown.status).toBe(404);
    expect(unknown.json).toEqual({ error: "Cannot GET /api/nao-existe" });

    const wrongMethod = await call("PUT", "/api/tasks", { headers: sessionHeaders(newUser()), body: {} });
    expect(wrongMethod.status).toBe(404);
    expect(wrongMethod.json).toEqual({ error: "Cannot PUT /api/tasks" });
  });

  test("query repetida e query inválida são 400, e query desconhecida é ignorada", async () => {
    const user = newUser();
    const repeated = await call(
      "GET",
      "/api/tasks?from=2026-01-01T00:00:00Z&from=2026-01-02T00:00:00Z",
      { headers: sessionHeaders(user) },
    );
    expect(repeated.status).toBe(400);
    expect(repeated.json).toEqual({ error: "Invalid from date" });

    const invalidLimit = await call("GET", "/api/tasks?limit=abc", { headers: sessionHeaders(user) });
    expect(invalidLimit.status).toBe(400);
    expect(invalidLimit.json).toEqual({ error: "Invalid limit" });

    const ignored = await call("GET", "/api/tasks?desconhecido=1", { headers: sessionHeaders(user) });
    expect(ignored.status).toBe(200);
    expect(ignored.json).toEqual({ items: [] });
  });

  test("JSON malformado é 400 e content-type incompatível reproduz o 500 atual da Nest", async () => {
    const malformed = await call("POST", "/api/tasks", { headers: sessionHeaders(newUser()), raw: "{oops" });
    expect(malformed.status).toBe(400);
    expect(malformed.json).toEqual({
      error: "Expected property name or '}' in JSON at position 1 (line 1 column 2)",
    });

    // O comportamento acidental de hoje: sem o parser JSON, o corpo chega
    // ausente e o caso de uso estoura; a migração deve preservá-lo ou a mudança
    // precisa ser aprovada à parte.
    const incompatible = await call("POST", "/api/tasks", {
      headers: { ...sessionHeaders(newUser()), "content-type": "text/plain" },
      raw: '{"name":"tarefa"}',
    });
    expect(incompatible.status).toBe(500);
    expect(incompatible.json).toEqual({ error: "Cannot read properties of undefined (reading 'kind')" });
  });
});

describe("validação e erros de domínio", () => {
  test("a validação de entrada responde 400 com a mensagem do campo", async () => {
    const user = newUser();
    const badKind = await call("POST", "/api/tasks", { headers: sessionHeaders(user), body: { kind: "bogus" } });
    expect(badKind.status).toBe(400);
    expect(badKind.json).toEqual({ error: "Invalid kind" });

    const unknownField = await call("POST", "/api/tasks", { headers: sessionHeaders(user), body: { nombre: "x" } });
    expect(unknownField.status).toBe(400);
    expect(unknownField.json).toEqual({ error: "Invalid field nombre" });

    const badQuery = await call("GET", "/api/tasks?actor=bogus", { headers: sessionHeaders(user) });
    expect(badQuery.status).toBe(400);
    expect(badQuery.json).toEqual({ error: 'Invalid actor: "bogus". Allowed: human, agent' });

    const badRevision = await call("PATCH", "/api/tasks/missing-task", {
      headers: sessionHeaders(user),
      body: {},
    });
    expect(badRevision.status).toBe(400);
    expect(badRevision.json).toEqual({ error: "Invalid expectedRevision" });
  });

  test("404 é o recurso que não existe e 403 é o recurso de outro usuário", async () => {
    const owner = newUser();
    const other = newUser();
    const created = await call("POST", "/api/tasks", { headers: sessionHeaders(owner), body: { name: "minha" } });
    const taskId = (created.json as { taskId: string }).taskId;

    const missing = await call("GET", "/api/tasks/missing-task", { headers: sessionHeaders(owner) });
    expect(missing.status).toBe(404);
    expect(missing.json).toEqual({ error: "Task not found" });

    const foreign = await call("GET", `/api/tasks/${taskId}`, { headers: sessionHeaders(other) });
    expect(foreign.status).toBe(403);
    expect(foreign.json).toEqual({ error: "Only the task owner can modify it" });

    const artifact = await call("POST", "/api/artifacts", {
      headers: sessionHeaders(owner),
      body: { data: { body: "meu" } },
    });
    const artifactId = (artifact.json as { artifactId: string }).artifactId;
    const foreignArtifact = await call("GET", `/api/artifacts/${artifactId}`, { headers: sessionHeaders(other) });
    expect(foreignArtifact.status).toBe(403);
    expect(foreignArtifact.json).toEqual({ error: "Only the artifact owner can modify it" });
  });

  test("409 é a revisão vencida e o nome de projeto repetido", async () => {
    const user = newUser();
    const created = await call("POST", "/api/tasks", { headers: sessionHeaders(user), body: { name: "conflito" } });
    const taskId = (created.json as { taskId: string }).taskId;

    const stale = await call("PATCH", `/api/tasks/${taskId}`, {
      headers: sessionHeaders(user),
      body: { expectedRevision: 9, name: "outra" },
    });
    expect(stale.status).toBe(409);
    expect(stale.json).toEqual({ error: "Expected revision 9 but found 1" });

    await call("POST", "/api/projects", { headers: sessionHeaders(user), body: { name: "casa" } });
    const duplicate = await call("POST", "/api/projects", { headers: sessionHeaders(user), body: { name: "CASA" } });
    expect(duplicate.status).toBe(409);
    expect(duplicate.json).toEqual({ error: "Project already exists: CASA" });
  });
});

describe("idempotência", () => {
  const body = { data: { body: "idempotente" } };

  test("a primeira execução cria e o replay devolve a mesma resposta com Idempotent-Replayed", async () => {
    const user = newUser();
    const headers = { ...sessionHeaders(user), "idempotency-key": `key-${randomUUID()}` };

    const first = await call("POST", "/api/artifacts", { headers, body });
    expect(first.status).toBe(201);
    expect(first.headers.get("idempotent-replayed")).toBeNull();

    const replay = await call("POST", "/api/artifacts", { headers, body });
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotent-replayed")).toBe("true");
    expect(replay.json).toEqual(first.json);
  });

  test("a mesma chave com outro corpo é 422 e uma chave fora do formato é 400", async () => {
    const user = newUser();
    const headers = { ...sessionHeaders(user), "idempotency-key": `key-${randomUUID()}` };
    await call("POST", "/api/artifacts", { headers, body });

    const mismatch = await call("POST", "/api/artifacts", {
      headers,
      body: { data: { body: "outro conteúdo" } },
    });
    expect(mismatch.status).toBe(422);
    expect(mismatch.json).toEqual({ error: "Idempotency-Key was already used with a different request" });

    const invalid = await call("POST", "/api/artifacts", {
      headers: { ...sessionHeaders(user), "idempotency-key": "chave com espaço" },
      body,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.json).toEqual({ error: "Invalid Idempotency-Key" });
  });

  test("uma execução ainda em andamento é 409", async () => {
    const user = newUser();
    const key = `key-${randomUUID()}`;
    const requestHash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
    await ctx.pool.query(
      "INSERT INTO idempotency_keys (user_id, scope, key, request_hash) VALUES ($1, $2, $3, $4)",
      [user, "/api/artifacts", key, requestHash],
    );

    const inProgress = await call("POST", "/api/artifacts", {
      headers: { ...sessionHeaders(user), "idempotency-key": key },
      body,
    });
    expect(inProgress.status).toBe(409);
    expect(inProgress.json).toEqual({ error: "A request with this Idempotency-Key is in progress" });
  });

  test("quando o handler falha a chave é liberada e pode ser usada de novo", async () => {
    const user = newUser();
    const key = `key-${randomUUID()}`;
    const headers = { ...sessionHeaders(user), "idempotency-key": key };

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

describe("limites de corpo", () => {
  test("o parser da API aceita acima dos 100 kB padrão do Express em qualquer rota (o gateway é quem limita)", async () => {
    const user = newUser();
    const largeArtifact = await call("POST", "/api/artifacts", {
      headers: sessionHeaders(user),
      body: { data: { body: "a".repeat(200 * 1024) } },
    });
    expect(largeArtifact.status).toBe(201);

    const dailyReading = await call("POST", "/api/tasks/daily-reading", {
      headers: sessionHeaders(newUser()),
      body: {
        url: "https://example.com/uma-pagina",
        title: "Uma página",
        markdown: "a".repeat(300_000),
      },
    });
    expect(dailyReading.status).toBe(200);
    expect(dailyReading.json).toEqual({
      taskId: expect.any(String),
      artifactId: expect.any(String),
      taskCreated: true,
      artifactCreated: true,
    });
  });

  test("a entrega de transcrição aceita 2 MiB e recusa acima dos 4 MiB, com o 500 atual do parser", async () => {
    const delivery = JSON.stringify({ requestId: "missing", leaseToken: "missing", outcome: "failed", code: "failed" });
    const twoMegabytes = delivery + " ".repeat(2 * 1024 * 1024);
    const accepted = await call("POST", "/api/transcription-worker/deliver", {
      headers: deviceHeaders(),
      raw: twoMegabytes,
    });
    expect(accepted.status).toBe(409);
    expect(accepted.json).toEqual({ error: "O lease do pedido de transcrição não vale mais" });

    const aboveLimit = delivery + " ".repeat(4 * 1024 * 1024 + 100);
    const refused = await call("POST", "/api/transcription-worker/deliver", {
      headers: deviceHeaders(),
      raw: aboveLimit,
    });
    expect(refused.status).toBe(500);
    expect(refused.json).toEqual({ error: "request entity too large" });
  });
});
