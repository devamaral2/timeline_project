# Auth Service Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar em `apps/auth` um serviço NestJS executável que inicia de um Postgres vazio e cobre, de ponta a ponta, bootstrap do primeiro administrador, convites, senha, MFA obrigatório, recovery codes, sessões, refresh/logout, RBAC administrativo, JWKS, auditoria e retenção.

**Architecture:** `apps/auth` é um serviço isolado, dono de domínio, persistência e HTTP. Portas de persistência representam transições atômicas; Postgres garante locks, constraints, auditoria e rate limits; Twilio Verify e Pwned Passwords ficam atrás de gateways e nunca são chamados dentro de transações. Access tokens EdDSA são verificáveis localmente pelo JWKS e a revogação antecipada é deliberadamente limitada ao refresh, ficando cada access token válido até o TTL de 15 minutos.

**Tech Stack:** TypeScript 5.7, Node.js 24, NestJS 11, Express 5, PostgreSQL 17, Drizzle ORM/Kit, Zod 4, `node:crypto`, Vitest pelo runner único do monorepo e `fetch` nativo para Twilio Verify, Pwned Passwords e testes HTTP.

**Spec:** [`docs/superpowers/specs/2026-08-31-auth-service-stage-1-design.md`](../specs/2026-08-31-auth-service-stage-1-design.md)

## Global Constraints

- A spec aprovada é normativa. `apps/auth/PLANO.md` continua sendo visão futura e não pode reintroduzir decisões incompatíveis nesta etapa.
- Não criar OAuth, `identities`, `oauth_states`, grants de conteúdo, `access_grants`, integração com `apps/api`, cookies, BFF, web ou mobile.
- Não criar `mfaEnabled`, `mfa_enabled`, `tokenVersion`, `token_version` nem claim `ver`. Todo usuário `active` tem senha e MFA verificado.
- Access token: Ed25519/`EdDSA`, `typ: at+jwt`, TTL de 900 segundos, tolerância de relógio de 30 segundos. Refresh token: opaco, 256 bits, TTL de 30 dias, rotação de uso único. Logout, suspensão e troca de senha não invalidam access tokens já emitidos antes de `exp`.
- IDs de domínio são ULIDs em `text`; `kid` e `jti` podem ser valores aleatórios próprios. Datas persistidas são `timestamptz`.
- E-mail persistido é sempre `trim().toLowerCase()`. Senha é NFC, case-sensitive e nunca sofre `trim`.
- O banco de auth usa `AUTH_DATABASE_URL` em runtime e `AUTH_DATABASE_MIGRATION_URL` nas migrações. Não há FK nem consulta cruzada com os outros workspaces.
- Migração nunca roda no startup. Readiness compara a versão esperada e falha enquanto o schema estiver atrasado.
- Toda mudança persistente de segurança e seu evento de auditoria fazem commit ou rollback juntos. `AuditLog.record` isolado serve somente para falhas que não mutam estado.
- Comandos transacionais que representam mais de um fato recebem `auditEvents` não vazio e inserem todos os eventos no mesmo commit; não reduza aceite, login ou troca de senha a um único evento genérico.
- Toda falha de policy, credencial, Twilio ou HIBP que não muta domínio chama
  `AuditLog.record` em transação própria com action do fluxo,
  `result="failed"` e razão interna redigida.
- Ordem global de locks: advisory lock de negócio
  (`bootstrap-admin`/`capable-admin`/`cleanup`) quando aplicável → `users` →
  `invites` → `authentication_attempts` →
  `mfa_challenges`/`recovery_codes` → `sessions` → `refresh_tokens` →
  advisory lock de signing key + `signing_keys` → insert de auditoria.
- Consultas podem descobrir IDs antes da transação, mas precisam reler e validar sob lock na ordem acima.
- Twilio e Pwned Passwords são chamados antes da transação final e nunca enquanto houver lock aberto.
- Segredos brutos só existem na borda do caso de uso e na resposta única ao cliente. Senha, OTP, recovery code, token, chave privada, `Authorization` e telefone completo nunca entram em logs, erros ou metadata de auditoria.
- Controllers validam todo input em runtime, extraem IP do socket, ignoram `X-Forwarded-For` e `x-user-id` e declaram rotas estáticas antes das dinâmicas.
- Use somente `npm run --silent test:ai [arquivo]` para testes. Não use `npm test` nem `npx vitest`.
- Cada fatia segue RED → GREEN → testes focados → suite oficial → commit. Não combine tarefas em um único commit.
- Preserve mudanças preexistentes fora dos arquivos nomeados na tarefa. Em especial, não reverta `pnpm-lock.yaml` nem `vitest.workspace.ts` por atacado.

---

## Baseline and Execution Convention

Baseline confirmada em 31 de agosto de 2026:

- `npm run --silent test:ai` passa e imprime `Tests pass`.
- `pnpm --filter @repo/auth run typecheck` falha apenas no `scrypt` promisificado e no tipo global ausente `JsonWebKey`.
- `apps/auth` ainda é um esqueleto sem `main.ts`, módulo Nest, HTTP, banco, migrações ou CLIs.
- `vitest.workspace.ts` já registra o projeto `auth`; mantenha essa entrada.

Para testes Postgres, use um banco descartável real:

```powershell
docker compose -f apps/auth/compose.test.yaml up -d --wait
$env:NODE_ENV = "test"
$env:AUTH_TEST_DATABASE_URL = "postgresql://auth_test:auth_test@127.0.0.1:55432/timeline_auth_test"
$env:AUTH_REQUIRE_POSTGRES_TESTS = "true"
npm run --silent test:ai apps/auth/src/db/migrations.integration.test.ts
```

Os testes de integração usam o helper `describeWithPostgres`: sem URL eles
podem ser pulados na suite unitária; com
`AUTH_REQUIRE_POSTGRES_TESTS=true` o helper falha imediatamente se a URL não
existir e nunca escolhe `describe.skip`. O reporter verde imprime somente
`Tests pass`, portanto esse sentinela — e não um contador inexistente — prova
no gate final que integração e E2E estavam habilitados.

## Target File Structure

Arquivos existentes preservados e endurecidos:

- `apps/auth/src/crypto/base64url.ts`, `key-encryption.ts` e seus testes;
- `apps/auth/src/crypto/secret-token.ts`;
- `apps/auth/src/rbac/permissions.ts`, `system-roles.ts` e testes;
- entidades/portas existentes de usuário, convite, MFA, sessão e chave, substituídas gradualmente pelos contratos deste plano.

Estrutura final:

```text
apps/auth/
  compose.test.yaml
  drizzle.config.ts
  drizzle/
    0000_infrastructure.sql
    0001_users_invites.sql
    0002_authentication_sessions.sql
    rollback/
      0002_authentication_sessions.down.sql
      0001_users_invites.down.sql
      0000_infrastructure.down.sql
    meta/
      0000_snapshot.json
      0001_snapshot.json
      0002_snapshot.json
      _journal.json
  src/
    main.ts
    app.module.ts
    config/
      env.ts
      load-env.ts
      security-policy.ts
    common/
      clock.ts
      errors.ts
      request-context.ts
      secret-generator.ts
    db/
      client.ts
      db.module.ts
      migrate.ts
      migrate.cli.ts
      schema.ts
      transaction-locks.ts
      readiness.ts
    audit/
      audit-event.ts
      audit-redaction.ts
      ports/audit-log.ts
      postgres-audit-log.ts
    rate-limit/
      rate-limit-key.ts
      rate-limiter.ts
      postgres-rate-limiter.ts
    crypto/
      jwk.ts
      jwt.ts
      signing-key.ts
      signing-key.service.ts
      postgres-signing-key.repository.ts
      rotate-signing-key.cli.ts
      ports/signing-key-repository.ts
    credentials/
      password-policy.ts
      password-hasher.ts
      scrypt-password-hasher.ts
      prepare-password.ts
      pwned-passwords.gateway.ts
      http-pwned-passwords.gateway.ts
    users/
      user.ts
      postgres-user.repository.ts
      ports/user-repository.ts
      usecases/change-user-status.usecase.ts
      usecases/list-users.usecase.ts
    rbac/
      permissions.ts
      effective-permissions.ts
      system-roles.ts
      postgres-rbac.repository.ts
      ports/rbac-repository.ts
    invites/
      invite.ts
      postgres-invite.repository.ts
      ports/invite-repository.ts
      usecases/inspect-invite.usecase.ts
      usecases/bootstrap-admin.usecase.ts
      usecases/create-invite.usecase.ts
      usecases/reissue-invite.usecase.ts
      usecases/revoke-invite.usecase.ts
    mfa/
      authentication-attempt.ts
      mfa-challenge.ts
      recovery-code.ts
      otp-verification.gateway.ts
      twilio-verify.gateway.ts
      fake-otp-verification.gateway.ts
      postgres-authentication.repository.ts
      ports/authentication-repository.ts
    authentication/
      usecases/start-invite-acceptance.usecase.ts
      usecases/complete-invite-acceptance.usecase.ts
      usecases/start-login.usecase.ts
      usecases/complete-login.usecase.ts
      usecases/resend-mfa.usecase.ts
      usecases/start-step-up.usecase.ts
      usecases/complete-step-up.usecase.ts
      usecases/change-password.usecase.ts
      usecases/regenerate-recovery-codes.usecase.ts
    sessions/
      session.ts
      refresh-token.ts
      postgres-session.repository.ts
      ports/session-repository.ts
      usecases/refresh-session.usecase.ts
      usecases/logout.usecase.ts
      usecases/logout-all.usecase.ts
      usecases/get-me.usecase.ts
    http/
      auth-exception.filter.ts
      bearer-auth.guard.ts
      require-permission.guard.ts
      current-actor.decorator.ts
      request-context.middleware.ts
      validation.ts
      public-auth.controller.ts
      authenticated-auth.controller.ts
      admin-auth.controller.ts
      jwks.controller.ts
      health.controller.ts
    cli/
      bootstrap-admin.cli.ts
      cleanup-auth-data.cli.ts
      smoke-twilio.cli.ts
    cleanup/
      cleanup-auth-data.ts
    testing/
      create-test-app.ts
      postgres-test-database.ts
      fake-clock.ts
      fake-secret-generator.ts
      in-memory-audit-log.ts
      in-memory-rate-limiter.ts
      fake-http-server.ts
```

Arquivos removidos até o fim da tarefa 1:

- `apps/auth/src/oauth/**`;
- `apps/auth/src/rbac/access-grant.ts`, `access-policy.ts` e `access-policy.test.ts`;
- `apps/auth/src/crypto/otp-hash.ts`;
- gateways `console-otp`, `meta-whatsapp-otp`, `twilio-otp` e a porta `otp-delivery.gateway.ts`;
- `apps/auth/src/mfa/usecases/**` e `mfa/ports/mfa-challenge-repository.ts`;
- `apps/auth/src/login/**`, substituído por `authentication` e `mfa/authentication-attempt.ts`;
- `apps/auth/src/sessions/**`, recriado a partir da tarefa 8 com sessão e refresh separados;
- `apps/auth/src/users/ports/user-repository.ts`;
- `apps/auth/src/rbac/ports/rbac-repository.ts` e `rbac/resolve-user-permissions.ts`;
- dependências `cookie-parser` e `@types/cookie-parser`.

## Shared Contracts

Defina estes contratos uma vez e reutilize-os em todas as tarefas; não crie DTOs paralelos com o mesmo significado:

```ts
export type MfaChannel = "sms" | "whatsapp";
export type SecondFactor = "otp" | "recovery";
export type AuthenticationPurpose =
  | "invite_acceptance"
  | "login"
  | "password_change"
  | "recovery_regeneration";
export type AuthenticationMethod = "pwd" | "otp" | "recovery";

export interface ResolvedAccess {
  roleKeys: string[];
  permissions: Permission[];
  denies: Permission[];
}

export interface AuthenticatedActor {
  userId: string;
  sessionId: string;
  roles: string[];
  permissions: Permission[];
  denies: Permission[];
  amr: AuthenticationMethod[];
  authTime: number;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: 900;
  refreshTokenExpiresAt: Date;
}

export interface NewSessionWrite {
  id: string;
  amr: readonly AuthenticationMethod[];
  authTime: Date;
  issuedAt: Date;
  context: RequestContext;
  refreshToken: {
    id: string;
    hash: string;
    expiresAt: Date;
  };
}

export interface NewRecoveryCode {
  id: string;
  hash: string;
  generation: number;
}

export interface SessionCommit {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshTokenExpiresAt: Date;
  access: ResolvedAccess;
}
```

```ts
export interface AccessTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  sid: string;
  jti: string;
  iat: number;
  exp: number;
  perms: Permission[];
  denies: Permission[];
  roles: string[];
  amr: AuthenticationMethod[];
  auth_time: number;
}

export type UnsignedAccessTokenClaims = Omit<AccessTokenClaims, "jti">;

export interface SigningKeyForSigning {
  kid: string;
  encryptedPrivateKey: string;
}

export type SignAccessToken = (
  key: SigningKeyForSigning,
  claims: UnsignedAccessTokenClaims,
) => string;
```

---

## Task 1: Align the Skeleton with the Approved Stage 1 Contract

**Interfaces:**

- Consumes: o esqueleto atual de `apps/auth` e o catálogo fechado `Permission`/`DirectPermission`.
- Produces: `PublicSigningJwk`, `isPublicSigningJwk(value: unknown): value is PublicSigningJwk`, `resolveEffectivePermissions(sources: PermissionSources): EffectivePermissions`, `isAllowed(access: EffectivePermissions, resource: Resource, action: Action): boolean`, os contratos compartilhados desta seção e a taxonomia `AuthenticationFailedError | AccessDeniedError | SemanticInputError | ConflictError | NotFoundError | RateLimitedError | RequiredDependencyUnavailableError`.

**Files:**

- Modify: `apps/auth/package.json`
- Modify: `apps/auth/src/common/errors.ts`
- Modify: `apps/auth/src/crypto/password.ts`
- Modify: `apps/auth/src/crypto/password.test.ts`
- Create: `apps/auth/src/crypto/jwk.ts`
- Modify: `apps/auth/src/crypto/signing-key.ts`
- Modify: `apps/auth/src/crypto/signing-key.service.ts`
- Modify: `apps/auth/src/crypto/ports/signing-key-repository.ts`
- Modify: `apps/auth/src/crypto/jwt.ts`
- Modify: `apps/auth/src/crypto/jwt.test.ts`
- Modify: `apps/auth/src/users/user.ts`
- Modify: `apps/auth/src/rbac/effective-permissions.ts`
- Modify: `apps/auth/src/rbac/effective-permissions.test.ts`
- Create: `apps/auth/src/scope-boundary.test.ts`
- Delete: todos os arquivos listados em “Arquivos removidos” acima

- [ ] **Step 1: Write the failing scope and contract tests**

Em `scope-boundary.test.ts`, percorra `apps/auth/src` e falhe se nome ou conteúdo trouxer itens excluídos:

```ts
const forbidden = [
  "mfaEnabled",
  "mfa_enabled",
  "tokenVersion",
  "token_version",
  "access_grants",
  "oauth_states",
  "cookie-parser",
];

const productionFiles = sourceFiles.filter(
  (file) => !file.endsWith(".test.ts") && !file.endsWith(".spec.ts"),
);

for (const file of productionFiles) {
  const contents = readFileSync(file, "utf8");
  for (const marker of forbidden) {
    expect(
      contents,
      "forbidden marker " + marker + " in " + file,
    ).not.toContain(marker);
  }
}
expect(existsSync(resolve(authRoot, "src/oauth"))).toBe(false);
```

Acrescente testes de JWT que exijam `typ: at+jwt`, `denies` e `auth_time` e recusem `ver`. Acrescente teste de RBAC comprovando que a resolução retorna allows e denies separados e que `deny event:delete` vence `*:manage` ao consultar cobertura.

- [ ] **Step 2: Run the tests to verify RED**

```powershell
npm run --silent test:ai apps/auth/src/scope-boundary.test.ts
npm run --silent test:ai apps/auth/src/crypto/jwt.test.ts
npm run --silent test:ai apps/auth/src/rbac/effective-permissions.test.ts
```

Esperado: falhas por arquivos fora de escopo, `typ` antigo, claim `ver` e denies descartados.

- [ ] **Step 3: Remove future-stage code and cookie dependencies**

Exclua os arquivos de OAuth/grants/OTP local/login antigo. Retire `cookie-parser` e seus tipos do `package.json`. Adicione `tsx` como dev dependency para CLIs TypeScript e scripts vazios somente quando a tarefa dona do CLI os implementar; não antecipe comandos quebrados.

Execute `pnpm install --lockfile-only` na raiz e revise o diff do lockfile. Como `pnpm-lock.yaml` já estava modificado na baseline, não stage o arquivo inteiro: selecione somente os hunks do importer `apps/auth`. Se um hunk misturar mudança alheia e mudança necessária de auth sem separação segura, pare antes do commit e peça ao dono da worktree para decidir.

- [ ] **Step 4: Replace the ambient JWK type with a local closed type**

