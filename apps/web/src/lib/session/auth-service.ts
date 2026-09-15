import type { SessionTokens } from "./session-cookies";

const AUTH_REQUEST_TIMEOUT_MS = 5_000;

/** O usuario da sessao, do jeito que as telas do web o conhecem. */
export interface SessionUser {
  userId: string;
  name: string;
  email: string | null;
}

/** O que o apps/auth respondeu. Sem conseguir nem perguntar, o status e 503. */
export type AuthResult<T> = { ok: true; data: T } | { ok: false; status: number; retryAfter?: string | null };

function authServiceUrl(): string {
  return process.env.AUTH_SERVICE_URL ?? "http://127.0.0.1:3002";
}

async function callAuth<T>(path: string, init: RequestInit, parse: (response: Response) => Promise<T>): Promise<AuthResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${authServiceUrl()}${path}`, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 503 };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, retryAfter: response.headers.get("retry-after") };
  }
  return { ok: true, data: await parse(response) };
}

function jsonBody(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function login(email: string, password: string): Promise<AuthResult<Required<SessionTokens>>> {
  return callAuth("/auth/login", jsonBody({ email, password }), (response) => response.json());
}

export function refresh(refreshToken: string): Promise<AuthResult<SessionTokens>> {
  return callAuth("/auth/token/refresh", jsonBody({ refreshToken }), (response) => response.json());
}

export function logout(refreshToken: string): Promise<AuthResult<void>> {
  return callAuth("/auth/logout", jsonBody({ refreshToken }), async () => undefined);
}

export function me(accessToken: string): Promise<AuthResult<SessionUser>> {
  return callAuth(
    "/auth/me",
    { method: "GET", headers: { authorization: `Bearer ${accessToken}` } },
    async (response) => {
      const body = (await response.json()) as SessionUser;
      return { userId: body.userId, name: body.name, email: body.email };
    },
  );
}
