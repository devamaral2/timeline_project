import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Client } from "pg";
import {
  DEVICE_PERMISSIONS_HEADER,
  TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES,
  TRANSCRIPTION_WORK_PERMISSION,
} from "@repo/contracts/device-key";
import { ANONYMOUS_CONTEXT } from "../common/request-context";
import { CryptoSecretGenerator } from "../common/secret-generator";
import { SECURITY_POLICY } from "../config/security-policy";
import { IssueDeviceKeyUseCase } from "../features/device-keys/usecases/issue-device-key.usecase";
import { LEAK_PROBE, createTestApp, type TestApp } from "../testing/create-test-app";
import { createPostgresTestDatabase, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { InMemoryDeviceKeyRepository } from "../testing/in-memory-device-key.repository";
import { ScryptPasswordHasher } from "../auth-core/password/scrypt-password-hasher";
import { SigningKeyService } from "../auth-core/security/signing-key.service";
import { startFakeHttpServer, type FakeHttpServer } from "../testing/fake-http-server";
import { AUTH_HTTP_OPERATIONS, documentedOperations } from "./http-contract.inventory";
import { authOpenApiDocument } from "./openapi";

/**
 * A linha de base executável do contrato HTTP do Auth.
 *
 * Ela sobe o Nest de verdade numa porta efêmera, com Postgres de verdade, e
 * fala HTTP como o web, o Android, a extensão e o serviço local falam. Nada
 * aqui inspeciona decorators, providers ou metadata: o que está congelado é o
 * que atravessa o socket.
 */

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

interface UserSeed {
  id: string;
  email: string;
  name: string;
  roleKeys: readonly string[];
}

describe("Auth HTTP contract baseline", () => {
  let database: PostgresTestDatabase;
  let admin: Client;
  let app: TestApp;
  let passwordHash: string;
  let deviceKeys: InMemoryDeviceKeyRepository;
  let upstream: FakeHttpServer;

  const call = (path: string, init: RequestInit = {}) => fetch(`${app.url}${path}`, init);
  const postJson = (path: string, body: unknown) =>
    call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  async function seedUser(label: string, roleKeys: readonly string[] = ["member"]): Promise<UserSeed> {
    const id = `user-${label}-${crypto.randomUUID()}`;
    const email = `${label}-${crypto.randomUUID()}@example.test`;
    const user = { id, email, name: `Pessoa ${label}`, roleKeys };
    await admin.query(
      "INSERT INTO users (id,email,name,password_hash,status,created_at,updated_at) VALUES ($1,$2,$3,$4,'active',now(),now())",
      [user.id, user.email, user.name, passwordHash],
    );
    for (const roleKey of roleKeys) {
      await admin.query("INSERT INTO user_roles (user_id,role_key) VALUES ($1,$2)", [user.id, roleKey]);
    }
    return user;
  }

  async function login(email: string, password = "Integration-password-42!"): Promise<{ accessToken: string; refreshToken: string }> {
    const response = await postJson("/auth/login", { email, password });
    expect(response.status).toBe(201);
    return (await response.json()) as { accessToken: string; refreshToken: string };
  }

  async function expectEmpty(response: Response, status: number): Promise<void> {
    expect(response.status).toBe(status);
    expect(await response.text()).toBe("");
    expect(response.headers.get("x-correlation-id")).toMatch(ULID);
  }

  beforeAll(async () => {
    database = await createPostgresTestDatabase();
    admin = new Client({ connectionString: database.adminUrl });
    await admin.connect();
    upstream = await startFakeHttpServer(() => ({ status: 200, body: "ok" }));
    passwordHash = await new ScryptPasswordHasher().hash("Integration-password-42!");
    deviceKeys = new InMemoryDeviceKeyRepository();
    app = await createTestApp(
      {
        AUTH_DATABASE_URL: database.runtimeUrl,
        AUTH_PASSWORD_IP_LIMIT: "1000",
        API_SERVICE_URL: upstream.url,
      },
      { deviceKeys },
    );
    // O bootstrap real garante a chave ativa antes do listen; aqui a garantia é
    // exercitada no teste dedicado e reproduzida para o restante da suíte.
    await app.app.get(SigningKeyService).ensureActive(new Date(), {
      correlationId: "contract-baseline", actorUserId: null, action: "key.created",
      targetType: "signing_key", targetId: null, result: "succeeded",
      reason: null, metadata: {}, context: ANONYMOUS_CONTEXT, occurredAt: new Date(),
    });
  });

  afterAll(async () => {
    await app?.close();
    await upstream?.close();
    await admin?.end();
    await database?.close();
  });

  describe("inventário de operações", () => {
    it("cobre exatamente as operações do documento OpenAPI", () => {
      const fromDocument = Object.entries(authOpenApiDocument.paths)
        .flatMap(([path, operations]) => Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`))
        .sort();
      const fromInventory = documentedOperations()
        .map((operation) => `${operation.method} ${operation.path}`)
        .sort();

      expect(fromDocument).toEqual(fromInventory);
    });

    it("mantém status, corpo e autenticação do inventário iguais aos do documento", () => {
      type DocumentedOperation = { security?: unknown; responses: Record<string, unknown> };
      const paths = authOpenApiDocument.paths as unknown as Record<string, Record<string, DocumentedOperation>>;

      for (const operation of documentedOperations()) {
        const documented = paths[operation.path]?.[operation.method.toLowerCase()];
        expect(documented, `${operation.method} ${operation.path}`).toBeDefined();

        const response = documented?.responses[String(operation.success.status)] as
          | { content?: Record<string, { schema?: { $ref?: string } }> }
          | undefined;
        expect(response, `${operation.method} ${operation.path} -> ${operation.success.status}`).toBeDefined();
        if (operation.success.body.kind === "json") {
          expect(response?.content?.["application/json"]?.schema?.$ref).toBe(
            `#/components/schemas/${operation.success.body.schema}`,
          );
        }

        const requiresBearer = operation.authentication === "bearer" || operation.authentication === "bearer-super-admin";
        expect(Boolean(documented?.security), `${operation.method} ${operation.path} security`).toBe(requiresBearer);
      }
    });

    it.each(AUTH_HTTP_OPERATIONS.map((operation) => [operation.method, operation.path, operation.withoutCredential, operation.headers] as const))(
      "responde %s %s com %i quando não há credencial",
      async (method, path, expectedStatus, headers) => {
        const concretePath = path.replace("*", "probe");
        const response = await call(concretePath, {
          method: method === "ALL" ? "POST" : method,
          ...(method === "POST" || method === "ALL"
            ? { headers: { "content-type": "application/json" }, body: "{}" }
            : {}),
        });

        expect(response.status).toBe(expectedStatus);
        expect(response.headers.get("x-correlation-id")).toMatch(ULID);
        for (const header of headers) expect(response.headers.get(header)).not.toBeNull();
        if (expectedStatus === 401 || expectedStatus === 403 || expectedStatus === 429) {
          expect(await response.text()).toBe("");
        }
      },
    );

    it("não inventaria caminhos ou métodos que não existem", async () => {
      const unknown = await call("/auth/nao-existe");
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toEqual({ code: "not_found" });

      const wrongMethod = await call("/auth/login");
      expect(wrongMethod.status).toBe(404);
      expect(await wrongMethod.json()).toEqual({ code: "not_found" });
    });

    it("normaliza trailing slash como o Express faz hoje", async () => {
      expect((await call("/health/live/")).status).toBe(200);
      expect((await call("/.well-known/jwks.json/")).status).toBe(200);
      expect((await postJson("/auth/login/", {})).status).toBe(400);

      const user = await seedUser("trailing");
      const tokens = await login(user.email);
      const me = await call("/auth/me/", { headers: { authorization: `Bearer ${tokens.accessToken}` } });
      expect(me.status).toBe(200);
    });
  });

  describe("contrato de erros e correlation id", () => {
    it("preserva o correlation id válido e substitui o inválido", async () => {
      const echoed = await call("/health/live", { headers: { "x-correlation-id": "trace-abc_123" } });
      expect(echoed.headers.get("x-correlation-id")).toBe("trace-abc_123");

      for (const invalid of ["trace com espaço", "a".repeat(129), ""]) {
        const response = await call("/health/live", { headers: { "x-correlation-id": invalid } });
        const generated = response.headers.get("x-correlation-id");
        expect(generated).toMatch(ULID);
        expect(generated).not.toBe(invalid);
      }
    });

    it("mantém IP e user agent no contexto da requisição", async () => {
      const response = await call("/testing/request-context", {
        headers: { "x-correlation-id": "ctx-1", "user-agent": "contract-agent" },
      });
      expect(await response.json()).toEqual({
        correlationId: "ctx-1",
        ipAddress: "127.0.0.1",
        userAgent: "contract-agent",
      });
    });

    it.each([
      ["authentication", 401, null, undefined],
      ["access", 403, null, undefined],
      ["rate-limit", 429, "43", undefined],
      ["semantic", 422, null, { code: "password_compromised" }],
      ["conflict", 409, null, { code: "would_remove_last_admin" }],
      ["not-found", 404, null, { code: "not_found" }],
      ["dependency", 503, null, { code: "service_unavailable" }],
    ] as const)("traduz %s sem vazar o motivo interno", async (kind, status, retryAfter, body) => {
      const response = await call(`/testing/raise/${kind}`, { headers: { "x-correlation-id": "error-trace" } });

      expect(response.status).toBe(status);
      expect(response.headers.get("x-correlation-id")).toBe("error-trace");
      expect(response.headers.get("retry-after")).toBe(retryAfter);
      const text = await response.text();
      expect(text).not.toContain(LEAK_PROBE);
      expect(body === undefined ? text : JSON.parse(text)).toEqual(body ?? "");
    });

    it("responde 500 com internal_error e correlation id, sem motivo nem causa", async () => {
      const response = await call("/testing/raise/unknown", { headers: { "x-correlation-id": "trace-500" } });

      expect(response.status).toBe(500);
      expect(response.headers.get("x-correlation-id")).toBe("trace-500");
      const text = await response.text();
      expect(text).not.toContain(LEAK_PROBE);
      expect(JSON.parse(text)).toEqual({ code: "internal_error", correlationId: "trace-500" });
    });

    it("usa Retry-After 1 para 429 fora do erro de domínio", async () => {
      const response = await call("/testing/generic-rate-limit");
      await expectEmpty(response, 429);
      expect(response.headers.get("retry-after")).toBe("1");
    });

    it.each([
      ["corpo vazio", {}, "application/json"],
      ["JSON malformado", "{oops", "application/json"],
      ["campo desconhecido", { email: "a@b.test", password: "x", extra: true }, "application/json"],
      ["senha vazia", { email: "a@b.test", password: "" }, "application/json"],
      ["sem content-type", "{}", undefined],
      ["content-type incompatível", "{}", "text/plain"],
    ] as const)("recusa %s com 400 invalid_request", async (_label, body, contentType) => {
      const response = await call("/auth/login", {
        method: "POST",
        headers: contentType ? { "content-type": contentType } : {},
        body: typeof body === "string" ? body : JSON.stringify(body),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ code: "invalid_request" });
    });

    it("recusa corpo acima do limite comum com 413 payload_too_large", async () => {
      const response = await postJson("/auth/login", { email: "a@b.test", password: "x".repeat(40 * 1024) });
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ code: "payload_too_large" });
    });
  });

  describe("health, JWKS e documentação", () => {
    it("mantém liveness e readiness com o mesmo corpo", async () => {
      const live = await call("/health/live");
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: "ok" });

      const ready = await call("/health/ready");
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({ status: "ok" });
    });

    it("publica a chave ativa no JWKS com ETag e 304", async () => {
      const first = await call("/.well-known/jwks.json");
      expect(first.status).toBe(200);
      expect(first.headers.get("cache-control")).toBe("public, max-age=300, stale-if-error=3600");
      const body = (await first.json()) as { keys: Array<Record<string, unknown>> };
      expect(body.keys).toHaveLength(1);
      expect(body.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519", use: "sig", alg: "EdDSA" });
      expect(body.keys[0]?.d).toBeUndefined();

      const etag = first.headers.get("etag");
      expect(etag).toMatch(/^"sha256-[A-Za-z0-9_-]{43}"$/);
      expect(etag).toBe(`"sha256-${createHash("sha256").update(JSON.stringify(body)).digest("base64url")}"`);

      const notModified = await call("/.well-known/jwks.json", { headers: { "if-none-match": etag ?? "" } });
      await expectEmpty(notModified, 304);
      expect(notModified.headers.get("etag")).toBe(etag);
    });

    it("serve o OpenAPI e a referência interativa sem autenticação", async () => {
      const document = await call("/openapi.json");
      expect(document.status).toBe(200);
      expect(await document.json()).toEqual(authOpenApiDocument);

      const docs = await call("/docs");
      expect(docs.status).toBe(200);
      expect(docs.headers.get("content-type")).toContain("text/html");
      const html = await docs.text();
      expect(html).toContain("Braid Auth API");
      expect(html).toContain("scalar");
    });
  });

  describe("sessões", () => {
    it("emite sessão e tokens no login válido", async () => {
      const user = await seedUser("login");
      const response = await postJson("/auth/login", { email: user.email, password: "Integration-password-42!" });

      expect(response.status).toBe(201);
      expect(response.headers.get("content-type")).toContain("application/json");
      const body = (await response.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        "accessToken", "accessTokenExpiresInSeconds", "refreshToken", "refreshTokenExpiresAt",
      ]);
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.refreshToken).toEqual(expect.any(String));
      expect(body.accessTokenExpiresInSeconds).toBe(900);
      expect(new Date(String(body.refreshTokenExpiresAt)).toISOString()).toBe(body.refreshTokenExpiresAt);

      const sessions = await admin.query("SELECT user_id FROM sessions WHERE user_id=$1", [user.id]);
      expect(sessions.rows).toEqual([{ user_id: user.id }]);
    });

    it("recusa credenciais inválidas com 401 vazio, sem revelar se o email existe", async () => {
      const user = await seedUser("bad-login");
      const wrongPassword = await postJson("/auth/login", { email: user.email, password: "senha-errada" });
      const unknownEmail = await postJson("/auth/login", { email: "ninguem@example.test", password: "senha-errada" });

      await expectEmpty(wrongPassword, 401);
      await expectEmpty(unknownEmail, 401);
      const sessions = await admin.query("SELECT id FROM sessions WHERE user_id=$1", [user.id]);
      expect(sessions.rows).toEqual([]);
    });

    it("consulta a sessão atual com usuário, sessão, papéis e permissões efetivas", async () => {
      const user = await seedUser("me");
      const tokens = await login(user.email);
      const response = await call("/auth/me", { headers: { authorization: `Bearer ${tokens.accessToken}` } });

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject({
        userId: user.id, email: user.email, name: user.name, roles: ["member"], denies: [],
      });
      expect(body.sessionId).toEqual(expect.any(String));
      expect(body.permissions).toEqual(expect.arrayContaining(["task:read", "task:create", "tag:read"]));
    });

    it("rotaciona o refresh token e recusa a reutilização do anterior", async () => {
      const user = await seedUser("refresh");
      const tokens = await login(user.email);

      const refreshed = await postJson("/auth/token/refresh", { refreshToken: tokens.refreshToken });
      expect(refreshed.status).toBe(200);
      const body = (await refreshed.json()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(["accessToken", "refreshToken"]);
      expect(body.refreshToken).not.toBe(tokens.refreshToken);

      await expectEmpty(await postJson("/auth/token/refresh", { refreshToken: tokens.refreshToken }), 401);
      await expectEmpty(await postJson("/auth/token/refresh", { refreshToken: "token-desconhecido" }), 401);
    });

    it("revoga a sessão no logout e responde 204 mesmo na repetição", async () => {
      const user = await seedUser("logout");
      const tokens = await login(user.email);

      await expectEmpty(await postJson("/auth/logout", { refreshToken: tokens.refreshToken }), 204);
      await expectEmpty(await postJson("/auth/logout", { refreshToken: tokens.refreshToken }), 204);
      await expectEmpty(await postJson("/auth/logout", { refreshToken: "desconhecido" }), 204);
      await expectEmpty(await postJson("/auth/token/refresh", { refreshToken: tokens.refreshToken }), 401);
    });

    it("revoga todas as sessões no logout geral, invalidando o bearer na consulta seguinte", async () => {
      const user = await seedUser("logout-all");
      const first = await login(user.email);
      const second = await login(user.email);

      await expectEmpty(
        await call("/auth/logout-all", { method: "POST", headers: { authorization: `Bearer ${first.accessToken}` } }),
        204,
      );
      await expectEmpty(await call("/auth/me", { headers: { authorization: `Bearer ${first.accessToken}` } }), 401);
      await expectEmpty(await call("/auth/me", { headers: { authorization: `Bearer ${second.accessToken}` } }), 401);
    });

    it("exige bearer válido nas operações protegidas", async () => {
      const user = await seedUser("bearer");
      const tokens = await login(user.email);

      await expectEmpty(await call("/auth/me"), 401);
      await expectEmpty(await call("/auth/me", { headers: { authorization: "Bearer token-invalido" } }), 401);
      await expectEmpty(await call("/auth/me", { headers: { authorization: "Basic abc" } }), 401);
      await expectEmpty(
        await call("/auth/logout-all", { method: "POST", headers: { authorization: `Bearer ${tokens.accessToken}` } }),
        204,
      );
    });

    it("devolve 429 com Retry-After depois do limite de tentativas por email", async () => {
      const email = `limite-${crypto.randomUUID()}@example.test`;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        expect((await postJson("/auth/login", { email, password: "errada" })).status).toBe(401);
      }

      const limited = await postJson("/auth/login", { email, password: "errada" });
      await expectEmpty(limited, 429);
      const retryAfter = Number(limited.headers.get("retry-after"));
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(900);
    });
  });

  describe("convites", () => {
    async function createInviteAsAdmin(input: { email: string; name: string }) {
      const adminUser = await seedUser("admin", ["admin"]);
      const tokens = await login(adminUser.email);
      const response = await call("/auth/admin/invites", {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ ...input, roleKeys: ["member"], directPermissions: [] }),
      });
      return response;
    }

    const tokenFromLink = (link: string): string => {
      const url = new URL(link);
      const token = new URLSearchParams(url.hash.replace(/^#/, "")).get("token");
      if (!token) throw new Error(`invite link without token: ${link}`);
      return token;
    };

    it("cria o convite como superadmin, inspeciona, aceita e deixa o convidado entrar", async () => {
      const email = `convidado-${crypto.randomUUID()}@example.test`;
      const created = await createInviteAsAdmin({ email, name: "Pessoa Convidada" });

      expect(created.status).toBe(201);
      const invite = (await created.json()) as { userId: string; inviteLink: string; expiresAt: string };
      expect(invite.userId).toEqual(expect.any(String));
      expect(invite.inviteLink.startsWith("https://web.example.test/convites/aceitar#")).toBe(true);
      expect(new Date(invite.expiresAt).toISOString()).toBe(invite.expiresAt);
      const token = tokenFromLink(invite.inviteLink);

      const inspection = await postJson("/auth/invites/inspect", { token });
      expect(inspection.status).toBe(201);
      expect(await inspection.json()).toEqual({
        name: "Pessoa Convidada",
        email: `c***@example.test`,
        expiresAt: invite.expiresAt,
      });

      const accepted = await postJson("/auth/invites/accept", { token, password: "Outra-senha-forte-42!" });
      expect(accepted.status).toBe(201);
      expect(await accepted.json()).toEqual({ accepted: true });

      await expectEmpty(await postJson("/auth/invites/accept", { token, password: "Outra-senha-forte-42!" }), 401);

      const tokens = await login(email, "Outra-senha-forte-42!");
      const me = await call("/auth/me", { headers: { authorization: `Bearer ${tokens.accessToken}` } });
      expect(me.status).toBe(200);
      expect(await me.json()).toMatchObject({ email, roles: ["member"] });
    });

    it("recusa convite desconhecido e email repetido", async () => {
      await expectEmpty(await postJson("/auth/invites/inspect", { token: "token-desconhecido" }), 401);

      const user = await seedUser("duplicado");
      const duplicated = await createInviteAsAdmin({ email: user.email, name: "Duplicado" });
      expect(duplicated.status).toBe(409);
      expect(await duplicated.json()).toEqual({ code: "email_already_exists" });
    });

    it("exige superadmin para convidar", async () => {
      const member = await seedUser("quase-admin", ["member"]);
      const tokens = await login(member.email);
      const forbidden = await call("/auth/admin/invites", {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ email: "x@example.test", name: "X", roleKeys: [], directPermissions: [] }),
      });

      await expectEmpty(forbidden, 403);
      await expectEmpty(
        await call("/auth/admin/invites", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
        401,
      );
    });
  });

  describe("proxy Auth -> API", () => {
    beforeEach(() => {
      upstream.requests.length = 0;
      upstream.respondWith(() => ({ status: 200, body: "ok" }));
    });

    async function issueKeyFor(user: UserSeed) {
      const reader = {
        findByEmail: async (email: string) =>
          email === user.email
            ? { id: user.id, email: user.email, name: user.name, passwordHash, status: "active" as const, createdAt: new Date(), updatedAt: new Date() }
            : null,
      };
      return new IssueDeviceKeyUseCase(reader, deviceKeys, { now: () => new Date() }, new CryptoSecretGenerator())
        .execute({ email: user.email, label: "servidor local", context: ANONYMOUS_CONTEXT });
    }

    it("autoriza e repassa GET com query repetida, sem credenciais do cliente e com a identidade validada", async () => {
      const user = await seedUser("proxy-get");
      const tokens = await login(user.email);
      upstream.respondWith(() => ({
        status: 201,
        body: "created",
        headers: { "content-type": "application/problem+json", "x-upstream": "yes" },
      }));

      const response = await call("/api/tasks?status=open&status=done", {
        headers: {
          authorization: `Bearer ${tokens.accessToken}`,
          "x-auth-user-id": "intruso",
          "x-auth-session-id": "sessao-forjada",
          "x-auth-permissions": "*:manage",
          "x-auth-gateway-key": "chave-forjada",
          "x-custom": "preservado",
        },
      });

      expect(response.status).toBe(201);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(response.headers.get("x-upstream")).toBe("yes");
      expect(await response.text()).toBe("created");

      expect(upstream.requests).toHaveLength(1);
      const forwarded = upstream.requests[0];
      expect(forwarded).toMatchObject({ method: "GET", path: "/api/tasks?status=open&status=done", body: "" });
      expect(forwarded?.headers["x-auth-gateway-key"]).toBe("test-internal-service-key-32-bytes");
      expect(forwarded?.headers["x-auth-user-id"]).toBe(user.id);
      expect(forwarded?.headers["x-auth-session-id"]).toEqual(expect.any(String));
      expect(forwarded?.headers["x-auth-permissions"]).toBeUndefined();
      expect(forwarded?.headers["x-custom"]).toBe("preservado");
      expect(forwarded?.headers.authorization).toBeUndefined();
    });

    it("autoriza e repassa POST com o corpo JSON e a identidade validada", async () => {
      const user = await seedUser("proxy-post");
      const tokens = await login(user.email);
      upstream.respondWith(() => ({ status: 201, body: "{\"id\":\"task-1\"}", headers: { "content-type": "application/json" } }));

      const response = await call("/api/tasks", {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ title: "Comprar pão" }),
      });

      expect(response.status).toBe(201);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(await response.json()).toEqual({ id: "task-1" });
      expect(upstream.requests[0]).toMatchObject({
        method: "POST",
        path: "/api/tasks",
        body: JSON.stringify({ title: "Comprar pão" }),
      });
    });

    it("recusa com 403 vazio quando o ator não tem a permissão do recurso, sem tocar a API", async () => {
      const user = await seedUser("proxy-denied", ["viewer"]);
      const tokens = await login(user.email);

      const response = await call("/api/requests", {
        method: "POST",
        headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, text: "oi" }),
      });

      await expectEmpty(response, 403);
      expect(upstream.requests).toEqual([]);
    });

    it("responde 500 sem policy para caminho da API fora do contrato do gateway", async () => {
      const user = await seedUser("proxy-unknown");
      const tokens = await login(user.email);

      const response = await call("/api/desconhecido", {
        headers: { authorization: `Bearer ${tokens.accessToken}`, "x-correlation-id": "proxy-policy" },
      });

      // Comportamento atual do Nest, congelado para a migração: o throw do
      // `policyFor` cai no filtro como erro inesperado, não como 404.
      expect(response.status).toBe(500);
      expect(response.headers.get("x-correlation-id")).toBe("proxy-policy");
      expect(await response.json()).toEqual({ code: "internal_error", correlationId: "proxy-policy" });
      expect(upstream.requests).toEqual([]);
    });

    it("trata indisponibilidade da API como 500, não como falha de autenticação", async () => {
      const deadUpstream = await startFakeHttpServer(() => ({ status: 200, body: "ok" }));
      const deadUrl = deadUpstream.url;
      await deadUpstream.close();
      const deadApp = await createTestApp({
        AUTH_DATABASE_URL: database.runtimeUrl,
        API_SERVICE_URL: deadUrl,
      });
      try {
        const user = await seedUser("proxy-down");
        const tokens = await login(user.email);

        const deadResponse = await fetch(`${deadApp.url}/api/tasks`, {
          headers: { authorization: `Bearer ${tokens.accessToken}`, "x-correlation-id": "api-down" },
        });

        expect(deadResponse.status).toBe(500);
        expect(deadResponse.headers.get("x-correlation-id")).toBe("api-down");
        expect(await deadResponse.json()).toEqual({ code: "internal_error", correlationId: "api-down" });
      } finally {
        await deadApp.close();
      }
    });

    it("encaminha a chave de dispositivo com dono, id da chave e só a permissão de transcrição", async () => {
      const user = await seedUser("device-owner");
      const issued = await issueKeyFor(user);

      const response = await call("/api/transcription-worker/next", {
        method: "POST",
        headers: {
          authorization: `Bearer ${issued.key}`,
          "content-type": "application/json",
          "x-auth-user-id": "intruso",
          "x-auth-session-id": "sessao-forjada",
          "x-auth-permissions": "*:manage",
        },
        body: "{}",
      });

      expect(response.status).toBe(200);
      expect(upstream.requests).toHaveLength(1);
      const forwarded = upstream.requests[0];
      expect(forwarded).toMatchObject({ method: "POST", path: "/api/transcription-worker/next", body: "{}" });
      expect(forwarded?.headers["x-auth-gateway-key"]).toBe("test-internal-service-key-32-bytes");
      expect(forwarded?.headers["x-auth-user-id"]).toBe(user.id);
      expect(forwarded?.headers[DEVICE_PERMISSIONS_HEADER.toLowerCase()]).toBe(TRANSCRIPTION_WORK_PERMISSION);
      expect(forwarded?.headers["x-auth-device-key-id"]).toBe(issued.keyId);
      expect(forwarded?.headers["x-auth-session-id"]).toBeUndefined();
      expect(forwarded?.headers.authorization).toBeUndefined();
    });

    it("não aceita chave de dispositivo fora da rota local nem sessão de usuário dentro dela", async () => {
      const user = await seedUser("device-scope");
      const issued = await issueKeyFor(user);

      await expectEmpty(
        await call("/api/tasks", {
          method: "POST",
          headers: { authorization: `Bearer ${issued.key}`, "content-type": "application/json" },
          body: "{}",
        }),
        401,
      );

      const tokens = await login(user.email);
      await expectEmpty(
        await call("/api/transcription-worker/next", {
          method: "POST",
          headers: { authorization: `Bearer ${tokens.accessToken}`, "content-type": "application/json" },
          body: "{}",
        }),
        401,
      );
      expect(upstream.requests).toEqual([]);
    });

    describe("limites de corpo", () => {
      const bodyOf = (field: string, bytes: number): string => {
        const overhead = Buffer.byteLength(JSON.stringify({ [field]: "" }));
        return JSON.stringify({ [field]: "a".repeat(bytes - overhead) });
      };

      it("aceita o corpo da Leitura diária até o teto e recusa um byte acima", async () => {
        const atLimit = bodyOf("markdown", SECURITY_POLICY.maxLargeRequestBodyBytes);
        const aboveLimit = bodyOf("markdown", SECURITY_POLICY.maxLargeRequestBodyBytes + 1);
        expect(Buffer.byteLength(atLimit)).toBe(SECURITY_POLICY.maxLargeRequestBodyBytes);

        const accepted = await call("/api/tasks/daily-reading", {
          method: "POST", headers: { "content-type": "application/json" }, body: atLimit,
        });
        await expectEmpty(accepted, 401);

        const refused = await call("/api/tasks/daily-reading", {
          method: "POST", headers: { "content-type": "application/json" }, body: aboveLimit,
        });
        expect(refused.status).toBe(413);
        expect(await refused.json()).toEqual({ code: "payload_too_large" });
        expect(upstream.requests).toEqual([]);
      });

      it("recusa nas rotas comuns o corpo que a Leitura diária aceita", async () => {
        const pageSized = bodyOf("markdown", 200 * 1024);

        const refused = await call("/api/tasks", {
          method: "POST", headers: { "content-type": "application/json" }, body: pageSized,
        });
        expect(refused.status).toBe(413);
        expect(await refused.json()).toEqual({ code: "payload_too_large" });
      });

      it("aceita a entrega da transcrição até o teto e recusa um byte acima", async () => {
        const atLimit = bodyOf("result", TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES);
        const aboveLimit = bodyOf("result", TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES + 1);

        const accepted = await call("/api/transcription-worker/deliver", {
          method: "POST", headers: { "content-type": "application/json" }, body: atLimit,
        });
        await expectEmpty(accepted, 401);

        const refused = await call("/api/transcription-worker/deliver", {
          method: "POST", headers: { "content-type": "application/json" }, body: aboveLimit,
        });
        expect(refused.status).toBe(413);
        expect(await refused.json()).toEqual({ code: "payload_too_large" });
      });
    });
  });
});