```ts
export interface PublicSigningJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  use: "sig";
  alg: "EdDSA";
}

export function isPublicSigningJwk(value: unknown): value is PublicSigningJwk {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const jwk = value as Record<string, unknown>;
  return (
    jwk.kty === "OKP" &&
    jwk.crv === "Ed25519" &&
    typeof jwk.x === "string" &&
    jwk.x.length > 0 &&
    typeof jwk.kid === "string" &&
    jwk.kid.length > 0 &&
    jwk.use === "sig" &&
    jwk.alg === "EdDSA" &&
    !("d" in jwk)
  );
}
```

Use `PublicSigningJwk` em chave, repositório e serviço. `toPublicJwk` deve copiar somente `kty`, `crv` e `x` do export do Node e acrescentar os quatro campos fixos; nunca faça spread de uma JWK que possa conter `d`.

- [ ] **Step 5: Correct scrypt typing and normalization without weakening limits**

Substitua `promisify(scrypt)` por uma Promise tipada e normalize em NFC:

```ts
function scryptDerive(
  passwordNfc: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passwordNfc, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
```

Antes de executar `scrypt` sobre parâmetros lidos do banco, exija exatamente `N=32768`, `r=8`, `p=1`, salt de 16 bytes e digest de 64 bytes. Hash malformado retorna `false` sem alocar memória arbitrária.

- [ ] **Step 6: Establish the approved domain/JWT/RBAC shapes**

Remova campos de OAuth, `mfaEnabled` e `tokenVersion` de `User`. Implemente:

```ts
export interface EffectivePermissions {
  permissions: Permission[];
  denies: Permission[];
}

export function resolveEffectivePermissions(
  sources: PermissionSources,
): EffectivePermissions {
  const denies = [...new Set(
    sources.directPermissions
      .filter(({ effect }) => effect === "deny")
      .map(({ permission }) => permission)
      .filter(isPermission),
  )].sort();
  const permissions = [...new Set([
    ...sources.rolePermissions.filter(isPermission),
    ...sources.directPermissions
      .filter(({ effect }) => effect === "allow")
      .map(({ permission }) => permission)
      .filter(isPermission),
  ])].sort();
  return { permissions, denies };
}
```

Crie `isAllowed(access, resource, action)`: primeiro expanda a ação específica desejada, negue se qualquer deny específico a cobre, depois procure allow específico, `resource:manage` ou `*:manage`. Um deny em `event:delete` não remove outros allows, mas bloqueia aquela ação mesmo diante de `*:manage`.

Atualize o header e o payload JWT para os contratos compartilhados. A validação criptográfica completa fica na tarefa 4, mas a estrutura já não pode compilar se alguém tentar emitir `ver` ou omitir `denies/auth_time`.

Congele também a taxonomia mínima usada pelas próximas fatias; a tarefa 14
completa o filtro HTTP, mas não renomeia estas classes:

```ts
export type SemanticInputCode =
  | "password_length"
  | "password_control"
  | "password_context"
  | "password_compromised"
  | "invalid_phone"
  | "channel_unavailable";

export type ConflictCode =
  | "email_already_exists"
  | "invalid_status_transition"
  | "would_remove_last_admin"
  | "already_initialized";

export class AuthenticationFailedError extends Error {
  constructor(readonly internalReason: string) {
    super("authentication failed");
  }
}
export class AccessDeniedError extends Error {}
export class SemanticInputError extends Error {
  constructor(readonly safeCode: SemanticInputCode) { super(safeCode); }
}
export class ConflictError extends Error {
  constructor(readonly safeCode: ConflictCode) { super(safeCode); }
}
export class NotFoundError extends Error {}
export class RateLimitedError extends Error {
  constructor(
    readonly retryAfterSeconds: number,
    readonly internalReason: string,
  ) { super("rate limited"); }
}
export class RequiredDependencyUnavailableError extends Error {
  constructor(readonly internalReason: string, options?: ErrorOptions) {
    super("required dependency unavailable", options);
  }
}
```

- [ ] **Step 7: Run focused and package gates**

```powershell
npm run --silent test:ai apps/auth/src/scope-boundary.test.ts
npm run --silent test:ai apps/auth/src/crypto/password.test.ts
npm run --silent test:ai apps/auth/src/crypto/jwt.test.ts
npm run --silent test:ai apps/auth/src/rbac/effective-permissions.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
```

Esperado: `Tests pass` e typecheck sem os dois erros da baseline.

- [ ] **Step 8: Commit**

```powershell
git add apps/auth/nest-cli.json apps/auth/package.json apps/auth/PLANO.md apps/auth/tsconfig.json apps/auth/tsconfig.build.json apps/auth/src
git add -p pnpm-lock.yaml
git commit -m "chore(auth): align skeleton with stage one"
```

---

## Task 2: Bootstrap Validated Configuration and the Nest Process

**Interfaces:**

- Consumes: a taxonomia de erros da tarefa 1 e `SECURITY_POLICY` como única fonte dos TTLs/invariantes fixos.
- Produces: `type EnvSource = Readonly<Record<string, string | undefined>>`, `loadRootEnv(rootDir: string, processEnv: EnvSource): EnvSource`, `getRuntimeEnv(source: EnvSource): RuntimeEnv`, `getMigrationEnv(source: EnvSource): { databaseMigrationUrl: string }`, `getTestDatabaseUrl(source: EnvSource): string | undefined`, `RequestContext` e `AppModule.forRoot(env: RuntimeEnv): DynamicModule`.

**Files:**

- Create: `apps/auth/src/config/load-env.ts`
- Replace: `apps/auth/src/config/env.ts`
- Create: `apps/auth/src/config/security-policy.ts`
- Create: `apps/auth/src/config/env.test.ts`
- Create: `apps/auth/src/main.ts`
- Create: `apps/auth/src/app.module.ts`
- Create: `apps/auth/src/common/clock.ts`
- Create: `apps/auth/src/common/secret-generator.ts`
- Modify: `apps/auth/src/common/request-context.ts`
- Create: `apps/auth/src/http/request-context.middleware.ts`
- Create: `apps/auth/src/http/health.controller.ts`
- Create: `apps/auth/src/http/auth-exception.filter.ts`
- Create: `apps/auth/src/http/http-shell.e2e.test.ts`
- Create: `apps/auth/src/testing/create-test-app.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing environment matrix tests**

Teste separadamente `getRuntimeEnv`, `getMigrationEnv` e `getTestDatabaseUrl`:

```ts
export interface RuntimeEnv {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  issuer: string;
  audience: string;
  publicUrl: URL;
  webAppUrl: URL;
  keyEncryptionKey: Buffer;
  otpProvider: "fake" | "twilio";
  allowFakeOtp: boolean;
  twilioTimeoutMs: number;
  twilioWhatsappEnabled: boolean;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioVerifyServiceSid?: string;
  passwordBlocklistTimeoutMs: number;
  limits: {
    passwordEmail: { attempts: number; windowSeconds: number };
    passwordIp: { attempts: number; windowSeconds: number };
    mfaSendUser: { attempts: number; windowSeconds: number };
    factorCheckAttempt: { attempts: number; windowSeconds: number };
  };
}
```

Casos obrigatórios:

- shell env ganha de arquivo e `.env.local` ganha de `.env`, usando diretório
  temporário e restaurando `process.env` no teardown;
- defaults `127.0.0.1`, `3002`, `timeline-api`, 5000 ms, 2000 ms, limites 5/900, 30/900, 3/600 e 5 por tentativa;
- KEK recusada salvo se for Base64URL canônica de exatamente 32 bytes;
- `AUTH_OTP_PROVIDER=fake` aceito somente com `NODE_ENV=development|test`, host loopback e `AUTH_ALLOW_FAKE_OTP=true`;
- Twilio exige os três segredos;
- WhatsApp recusado na validação de input quando `AUTH_TWILIO_WHATSAPP_ENABLED=false`;
- `AUTH_TEST_DATABASE_URL` ausente é permitido, mas se estiver presente fora de
  `NODE_ENV=test` a configuração falha;
- o runtime não exige nem lê `AUTH_DATABASE_MIGRATION_URL`;
- o migrator exige `AUTH_DATABASE_MIGRATION_URL` e não usa a credencial de runtime como fallback.

Os nomes dos limites são exatamente `AUTH_PASSWORD_EMAIL_LIMIT`,
`AUTH_PASSWORD_IP_LIMIT`, `AUTH_PASSWORD_WINDOW_SECONDS`,
`AUTH_MFA_SEND_LIMIT`, `AUTH_MFA_SEND_WINDOW_SECONDS` e
`AUTH_MFA_CHECK_LIMIT`. O check usa a validade de 600 segundos do próprio
attempt como janela; não crie outra variável de janela.

A allowlist completa de variáveis é:

```text
NODE_ENV
AUTH_PORT
AUTH_HOST
AUTH_DATABASE_URL
AUTH_DATABASE_MIGRATION_URL
AUTH_TEST_DATABASE_URL
AUTH_ISSUER
AUTH_AUDIENCE
AUTH_PUBLIC_URL
AUTH_WEB_APP_URL
AUTH_KEY_ENCRYPTION_KEY
AUTH_OTP_PROVIDER
AUTH_ALLOW_FAKE_OTP
AUTH_TWILIO_TIMEOUT_MS
AUTH_TWILIO_WHATSAPP_ENABLED
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID
AUTH_PASSWORD_BLOCKLIST_TIMEOUT_MS
AUTH_PASSWORD_EMAIL_LIMIT
AUTH_PASSWORD_IP_LIMIT
AUTH_PASSWORD_WINDOW_SECONDS
AUTH_MFA_SEND_LIMIT
AUTH_MFA_SEND_WINDOW_SECONDS
AUTH_MFA_CHECK_LIMIT
```

`AUTH_REQUIRE_POSTGRES_TESTS` pertence somente ao helper Vitest e nunca entra em
`RuntimeEnv`.

- [ ] **Step 2: Run RED**

```powershell
npm run --silent test:ai apps/auth/src/config/env.test.ts
```

- [ ] **Step 3: Implement root env loading and closed configuration parsing**

Copie a precedência já adotada pelo monorepo: carregue `.env.local` e depois `.env` com `process.loadEnvFile`, sem sobrescrever variáveis do processo. Use schemas Zod com `.strict()` para objetos internos, conversões explícitas e mensagens sem valores secretos.

Mantenha TTLs e invariantes não configuráveis em `security-policy.ts`:

```ts
export const SECURITY_POLICY = {
  accessTokenTtlSeconds: 900,
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  inviteTtlSeconds: 7 * 24 * 60 * 60,
  authenticationAttemptTtlSeconds: 10 * 60,
  mfaChallengeTtlSeconds: 5 * 60,
  clockToleranceSeconds: 30,
  recoveryCodeCount: 10,
  recoveryCodeEntropyBits: 80,
  signingKeyRetireDelaySeconds: 930,
  maxRequestBodyBytes: 32 * 1024,
} as const;
```

- [ ] **Step 4: Write the failing process-shell E2E test**

Suba uma aplicação Nest real em porta efêmera e use `fetch` nativo para provar:

- `GET /health/live` → `200 {"status":"ok"}`;
- método ou rota desconhecida usa JSON genérico, sem stack;
- cada resposta recebe `X-Correlation-Id`;
- um correlation id válido recebido (`^[A-Za-z0-9._-]{1,128}$`) é preservado; valor inválido é substituído por ULID;
- IP vem de `request.socket.remoteAddress` mesmo com `X-Forwarded-For` falso;
- body maior que 32 KiB produz `413` seguro.

- [ ] **Step 5: Implement the Nest shell**

`main.ts` carrega env antes de importar/criar providers, cria `AppModule.forRoot(env)`, desliga `x-powered-by`, configura parser JSON com limite, middleware de contexto, filtro global e escuta em `env.host/env.port`. Não habilite CORS nem cookies nesta etapa.

Use um request context imutável:

```ts
export interface RequestContext {
  correlationId: string;
  ipAddress: string | null;
  userAgent: string | null;
}
```

Implemente desde já a taxonomia congelada na tarefa 1 e a matriz completa:
400/413 seguros, 422 allowlisted, 401/403 vazios, 404 administrativo
`{"code":"not_found"}`, 409 allowlisted, 429 vazio com `Retry-After`, 503
genérico e 500 com correlation id. Isso evita que as fatias 5–13 criem
mapeamentos ad hoc em controllers. A tarefa 14 adiciona a prova exaustiva e a
redação, sem mudar o contrato. Erro 500 responde:

```json
{"code":"internal_error","correlationId":"01K4A7W2F6M8R9T0V1X3Y5Z7AB"}
```

- [ ] **Step 6: Document environment keys**

Acrescente uma seção `auth` em `.env.example` com todos os nomes da spec, exemplos não secretos, KEK descrita como `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` e comentário explícito de que URLs de runtime/migração são credenciais distintas em produção.

- [ ] **Step 7: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/config/env.test.ts
npm run --silent test:ai apps/auth/src/http/http-shell.e2e.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add .env.example apps/auth/src
git commit -m "feat(auth): bootstrap validated service configuration"
```

---

## Task 3: Add Incremental Postgres Infrastructure, Audit, and Persistent Rate Limits

**Interfaces:**

- Consumes: `RuntimeEnv.databaseUrl`, `getMigrationEnv`, `RequestContext`, `RequiredDependencyUnavailableError` e `SECURITY_POLICY`.
- Produces: `AuthDatabase`, `AuthTransaction`, `migrateAuthDatabase(databaseUrl: string): Promise<void>`, `checkReadiness(db: AuthDatabase, expectedVersion: number): Promise<void>`, `insertAuditEvents(tx: AuthTransaction, events: readonly AuditEventInput[]): Promise<void>`, `AuditLog.record(event: AuditEventInput): Promise<void>` e `RateLimiter.hit(input: { scope: RateLimitScope; subject: string; limit: number; windowSeconds: number; now: Date }): Promise<{ allowed: boolean; retryAfterSeconds: number }>`.

**Files:**

- Create: `apps/auth/compose.test.yaml`
- Create: `apps/auth/drizzle.config.ts`
- Create: `apps/auth/drizzle/0000_infrastructure.sql`
- Create: `apps/auth/drizzle/rollback/0000_infrastructure.down.sql`
- Create: `apps/auth/drizzle/meta/0000_snapshot.json`
- Create: `apps/auth/drizzle/meta/_journal.json`
- Create: `apps/auth/src/db/schema.ts`
- Create: `apps/auth/src/db/client.ts`
- Create: `apps/auth/src/db/db.module.ts`
- Create: `apps/auth/src/db/migrate.ts`
- Create: `apps/auth/src/db/migrate.cli.ts`
- Create: `apps/auth/src/db/migrations.integration.test.ts`
- Create: `apps/auth/src/db/transaction-locks.ts`
- Create: `apps/auth/src/db/readiness.ts`
- Create: `apps/auth/src/testing/postgres-test-database.ts`
- Create: `apps/auth/src/testing/postgres-runtime-role.ts`
- Create: `apps/auth/src/db/runtime-privileges.integration.test.ts`
- Replace: `apps/auth/src/common/audit.ts` with the `audit` module below
- Delete: `apps/auth/src/common/rate-limiter.ts`
- Create: `apps/auth/src/audit/audit-event.ts`
- Create: `apps/auth/src/audit/audit-redaction.ts`
- Create: `apps/auth/src/audit/ports/audit-log.ts`
- Create: `apps/auth/src/audit/postgres-audit-log.ts`
- Create: `apps/auth/src/audit/postgres-audit-log.integration.test.ts`
- Create: `apps/auth/src/rate-limit/rate-limit-key.ts`
- Create: `apps/auth/src/rate-limit/rate-limiter.ts`
- Create: `apps/auth/src/rate-limit/postgres-rate-limiter.ts`
- Create: `apps/auth/src/rate-limit/postgres-rate-limiter.integration.test.ts`
- Create: `apps/auth/src/testing/in-memory-audit-log.ts`
- Create: `apps/auth/src/testing/in-memory-rate-limiter.ts`
- Modify: `apps/auth/package.json`

- [ ] **Step 1: Add the disposable Postgres service**

`compose.test.yaml` deve fixar Postgres 17, porta 55432, health check e armazenamento `tmpfs`:

```yaml
services:
  auth-postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: timeline_auth_test
      POSTGRES_USER: auth_test
      POSTGRES_PASSWORD: auth_test
    ports:
      - "55432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U auth_test -d timeline_auth_test"]
      interval: 1s
      timeout: 3s
      retries: 30
    tmpfs:
      - /var/lib/postgresql/data
```

O helper de teste cria por arquivo um schema isolado cujo nome é `auth_test_` seguido de um ULID minúsculo, define `search_path` na conexão e o remove no teardown com o nome já validado por `/^[a-z0-9_]+$/`. Nunca apague database/schema derivado de string não validada.

O helper também passa um `migrationsSchema` exclusivo
formado por `drizzle_auth_test_` seguido do mesmo ULID ao migrator; a tabela de journal do
Drizzle não pode ser compartilhada por testes paralelos.

