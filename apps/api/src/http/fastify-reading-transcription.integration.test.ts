import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { TRANSCRIPTION_FORMAT_JOB, TRANSCRIPTION_JOB } from "../api-core/transcription/transcription-requests";
import { createPostgresTestContext, type PostgresTestContext } from "../infrastructure/persistence/testing/postgres-test-context";
import { createApiTestApp, type ApiTestApp } from "../testing/create-api-test-app";

/**
 * A Leitura diaria e o servico local de transcricao pelo Fastify, na mesma
 * porta em que as rotas ainda no Nest convivem. O comportamento externo e o da
 * linha de base: a extensao guarda a pagina sem duplicar, o servico local
 * reserva, renova o lease e entrega, e a entrega enfileira a formatacao.
 */

const GATEWAY_KEY = "reading-transcription-gateway-key-32";
const ORIGIN = "https://app.example.com";
let ctx: PostgresTestContext;
let app: ApiTestApp;

const session = (userId: string): Record<string, string> => ({
  "x-auth-gateway-key": GATEWAY_KEY,
  "x-auth-user-id": userId,
  "x-auth-session-id": `session-${userId}`,
});

const device = (userId: string, permissions = "transcription:work"): Record<string, string> => ({
  "x-auth-gateway-key": GATEWAY_KEY,
  "x-auth-user-id": userId,
  "x-auth-device-key-id": "device-key-1",
  "x-auth-permissions": permissions,
});

const newUser = () => `reading-user-${randomUUID()}`;

