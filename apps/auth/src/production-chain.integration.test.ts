import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer, type AddressInfo } from "node:net";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ScryptPasswordHasher } from "./auth-core/password/scrypt-password-hasher";
import { DatabaseSync } from "@repo/sqlite";
import { openAuthDatabase, type AuthDatabase } from "./db/client";

/**
 * A cadeia de produção: Auth e API executados a partir dos `dist/`.
 *
 * Cada processo é um `node apps/<app>/dist/main.js` de verdade, em portas
 * efêmeras, cada um com o próprio arquivo SQLite (ADR 0024 e 0025), que ele mesmo migra ao subir. Uma sessão
 * criada pelo Auth compilado atravessa o proxy e executa uma operação na API
 * compilada; autorização, correlation id, erros e encerramento são observados
 * pelo socket, nunca pela estrutura interna de cada processo.
 */

const repoRoot = resolve(__dirname, "../../..");
const authRoot = resolve(repoRoot, "apps/auth");
const apiRoot = resolve(repoRoot, "apps/api");
const GATEWAY_KEY = "chain-gateway-key-with-at-least-32-chars";
const PASSWORD = "Integration-password-42!";

interface RunningProcess {
  child: ChildProcess;
  output: () => string;
  stop(): Promise<number | null>;
}

function startProcess(label: string, appRoot: string, env: Record<string, string>): RunningProcess {
  const chunks: string[] = [];
  const child = spawn(process.execPath, [resolve(appRoot, "dist/main.js")], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));

  const output = (): string => `--- ${label} ---\n${chunks.join("")}`;
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  return {
    child,
    output,
    async stop() {
      if (exited) return child.exitCode;
      child.kill("SIGTERM");
      const timeout = setTimeout(() => child.kill("SIGKILL"), 15_000);
      try {
        await once(child, "exit");
      } finally {
        clearTimeout(timeout);
      }
      return child.exitCode;
    },
  };
}

/** Reserva as portas ao mesmo tempo: duas chamadas soltas devolveriam a mesma. */
async function freePorts(count: number): Promise<number[]> {
  const servers = Array.from({ length: count }, () => createServer());
  try {
    for (const server of servers) {
      await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    }
    return servers.map((server) => (server.address() as AddressInfo).port);
  } finally {
    await Promise.all(servers.map((server) => new Promise<void>((resolveClose) => server.close(() => resolveClose()))));
  }
}