`describeWithPostgres` escolhe `describe` quando a URL existe,
`describe.skip` somente quando ela falta e o sentinela está desligado, e lança
na carga do módulo quando `AUTH_REQUIRE_POSTGRES_TESTS=true` sem URL. Teste as
três combinações para impedir um gate verde por skip acidental.

Depois da migração, o helper cria uma role runtime de nome/senha aleatórios e
validados, concede acesso apenas ao schema daquele teste e devolve uma URL
runtime separada. A URL em `AUTH_TEST_DATABASE_URL` continua sendo a credencial
de migração/owner; nenhum teste de aplicação deve reutilizá-la como runtime.

- [ ] **Step 2: Write failing migration tests**

Prove:

- banco/schema vazio → `migrate` → versão `1`;
- segunda execução não altera nada;
- tabelas `auth_schema_meta`, `audit_log`, `rate_limit_buckets` e `signing_keys` existem;
- trigger recusa `UPDATE` e `DELETE` em `audit_log`;
- role runtime consegue `INSERT` em `audit_log`, mas `SELECT`, `UPDATE`,
  `DELETE` e DDL falham por privilégio;
- migrator executado com a URL runtime falha; somente a URL de migração altera
  schema/journal;
- índice parcial recusa duas chaves `active`;
- `0000_infrastructure.down.sql` funciona somente no schema descartável; um
  schema fresco volta a aplicar o up (não manipule journal manualmente);
- não existem tabelas `identities`, `oauth_states` ou `access_grants`.

- [ ] **Step 3: Implement migration 0000 and the migrator**

Use Drizzle para declarar os tipos e SQL explícito para constraints/triggers:

```powershell
pnpm --filter @repo/auth run db:generate -- --name infrastructure
```

```sql
CREATE TABLE auth_schema_meta (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version integer NOT NULL CHECK (version >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id text PRIMARY KEY,
  correlation_id text NOT NULL,
  actor_user_id text,
  action text NOT NULL,
  target_type text,
  target_id text,
  result text NOT NULL CHECK (result IN ('succeeded', 'failed')),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz NOT NULL
);

CREATE TABLE rate_limit_buckets (
  scope text NOT NULL CHECK (
    scope IN ('password_email', 'password_ip', 'mfa_send_user', 'factor_check_attempt')
  ),
  subject_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_expires_at timestamptz NOT NULL,
  hit_count integer NOT NULL CHECK (hit_count > 0),
  blocked_until timestamptz,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (scope, subject_hash)
);
```

`signing_keys` já nasce aqui porque readiness precisa garantir uma chave ativa: `kid` PK, status fechado, `public_jwk jsonb`, `encrypted_private_key text null`, `created_at`, `last_used_at`, `retire_after`, `retired_at`, check que retired não possui material privado e índice parcial único `WHERE status='active'`.

Crie trigger `reject_audit_mutation()` que lança exceção em `UPDATE`/`DELETE`. Finalize a migração com upsert do singleton para versão 1. O migrator recebe URL explicitamente; não acessa `AUTH_DATABASE_URL`.

```ts
export async function migrateAuthDatabase(input: {
  migrationDatabaseUrl: string;
  migrationsFolder: string;
  migrationsSchema?: string;
}): Promise<void> {
  const pool = new Pool({ connectionString: input.migrationDatabaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: input.migrationsFolder,
      migrationsSchema: input.migrationsSchema,
    });
  } finally {
    await pool.end();
  }
}
```

Configure `db:migrate` como `tsx src/db/migrate.cli.ts` e `db:generate` com `--config drizzle.config.ts`.

O helper de privilégios, espelhado no runbook de produção, valida/escapa os dois
identificadores e aplica nesta ordem:

```sql
REVOKE ALL ON SCHEMA auth_test_01k4a7w2f6m8r9t0v1x3y5z7ab
  FROM auth_runtime_01k4a7w2f6m8r9t0v1x3y5z7ab;
GRANT USAGE ON SCHEMA auth_test_01k4a7w2f6m8r9t0v1x3y5z7ab
  TO auth_runtime_01k4a7w2f6m8r9t0v1x3y5z7ab;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA
  auth_test_01k4a7w2f6m8r9t0v1x3y5z7ab
  TO auth_runtime_01k4a7w2f6m8r9t0v1x3y5z7ab;
REVOKE ALL ON auth_test_01k4a7w2f6m8r9t0v1x3y5z7ab.audit_log
  FROM auth_runtime_01k4a7w2f6m8r9t0v1x3y5z7ab;
GRANT INSERT ON auth_test_01k4a7w2f6m8r9t0v1x3y5z7ab.audit_log
  TO auth_runtime_01k4a7w2f6m8r9t0v1x3y5z7ab;
```

Não conceda `CREATE` no schema. Reaplique grants após cada migração que criar
tabelas; a tarefa 15 documenta o comando operacional.

- [ ] **Step 4: Centralize database tokens and advisory locks**

```ts
export const AUTH_POOL = "AUTH_POOL";
export const AUTH_DATABASE = "AUTH_DATABASE";
export const AUDIT_LOG = "AUDIT_LOG";
export const RATE_LIMITER = "RATE_LIMITER";
export const SIGNING_KEY_REPOSITORY = "SIGNING_KEY_REPOSITORY";
export const USER_REPOSITORY = "USER_REPOSITORY";
export const RBAC_REPOSITORY = "RBAC_REPOSITORY";
export const INVITE_REPOSITORY = "INVITE_REPOSITORY";
export const AUTHENTICATION_REPOSITORY = "AUTHENTICATION_REPOSITORY";
export const SESSION_REPOSITORY = "SESSION_REPOSITORY";
```

`transaction-locks.ts` expõe nomes estáveis e uma função que usa `pg_advisory_xact_lock(hashtextextended($1, 0))`:

```ts
export const ADVISORY_LOCK = {
  bootstrapAdmin: "timeline-auth:bootstrap-admin",
  capableAdmin: "timeline-auth:capable-admin",
  signingKey: "timeline-auth:signing-key",
  cleanup: "timeline-auth:cleanup",
} as const;
```

- [ ] **Step 5: Write RED tests for append-only audit and rate limiting**

Contratos:

```ts
export type AuditResult = "succeeded" | "failed";

export type AuditAction =
  | "bootstrap.admin_created"
  | "bootstrap.admin_reissued"
  | "invite.created"
  | "invite.reissued"
  | "invite.revoked"
  | "invite.inspected"
  | "invite.acceptance_started"
  | "invite.accepted"
  | "invite.failed"
  | "login.started"
  | "login.succeeded"
  | "login.failed"
  | "mfa.sent"
  | "mfa.resent"
  | "mfa.verified"
  | "mfa.failed"
  | "recovery.generated"
  | "recovery.used"
  | "recovery.regenerated"
  | "session.issued"
  | "session.refreshed"
  | "session.revoked"
  | "session.revoked_all"
  | "token.reuse_detected"
  | "step_up.started"
  | "step_up.verified"
  | "step_up.consumed"
  | "step_up.failed"
  | "password.changed"
  | "user.status_changed"
  | "access.changed"
  | "key.created"
  | "key.rotated"
  | "key.retired"
  | "cleanup.completed";

export type AuditMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly AuditMetadataValue[]
  | { readonly [key: string]: AuditMetadataValue };

export interface AuditEventInput {
  correlationId: string;
  actorUserId: string | null;
  action: AuditAction;
  targetType: string | null;
  targetId: string | null;
  result: AuditResult;
  reason: string | null;
  metadata: Readonly<Record<string, AuditMetadataValue>>;
  context: RequestContext;
  occurredAt: Date;
}

export interface AuditLog {
  record(event: AuditEventInput): Promise<void>;
}

export type RateLimitScope =
  | "password_email"
  | "password_ip"
  | "mfa_send_user"
  | "factor_check_attempt";

export interface RateLimiter {
  hit(input: {
    scope: RateLimitScope;
    subject: string;
    limit: number;
    windowSeconds: number;
    now: Date;
  }): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}
```

Testes de integração usam duas pools para provar incremento atômico entre réplicas, persistência após restart, reset exato na fronteira da janela e incremento antes do callback de trabalho caro.

Nos testes de cada transição, exija os eventos específicos. Aceite insere
`mfa.verified`, `invite.accepted`, `recovery.generated` e `session.issued`;
login insere o fator usado, `login.succeeded` e `session.issued`; troca de
senha insere `step_up.consumed`, `password.changed`,
`session.revoked_all` e `session.issued`. Falhas sem mutação usam a action do
fluxo com `result="failed"` e razão interna.

Exporte `insertAuditEvents(tx, events)` para os repositórios atômicos. Ele
exige array não vazio, aplica a mesma redação de `AuditLog.record` e usa a
transação recebida; é proibido chamar `AuditLog.record` de dentro de outra
transação.

- [ ] **Step 6: Implement redaction, HMAC keys, and atomic counters**

`assertSafeAuditEvent` percorre recursivamente metadata, limita
profundidade/quantidade/tamanho e recusa chaves `password`, `otp`, `code`,
`token`, `secret`, `authorization`, `cookie` e `privateKey`. Aceite somente o
JSON fechado de `AuditMetadataValue`; recuse `Date`, `Buffer`, funções,
`undefined` e objetos com protótipo customizado. Não tente “mascarar” segredo
depois de recebê-lo: falhe antes do insert.

Derive a chave de rate limit sem expor a KEK:

```ts
const RATE_LIMIT_KEY = Buffer.from(
  hkdfSync(
    "sha256",
    keyEncryptionKey,
    Buffer.alloc(0),
    "timeline-auth-rate-limit",
    32,
  ),
);

export function rateLimitSubjectHash(
  key: Buffer,
  scope: RateLimitScope,
  normalizedSubject: string,
): string {
  return createHmac("sha256", key)
    .update(scope)
    .update("\0")
    .update(normalizedSubject)
    .digest("base64url");
}
```

O upsert do bucket calcula a janela no banco, incrementa uma vez antes do trabalho e devolve `Retry-After` arredondado para cima. Nunca persista e-mail ou IP em claro.

- [ ] **Step 7: Add readiness primitives**

`readiness.ts` executa `SELECT 1`, lê `auth_schema_meta.version` e recebe `expectedVersion`. Nesta tarefa o esperado é 1; tarefas 5 e 8 o elevam. A chave ativa será incorporada à resposta ready na tarefa 4. `live` nunca consulta dependências.

Acrescente E2E com schema vazio e schema na versão 0: subir a aplicação não
cria tabela, não altera `auth_schema_meta` e não chama o migrator;
`/health/live` responde 200 e `/health/ready` responde 503 até
`migrateAuthDatabase` ser chamado explicitamente. Depois da migração,
readiness passa pela checagem de banco/schema (a exigência da chave entra na
tarefa 4).

- [ ] **Step 8: Verify and commit**

```powershell
docker compose -f apps/auth/compose.test.yaml up -d --wait
$env:NODE_ENV = "test"
$env:AUTH_TEST_DATABASE_URL = "postgresql://auth_test:auth_test@127.0.0.1:55432/timeline_auth_test"
$env:AUTH_REQUIRE_POSTGRES_TESTS = "true"
npm run --silent test:ai apps/auth/src/db/migrations.integration.test.ts
npm run --silent test:ai apps/auth/src/db/runtime-privileges.integration.test.ts
npm run --silent test:ai apps/auth/src/audit/postgres-audit-log.integration.test.ts
npm run --silent test:ai apps/auth/src/rate-limit/postgres-rate-limiter.integration.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth
git commit -m "feat(auth): add transactional Postgres foundation"
```

---

## Task 4: Issue Strict EdDSA Tokens and Publish a Rotation-Safe JWKS

**Interfaces:**

- Consumes: `AuthTransaction`, `AuditEventInput`, `PublicSigningJwk`, `SignAccessToken`, `UnsignedAccessTokenClaims`, `SECURITY_POLICY` e a KEK validada.
- Produces: `buildUnsignedAccessTokenClaims(input: Omit<UnsignedAccessTokenClaims, "iat" | "exp"> & { now: Date }): UnsignedAccessTokenClaims`, `verifyJwt(token: string, keys: readonly PublicSigningJwk[], expectedIssuer: string, expectedAudience: string, now: Date): AccessTokenClaims`, `SigningKeyRepository`, `lockActiveSigningKey(tx: AuthTransaction, now: Date): Promise<SigningKeyForSigning>`, `SigningKeyService.signAccessToken` e `SigningKeyService.publicKeyFor(kid: string): Promise<PublicSigningJwk | null>`.

**Files:**

- Modify: `apps/auth/src/crypto/jwt.ts`
- Modify: `apps/auth/src/crypto/jwt.test.ts`
- Modify: `apps/auth/src/crypto/signing-key.ts`
- Modify: `apps/auth/src/crypto/signing-key.service.ts`
- Modify: `apps/auth/src/crypto/ports/signing-key-repository.ts`
- Create: `apps/auth/src/crypto/postgres-signing-key.repository.ts`
- Create: `apps/auth/src/crypto/postgres-signing-key.repository.integration.test.ts`
- Create: `apps/auth/src/crypto/rotate-signing-key.cli.ts`
- Create: `apps/auth/src/http/jwks.controller.ts`
- Create: `apps/auth/src/http/jwks.e2e.test.ts`
- Modify: `apps/auth/src/http/health.controller.ts`
- Modify: `apps/auth/src/db/readiness.ts`
- Modify: `apps/auth/src/db/db.module.ts`
- Modify: `apps/auth/src/app.module.ts`
- Modify: `apps/auth/package.json`

- [ ] **Step 1: Write the strict JWT tests**

Cubra assinatura e validação com `node:crypto`:

- header exatamente `{"alg":"EdDSA","typ":"at+jwt","kid":"kid-test-1"}` no fixture;
- todos os claims obrigatórios e tipos fechados;
- `exp`, `iat` e `auth_time` como inteiros NumericDate;
- `exp - iat === 900`; token corretamente assinado com TTL maior ou menor é recusado;
- `iat` e `auth_time` não podem estar mais de 30 segundos no futuro;
- `exp` precisa ser posterior a `iat` e ainda válido;
- `perms` e `denies` passam por `isPermission`;
- `roles` são strings não vazias e únicas;
- `amr` contém somente `pwd`, `otp` ou `recovery`, sem duplicatas;
- `sub`, `sid`, `jti`, `iss`, `aud` e `kid` são strings não vazias;
- algoritmo, `typ`, issuer, audience, `kid`, assinatura, JSON e Base64URL inválidos falham;
- propriedades extras no header ou payload falham, inclusive `ver`;
- assinatura sempre gera `jti` novo.

O parser trata input como `unknown` e só retorna `AccessTokenClaims` depois de validar; não use cast genérico de `JSON.parse` como prova de tipo.

Centralize `iat/exp` em `buildUnsignedAccessTokenClaims`; todos os fluxos
passam `now` e o builder fixa `exp = iat + 900`. Repositórios não montam esses
dois campos manualmente.

- [ ] **Step 2: Run JWT RED**

```powershell
npm run --silent test:ai apps/auth/src/crypto/jwt.test.ts
```

- [ ] **Step 3: Implement the signing repository contract**

```ts
export type SigningKeyStatus = "active" | "retiring" | "retired";

export interface StoredSigningKey {
  kid: string;
  status: SigningKeyStatus;
  publicJwk: PublicSigningJwk;
  encryptedPrivateKey: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  retireAfter: Date | null;
  retiredAt: Date | null;
}

export interface NewStoredSigningKey {
  kid: string;
  publicJwk: PublicSigningJwk;
  encryptedPrivateKey: string;
}

export interface SigningKeyRepository {
  ensureActive(
    candidate: NewStoredSigningKey,
    now: Date,
    audit: AuditEventInput,
  ): Promise<StoredSigningKey>;
  rotate(
    candidate: NewStoredSigningKey,
    now: Date,
    audit: AuditEventInput,
  ): Promise<StoredSigningKey>;
  listPublishable(): Promise<StoredSigningKey[]>;
}
```

`ensureActive` e `rotate` geram o candidato fora da transação, adquirem o advisory lock exclusivo `timeline-auth:signing-key` e inserem auditoria no mesmo commit. Em rotação, marque a anterior `retiring` e calcule `retire_after = max(now, last_used_at) + 930 seconds` antes de inserir/promover a nova.

Para emissão dentro de qualquer repositório transacional, exponha um helper interno, não um CRUD público:

```ts
export async function lockActiveSigningKey(
  tx: AuthTransaction,
  now: Date,
): Promise<SigningKeyForSigning> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock_shared(
    hashtextextended('timeline-auth:signing-key', 0)
  )`);
  const key = await selectActiveKeyForKeyShare(tx);
  if (!key?.encryptedPrivateKey) throw new NoActiveSigningKeyError();
  await touchLastUsedAt(tx, key.kid, now);
  return {
    kid: key.kid,
    encryptedPrivateKey: key.encryptedPrivateKey,
  };
}
```

O lock advisory compartilhado permite emissões concorrentes, mas é incompatível com rotação. A leitura `FOR KEY SHARE` e o update monotônico de `last_used_at = greatest(last_used_at, now)` mantêm a linha viva. Todas as transações que emitem sessão usam esse helper; nenhuma lê uma chave em cache sem confirmar no banco qual `kid` está ativo.

- [ ] **Step 4: Prove rotation/emission concurrency in Postgres**

Use duas conexões e uma barreira controlável:

1. emissão adquire lock compartilhado e pausa antes de assinar;
2. rotação começa em outra conexão e permanece bloqueada;
3. emissão assina/commita;
4. rotação conclui;
5. emissão seguinte usa somente o novo `kid`.

Teste também duas rotações concorrentes, bootstrap concorrente sem chave, rollback quando auditoria falha e a invariante de exatamente uma chave ativa.

Acrescente o cenário integrado: emitir T1 com K1, rotacionar para K2, emitir T2,
buscar um único snapshot JWKS contendo K1 `retiring` e K2 `active` e validar T1
e T2 usando somente esse snapshot, com pool fechado e nenhum callback ao auth.
Avance o relógio até 929 segundos e prove que K1 ainda está publicada; somente
depois do prazo de aposentadoria ela pode sair.

- [ ] **Step 5: Implement cached private material and strict signing**

`SigningKeyService` recebe a KEK, valida a JWK pública, descriptografa PKCS8 somente quando encontra um `kid` ainda ausente no cache e armazena `KeyObject` por `kid`. O callback `SignAccessToken` permanece síncrono:

```ts
signAccessToken = (
  key: SigningKeyForSigning,
  claims: UnsignedAccessTokenClaims,
): string => {
  const privateKey = this.privateKeyFor(key);
  return signJwt(
    { ...claims, jti: this.secretGenerator.randomId() },
    { kid: key.kid, privateKey },
  );
};
```

Não mantenha uma propriedade “active key” em cache. A transação decide o `kid` ativo e o cache guarda somente material imutável por `kid`.

Para verificação dentro do próprio auth, `publicKeyFor(kid)` consulta primeiro
o snapshot em memória. Em miss, uma única Promise coalescida recarrega
`listPublishable` e substitui o snapshot; misses concorrentes não disparam N
queries. Cacheie resultado negativo por cinco segundos para limitar kids
aleatórios. A função pura `verifyJwt` continua aceitando um snapshot síncrono,
o que permite aos serviços consumidores validar sem banco.

Teste 20 misses concorrentes → uma leitura; o mesmo kid ausente dentro de cinco
segundos → zero leituras adicionais; K2 recém-rotacionada → uma recarga e
validação bem-sucedida.

- [ ] **Step 6: Publish JWKS with cache validation**

`GET /.well-known/jwks.json` publica somente `active` e `retiring`, ordenadas por `kid`. Canonicalize o JSON, calcule ETag forte com SHA-256 e configure:

```text
Cache-Control: public, max-age=300, stale-if-error=3600
ETag: "sha256-Y2Fub25pY2FsLWp3a3M"
Content-Type: application/json; charset=utf-8
```

`If-None-Match` igual retorna `304` sem corpo. Prove que `d`, `encryptedPrivateKey` e demais colunas nunca aparecem.

- [ ] **Step 7: Wire startup, readiness, and the rotation CLI**

No bootstrap, gere uma chave candidata e chame `ensureActive`. `GET /health/ready` retorna `200 {"status":"ok"}` somente se Postgres responde, schema está na versão esperada e existe uma chave ativa utilizável; caso contrário retorna `503 {"code":"service_unavailable"}`. Não chame Twilio ou HIBP.

Adicione:

```json
{
  "scripts": {
    "rotate-signing-key": "tsx src/crypto/rotate-signing-key.cli.ts"
  }
}
```

O CLI carrega env, gera chave, chama a transação de rotação, imprime apenas `kid`/status/data e sai com código diferente de zero sem imprimir segredo.

- [ ] **Step 8: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/crypto/jwt.test.ts
npm run --silent test:ai apps/auth/src/crypto/postgres-signing-key.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/http/jwks.e2e.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth
git commit -m "feat(auth): issue strict EdDSA access tokens"
```

---

## Task 5: Add Users, RBAC, Invitations, Bootstrap, and Public Inspection

**Interfaces:**

- Consumes: `MfaChannel`, `ResolvedAccess`, `AuditEventInput`, `RequestContext`, `isAllowed` e `AuthTransaction`.
- Produces: `User`, `UserRepository`, `Role`, `UserAccess`, `RbacRepository`, `InviteInspection`, `InviteRepository`, `BootstrapAdminCommand`, `BootstrapAdminCommitOutcome`, `BootstrapAdminOutcome`, `coversSuperAdmin(access: ResolvedAccess): boolean` e `inviteLink(webAppUrl: URL, token: string): string`.

**Files:**

- Create: `apps/auth/drizzle/0001_users_invites.sql`
- Create: `apps/auth/drizzle/rollback/0001_users_invites.down.sql`
- Create: `apps/auth/drizzle/meta/0001_snapshot.json`
- Modify: `apps/auth/src/db/schema.ts`
- Modify: `apps/auth/src/db/readiness.ts`
- Modify: `apps/auth/src/db/migrations.integration.test.ts`
- Replace: `apps/auth/src/users/user.ts`
- Create: `apps/auth/src/users/ports/user-repository.ts`
- Create: `apps/auth/src/users/postgres-user.repository.ts`
- Create: `apps/auth/src/rbac/ports/rbac-repository.ts`
- Create: `apps/auth/src/rbac/resolve-user-permissions.ts`
- Create: `apps/auth/src/rbac/postgres-rbac.repository.ts`
- Replace: `apps/auth/src/invites/invite.ts`
- Replace: `apps/auth/src/invites/ports/invite-repository.ts`
- Create: `apps/auth/src/invites/postgres-invite.repository.ts`
- Create: `apps/auth/src/invites/usecases/inspect-invite.usecase.ts`
- Create: `apps/auth/src/invites/usecases/bootstrap-admin.usecase.ts`
- Create: `apps/auth/src/cli/bootstrap-admin.cli.ts`
- Create: `apps/auth/src/http/public-auth.controller.ts`
- Create: `apps/auth/src/http/public-auth.controller.e2e.test.ts`
- Create tests next to every repository/use case above
- Modify: `apps/auth/src/db/db.module.ts`
- Modify: `apps/auth/src/app.module.ts`
- Modify: `apps/auth/package.json`

- [ ] **Step 1: Write migration RED tests for users, access, and invites**

Antes de criar `0001`, escreva as assertions de versão/tabelas/seeds abaixo e rode:

```powershell
npm run --silent test:ai apps/auth/src/db/migrations.integration.test.ts
```

Esperado: RED porque `users` ainda não existe e a versão é 1. Depois atualize
`schema.ts`, gere os artefatos e complete o SQL. Migração `0001` cria:

```powershell
pnpm --filter @repo/auth run db:generate -- --name users_invites
```

```text
users
  id, email, name, password_hash, phone_e164, phone_verified_at,
  mfa_channel, status, created_at, updated_at
roles
  key, name, description, is_system, created_at
role_permissions
  role_key, permission
user_roles
  user_id, role_key
user_permissions
  user_id, permission, effect
invites
  id, token_hash, user_id, issuer_user_id, expires_at,
  accepted_at, revoked_at, created_at
```

Prove as constraints:

- e-mail único, normalizado, não vazio;
- status somente `pending_invite|active|suspended|disabled`;
- `active` exige hash, telefone E.164, canal e `phone_verified_at`;
- canal somente `sms|whatsapp`;
- relações RBAC únicas e permission/effect no catálogo fechado;
- token hash de convite único;
- no máximo um convite não aceito/não revogado por usuário;
- FKs não deixam relações órfãs;
- seed idempotente cria exatamente `admin`, `member` e `viewer` com as permissões exatas da spec.

Finalize com `auth_schema_meta.version = 2` e eleve `EXPECTED_SCHEMA_VERSION` para 2.
Reaplique o helper de grants e prove que a role runtime acessa as tabelas
novas sem ganhar `SELECT` em audit ou DDL.
No schema descartável, `0001_users_invites.down.sql` remove somente essa fatia,
restaura versão 1 e não toca infraestrutura/audit; um schema fresco aplica up
com sucesso.

- [ ] **Step 2: Define the domain and atomic repository contracts**

```ts
export type UserStatus =
  | "pending_invite"
  | "active"
  | "suspended"
  | "disabled";

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  phoneE164: string | null;
  phoneVerifiedAt: Date | null;
  mfaChannel: MfaChannel | null;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(normalizedEmail: string): Promise<User | null>;
}

export interface Role {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: Permission[];
}

export interface UserAccess {
  roleKeys: string[];
  directPermissions: DirectPermission[];
}

export interface InviteInspection {
  inviteId: string;
  userId: string;
  name: string;
  email: string;
  expiresAt: Date;
}

export interface BootstrapAdminCommand {
  email: string;
  name: string;
  userId: string;
  invite: {
    id: string;
    tokenHash: string;
    expiresAt: Date;
  };
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export type BootstrapAdminCommitOutcome =
  | { kind: "created"; userId: string }
  | { kind: "reissued"; userId: string }
  | { kind: "already_initialized" }
  | { kind: "conflicting_pending_admin" };

export interface RbacRepository {
  listRoles(): Promise<Role[]>;
  findRoles(keys: readonly string[]): Promise<Role[]>;
  accessOf(userId: string): Promise<UserAccess>;
  resolvedAccessOf(userId: string): Promise<ResolvedAccess>;
}

export interface InviteRepository {
  inspectByTokenHash(hash: string, now: Date): Promise<InviteInspection | null>;
  bootstrapAdmin(
    command: BootstrapAdminCommand,
  ): Promise<BootstrapAdminCommitOutcome>;
}
```

As portas não expõem `save` genérico. `ResolvedAccess` preserva `roleKeys`, `permissions` e `denies`.

- [ ] **Step 3: Implement permission resolution and capable-admin semantics**

Carregue papéis e permissões diretas numa única fotografia transacional. Ordene/deduplique claims.

`coversSuperAdmin(access)` exige primeiro um allow literal `*:manage` e depois
`isAllowed` true para todas as 30 combinações de recurso/ação do catálogo.
Portanto 30 allows específicos não substituem `*:manage`, e `*:manage` com
qualquer deny específico não é um administrador capaz. A mesma função será
usada pelo guard administrativo e pelo lockout invariant na tarefa 13.

- [ ] **Step 4: Write bootstrap and invite inspection RED tests**

Casos do bootstrap:

- banco sem admin cria um `pending_invite` com role `admin` e um convite;
- duas execuções concorrentes criam um único usuário/admin;
- reexecução do mesmo e-mail normalizado enquanto ele é o único admin pendente revoga o convite anterior e emite outro;
- e-mail diferente, mais de um admin, admin ativo/suspenso/disabled ou estado incoerente recusam;
- falha de FK/auditoria no meio não deixa usuário/RBAC/convite parcial;
- saída do CLI contém exatamente um link e nunca hash/SQL/stack.

Inspeção:

- token válido devolve somente `name`, e-mail mascarado e expiração;
- inválido, expirado, aceito ou revogado retorna o mesmo erro de autenticação;
- token é recebido no corpo e nunca aparece na URL.

- [ ] **Step 5: Implement atomic bootstrap and one-time links**

Adquira `timeline-auth:bootstrap-admin`, conte admins sob a mesma transação, normalize e valide input, insira usuário/RBAC/convite/auditoria. Gere token de 256 bits fora da transação e persista SHA-256.

`BootstrapAdminOutcome`:

```ts
export type BootstrapAdminOutcome =
  | { kind: "created"; userId: string; inviteToken: string }
  | { kind: "reissued"; userId: string; inviteToken: string }
  | { kind: "already_initialized" }
  | { kind: "conflicting_pending_admin" };
```

O repositório nunca recebe nem devolve o token bruto.
`BootstrapAdminUseCase` conserva o candidato em memória, chama a porta com
apenas o hash e só acrescenta `inviteToken` ao outcome quando o commit retorna
`created` ou `reissued`.

Construa o link sem interpolação em query:

```ts
export function inviteLink(webAppUrl: URL, token: string): string {
  const url = new URL("/convites/aceitar", webAppUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
```

- [ ] **Step 6: Expose inspect and wire the CLI**

`POST /auth/invites/inspect` aceita `{"token":"dGVzdC1pbnZpdGUtdG9rZW4"}` no fixture. A controller nunca loga body. Masking preserva o primeiro code point da parte local e o domínio, por exemplo `a***@dominio.com`; entradas anômalas retornam uma máscara fixa, nunca o e-mail bruto.

Adicione:

```json
{
  "scripts": {
    "bootstrap-admin": "tsx src/cli/bootstrap-admin.cli.ts"
  }
}
```

CLI aceita somente `--email` e `--name`, recusa flags duplicadas/desconhecidas e imprime:

```text
userId=01K4A7W2F6M8R9T0V1X3Y5Z7AB
invite=https://app.example.test/convites/aceitar#token=U2VncmVkby1kZS1leGVtcGxvLW5hby1yZWFs
```

- [ ] **Step 7: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/db/migrations.integration.test.ts
npm run --silent test:ai apps/auth/src/rbac/postgres-rbac.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/invites/postgres-invite.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/invites/usecases/bootstrap-admin.usecase.test.ts
npm run --silent test:ai apps/auth/src/http/public-auth.controller.e2e.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth
git commit -m "feat(auth): bootstrap administrators by invitation"
```

---

## Task 6: Enforce Password Policy, scrypt, and Fail-Closed Pwned Password Checks

**Interfaces:**

- Consumes: `SemanticInputError`, `RequiredDependencyUnavailableError`, `AuditLog`, `Clock` e `RuntimeEnv.passwordBlocklistTimeoutMs`.
- Produces: `PasswordHasher.hash(passwordNfc: string): Promise<string>`, `PasswordHasher.verify(passwordNfc: string, encodedHash: string): Promise<boolean>`, `PwnedPasswordsGateway.isCompromised(passwordNfc: string): Promise<boolean>` e `PreparePassword.execute(input: { password: string; normalizedEmail: string; name: string }): Promise<{ passwordNfc: string; passwordHash: string }>`.

**Files:**

- Create: `apps/auth/src/credentials/password-policy.ts`
- Create: `apps/auth/src/credentials/password-policy.test.ts`
- Create: `apps/auth/src/credentials/password-hasher.ts`
- Create: `apps/auth/src/credentials/scrypt-password-hasher.ts`
- Create: `apps/auth/src/credentials/scrypt-password-hasher.test.ts`
- Create: `apps/auth/src/credentials/prepare-password.ts`
- Create: `apps/auth/src/credentials/prepare-password.test.ts`
- Create: `apps/auth/src/credentials/pwned-passwords.gateway.ts`
- Create: `apps/auth/src/credentials/http-pwned-passwords.gateway.ts`
- Create: `apps/auth/src/credentials/http-pwned-passwords.gateway.test.ts`
- Create: `apps/auth/src/testing/fake-http-server.ts`
- Delete after moving tests: `apps/auth/src/crypto/password.ts` and `password.test.ts`
- Modify: `apps/auth/src/app.module.ts`

- [ ] **Step 1: Write password policy RED tests**

`evaluatePassword` recebe senha original, e-mail normalizado e nome. Teste:

- normalize primeiro para NFC; nessa forma, 11/129 code points são recusados
  e 12/128 aceitos, inclusive astral Unicode contado por `[...value]`;
- NFC é o valor devolvido e usado no hash; não há `trim` nem lowercase;
- espaços e Unicode imprimível são aceitos; controles C0/C1 e surrogates isolados são recusados;
- nenhuma regra de maiúscula, número ou símbolo;
- visão contextual é `NFKC + toLowerCase`;
- igualdade integral recusa `timeline`, `timeline_project`, e-mail, parte local, nome completo e tokens alfanuméricos do nome com 3+ code points;
- substring não recusa (`minha-timeline-senha` não é igual a `timeline`);
- resposta semântica é segura e não ecoa senha.

Contrato:

```ts
export type PasswordPolicyResult =
  | { accepted: true; passwordNfc: string }
  | {
      accepted: false;
      code: "password_length" | "password_control" | "password_context";
    };