interface Response {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

async function call(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: unknown; raw?: string } = {},
): Promise<Response> {
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

const page = {
  url: "https://example.com/uma-pagina",
  title: "Uma página",
  markdown: "# Uma página\n\nConteúdo lido hoje.",
};

const transcriptionResult = {
  video: { title: "Um vídeo", channel: "Um canal", durationSeconds: 120, description: "", chapters: [] },
  source: "whisper",
  segments: [{ startSeconds: 0, endSeconds: 4, speaker: "A", text: "olá" }],
  hotMoments: [],
  comments: [],
};

beforeAll(async () => {
  ctx = await createPostgresTestContext();
  app = await createApiTestApp({
    DATABASE_URL: ctx.connectionString,
    AUTH_INTERNAL_SERVICE_KEY: GATEWAY_KEY,
    API_HOST: "0.0.0.0",
    AI_AUTOMATION: "off",
    // O worker fica parado: o job da formatacao continua na fila para ser observado.
    AI_JOBS_POLL_MS: "60000",
    OPENROUTER_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
  });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await ctx?.stop();
});

const jobOf = async (taskId: string, kind: string) =>
  (await ctx.pool.query<{ id: string; status: string; kind: string }>(
    "SELECT id, status, kind FROM jobs WHERE task_id = $1 AND kind = $2 ORDER BY id DESC LIMIT 1",
    [taskId, kind],
  )).rows[0];

describe("Leitura diária pela extensão", () => {
  test("a página entra na leitura do dia, e guardar de novo atualiza o mesmo artefato", async () => {
    const headers = session(newUser());

    const first = await call("POST", "/api/tasks/daily-reading", { headers, body: page });
    expect(first.status).toBe(200);
    const created = first.json as { taskId: string; artifactId: string; taskCreated: boolean; artifactCreated: boolean };
    expect(created).toMatchObject({ taskCreated: true, artifactCreated: true });

    const again = await call("POST", "/api/tasks/daily-reading", { headers, body: page });
    expect(again.status).toBe(200);
    expect(again.json).toEqual({
      taskId: created.taskId,
      artifactId: created.artifactId,
      taskCreated: false,
      artifactCreated: false,
    });

    const artifact = await call("GET", `/api/artifacts/${created.artifactId}`, { headers });
    expect(artifact.status).toBe(200);
    expect(artifact.json).toMatchObject({
      id: created.artifactId,
      data: { body: expect.stringContaining("Conteúdo lido hoje.") },
    });

    const artifacts = await call("GET", "/api/artifacts", { headers });
    expect(artifacts.status).toBe(200);
    expect((artifacts.json as Array<{ id: string }>).filter((item) => item.id === created.artifactId)).toHaveLength(1);
  });

  test("o corpo grande da extensão passa e o excesso continua recusado pelo parser", async () => {
    const headers = session(newUser());

    const large = await call("POST", "/api/tasks/daily-reading", {
      headers,
      body: { ...page, markdown: "a".repeat(300_000) },
    });
    expect(large.status).toBe(200);

    const aboveLimit = JSON.stringify({ ...page, markdown: "a".repeat(4 * 1024 * 1024 + 100) });
    const refused = await call("POST", "/api/tasks/daily-reading", { headers, raw: aboveLimit });
    expect(refused.status).toBe(500);
    expect(refused.json).toEqual({ error: "request entity too large" });
  });

  test("sem a identidade do gateway e com a chave de dispositivo a extensão não grava", async () => {
    expect((await call("POST", "/api/tasks/daily-reading", { body: page })).status).toBe(401);
    expect((await call("POST", "/api/tasks/daily-reading", { headers: device(newUser()), body: page })).status).toBe(403);
  });
});

describe("pedido de transcrição", () => {
  test("o mesmo vídeo no mesmo dia devolve o pedido aberto, sem duplicar", async () => {
    const user = newUser();
    const headers = { ...session(user), origin: ORIGIN };
    const body = { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" };

    const first = await call("POST", "/api/tasks/transcription-requests", { headers, body });
    expect(first.status).toBe(200);
    expect(first.json).toMatchObject({ created: true, requestId: expect.any(String) });
    expect(first.headers.get("access-control-allow-origin")).toBe("*");

    const again = await call("POST", "/api/tasks/transcription-requests", { headers, body });
    expect(again.status).toBe(200);
    expect(again.json).toEqual({ ...(first.json as object), created: false });

    const rows = await ctx.pool.query<{ count: string }>(
      "SELECT count(*) FROM tasks WHERE user_id = $1 AND kind = 'save_content_with_transcription'",
      [user],
    );
    expect(rows.rows[0]?.count).toBe("1");
  });
});

describe("serviço local de transcrição", () => {
  test("reserva, renovação e falha preservam os status e o job do serviço", async () => {
    const user = newUser();
    const headers = session(user);
    const requested = await call("POST", "/api/tasks/transcription-requests", {
      headers,
      body: { url: "https://youtu.be/dQw4w9WgXcQ" },
    });
    const { requestId } = requested.json as { requestId: string };

    // A sessão do usuário não reserva; a chave sem a permissão também não.
    expect((await call("POST", "/api/transcription-worker/next", { headers })).status).toBe(403);
    expect(
      (await call("POST", "/api/transcription-worker/next", { headers: device(user, "task:manage") })).status,
    ).toBe(403);

    const reserved = await call("POST", "/api/transcription-worker/next", { headers: device(user) });
    expect(reserved.status).toBe(200);
    const reservation = reserved.json as { requestId: string; leaseToken: string; url: string };
    expect(reservation).toMatchObject({
      requestId,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      leaseToken: expect.any(String),
    });

    const job = await jobOf(requestId, TRANSCRIPTION_JOB);
    expect(job?.status).toBe("running");

    // Com o pedido em execução, a fila do dono está vazia.
    const empty = await call("POST", "/api/transcription-worker/next", { headers: device(user) });
    expect(empty.status).toBe(204);
    expect(empty.text).toBe("");
    expect(empty.headers.get("content-type")).toBeNull();

    const leased = await call("POST", "/api/transcription-worker/lease", {
      headers: device(user),
      body: { requestId, leaseToken: reservation.leaseToken, stage: "download", percent: 40 },
    });
    expect(leased.status).toBe(200);
    expect(leased.json).toEqual({ leaseExpiresAt: expect.any(String) });

    const delivered = await call("POST", "/api/transcription-worker/deliver", {
      headers: device(user),
      body: { requestId, leaseToken: reservation.leaseToken, outcome: "failed", code: "private" },
    });
    expect(delivered.status).toBe(200);
    expect(delivered.json).toEqual({ requestId, status: "failed", code: "private" });

    // Depois da falha, o pedido já não está na fila.
    expect((await call("POST", "/api/transcription-worker/next", { headers: device(user) })).status).toBe(204);
  });

  test("a entrega concluída leva o pedido a running e enfileira a formatação", async () => {
    const user = newUser();
    const headers = session(user);
    const requested = await call("POST", "/api/tasks/transcription-requests", {
      headers,
      body: { url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" },
    });
    const { requestId } = requested.json as { requestId: string };
    const reserved = await call("POST", "/api/transcription-worker/next", { headers: device(user) });
    const { leaseToken } = reserved.json as { leaseToken: string };

    const delivered = await call("POST", "/api/transcription-worker/deliver", {
      headers: device(user),
      body: { requestId, leaseToken, outcome: "completed", result: transcriptionResult },
    });
    expect(delivered.status).toBe(200);
    expect(delivered.json).toEqual({ requestId, status: "running" });

    const formatJob = await jobOf(requestId, TRANSCRIPTION_FORMAT_JOB);
    expect(formatJob).toMatchObject({ kind: TRANSCRIPTION_FORMAT_JOB, status: "queued" });
  });

  test("a entrega acima do teto de resultado falha com too_large sem enfileirar a formatação", async () => {
    const user = newUser();
    const headers = session(user);
    const requested = await call("POST", "/api/tasks/transcription-requests", {
      headers,
      body: { url: "https://www.youtube.com/watch?v=bbbbbbbbbbb" },
    });
    const { requestId } = requested.json as { requestId: string };
    const reserved = await call("POST", "/api/transcription-worker/next", { headers: device(user) });
    const { leaseToken } = reserved.json as { leaseToken: string };

    const big = {
      ...transcriptionResult,
      segments: [{ startSeconds: 0, endSeconds: 4, speaker: "A", text: "a".repeat(2 * 1024 * 1024) }],
    };
    const delivered = await call("POST", "/api/transcription-worker/deliver", {
      headers: device(user),
      body: { requestId, leaseToken, outcome: "completed", result: big },
    });
    expect(delivered.status).toBe(200);
    expect(delivered.json).toEqual({ requestId, status: "failed", code: "too_large" });
    expect(await jobOf(requestId, TRANSCRIPTION_FORMAT_JOB)).toBeUndefined();
  });
});
