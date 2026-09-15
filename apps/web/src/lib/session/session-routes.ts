import { NextResponse, type NextRequest } from "next/server";
import * as authService from "./auth-service";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from "./session-cookies";

/**
 * As rotas de `/api/session/*`. Vivem aqui, e nao nos `route.ts`, para que os
 * testes chamem as funcoes sem subir o Next.
 *
 * O corpo das respostas nunca carrega token: o navegador so recebe o usuario
 * e os cookies httpOnly.
 */

function failure(status: number, retryAfter?: string | null): NextResponse {
  const response = NextResponse.json({ code: codeFor(status) }, { status });
  if (retryAfter) response.headers.set("retry-after", retryAfter);
  return response;
}

function codeFor(status: number): string {
  if (status === 401) return "invalid_credentials";
  if (status === 429) return "rate_limited";
  if (status === 503) return "service_unavailable";
  return "session_error";
}

/** 4xx do apps/auth que nao sao 401/429 viram 400; 5xx viram 503. */
function normalizeStatus(status: number): number {
  if (status === 401 || status === 429) return status;
  if (status >= 500) return 503;
  return 400;
}

export async function getSession(request: NextRequest): Promise<NextResponse> {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!accessToken) return failure(401);

  const result = await authService.me(accessToken);
  if (!result.ok) return failure(result.status === 401 || result.status === 403 ? 401 : normalizeStatus(result.status));
  return NextResponse.json(result.data);
}

export async function postLogin(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  if (typeof body?.email !== "string" || typeof body.password !== "string" || !body.email || !body.password) {
    return failure(400);
  }

  const login = await authService.login(body.email, body.password);
  if (!login.ok) return failure(normalizeStatus(login.status), login.retryAfter);

  const user = await authService.me(login.data.accessToken);
  if (!user.ok) return failure(503);

  const response = NextResponse.json(user.data);
  setSessionCookies(response, login.data);
  return response;
}

export async function postRefresh(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) return failure(401);

  const refreshed = await authService.refresh(refreshToken);
  if (!refreshed.ok) {
    // Um refresh recusado (expirado, revogado ou reusado) encerra a sessao do
    // navegador. Uma queda do apps/auth nao: os cookies continuam para a
    // proxima tentativa.
    const response = failure(normalizeStatus(refreshed.status), refreshed.retryAfter);
    if (refreshed.status === 401) clearSessionCookies(response);
    return response;
  }

  const response = new NextResponse(null, { status: 204 });
  setSessionCookies(response, refreshed.data);
  return response;
}

export async function postLogout(request: NextRequest): Promise<NextResponse> {
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  // O logout do apps/auth e idempotente; mesmo com ele fora do ar o navegador
  // sai da sessao.
  if (refreshToken) await authService.logout(refreshToken);

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookies(response);
  return response;
}