export interface PasswordHasher {
  hash(passwordNfc: string): Promise<string>;
  verify(passwordNfc: string, encodedHash: string): Promise<boolean>;
}
```

- [ ] **Step 2: Write HIBP gateway RED tests against a fake server**

Contrato:

```ts
export interface PwnedPasswordsGateway {
  isCompromised(passwordNfc: string): Promise<boolean>;
}
```

Prove uma única chamada:

```text
GET https://api.pwnedpasswords.com/range/21BD1
Add-Padding: true
User-Agent: timeline-auth/0.1.0
```

Parseie linhas `SUFFIX:COUNT` sem case sensitivity; count zero é padding e não compromete. Só `200` é sucesso. Timeout de dois segundos, transporte, status inesperado e corpo inválido lançam `RequiredDependencyUnavailableError`; não há retry ou fallback.

O contrato oficial vigente da range API está em [Have I Been Pwned API v3](https://haveibeenpwned.com/API/v3#PwnedPasswords).

- [ ] **Step 3: Implement safe scrypt and the credential pipeline**

Mova o código corrigido da tarefa 1 para `ScryptPasswordHasher`. Formato persistido:

```text
scrypt$32768$8$1$c2FsdC1kZS0xNi1ieXRlcw$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
```

Pipeline de senha nova, sempre fora de transação:

```ts
const policy = evaluatePassword(input);
if (!policy.accepted) throw new SemanticInputError(policy.code);
if (await pwnedPasswords.isCompromised(policy.passwordNfc)) {
  throw new SemanticInputError("password_compromised");
}
return passwordHasher.hash(policy.passwordNfc);
```

Não envie a visão contextual para HIBP; a consulta usa a senha real NFC.

- [ ] **Step 4: Prove fail-closed behavior in a use-case seam**

Crie um teste de serviço `PreparePassword`: policy falha não chama HIBP/scrypt; HIBP comprometida não chama scrypt; timeout produz 503 de domínio; sucesso chama HIBP e scrypt exatamente uma vez.

- [ ] **Step 5: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/credentials/password-policy.test.ts
npm run --silent test:ai apps/auth/src/credentials/scrypt-password-hasher.test.ts
npm run --silent test:ai apps/auth/src/credentials/http-pwned-passwords.gateway.test.ts
npm run --silent test:ai apps/auth/src/credentials/prepare-password.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth/src
git commit -m "feat(auth): enforce safe password enrollment"
```

---

## Task 7: Add Twilio Verify and the Strictly Local Fake Provider

**Interfaces:**

- Consumes: `MfaChannel`, `RuntimeEnv`, `RequiredDependencyUnavailableError`, `SemanticInputError` e `AuditLog`.
- Produces: `OtpVerificationGateway.start(input: { phoneE164: string; channel: MfaChannel }): Promise<{ providerChallengeId: string; reportedChannel: MfaChannel }>`, `OtpVerificationGateway.check(input: { providerChallengeId: string; code: string }): Promise<{ approved: boolean; reportedChannel: MfaChannel }>`, `TwilioVerifyGateway` e `FakeOtpVerificationGateway` com o mesmo contrato.

**Files:**

- Create: `apps/auth/src/mfa/otp-verification.gateway.ts`
- Create: `apps/auth/src/mfa/twilio-verify.gateway.ts`
- Create: `apps/auth/src/mfa/twilio-verify.gateway.test.ts`
- Create: `apps/auth/src/mfa/fake-otp-verification.gateway.ts`
- Create: `apps/auth/src/mfa/fake-otp-verification.gateway.test.ts`
- Modify: `apps/auth/src/app.module.ts`

- [ ] **Step 1: Define the provider contract and write RED tests**

```ts
export interface OtpVerificationGateway {
  start(input: {
    phoneE164: string;
    channel: MfaChannel;
  }): Promise<{
    providerChallengeId: string;
    reportedChannel: MfaChannel;
  }>;

  check(input: {
    providerChallengeId: string;
    code: string;
  }): Promise<{
    approved: boolean;
    reportedChannel: MfaChannel;
  }>;
}
```

Twilio start:

```text
POST https://verify.twilio.com/v2/Services/VAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/Verifications
Authorization: Basic base64(accountSid:authToken)
Content-Type: application/x-www-form-urlencoded
To=%2B5511999999999&Channel=sms
```

Twilio check:

```text
POST https://verify.twilio.com/v2/Services/VAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/VerificationCheck
VerificationSid=VEbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&Code=123456
```

Valide em runtime `sid`, `channel` e `status`. Start só é utilizável com `status === "pending"`. No check, `approved` só quando `status === "approved"`; status pendente é credencial inválida, não 503. O gateway sempre devolve o canal reportado; o caso de uso compara com o canal pedido/gravado, persiste o mismatch como challenge inutilizável e então gera 503 seguro.