async function waitForHttp(url: string, timeoutMs = 30_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < until) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
      lastError = new Error(`${url} answered ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 50));
  }
  throw lastError instanceof Error ? lastError : new Error(`timed out waiting for ${url}`);
}

/** Depois do shutdown, a porta recusa conexão: nada ficou escutando. */
async function isPortFree(port: number): Promise<boolean> {
  const server = createServer();
  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(port, "127.0.0.1", () => resolveListen());
    });
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "EADDRINUSE";
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  }
}

describe("cadeia Auth -> API a partir dos artefatos de produção", () => {
  let dataDir: string;
  let admin: AuthDatabase;
  let api: RunningProcess;
  let auth: RunningProcess;
  let apiUrl: string;
  let authUrl: string;
  let apiPort: number;
  let authPort: number;
  let memberId: string;
  let memberEmail: string;
  let viewerId: string;
  let viewerEmail: string;

  const call = (path: string, init: RequestInit = {}) => fetch(`${authUrl}${path}`, init);
  /** O que a API compilada gravou no arquivo dela, lido somente leitura enquanto ela roda. */
  const apiRows = (text: string, ...params: string[]) => {
    const db = new DatabaseSync(join(dataDir, "api.sqlite"), { readOnly: true });
    try {
      return db.prepare(text).all(...params).map((row) => ({ ...row }));
    } finally {
      db.close();
    }
  };
  const postJson = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    call(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  async function login(email: string): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await postJson("/auth/login", { email, password: PASSWORD });
    expect(response.status, `login ${email}: ${await response.clone().text()}`).toBe(201);
    return (await response.json()) as { accessToken: string; refreshToken: string };
  }

  async function seedUser(label: string, role: "member" | "viewer"): Promise<{ id: string; email: string }> {
    const id = `user-${label}-${randomUUID()}`;
    const email = `${label}-${randomUUID()}@example.test`;
    const passwordHash = await new ScryptPasswordHasher().hash(PASSWORD);
    await admin.query(
      "INSERT INTO users (id,email,name,password_hash,status,created_at,updated_at) VALUES ($1,$2,$3,$4,'active',$5,$5)",
      [id, email, `Pessoa ${label}`, passwordHash, new Date()],
    );
    await admin.query("INSERT INTO user_roles (user_id,role_key) VALUES ($1,$2)", [id, role]);
    return { id, email };
  }

  beforeAll(async () => {
    // O caminho de produção é validado no artefato que o build gera: os dois
    // apps são compilados pelo `tsc` do próprio build, sem Nest CLI.
    execFileSync(
      "pnpm",
      ["exec", "turbo", "run", "build", "--filter=@repo/auth", "--filter=@repo/api"],
      { cwd: repoRoot, stdio: "pipe", timeout: 180_000 },
    );

    dataDir = mkdtempSync(join(tmpdir(), "chain-test-"));
    // O arquivo do Auth nasce migrado aqui para receber os usuários; o processo do Auth o abre de novo ao subir.
    admin = openAuthDatabase(join(dataDir, "auth.sqlite"));

    const member = await seedUser("membro", "member");
    memberId = member.id;
    memberEmail = member.email;
    const viewer = await seedUser("observador", "viewer");
    viewerId = viewer.id;
    viewerEmail = viewer.email;

    [apiPort, authPort] = await freePorts(2);
    apiUrl = `http://127.0.0.1:${apiPort}`;
    authUrl = `http://127.0.0.1:${authPort}`;

    api = startProcess("api", apiRoot, {
      NODE_ENV: "production",
      API_DATABASE_PATH: join(dataDir, "api.sqlite"),
      AUTH_INTERNAL_SERVICE_KEY: GATEWAY_KEY,
      API_HOST: "127.0.0.1",
      API_PORT: String(apiPort),
      AI_JOBS_POLL_MS: "50",
      WEB_PORT: "0",
    });

    auth = startProcess("auth", authRoot, {
      NODE_ENV: "production",
      AUTH_HOST: "127.0.0.1",
      AUTH_PORT: String(authPort),
      AUTH_DATABASE_PATH: join(dataDir, "auth.sqlite"),
      AUTH_ISSUER: "https://auth.example.test",
      AUTH_AUDIENCE: "timeline-api",
      AUTH_PUBLIC_URL: "https://auth.example.test",
      AUTH_WEB_APP_URL: "https://web.example.test",
      AUTH_KEY_ENCRYPTION_KEY: randomBytes(32).toString("base64url"),
      AUTH_INTERNAL_SERVICE_KEY: GATEWAY_KEY,
      API_SERVICE_URL: apiUrl,
      AUTH_PASSWORD_IP_LIMIT: "1000",
    });

    await waitForHttp(`${apiUrl}/health/live`);
    await waitForHttp(`${authUrl}/health/live`);
  }, 240_000);

  afterAll(async () => {
    await auth?.stop().catch(() => undefined);
    await api?.stop().catch(() => undefined);
    await admin?.close().catch(() => undefined);
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  }, 60_000);

  it("o Auth compilado sobe com health, documentação e shutdown próprio", async () => {
    const live = await call("/health/live");
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "ok" });

    const ready = await call("/health/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ok" });

    const jwks = await call("/.well-known/jwks.json");
    expect(jwks.status).toBe(200);
    const keys = (await jwks.json()) as { keys: unknown[] };
    expect(keys.keys).toHaveLength(1);

    const document = await call("/openapi.json");
    expect(document.status).toBe(200);

    const docs = await call("/docs");
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
    const html = await docs.text();
    expect(html).toContain("Braid Auth API");
    expect(html.toLowerCase()).toContain("scalar");
  });

  it("a API compilada traz as definições de agente e serve a documentação", async () => {
    const agents = (dir: string) => readdirSync(resolve(apiRoot, dir, "api-core/requests/agents")).filter((name) => name.endsWith(".md")).sort();
    expect(agents("dist")).toEqual(agents("src"));
    expect(agents("dist").length).toBeGreaterThan(0);

    const document = await fetch(`${apiUrl}/openapi.json`);
    expect(document.status).toBe(200);
    expect(await document.json()).toHaveProperty("paths");

    const docs = await fetch(`${apiUrl}/docs`);
    expect(docs.status).toBe(200);
    expect(docs.headers.get("content-type")).toContain("text/html");
  });

  it("uma sessão criada pelo Auth compilado executa uma operação na API compilada", async () => {
    const tokens = await login(memberEmail);

    const me = await call("/auth/me", { headers: { authorization: `Bearer ${tokens.accessToken}` } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ userId: memberId, email: memberEmail });

    const created = await postJson(
      "/api/tasks",
      { name: "Tarefa da cadeia real" },
      { authorization: `Bearer ${tokens.accessToken}`, "x-correlation-id": "chain-create" },
    );
    expect(created.status, `create task: ${await created.clone().text()}`).toBe(201);
    expect(created.headers.get("x-correlation-id")).toBe("chain-create");
    expect(created.headers.get("x-auth-gateway-key")).toBeNull();
    const task = (await created.json()) as { taskId: string };
    expect(task.taskId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    // A operação foi executada e persistida pela API compilada, não só respondida pelo Auth.
    expect(apiRows("SELECT id, name, user_id FROM tasks WHERE id = ?", task.taskId)).toEqual([{ id: task.taskId, name: "Tarefa da cadeia real", user_id: memberId }]);

    const read = await call(`/api/tasks/${task.taskId}`, { headers: { authorization: `Bearer ${tokens.accessToken}` } });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ id: task.taskId, name: "Tarefa da cadeia real" });
  });

  it("preserva a autorização: sem bearer e sem permissão, a API não é executada", async () => {
    const anonymous = await call("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(anonymous.status).toBe(401);
    expect(await anonymous.text()).toBe("");
    expect(anonymous.headers.get("x-correlation-id")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);

    const viewerTokens = await login(viewerEmail);
    const forbidden = await postJson(
      "/api/tasks",
      { name: "Não deveria existir" },
      { authorization: `Bearer ${viewerTokens.accessToken}`, "x-correlation-id": "chain-forbidden" },
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.text()).toBe("");
    expect(forbidden.headers.get("x-correlation-id")).toBe("chain-forbidden");

    expect(apiRows("SELECT id FROM tasks WHERE user_id = ?", viewerId)).toEqual([]);
  });

  it("preserva o erro da API e o correlation id do Auth na resposta", async () => {
    const tokens = await login(memberEmail);

    const missing = await call("/api/tasks/01ARZ3NDEKTSV4RRFFQ69G5FAV", {
      headers: { authorization: `Bearer ${tokens.accessToken}`, "x-correlation-id": "chain-missing" },
    });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("x-correlation-id")).toBe("chain-missing");
    expect(await missing.json()).toEqual({ error: expect.any(String) });

    const invalid = await call("/auth/me", {
      headers: { authorization: "Bearer token-invalido", "x-correlation-id": "chain-invalid" },
    });
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("x-correlation-id")).toBe("chain-invalid");
  });

  it("encerra os dois processos pelo sinal, sem deixar porta aberta", async () => {
    const authCode = await auth.stop();
    const apiCode = await api.stop();

    expect(authCode).toBe(0);
    expect(apiCode).toBe(0);
    expect(auth.output()).toContain("Auth shutting down after SIGTERM");
    expect(await isPortFree(authPort)).toBe(true);
    expect(await isPortFree(apiPort)).toBe(true);
  });
});
