import type { NextResponse } from "next/server";

/**
 * Os tokens do apps/auth ficam em cookies httpOnly: o JavaScript da pagina
 * nunca os le. Quem os transforma em `Authorization: Bearer` e o proxy do Next
 * (`src/proxy.ts`), no caminho de `/api/*` para o Nest.
 */
export const ACCESS_TOKEN_COOKIE = "braid_access";
export const REFRESH_TOKEN_COOKIE = "braid_refresh";

/**
 * O refresh token so viaja para as rotas de sessao — nunca para a API do Nest,
 * que nao tem o que fazer com ele.
 */
const REFRESH_COOKIE_PATH = "/api/session";

/** O mesmo `refreshTokenTtlSeconds` do apps/auth; quem manda de verdade e ele. */
const REFRESH_TOKEN_FALLBACK_SECONDS = 30 * 24 * 60 * 60;

// `lax`: mutacoes vindas de outro site nao carregam a sessao. `secure` fica de
// fora so em desenvolvimento, que roda em http.
function baseOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds?: number;
  refreshTokenExpiresAt?: string;
}

export function setSessionCookies(response: NextResponse, tokens: SessionTokens): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...baseOptions(),
    path: "/",
    maxAge: tokens.accessTokenExpiresInSeconds ?? secondsUntilExpiry(tokens.accessToken),
  });

  const refreshExpiresAt = tokens.refreshTokenExpiresAt ? new Date(tokens.refreshTokenExpiresAt) : undefined;
  response.cookies.set(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...baseOptions(),
    path: REFRESH_COOKIE_PATH,
    ...(refreshExpiresAt && !Number.isNaN(refreshExpiresAt.getTime())
      ? { expires: refreshExpiresAt }
      : { maxAge: REFRESH_TOKEN_FALLBACK_SECONDS }),
  });
}

export function clearSessionCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_TOKEN_COOKIE, "", { ...baseOptions(), path: "/", maxAge: 0 });
  response.cookies.set(REFRESH_TOKEN_COOKIE, "", { ...baseOptions(), path: REFRESH_COOKIE_PATH, maxAge: 0 });
}

/**
 * O refresh do apps/auth nao devolve a validade do novo access token; ela vem
 * do `exp` do proprio JWT. So decodifica — quem verifica a assinatura e o
 * apps/auth, a cada GET /auth/me.
 */
export function secondsUntilExpiry(jwt: string, now = Date.now()): number {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()) as { exp?: unknown };
    if (typeof payload.exp === "number") return Math.max(0, Math.floor(payload.exp - now / 1000));
  } catch {
    // Token opaco ou malformado: cai no padrao abaixo.
  }
  return 15 * 60;
}