Esses endpoints, campos e o fato de o check por SID aceitar `VerificationSid` estão documentados em [Twilio Verifications](https://www.twilio.com/docs/verify/api/verification) e [Verification Check](https://www.twilio.com/docs/verify/api/verification-check).

- [ ] **Step 2: Test transport and privacy behavior**

Com servidor fake, prove:

- uma chamada por operação, sem retry;
- `AbortSignal.timeout(env.twilioTimeoutMs)`;
- basic auth correto sem expô-lo em erro;
- `application/x-www-form-urlencoded`;
- timeout/transporte/401/403/429/5xx/configuração/JSON inválido → `RequiredDependencyUnavailableError`;
- 404 do check (SID expirado/aprovado/limite atingido no contrato Twilio) → fator inválido uniforme, não enumeração;
- telefone e body não aparecem no erro/auditoria fake;
- WhatsApp nunca é enviado quando desabilitado.

- [ ] **Step 3: Implement and test the fake**

`FakeOtpVerificationGateway` gera um challenge id local, reporta o canal pedido e aprova apenas `000000`. O código não aparece em logs. O módulo só instancia esse provider depois que `getRuntimeEnv` aprovou simultaneamente ambiente development/test, loopback e `AUTH_ALLOW_FAKE_OTP=true`.

Não implemente fallback SMS↔WhatsApp e não gere OTP local fora do fake.

- [ ] **Step 4: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/mfa/twilio-verify.gateway.test.ts
npm run --silent test:ai apps/auth/src/mfa/fake-otp-verification.gateway.test.ts
npm run --silent test:ai apps/auth/src/config/env.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth/src
git commit -m "feat(auth): add Twilio Verify MFA provider"
```

---

## Task 8: Persist Authentication State and Start Invitation Enrollment

**Interfaces:**

- Consumes: `InviteRepository.inspectByTokenHash`, `PreparePassword.execute`, `OtpVerificationGateway.start`, `RateLimiter.consume`, `AuditEventInput`, `RequestContext` e `SECURITY_POLICY`.
- Produces: `AuthenticationAttempt`, `MfaChallenge`, `RecoveryCode`, `Session`, `RefreshToken`, `AuthenticationRepository.startInviteAttempt(command: StartInviteAttemptCommand): Promise<"created" | "invalid_invite">`, `AuthenticationRepository.prepareOtpCheck(command: PrepareOtpCheckCommand): Promise<PreparedOtpCheck | "invalid">` e `AuthenticationRepository.invalidateOtpChallenge(command: InvalidateOtpChallengeCommand): Promise<"invalidated" | "invalid">`.

**Files:**

- Create: `apps/auth/drizzle/0002_authentication_sessions.sql`
- Create: `apps/auth/drizzle/rollback/0002_authentication_sessions.down.sql`
- Create: `apps/auth/drizzle/meta/0002_snapshot.json`
- Modify: `apps/auth/src/db/schema.ts`
- Modify: `apps/auth/src/db/readiness.ts`
- Modify: `apps/auth/src/db/migrations.integration.test.ts`
- Replace: `apps/auth/src/mfa/mfa-challenge.ts`
- Create: `apps/auth/src/mfa/authentication-attempt.ts`
- Create: `apps/auth/src/mfa/recovery-code.ts`
- Create: `apps/auth/src/mfa/ports/authentication-repository.ts`
- Create: `apps/auth/src/mfa/postgres-authentication.repository.ts`
- Create: `apps/auth/src/mfa/postgres-authentication.repository.integration.test.ts`
- Create: `apps/auth/src/sessions/session.ts`
- Create: `apps/auth/src/sessions/refresh-token.ts`
- Create: `apps/auth/src/authentication/usecases/start-invite-acceptance.usecase.ts`
- Create: `apps/auth/src/authentication/usecases/start-invite-acceptance.usecase.test.ts`
- Modify: `apps/auth/src/http/public-auth.controller.ts`
- Modify: `apps/auth/src/http/public-auth.controller.e2e.test.ts`
- Modify: `apps/auth/src/db/db.module.ts`
- Modify: `apps/auth/src/app.module.ts`

- [ ] **Step 1: Write migration RED tests for attempts, challenges, recovery, and sessions**

Antes de criar `0002`, escreva as assertions de versão/constraints abaixo e rode:

```powershell
npm run --silent test:ai apps/auth/src/db/migrations.integration.test.ts
```

Esperado: RED porque `sessions` ainda não existe e a versão é 2. Depois
atualize `schema.ts`, gere os artefatos e complete o SQL. Migração `0002` cria:

```powershell
pnpm --filter @repo/auth run db:generate -- --name authentication_sessions
```

```text
sessions
  id, user_id, amr, auth_time, initial_ip_address, initial_user_agent,
  last_used_at, revoked_at, ended_at, created_at
refresh_tokens
  id, token_hash, session_id, expires_at, consumed_at, successor_id, created_at
authentication_attempts
  id, token_hash, user_id, purpose, second_factor, first_methods,
  invite_id, origin_session_id, proposed_password_hash,
  proposed_phone_e164, proposed_mfa_channel, verified_at,
  expires_at, consumed_at, invalidated_at, created_at
mfa_challenges
  id, attempt_id, requested_channel, reported_channel,
  provider_challenge_id, check_count, expires_at,
  consumed_at, invalidated_at, created_at
recovery_codes
  id, user_id, code_hash, generation, used_at, revoked_at, created_at
```

Constraints obrigatórias:

- hashes de token/código únicos;
- `amr`/`first_methods` não vazios e limitados ao catálogo;
- purpose e second factor fechados;
- `invite_acceptance` exige `invite_id`, segundo fator OTP, métodos `["pwd"]`, três `proposed_*` e não aceita `origin_session_id`;
- `login` não aceita invite/origin/proposed;
- step-up exige `origin_session_id` e não aceita invite/proposed;
- desafio tem exatamente um attempt, canal fechado, provider id não vazio e check count 0..5;
- refresh successor referencia refresh da mesma sessão por trigger;
- cada refresh satisfaz `expires_at = created_at + interval '30 days'`;
- geração de recovery é positiva;
- uma sessão ativa não pode ter `ended_at`;
- FKs/cascades preservam audit e permitem retenção planejada.

Finalize com versão de schema 3. Esse passa a ser `EXPECTED_SCHEMA_VERSION` definitivo.
Reaplique o helper de grants e repita a prova com todas as tabelas finais.
No schema descartável, `0002_authentication_sessions.down.sql` remove somente
essa fatia, restaura versão 2 e preserva users/invites/audit.

- [ ] **Step 2: Define authentication-state contracts**

```ts
export interface StartInviteAttemptCommand {
  id: string;
  tokenHash: string;
  userId: string;
  inviteId: string;
  proposedPasswordHash: string;
  proposedPhoneE164: string;
  proposedMfaChannel: MfaChannel;
  challenge: {
    id: string;
    providerChallengeId: string;
    requestedChannel: MfaChannel;
    reportedChannel: MfaChannel;
    expiresAt: Date;
    invalidatedAt: Date | null;
  };
  expiresAt: Date;
  invalidatedAt: Date | null;
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface PrepareOtpCheckCommand {
  attemptTokenHash: string;
  now: Date;
}

export interface PreparedOtpCheck {
  attemptId: string;
  userId: string;
  purpose: AuthenticationPurpose;
  challengeId: string;
  providerChallengeId: string;
  requestedChannel: MfaChannel;
  reportedChannel: MfaChannel;
}

export interface InvalidateOtpChallengeCommand {
  attemptId: string;
  challengeId: string;
  now: Date;
  auditEvent: AuditEventInput;
}

export interface AuthenticationRepository {
  startInviteAttempt(
    command: StartInviteAttemptCommand,
  ): Promise<"created" | "invalid_invite">;

  prepareOtpCheck(command: PrepareOtpCheckCommand):
    Promise<PreparedOtpCheck | "invalid">;

  invalidateOtpChallenge(
    command: InvalidateOtpChallengeCommand,
  ): Promise<"invalidated" | "invalid">;
}
```

`startInviteAttempt` relê e bloqueia usuário → convite, exige usuário pendente e convite vigente, insere attempt/challenge/auditoria juntos. Se o Twilio já foi chamado e a revalidação falhar, o challenge externo fica órfão até expirar; não abra uma transação durante a chamada para evitá-lo.

- [ ] **Step 3: Write the start-invitation use-case tests**

Input:

```ts
export interface StartInviteAcceptanceInput {
  inviteToken: string;
  password: string;
  phoneE164: string;
  mfaChannel: MfaChannel;
  context: RequestContext;
}

export interface StartInviteAcceptanceOutput {
  mfaToken: string;
  channel: MfaChannel;
  maskedDestination: string;
  expiresAt: Date;
}
```

Casos:

- convite válido → policy → HIBP → scrypt → rate limit → Twilio → transação;
- usuário permanece `pending_invite` e sem credenciais depois do start;
- attempt guarda exatamente o hash/telefone/canal daquela chamada;
- convite inválido falha antes de HIBP/Twilio;
- HIBP/Twilio indisponível → 503 e nenhum attempt;
- WhatsApp desabilitado → 422 antes do provider;
- rate limit 3/10 min por user acontece antes do provider e 4ª chamada retorna 429;
- mismatch de canal do provider → attempt/challenge persistidos já invalidados, auditoria sem destino em claro e 503; nenhum token MFA utilizável;
- falha transacional depois do Twilio não ativa usuário;
- resposta não contém invite token, provider SID ou telefone completo.

- [ ] **Step 4: Implement normalization and orchestration**

Telefone deve casar `^\+[1-9]\d{7,14}$` depois de remover somente espaços ASCII, hífens e parênteses de apresentação; não invente código de país. Masking conserva `+`, os dois últimos dígitos e substitui o restante por `*`.

Ordem exata:

1. hash SHA-256 do invite token e inspeção;
2. validação de canal/telefone/senha contextual;
3. HIBP e scrypt;
4. rate limit `mfa_send_user` usando user id;
5. geração de attempt id/token e challenge id;
6. uma chamada `otpGateway.start`;
7. compare canal pedido/reportado e chame `startInviteAttempt` com revalidação, preenchendo `invalidatedAt` no mismatch;
8. no mismatch, descarte o token bruto e retorne 503; caso contrário, devolva-o uma única vez.

Tokens opacos têm 32 bytes aleatórios; somente SHA-256 entra no banco.

- [ ] **Step 5: Expose POST /auth/invites/accept**

Schema Zod estrito:

```ts
z.object({
  token: z.string().min(1).max(1024),
  password: z.string().min(1).max(1024),
  phone: z.string().min(1).max(64),
  channel: z.enum(["sms", "whatsapp"]),
}).strict()
```

Resposta `202`:

```json
{
  "mfaToken": "dGVzdC1vbmx5LW9wYXF1ZS10b2tlbg",
  "channel": "sms",
  "maskedDestination": "+*********42",
  "expiresAt": "2026-08-31T12:10:00.000Z"
}
```

- [ ] **Step 6: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/db/migrations.integration.test.ts
npm run --silent test:ai apps/auth/src/mfa/postgres-authentication.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/authentication/usecases/start-invite-acceptance.usecase.test.ts
npm run --silent test:ai apps/auth/src/http/public-auth.controller.e2e.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth
git commit -m "feat(auth): start invitation MFA enrollment"
```

---

## Task 9: Complete Invitation Enrollment Atomically and Issue the First Session

**Interfaces:**

- Consumes: `AuthenticationRepository.prepareOtpCheck`, `AuthenticationRepository.invalidateOtpChallenge`, `OtpVerificationGateway.check`, `SignAccessToken`, `NewSessionWrite`, `NewRecoveryCode` e `AuditEventInput`.
- Produces: `AuthenticationRepository.completeInviteEnrollment(command: CompleteInviteEnrollmentCommand, sign: SignAccessToken): Promise<EnrollmentCommit | "invalid">`, onde `type EnrollmentCommit = SessionCommit`, e a resposta pública `{ accessToken: string; refreshToken: string; accessTokenExpiresInSeconds: 900; refreshTokenExpiresAt: string; recoveryCodes: string[] }`.

**Files:**

- Modify: `apps/auth/src/mfa/ports/authentication-repository.ts`
- Modify: `apps/auth/src/mfa/postgres-authentication.repository.ts`
- Modify: `apps/auth/src/mfa/postgres-authentication.repository.integration.test.ts`
- Create: `apps/auth/src/mfa/recovery-code.test.ts`
- Create: `apps/auth/src/authentication/usecases/complete-invite-acceptance.usecase.ts`
- Create: `apps/auth/src/authentication/usecases/complete-invite-acceptance.usecase.test.ts`
- Modify: `apps/auth/src/http/public-auth.controller.ts`
- Modify: `apps/auth/src/http/public-auth.controller.e2e.test.ts`

- [ ] **Step 1: Write recovery-code generation RED tests**

Gere exatamente 10 valores independentes de 10 bytes. Codifique RFC 4648 Base32 maiúsculo sem padding e apresente 16 caracteres em quatro grupos:

```text
XXXX-XXXX-XXXX-XXXX
```

`normalizeRecoveryCode` remove somente hífens/espaços ASCII, converte para maiúsculas e exige `^[A-Z2-7]{16}$`. Hash SHA-256 da forma canônica de 16 caracteres. O retorno interno separa `plainText` de `hash` para que somente o primeiro vá à resposta.

- [ ] **Step 2: Add the atomic enrollment port and RED concurrency tests**

```ts
export interface CompleteInviteEnrollmentCommand {
  attemptTokenHash: string;
  challengeId: string;
  recoveryCodes: readonly NewRecoveryCode[];
  newSession: NewSessionWrite;
  verifiedAt: Date;
  context: RequestContext;
  auditEvents: readonly AuditEventInput[];
}

export type EnrollmentCommit = SessionCommit;

export interface AuthenticationRepository {
  completeInviteEnrollment(
    command: CompleteInviteEnrollmentCommand,
    sign: SignAccessToken,
  ): Promise<EnrollmentCommit | "invalid">;
}
```

Testes Postgres com duas conexões:

- dois completes simultâneos ativam uma vez;
- tentativa vencedora copia exatamente seus três `proposed_*`;
- dois checks aprovados criam no máximo uma sessão;
- convite/tentativa/challenge são consumidos e tentativas irmãs invalidadas;
- exatamente 10 hashes generation 1;
- falha no insert de audit, recovery, refresh ou session reverte tudo;
- provider aprova, o commit falha, usuário/convite/attempt continuam
  pendentes; um novo `POST /auth/invites/accept` com o mesmo convite cria outro
  challenge e pode concluir exatamente uma vez;
- assinatura usa a chave bloqueada dentro da transação;
- usuário/invite/attempt/challenge vencido ou vínculo divergente não muta nada.

- [ ] **Step 3: Implement prepare-check → provider → final transaction**

`prepareOtpCheck` descobre IDs, bloqueia usuário → invite → attempt → challenge, revalida purpose/expiração/consumo, aplica `factor_check_attempt` e incrementa `check_count` antes da chamada externa. Ele commita e devolve apenas provider SID, canal e challenge id.

O use case:

1. hash do MFA token;
2. `prepareOtpCheck`;
3. uma chamada `otpGateway.check`;
4. canal reportado precisa coincidir; mismatch chama `invalidateOtpChallenge`, audita e retorna 503;
5. status não aprovado → auditoria própria e 401;
6. gere 10 recovery codes, session id, refresh id/token e claims;
7. `completeInviteEnrollment(command, signAccessToken)`;
8. só depois do commit devolva tokens e códigos em claro.

O repositório final relê e bloqueia na ordem global. Ativa usuário, consome/invalida estado, insere códigos/session/refresh, resolve RBAC, bloqueia chave, assina e audita no mesmo commit.

- [ ] **Step 4: Define the one-time response**

`POST /auth/mfa/verify` recebe `mfaToken` e `code`. Para purpose `invite_acceptance` retorna `200`:

```json
{
  "accessToken": "eyJhbGciOiJFZERTQSIsInR5cCI6ImF0K2p3dCIsImtpZCI6InRlc3QifQ.eyJzdWIiOiIwMUs0In0.signature",
  "refreshToken": "dGVzdC1vbmx5LXJlZnJlc2gtdG9rZW4",
  "accessTokenExpiresInSeconds": 900,
  "refreshTokenExpiresAt": "2026-09-30T12:00:00.000Z",
  "recoveryCodes": [
    "AAAA-BBBB-CCCC-DDDD"
  ]
}
```

O array precisa ter 10 entradas. Retry após sucesso retorna 401 vazio e nunca reapresenta os códigos.

- [ ] **Step 5: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/mfa/recovery-code.test.ts
npm run --silent test:ai apps/auth/src/mfa/postgres-authentication.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/authentication/usecases/complete-invite-acceptance.usecase.test.ts
npm run --silent test:ai apps/auth/src/http/public-auth.controller.e2e.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth/src
git commit -m "feat(auth): complete invitation enrollment atomically"
```

---

## Task 10: Require Password plus OTP or Recovery for Every Login

**Interfaces:**

- Consumes: `PasswordHasher.verify`, `OtpVerificationGateway.start/check`, `AuthenticationRepository.prepareOtpCheck`, `AuthenticationRepository.invalidateOtpChallenge`, `RateLimiter.hit`, `SignAccessToken` e `SessionCommit`.
- Produces: `AuthenticationRepository.startLoginAttempt(command: StartLoginAttemptCommand): Promise<"created" | "invalid">`, `AuthenticationRepository.prepareMfaResend(attemptTokenHash: string, now: Date): Promise<PreparedMfaResend | "invalid">`, `AuthenticationRepository.replaceMfaChallenge(command: ReplaceMfaChallengeCommand): Promise<"replaced" | "invalid">` e `AuthenticationRepository.completeLogin(command: CompleteLoginCommand, sign: SignAccessToken): Promise<SessionCommit | "invalid">`.

**Files:**

- Create: `apps/auth/src/authentication/login-credential-checker.ts`
- Create: `apps/auth/src/authentication/login-credential-checker.test.ts`
- Create: `apps/auth/src/authentication/usecases/start-login.usecase.ts`
- Create: `apps/auth/src/authentication/usecases/start-login.usecase.test.ts`
- Create: `apps/auth/src/authentication/usecases/complete-login.usecase.ts`
- Create: `apps/auth/src/authentication/usecases/complete-login.usecase.test.ts`
- Create: `apps/auth/src/authentication/usecases/resend-mfa.usecase.ts`
- Modify: `apps/auth/src/mfa/ports/authentication-repository.ts`
- Modify: `apps/auth/src/mfa/postgres-authentication.repository.ts`
- Modify: `apps/auth/src/mfa/postgres-authentication.repository.integration.test.ts`
- Modify: `apps/auth/src/http/public-auth.controller.ts`
- Create: `apps/auth/src/http/login.e2e.test.ts`

- [ ] **Step 1: Write structural anti-enumeration RED tests**

Para e-mail inexistente, senha errada, `pending_invite`, `suspended` e `disabled`, spies comprovam:

- mesma normalização de e-mail/senha;
- hits de rate limit por e-mail e IP antes da consulta/hash caro;
- exatamente uma execução real de `scrypt` com parâmetros vigentes;
- mesmo erro 401 vazio;
- nenhum Twilio, attempt ou session;
- razão real distinta apenas na auditoria.

Crie no startup um dummy hash scrypt válido. Se o usuário não for active, não tiver hash ou o encoding estiver fora dos limites, verifique contra o dummy. Não faça um caminho rápido para hash malformado.

- [ ] **Step 2: Define login start contracts and tests**

```ts
export interface StartLoginInput {
  email: string;
  password: string;
  secondFactor: SecondFactor;
  context: RequestContext;
}

export interface StartLoginOutput {
  mfaToken: string;
  secondFactor: SecondFactor;
  channel?: MfaChannel;
  maskedDestination?: string;
  expiresAt: Date;
}

export interface StartLoginAttemptCommand {
  id: string;
  tokenHash: string;
  userId: string;
  secondFactor: SecondFactor;
  firstMethods: readonly ["pwd"];
  challenge: {
    id: string;
    providerChallengeId: string;
    requestedChannel: MfaChannel;
    reportedChannel: MfaChannel;
    expiresAt: Date;
    invalidatedAt: Date | null;
  } | null;
  expiresAt: Date;
  invalidatedAt: Date | null;
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface PreparedMfaResend {
  attemptId: string;
  userId: string;
  phoneE164: string;
  channel: MfaChannel;
}

export interface ReplaceMfaChallengeCommand {
  attemptId: string;
  challenge: {
    id: string;
    providerChallengeId: string;
    requestedChannel: MfaChannel;
    reportedChannel: MfaChannel;
    expiresAt: Date;
    invalidatedAt: Date | null;
  };
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface AuthenticationRepository {
  startLoginAttempt(
    command: StartLoginAttemptCommand,
  ): Promise<"created" | "invalid">;
  prepareMfaResend(
    attemptTokenHash: string,
    now: Date,
  ): Promise<PreparedMfaResend | "invalid">;
  replaceMfaChallenge(
    command: ReplaceMfaChallengeCommand,
  ): Promise<"replaced" | "invalid">;
}
```

Sucesso exige usuário active e senha correta. Para OTP, aplique limite de envio e chame Twilio uma vez; para
recovery, crie attempt sem challenge e sem chamar Twilio. Em ambos,
`first_methods=["pwd"]` e nenhuma sessão é criada. Mismatch no start é
persistido com attempt/challenge invalidados e retorna 503.

- [ ] **Step 3: Implement atomic login completion**

Amplie a porta:

```ts
export interface CompleteLoginCommand {
  attemptTokenHash: string;
  challengeId: string | null;
  recoveryCodeHash: string | null;
  newSession: NewSessionWrite;
  verifiedAt: Date;
  auditEvents: readonly AuditEventInput[];
}

completeLogin(
  command: CompleteLoginCommand,
  sign: SignAccessToken,
): Promise<SessionCommit | "invalid">;
```

OTP usa `prepareOtpCheck` e Twilio antes do complete. Recovery aplica o bucket `factor_check_attempt` e, na transação final, bloqueia usuário → attempt → recovery code, consome o código uma vez e cria sessão. Os dois caminhos releem usuário active, resolvem RBAC e emitem:

- OTP: `amr=["pwd","otp"]`;
- recovery: `amr=["pwd","recovery"]`.

`auth_time` é o instante em que o segundo fator foi aprovado e permanece na sessão.

- [ ] **Step 4: Implement resend without changing the attempt token**

`POST /auth/mfa/resend` aceita o mesmo `mfaToken` somente para attempts OTP pendentes. Limite 3/10 min por user antes do provider. Inicie novo challenge externo, então uma transação invalida o challenge anterior e persiste o novo se o attempt ainda estiver válido. Resposta mostra canal/destino mascarado/expiração, nunca um novo token de attempt.

Use `prepareMfaResend` para obter user/telefone/canal antes do rate limit e da
chamada. `replaceMfaChallenge` relê tudo sob lock. Se o provider reportar outro
canal, persista o novo challenge já invalidado, audite o mismatch e retorne
503; não deixe o challenge anterior reutilizável.

- [ ] **Step 5: Expose and test all login endpoints**

- `POST /auth/login` → `202` com tentativa;
- `POST /auth/mfa/verify` → `200` tokens para login OTP;
- `POST /auth/mfa/recover` → `200` tokens para login recovery;
- `POST /auth/mfa/resend` → `202`;
- input/identidade/fator inválido → matriz segura;
- 6ª verificação do mesmo attempt → 429 com `Retry-After`;
- recovery funciona com Twilio indisponível;
- dois consumos concorrentes do mesmo recovery code dão um sucesso e um 401;
- refresh/session nunca nasce antes do segundo fator.

- [ ] **Step 6: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/authentication/login-credential-checker.test.ts
npm run --silent test:ai apps/auth/src/authentication/usecases/start-login.usecase.test.ts
npm run --silent test:ai apps/auth/src/authentication/usecases/complete-login.usecase.test.ts
npm run --silent test:ai apps/auth/src/mfa/postgres-authentication.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/http/login.e2e.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth/src
git commit -m "feat(auth): require MFA for password login"
```

---

## Task 11: Rotate Refresh Tokens and Revoke Sessions Safely

**Interfaces:**

- Consumes: `SignAccessToken`, `SessionCommit`, `ResolvedAccess`, `RequestContext`, `AuditEventInput` e o helper transacional `lockActiveSigningKey`.
- Produces: `SessionRepository.rotateRefreshToken(command: RotateRefreshTokenCommand, sign: SignAccessToken): Promise<{ kind: "rotated"; accessToken: string; session: Session; access: ResolvedAccess; refreshTokenExpiresAt: Date } | { kind: "reused" } | { kind: "invalid" }>`, `SessionRepository.revokeByRefreshToken(command: RevokeSessionCommand): Promise<boolean>`, `SessionRepository.revokeAllOfUser(command: RevokeAllSessionsCommand): Promise<number>`, `SessionRepository.readActiveActor(command: ReadActiveActorCommand): Promise<ActiveActorView | "invalid">` e `BearerAuthGuard` com validação JWT local.

**Files:**

- Create: `apps/auth/src/sessions/ports/session-repository.ts`
- Create: `apps/auth/src/sessions/postgres-session.repository.ts`
- Create: `apps/auth/src/sessions/postgres-session.repository.integration.test.ts`
- Create: `apps/auth/src/sessions/usecases/refresh-session.usecase.ts`
- Create: `apps/auth/src/sessions/usecases/revoke-session.usecase.ts`
- Create: `apps/auth/src/sessions/usecases/logout-all.usecase.ts`
- Create: `apps/auth/src/sessions/usecases/get-me.usecase.ts`
- Create: `apps/auth/src/http/bearer-auth.guard.ts`
- Create: `apps/auth/src/http/current-actor.decorator.ts`
- Create: `apps/auth/src/http/authenticated-auth.controller.ts`
- Create: `apps/auth/src/http/session.e2e.test.ts`
- Modify: `apps/auth/src/db/db.module.ts`
- Modify: `apps/auth/src/app.module.ts`

- [ ] **Step 1: Define the session port and write RED repository tests**

```ts
export interface RotateRefreshTokenCommand {
  presentedTokenHash: string;
  successor: {
    id: string;
    hash: string;
    issuedAt: Date;
    expiresAt: Date;
  };
  now: Date;
  context: RequestContext;
  auditEvents: readonly AuditEventInput[];
}

export interface RevokeSessionCommand {
  presentedTokenHash: string;
  now: Date;
  context: RequestContext;
  auditEvents: readonly AuditEventInput[];
}

export interface RevokeAllSessionsCommand {
  actor: AuthenticatedActor;
  now: Date;
  context: RequestContext;
  auditEvents: readonly AuditEventInput[];
}

export interface ReadActiveActorCommand {
  actor: AuthenticatedActor;
  now: Date;
}

export interface ActiveActorView {
  user: User;
  session: Session;
  access: ResolvedAccess;
}

export interface SessionRepository {
  rotateRefreshToken(
    command: RotateRefreshTokenCommand,
    sign: SignAccessToken,
  ): Promise<
    | {
        kind: "rotated";
        accessToken: string;
        session: Session;
        access: ResolvedAccess;
        refreshTokenExpiresAt: Date;
      }
    | { kind: "reused" }
    | { kind: "invalid" }
  >;

  revokeByRefreshToken(command: RevokeSessionCommand): Promise<boolean>;
  revokeAllOfUser(command: RevokeAllSessionsCommand): Promise<number>;
  readActiveActor(command: ReadActiveActorCommand):
    Promise<ActiveActorView | "invalid">;
}
```

Testes obrigatórios:

- rotação consome token, liga successor e cria hash novo;
- emissão inicial e cada sucessor satisfazem exatamente
  `expiresAt - issuedAt === 30 * 24 * 60 * 60 * 1000`;
- `sid`, `amr` e `auth_time` permanecem; `jti` muda;
- status/RBAC são relidos e claims novos refletem alterações;
- usuário não active ou sessão revogada não emite;
- duas rotações concorrentes do mesmo token: no máximo uma resposta de sucesso e a duplicata revoga sessão e sucessor;
- apresentar depois um token consumido revoga sessão e audita `token.reuse_detected`;
- falha de auditoria/assinatura/insert faz rollback;
- token desconhecido/expirado → invalid sem mutação de outra sessão.

- [ ] **Step 2: Implement stable lock ordering and reuse detection**

Faça lookup inicial pelo hash sem lock para descobrir user/session/refresh IDs. Dentro da transação, bloqueie usuário → sessão → refresh e releia tudo.

- Se refresh foi consumido: revogue a sessão inteira, inclusive sucessor, insira audit e retorne `reused`.
- Se vivo: consuma, insira sucessor de 30 dias, atualize `last_used_at`, releia RBAC, bloqueie signing key, assine e audite.
- Se expirado/revogado/user inativo: não emita; quando houver sessão ainda não revogada, encerre/revogue de forma auditada.

O segredo do sucessor é gerado antes da transação e só é devolvido quando `kind=rotated` commita.

- [ ] **Step 3: Add strict local bearer validation**

`BearerAuthGuard` exige exatamente um header no formato `Authorization: Bearer eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiIwMUs0In0.signature` no fixture, resolve o
`kid` pelo cache da tarefa 4, valida JWT com
algoritmo/claims/issuer/audience/clock fixos e anexa `AuthenticatedActor`. Ele
não consulta usuário/sessão nem chama introspecção; somente um cache miss de
`kid` pode recarregar as chaves publicáveis. `x-user-id` é ignorado.

Use cases que criam/revogam sessão recebem actor, mas releem usuário e sessão dentro da mutação. Um token ainda criptograficamente válido não consegue fazer step-up ou gerar sessão se sua origem estiver revogada.

- [ ] **Step 4: Expose refresh, logout, logout-all, and me**

- `POST /auth/token/refresh` recebe `{"refreshToken":"dGVzdC1yZWZyZXNoLXRva2Vu"}` no fixture e devolve novo par;
- `POST /auth/logout` recebe refresh, é idempotente externamente e retorna `204`;
- `POST /auth/logout-all` exige bearer, revoga todas as sessões e retorna `204`;
- `GET /auth/me` exige bearer e relê usuário/sessão active antes de devolver:

```json
{
  "userId": "01K4A7W2F6M8R9T0V1X3Y5Z7AB",
  "email": "user@example.com",
  "name": "User",
  "sessionId": "01K4A81CH2N4P6Q8S0T2V4X6YZ",
  "roles": ["member"],
  "permissions": ["event:read"],
  "denies": []
}
```

Refresh inválido retorna 401 vazio. Logout com token conhecido retorna 204
tanto na primeira revogação quanto nas repetições e não revela se a sessão já
estava revogada; token desconhecido, malformado ou expirado retorna 401 vazio.

- [ ] **Step 5: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/sessions/postgres-session.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/sessions/usecases/refresh-session.usecase.test.ts
npm run --silent test:ai apps/auth/src/http/session.e2e.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth/src
git commit -m "feat(auth): rotate and revoke sessions safely"
```

---

## Task 12: Enforce One-Time Step-Up for Password and Recovery-Code Changes

**Interfaces:**

- Consumes: `AuthenticatedActor`, `AuthenticationRepository.prepareOtpCheck/invalidateOtpChallenge`, `OtpVerificationGateway.start/check`, `PreparePassword.execute`, `SignAccessToken`, `NewRecoveryCode`, `RateLimiter.hit` e `AuditEventInput`.
- Produces: `AuthenticationRepository.startStepUpAttempt(command: StartStepUpAttemptCommand): Promise<"created" | "invalid">`, `AuthenticationRepository.markStepUpVerified(command: MarkStepUpVerifiedCommand): Promise<"verified" | "invalid">`, `AuthenticationRepository.markStepUpVerifiedWithRecovery(command: VerifyStepUpWithRecoveryCommand): Promise<"verified" | "invalid">`, `AuthenticationRepository.changePasswordWithStepUp(command: ChangePasswordWithStepUpCommand, sign: SignAccessToken): Promise<SessionCommit | "invalid">` e `AuthenticationRepository.regenerateRecoveryCodesWithStepUp(command: RegenerateRecoveryCodesWithStepUpCommand): Promise<"regenerated" | "invalid">`.

**Files:**

- Create: `apps/auth/src/authentication/usecases/start-step-up.usecase.ts`
- Create: `apps/auth/src/authentication/usecases/start-step-up.usecase.test.ts`
- Create: `apps/auth/src/authentication/usecases/complete-step-up.usecase.ts`
- Create: `apps/auth/src/authentication/usecases/complete-step-up.usecase.test.ts`
- Create: `apps/auth/src/authentication/usecases/change-password.usecase.ts`
- Create: `apps/auth/src/authentication/usecases/change-password.usecase.test.ts`
- Create: `apps/auth/src/authentication/usecases/regenerate-recovery-codes.usecase.ts`
- Create: `apps/auth/src/authentication/usecases/regenerate-recovery-codes.usecase.test.ts`
- Modify: `apps/auth/src/mfa/ports/authentication-repository.ts`
- Modify: `apps/auth/src/mfa/postgres-authentication.repository.ts`
- Modify: `apps/auth/src/mfa/postgres-authentication.repository.integration.test.ts`
- Modify: `apps/auth/src/http/authenticated-auth.controller.ts`
- Create: `apps/auth/src/http/step-up.e2e.test.ts`

- [ ] **Step 1: Write step-up start RED tests**

`POST /auth/step-up/start` exige bearer e:

```ts
export interface StartStepUpInput {
  actor: AuthenticatedActor;
  currentPassword: string;
  purpose: "password_change" | "recovery_regeneration";
  secondFactor: SecondFactor;
  context: RequestContext;
}

export interface StartStepUpAttemptCommand {
  id: string;
  tokenHash: string;
  userId: string;
  originSessionId: string;
  purpose: "password_change" | "recovery_regeneration";
  secondFactor: SecondFactor;
  firstMethods: readonly ["pwd"];
  challenge: StartLoginAttemptCommand["challenge"];
  expiresAt: Date;
  invalidatedAt: Date | null;
  now: Date;
  auditEvents: readonly AuditEventInput[];
}
```

Releia usuário e sessão de origem. Aplique rate limits de password por e-mail/IP, execute exatamente um scrypt e crie attempt de 10 minutos com `origin_session_id`. OTP também aplica `mfa_send_user` antes de chamar Twilio; recovery não chama o provider. Usuário fora de active, sessão revogada ou password inválida responde 401 uniforme e não cria attempt.

Adicione `startStepUpAttempt(command)` à `AuthenticationRepository`; a
transação relê user/origin session e devolve `"created"|"invalid"`. Mismatch de
canal usa os campos `invalidatedAt`, audita e retorna 503 sem token utilizável.

- [ ] **Step 2: Implement factor completion without consuming the action**

OTP segue `prepareOtpCheck` → Twilio → transação. Recovery aplica `factor_check_attempt` antes do lookup, normaliza/hash e consome um código na transação. Nos dois casos:

- confira user e origin session ainda active;
- grave `verified_at` e consuma challenge/recovery quando houver;
- mantenha o attempt não consumido;
- preserve purpose e second factor;
- retorne o mesmo `stepUpToken` opaco para a ação final.

Um fator verificado não autoriza a outra ação: purpose é validado novamente e o attempt só pode ser consumido uma vez.

- [ ] **Step 3: Add atomic action ports and concurrency tests**

```ts
export interface MarkStepUpVerifiedCommand {
  attemptTokenHash: string;
  challengeId: string;
  verifiedAt: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface VerifyStepUpWithRecoveryCommand {
  attemptTokenHash: string;
  recoveryCodeHash: string;
  verifiedAt: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface ChangePasswordWithStepUpCommand {
  attemptTokenHash: string;
  newPasswordHash: string;
  newSession: NewSessionWrite;
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface RegenerateRecoveryCodesWithStepUpCommand {
  attemptTokenHash: string;
  recoveryCodes: readonly NewRecoveryCode[];
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface AuthenticationRepository {
  startStepUpAttempt(
    command: StartStepUpAttemptCommand,
  ): Promise<"created" | "invalid">;
  markStepUpVerified(
    command: MarkStepUpVerifiedCommand,
  ): Promise<"verified" | "invalid">;

  markStepUpVerifiedWithRecovery(
    command: VerifyStepUpWithRecoveryCommand,
  ): Promise<"verified" | "invalid">;

  changePasswordWithStepUp(
    command: ChangePasswordWithStepUpCommand,
    sign: SignAccessToken,
  ): Promise<SessionCommit | "invalid">;

  regenerateRecoveryCodesWithStepUp(
    command: RegenerateRecoveryCodesWithStepUpCommand,
  ): Promise<"regenerated" | "invalid">;
}
```

Teste:

- dois consumers do mesmo step-up: um sucesso;
- step-up de purpose errado falha;
- expiração, user/session inativo ou origem diferente falha;
- falha de audit reverte ação e consumo;
- password change revoga todas as sessões, troca hash e cria uma sessão substituta no mesmo commit;
- sessão substituta tem novo `sid`, `auth_time` da aprovação e `amr pwd+otp|recovery`;
- regeneration revoga todos os códigos antigos e insere exatamente 10 da generation anterior + 1;
- código antigo/regeneration anterior nunca volta a funcionar.

- [ ] **Step 4: Implement password change orchestration**

Input contém `stepUpToken` e `newPassword`. Antes da transação, rode policy contextual, HIBP e scrypt. Gere session/refresh novos. Na transação bloqueie user → attempt → origin session → demais sessions → signing key; revalide tudo, consuma step-up, atualize hash, revogue sessões, insira substituta, assine e audite.

Resposta `200` contém somente novo par de tokens. Se HIBP falhar, retorne 503 e deixe step-up disponível até expirar; se a transação falhar, step-up também permanece não consumido.

- [ ] **Step 5: Implement recovery-code regeneration**

Gere 10 códigos fora da transação. No commit, consuma step-up, revogue todos os códigos anteriores, insira a nova generation e audite. Resposta apresenta os 10 uma única vez. Não revogue sessões para essa ação.

- [ ] **Step 6: Expose and test the authenticated routes**

- `POST /auth/step-up/start` → 202;
- `POST /auth/step-up/verify` → 200 com step-up token;
- `POST /auth/step-up/recover` → 200 com step-up token;
- `POST /auth/password/change` → 200 tokens;
- `POST /auth/recovery-codes/regenerate` → 200 com 10 códigos.

Prove que recovery completa ambos os purposes com Twilio desligado e que access token antigo continua criptograficamente válido até `exp`, embora não consiga gerar nova sessão no auth. Prove também que a 4ª tentativa de envio OTP do mesmo usuário em 10 minutos e a 6ª tentativa recovery do mesmo attempt retornam 429 com `Retry-After`, inclusive após restart.

- [ ] **Step 7: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/authentication/usecases/start-step-up.usecase.test.ts
npm run --silent test:ai apps/auth/src/authentication/usecases/complete-step-up.usecase.test.ts
npm run --silent test:ai apps/auth/src/authentication/usecases/change-password.usecase.test.ts
npm run --silent test:ai apps/auth/src/authentication/usecases/regenerate-recovery-codes.usecase.test.ts
npm run --silent test:ai apps/auth/src/mfa/postgres-authentication.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/http/step-up.e2e.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth/src
git commit -m "feat(auth): enforce one-time step-up operations"
```

---

## Task 13: Add Lockout-Safe Administrative APIs

**Interfaces:**

- Consumes: `AuthenticatedActor`, `coversSuperAdmin`, `UserRepository`, `RbacRepository`, `InviteRepository`, `AuditEventInput` e os locks transacionais globais.
- Produces: `AdminUserSummary`, `UserRepository.list(input: { cursor: string | null; limit: number }): Promise<{ users: AdminUserSummary[]; nextCursor: string | null }>`, `UserRepository.changeStatusPreservingCapableAdmin(command: ChangeUserStatusCommand): Promise<AdminMutationOutcome>`, `RbacRepository.replaceAccessPreservingCapableAdmin(command: ReplaceAccessCommand): Promise<AdminMutationOutcome>`, `InviteRepository.createPendingUserWithAccessAndInvite(command: CreatePendingUserWithInviteCommand): Promise<void>`, `InviteRepository.reissueInvite(command: ReissueInviteCommand): Promise<ReissueInviteOutcome>` e `InviteRepository.revokePendingInvite(command: RevokeInviteCommand): Promise<boolean>`.

**Files:**

- Extend: `apps/auth/src/users/ports/user-repository.ts`
- Extend: `apps/auth/src/users/postgres-user.repository.ts`
- Create: `apps/auth/src/users/postgres-user.repository.integration.test.ts`
- Extend: `apps/auth/src/rbac/ports/rbac-repository.ts`
- Extend: `apps/auth/src/rbac/postgres-rbac.repository.ts`
- Extend: `apps/auth/src/rbac/postgres-rbac.repository.integration.test.ts`
- Extend: `apps/auth/src/invites/postgres-invite.repository.ts`
- Extend: `apps/auth/src/invites/postgres-invite.repository.integration.test.ts`
- Create: `apps/auth/src/invites/usecases/create-invite.usecase.ts`
- Create: `apps/auth/src/invites/usecases/reissue-invite.usecase.ts`
- Create: `apps/auth/src/invites/usecases/revoke-invite.usecase.ts`
- Create: `apps/auth/src/users/usecases/list-users.usecase.ts`
- Create: `apps/auth/src/users/usecases/change-user-status.usecase.ts`
- Create: `apps/auth/src/users/usecases/replace-user-access.usecase.ts`
- Create: `apps/auth/src/sessions/usecases/revoke-user-sessions.usecase.ts`
- Create: `apps/auth/src/http/require-permission.guard.ts`
- Create: `apps/auth/src/http/admin-auth.controller.ts`
- Create: `apps/auth/src/http/admin.e2e.test.ts`
- Modify: `apps/auth/src/app.module.ts`

- [ ] **Step 1: Finalize atomic administrative contracts**

```ts
export type AdminMutationOutcome =
  | "updated"
  | "not_found"
  | "invalid_transition"
  | "would_remove_last_admin";

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  mfaChannel: MfaChannel | null;
  phoneVerified: boolean;
  roles: string[];
  permissions: Permission[];
  denies: Permission[];
  createdAt: Date;
}

export interface ChangeUserStatusCommand {
  actorUserId: string;
  targetUserId: string;
  nextStatus: "suspended" | "active" | "disabled";
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface UserRepository {
  list(input: {
    cursor: string | null;
    limit: number;
  }): Promise<{ users: AdminUserSummary[]; nextCursor: string | null }>;

  changeStatusPreservingCapableAdmin(
    command: ChangeUserStatusCommand,
  ): Promise<AdminMutationOutcome>;
}

export interface ReplaceAccessCommand {
  actorUserId: string;
  targetUserId: string;
  roleKeys: readonly string[];
  directPermissions: readonly {
    permission: Permission;
    effect: "allow" | "deny";
  }[];
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface CreatePendingUserWithInviteCommand {
  actorUserId: string;
  user: { id: string; email: string; name: string };
  roleKeys: readonly string[];
  directPermissions: readonly {
    permission: Permission;
    effect: "allow" | "deny";
  }[];
  invite: { id: string; tokenHash: string; expiresAt: Date };
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface ReissueInviteCommand {
  actorUserId: string;
  targetUserId: string;
  invite: { id: string; tokenHash: string; expiresAt: Date };
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export type ReissueInviteOutcome =
  | "reissued"
  | "not_found"
  | "invalid_state";

export interface RevokeInviteCommand {
  actorUserId: string;
  targetUserId: string;
  now: Date;
  auditEvents: readonly AuditEventInput[];
}

export interface RbacRepository {
  replaceAccessPreservingCapableAdmin(
    command: ReplaceAccessCommand,
  ): Promise<AdminMutationOutcome>;
}

export interface InviteRepository {
  createPendingUserWithAccessAndInvite(
    command: CreatePendingUserWithInviteCommand,
  ): Promise<void>;
  reissueInvite(
    command: ReissueInviteCommand,
  ): Promise<ReissueInviteOutcome>;
  revokePendingInvite(command: RevokeInviteCommand): Promise<boolean>;
}
```

Paginação ordena por `(created_at, id)` e cursor opaco Base64URL de JSON validado; limite default 50, mínimo 1, máximo 100.

- [ ] **Step 2: Write the last-capable-admin concurrency RED tests**

`changeStatusPreservingCapableAdmin` e `replaceAccessPreservingCapableAdmin` adquirem o mesmo advisory lock `timeline-auth:capable-admin`. Com dois admins e duas conexões, duas remoções concorrentes precisam resultar em um `updated` e um `would_remove_last_admin`, restando exatamente um capaz.

Administrador capaz:

- user `active`;
- post-image contém allow literal `*:manage` e cobre todas as ações via
  `coversSuperAdmin`;
- qualquer deny que retire parte da cobertura o torna não capaz.

Saída de `active` revoga todas as sessões e audita no mesmo commit. Transições aceitas: `active ↔ suspended` e qualquer não terminal → `disabled`. `pending_invite → active` só ocorre no aceite; `disabled` é terminal.

- [ ] **Step 3: Implement invite administration atomically**

Create invite valida e normaliza email/name, resolve todos os roles e permissions antes de escrever e usa `createPendingUserWithAccessAndInvite` para usuário + RBAC + convite + audit em uma transação. E-mail existente retorna conflito seguro.

Reissue:

- bloqueia user;
- exige `pending_invite`;
- revoga todos os convites anteriores;
- invalida attempts/challenges anteriores;
- preserva RBAC;
- insere um novo hash/link de sete dias;
- audita e devolve segredo uma vez.

Revoke faz a mesma invalidação, sem criar novo convite. Nunca há gateway de e-mail.

- [ ] **Step 4: Require full super-admin coverage**

Todas as rotas `/auth/admin` exigem bearer e `coversSuperAdmin(actor)`. Um token com `*:manage` mais `deny event:delete` não passa. Falha é 403 vazio. Não aceite permissões parciais como `user:manage` nesta etapa.

- [ ] **Step 5: Expose the exact administrative surface**

- `POST /auth/admin/invites` → 201 com `userId` e link único;
- `GET /auth/admin/users?cursor=&limit=` → 200;
- `PATCH /auth/admin/users/:userId/status` → 200;
- `PUT /auth/admin/users/:userId/access` → 200, substituição total;
- `POST /auth/admin/users/:userId/invite/reissue` → 200 com link único;
- `DELETE /auth/admin/users/:userId/invite` → 204;
- `POST /auth/admin/users/:userId/revoke-sessions` → 204.

Schemas são estritos, rejeitam duplicatas, roles desconhecidos, permissions fora do catálogo e efeitos desconhecidos. Rotas fixas de `users` ficam antes de qualquer parâmetro que possa capturá-las.

- [ ] **Step 6: Test conflicts, rollbacks, and authorization E2E**

Cubra 401 sem bearer, 403 para member, sucesso para admin capaz, 409 para e-mail existente/último admin, 404 genérico para alvo administrativo ausente e rollback por falha de audit. Compare as chaves exatas de `AdminUserSummary` e prove ausência de `passwordHash`, `phoneE164`, token, convite, recovery e qualquer hash. Prove ainda que trocar RBAC aparece no próximo refresh, não altera JWT antigo e nunca permite que o convidado escolha acesso no aceite.

- [ ] **Step 7: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/users/postgres-user.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/rbac/postgres-rbac.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/invites/postgres-invite.repository.integration.test.ts
npm run --silent test:ai apps/auth/src/http/admin.e2e.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth/src
git commit -m "feat(auth): add lockout-safe administration"
```

---

## Task 14: Harden HTTP Contracts, Routing, Redaction, and End-to-End Behavior

**Interfaces:**

- Consumes: todos os controllers/use cases das tarefas 5–13, a taxonomia da tarefa 1, `RequestContext`, `AuthenticatedActor` e `assertSafeAuditEvent`.
- Produces: a matriz HTTP final no `AuthExceptionFilter`, `RequirePermissionGuard`, `CurrentActor` e validadores Zod fechados para cada body/param/query; não cria novo contrato de domínio.

**Files:**

- Replace: `apps/auth/src/common/errors.ts`
- Replace: `apps/auth/src/http/auth-exception.filter.ts`
- Create: `apps/auth/src/http/validation.ts`
- Modify: all controllers under `apps/auth/src/http`
- Create: `apps/auth/src/http/error-contract.e2e.test.ts`
- Create: `apps/auth/src/http/routing.e2e.test.ts`
- Create: `apps/auth/src/http/redaction.e2e.test.ts`
- Create: `apps/auth/src/http/auth-stage-1.e2e.test.ts`
- Modify: `apps/auth/src/testing/create-test-app.ts`
- Modify: `apps/auth/src/testing/fake-http-server.ts`

- [ ] **Step 1: Write the complete error-matrix RED test**

Use um logger injetável e teste bytes da resposta, não apenas JSON:

| Situação | Status | Corpo externo |
|---|---:|---|
| JSON malformado, tipo/shape inválido | 400 | `{"code":"invalid_request"}` |
| body acima de 32 KiB | 413 | `{"code":"payload_too_large"}` |
| senha/telefone/canal semanticamente inválido | 422 | código allowlisted e mensagem segura |
| identidade, credencial, convite, MFA, step-up ou sessão inválido | 401 | zero bytes |
| ator autenticado sem autorização | 403 | zero bytes |
| rota ou recurso administrativo ausente | 404 | `{"code":"not_found"}` |
| conflito administrativo | 409 | código allowlisted |
| rate limit | 429 | zero bytes + `Retry-After` inteiro positivo |
| dependência obrigatória indisponível | 503 | `{"code":"service_unavailable"}` |
| falha real | 500 | `{"code":"internal_error","correlationId":"01K4A7W2F6M8R9T0V1X3Y5Z7AB"}` |

Allowlist 422: `password_length`, `password_control`, `password_context`, `password_compromised`, `invalid_phone`, `channel_unavailable`. Allowlist 409: `email_already_exists`, `invalid_status_transition`, `would_remove_last_admin`, `already_initialized`. Nenhuma mensagem menciona Twilio, HIBP, SQL, status de usuário ou existência do e-mail.

- [ ] **Step 2: Complete private-reason handling without changing the taxonomy**

Reutilize exatamente as classes e unions criadas na tarefa 1. Acrescente testes
de exaustividade para que uma nova subclasse sem mapping faça o teste falhar;
não duplique classes no módulo HTTP e não exponha `internalReason`.

O filtro usa `response.status(n).end()` para 401/403/429 e nunca serializa `Error.message` diretamente. Somente 500 recebe correlation id no corpo. A auditoria usa `internalReason`; o logger recebe evento estruturado já redigido.

- [ ] **Step 3: Lock runtime input validation and route order**

`parseBody(schema, value)` converte ZodError em 400, não 422. Sem coerção silenciosa de string→number/boolean. IDs de path precisam ser ULID válido; cursor/limit têm parser próprio.

Teste que cada rota pública/autenticada/admin chega ao handler correto e que strings como `me`, `login`, `refresh`, `invite` ou `recovery-codes` nunca são capturadas por `:userId`.

- [ ] **Step 4: Add secret-redaction tests**

Instrumente logger, audit fake e respostas com valores-canário distintos para password, OTP, invite, MFA token, refresh, recovery, Authorization, private key e telefone. Execute sucesso e cada falha. Busque os canários no output capturado e exija zero ocorrências.

Também prove:

- URL/path/query nunca contém token/código;
- provider body não é incorporado a erros;
- audit metadata recusa objeto com chave sensível;
- `X-Forwarded-For` e `x-user-id` não alteram contexto/ator;
- stack só aparece no logger de teste, nunca na resposta.

- [ ] **Step 5: Build one full real-app E2E journey**

Com Nest real, Postgres real e servidores HTTP fake:

1. migrate banco vazio e bootstrap admin;
2. inspect/start/verify convite e receber 10 recovery codes;
3. login OTP, refresh e logout;
4. login recovery sem Twilio;
5. step-up/regenerate e invalidar códigos anteriores;
6. criar member por admin, reemitir convite e provar link anterior inválido;
7. mudar RBAC e observar novos claims no refresh;
8. suspender member e impedir novos refreshes;
9. detectar reuso;
10. validar JWT usando somente snapshot do JWKS;
11. reiniciar app/pool e comprovar rate-limit persistente;
12. verificar health/live/ready e ETag/304 do JWKS.

Esse teste não substitui os testes menores; ele prova o wiring real.

- [ ] **Step 6: Verify and commit**

```powershell
npm run --silent test:ai apps/auth/src/http/error-contract.e2e.test.ts
npm run --silent test:ai apps/auth/src/http/routing.e2e.test.ts
npm run --silent test:ai apps/auth/src/http/redaction.e2e.test.ts
npm run --silent test:ai apps/auth/src/http/auth-stage-1.e2e.test.ts
pnpm --filter @repo/auth run typecheck
npm run --silent test:ai
git add apps/auth/src
git commit -m "feat(auth): harden HTTP error contracts"
```

---

## Task 15: Add Cleanup, Operational Runbooks, Smoke Tests, and Final Gates

**Interfaces:**

- Consumes: `AuthDatabase`, `Clock`, `AuditEventInput`, `OtpVerificationGateway`, `SECURITY_POLICY`, os CLIs anteriores e as três migrações.
- Produces: `cleanupAuthData(input: { db: AuthDatabase; now: Date; batchSize: number }): Promise<CleanupResult>`, `CleanupResult`, os scripts `db:migrate`, `db:rollback`, `bootstrap-admin`, `rotate-signing-key`, `cleanup` e `smoke:twilio`, além dos runbooks operacionais finais.

**Files:**

- Create: `apps/auth/src/cleanup/cleanup-auth-data.ts`
- Create: `apps/auth/src/cleanup/cleanup-auth-data.integration.test.ts`
- Create: `apps/auth/src/cli/cleanup-auth-data.cli.ts`
- Create: `apps/auth/src/cli/smoke-twilio.cli.ts`
- Create: `apps/auth/src/cli/smoke-twilio.cli.test.ts`
- Create: `apps/auth/ops/grant-runtime.sql`
- Modify: `apps/auth/package.json`
- Create: `docs/runbooks/auth-database.md`
- Create: `docs/runbooks/auth-bootstrap.md`
- Create: `docs/runbooks/auth-key-rotation.md`
- Create: `docs/runbooks/auth-data-retention.md`
- Create: `docs/runbooks/auth-twilio-smoke.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `.env.example` if final docs reveal a mismatch

- [ ] **Step 1: Write cleanup boundary and concurrency RED tests**

Contrato:

```ts
export interface CleanupResult {
  lockAcquired: boolean;
  sessionsEnded: number;
  authenticationAttemptsDeleted: number;
  mfaChallengesDeleted: number;
  rateLimitBucketsDeleted: number;
  invitesDeleted: number;
  recoveryCodesDeleted: number;
  sessionsDeleted: number;
  signingKeysRetired: number;
}
```

Use `pg_try_advisory_xact_lock` com `timeline-auth:cleanup`. Teste um milissegundo antes e exatamente no corte:

- attempts/challenges/buckets encerrados há 24 h;
- invites aceitos/revogados/expirados há 30 d;
- recovery codes usados/revogados há 90 d;
- sessions revogadas/encerradas há 90 d, com cascade de refresh;
- signing key `retiring` aposenta em `retire_after`, apaga material privado e mantém JWK pública;
- linhas anteriores de audit permanecem idênticas; a execução apenas acrescenta
  `key.retired` por chave e um `cleanup.completed`;
- falha em qualquer insert desses eventos reverte aposentadoria, deletes e
  `ended_at`;
- refresh consumido de sessão viva nunca é removido;
- sessão sem refresh não consumido e ainda válido recebe `ended_at` antes da retenção;
- segunda execução retorna contagens zero;
- duas execuções concorrentes: uma adquire lock, a outra retorna `lockAcquired=false` sem mutar.

Tempo terminal usa o evento mais recente relevante. Bucket usa `window_expires_at/blocked_until`; invite usa `accepted_at/revoked_at/expires_at`; código usa `used_at/revoked_at`; sessão usa `revoked_at/ended_at`.

- [ ] **Step 2: Implement cleanup as one bounded transaction**

Use deletes/updates por CTE com `RETURNING` para contagens determinísticas. Não faça loop sem limite; um run diário opera o conjunto elegível daquele snapshot. Se volume futuro exigir batches, isso será uma mudança operacional posterior com cursor explícito.

Ao aposentar key:

```sql
UPDATE signing_keys
SET status = 'retired',
    encrypted_private_key = NULL,
    retired_at = $now
WHERE status = 'retiring'
  AND retire_after <= $now;
```

Capture os `kid` por `RETURNING`, insira um `key.retired` para cada um e
`cleanup.completed` com contagens seguras antes do commit. O CLI imprime
somente JSON de `CleanupResult`.

- [ ] **Step 3: Add a real-provider smoke CLI**

`smoke-twilio` aceita, por exemplo, `--channel sms --phone +5511999999999`, inicia Verify, lê o código de um TTY com echo desabilitado, chama check uma vez e imprime somente `channel=sms status=approved` ou `channel=sms status=failed`. Recuse stdin não interativo e nunca aceite código por argumento, para não aparecer em histórico/process list.

Teste o CLI com gateway fake/injetado. O teste automatizado não chama Twilio real.

O gate de liberação do ambiente é obrigatoriamente real e separado da suite:

```powershell
if (-not $env:AUTH_SMOKE_PHONE_E164) { throw "Set AUTH_SMOKE_PHONE_E164 in the operator shell" }
pnpm --filter @repo/auth run smoke-twilio -- --channel sms --phone $env:AUTH_SMOKE_PHONE_E164
```

Repita com `--channel whatsapp` antes de habilitar
`AUTH_TWILIO_WHATSAPP_ENABLED=true`. Registre fora do repositório apenas
ambiente, canal, timestamp e `status=approved`; não registre telefone ou
código. Sem essa evidência, o canal permanece desabilitado e o critério
operacional 11 não está concluído.

- [ ] **Step 4: Add operational scripts**

```json
{
  "scripts": {
    "db:migrate": "tsx src/db/migrate.cli.ts",
    "bootstrap-admin": "tsx src/cli/bootstrap-admin.cli.ts",
    "rotate-signing-key": "tsx src/crypto/rotate-signing-key.cli.ts",
    "cleanup-auth-data": "tsx src/cli/cleanup-auth-data.cli.ts",
    "smoke-twilio": "tsx src/cli/smoke-twilio.cli.ts"
  }
}
```

Cada CLI carrega env, fecha pool em `finally`, usa exit code não zero em falha e não imprime configuração/segredo.

- [ ] **Step 5: Write exact runbooks**

`auth-database.md`:

- criar banco lógico/credenciais separados;
- aplicar migração com `AUTH_DATABASE_MIGRATION_URL`;
- provisionar runtime role com CONNECT/USAGE e privilégios necessários nas tabelas, mas somente INSERT em `audit_log`;
- executar, depois de cada migração:

```powershell
psql $env:AUTH_DATABASE_MIGRATION_URL -v runtime_role=timeline_auth_runtime -f apps/auth/ops/grant-runtime.sql
```

`grant-runtime.sql` usa `:"runtime_role"` como identificador psql, revoga
`CREATE` em `public` de `PUBLIC` e da role, concede USAGE e DML nas tabelas,
depois revoga tudo de `public.audit_log` e concede somente INSERT. Também
configura default privileges da role de migração para tabelas futuras; o
REVOKE específico de audit continua sendo reaplicado após cada migração.
- validar versão/readiness;
- rollback permitido somente com backup, janela e aprovação; scripts down são destrutivos e nunca automáticos.

`auth-key-rotation.md`:

- rotação agendada a cada 30 dias;
- comando, saída esperada, JWKS antes/depois;
- não aposentar antes de 930 s da última emissão;
- rollback operacional é manter/publicar retiring, nunca restaurar chave privada apagada.

`auth-bootstrap.md`:

- pré-condições de banco migrado, key ativa e URL web configurada;
- comando exato com `--email`/`--name` e armazenamento imediato do link;
- link em fragmento e natureza de exibição única;
- recuperação commit-before-output pela reexecução do mesmo e-mail pendente;
- recusas para e-mail diferente/admin fora do estado recuperável;
- verificação por inspect e procedimento de rollback sem apagar usuário/audit.

`auth-data-retention.md`:

- agendamento externo diário;
- todos os cortes, advisory lock, idempotência, métricas e procedimento de falha;
- auditoria fora do escopo de deleção.

`auth-twilio-smoke.md`:

- configurar Verify com código de seis dígitos, validade cinco minutos e no máximo cinco checks;
- validar sender/template/país/conta;
- executar smoke por canal habilitado;
- guardar a evidência sem PII e bloquear deploy/configuração do canal se
  `status=approved` não existir para o ambiente;
- WhatsApp permanece false até aprovação real;
- não registrar telefone/código.

- [ ] **Step 6: Update repository documentation without changing app boundaries**

Atualize a contagem para oito workspaces e documente `apps/auth`, porta 3002, banco lógico isolado e comandos. Não altere dependências de `apps/api`, `apps/web`, `apps/mobile` ou packages. Em `AGENTS.md`, preserve todas as regras existentes e acrescente somente auth, migração/CLIs e a exigência do Postgres descartável nos gates de integração.

- [ ] **Step 7: Run the final proof from a clean test database**

```powershell
docker compose -f apps/auth/compose.test.yaml up -d --wait
$env:NODE_ENV = "test"
$env:AUTH_TEST_DATABASE_URL = "postgresql://auth_test:auth_test@127.0.0.1:55432/timeline_auth_test"
$env:AUTH_REQUIRE_POSTGRES_TESTS = "true"
npm run --silent test:ai
pnpm --filter @repo/auth run typecheck
pnpm --filter @repo/auth run build
git diff --check
rg -n 'mfaEnabled|mfa_enabled|tokenVersion|token_version|\bver\b|access_grants|oauth_states' apps/auth/src --glob '!*.test.ts' --glob '!*.spec.ts'
rg -n 'cookie-parser' apps/auth/package.json
```

Esperado:

- testes: `Tests pass`, com integração/E2E executados;
- typecheck/build: exit 0;
- `git diff --check`: sem saída;
- ambos os `rg`: sem ocorrências;
- nenhum artefato `dist`, segredo ou arquivo de banco staged.

- [ ] **Step 8: Commit**

```powershell
git add apps/auth/package.json apps/auth/src/cleanup apps/auth/src/cli apps/auth/ops docs/runbooks README.md AGENTS.md .env.example
git commit -m "feat(auth): add operations and retention tooling"
```

---

## Spec Coverage Checklist

Antes de declarar a implementação concluída, marque cada linha com evidência do teste correspondente:

| Critério aprovado | Tarefas |
|---|---|
| Banco vazio, migrações e três roles | 3, 5, 8 |
| Bootstrap único e reexecução recuperável | 5 |
| Convite → senha → telefone → MFA → 10 códigos | 6–9 |
| MFA obrigatório; recovery substitui somente OTP | 9, 10, 12 |
| Refresh rotativo e reuso revoga sessão | 11 |
| Logout/suspensão bloqueiam novas emissões | 11, 13 |
| JWT local, claims estritos, JWKS e rotação segura | 1, 4, 11 |
| Step-up, troca de senha e regeneração atômicos | 12 |
| Rate limit persistente entre restart/réplicas | 3, 10, 14 |
| Twilio/HIBP fail closed e fake impossível fora do local | 2, 6, 7, 14 |
| Auditoria append-only, transacional e sem segredos | 3, 5, 8–14 |
| Retenção exata sem quebrar reuse detection | 15 |
| `*:manage` e último admin capaz sob concorrência | 5, 13 |
| 401/403 vazios, erros seguros e sem enumeração | 10, 14 |
| Sem OAuth/grants/cookies/apps consumidores | 1, 15 |
| Testes, typecheck e build oficiais | todas, gate final 15 |

## Implementation Stop Condition

A etapa termina quando todos os critérios acima têm teste verde, os três gates oficiais passam com Postgres de teste ativo e os runbooks permitem operar migração, bootstrap, rotação, smoke e cleanup. Não iniciar OAuth, integração com `apps/api`, BFF/web ou mobile nesta execução.
