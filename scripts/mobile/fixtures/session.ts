/**
 * Fixtures da sessão: o que o apps/auth devolve e aceita em `/auth/login`,
 * `/auth/token/refresh` e `/auth/me`.
 *
 * O apps/auth não exporta schemas Zod das respostas (só o OpenAPI em
 * `apps/auth/src/http/openapi.ts` e os corpos de entrada nos controllers), então
 * os schemas abaixo espelham esse OpenAPI e os `.strict()` dos controllers. Se o
 * Auth mudar, mude aqui: o teste Kotlin de contrato lê o JSON gerado.
 */
import type { FixtureContext } from "../generate-fixtures";

export function sessionFixtures({ z }: FixtureContext): Record<string, unknown> {
  const loginRequest = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(1024) }).strict();
  const refreshRequest = z.object({ refreshToken: z.string().min(1).max(1024) }).strict();
  const sessionTokens = z
    .object({
      accessToken: z.string(),
      refreshToken: z.string(),
      accessTokenExpiresInSeconds: z.number().int().optional(),
      refreshTokenExpiresAt: z.string().datetime().optional(),
    })
    .strict();
  const refreshedTokens = z.object({ accessToken: z.string(), refreshToken: z.string() }).strict();
  const currentUser = z
    .object({
      userId: z.string(),
      email: z.string(),
      name: z.string(),
      sessionId: z.string(),
      roles: z.array(z.string()),
      permissions: z.array(z.string()),
      denies: z.array(z.string()),
    })
    .strict();

  const validLogins = [
    { email: "admin@admin.com", password: "correct horse battery staple" },
    { email: "pessoa@exemplo.com", password: "x".repeat(1024) },
  ];
  const invalidLogins = [
    { email: "", password: "senha" },
    { email: "pessoa@exemplo.com", password: "" },
    { email: "e".repeat(321), password: "senha" },
    { email: "pessoa@exemplo.com", password: "x".repeat(1025) },
    { email: "pessoa@exemplo.com", password: "senha", remember: true },
  ];
  for (const body of validLogins) loginRequest.parse(body);
  for (const body of invalidLogins) {
    if (loginRequest.safeParse(body).success) throw new Error(`Invalid login example parsed: ${JSON.stringify(body).slice(0, 80)}`);
  }

  const refreshExample = { refreshToken: "refresh-token-opaco" };

  return {
    "session-login-request": { valid: validLogins, invalid: invalidLogins },
    "session-refresh-request": refreshRequest.parse(refreshExample),
    "session-login-tokens": sessionTokens.parse({
      accessToken: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEifQ.assinatura",
      refreshToken: "refresh-token-opaco",
      accessTokenExpiresInSeconds: 900,
      refreshTokenExpiresAt: "2026-12-17T12:00:00.000Z",
    }),
    "session-refreshed-tokens": refreshedTokens.parse({
      accessToken: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEiLCJyIjoxfQ.assinatura",
      refreshToken: "refresh-token-novo",
    }),
    "session-current-user": currentUser.parse({
      userId: "user-1",
      email: "admin@admin.com",
      name: "Admin",
      sessionId: "session-1",
      roles: ["admin"],
      permissions: ["tasks:read", "tasks:write"],
      denies: [],
    }),
  };
}
