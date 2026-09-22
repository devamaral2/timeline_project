import type { SessionTokens } from "./session-cookies";

const AUTH_REQUEST_TIMEOUT_MS = 5_000;

export interface SessionUser {
  userId: string;
  name: string;
  email: string | null;
}

export type AuthResult<T> = { ok: true; data: T } | { ok: false; status: number; retryAfter?: string | null };

function logAuthFailure(event: {
  path: string;
  url: string;
  status?: number;
  authCorrelationId?: string;
  code?: string;
  error?: { name: string; message: string } | string;
}): void {
  // Nunca registre init.body ou headers: login/refresh carregam credenciais.
  console.error("[AuthServiceClient] request failed", event);
}

async function safeFailureCode(response: Response): Promise<string | undefined> {
  if (!response.headers.get("content-type")?.includes("application/json")) return undefined;
  try {
    const body = (await response.json()) as unknown;
    if (typeof body === "object" && body !== null && "code" in body && typeof body.code === "string") {
      return body.code;
    }
  } catch {
    // O status, o correlation id e a falha de transporte continuam no log.
  }
  return undefined;
}

function authServiceUrl(): string {
  return process.env.AUTH_SERVICE_URL ?? "http://127.0.0.1:3002";
}

async function callAuth<T>(path: string, init: RequestInit, parse: (response: Response) => Promise<T>): Promise<AuthResult<T>> {
  const baseUrl = authServiceUrl();
  const url = `${baseUrl}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    logAuthFailure({
      path,
      url,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    return { ok: false, status: 503 };
  }
  if (!response.ok) {
    logAuthFailure({
      path,
      url,
      status: response.status,
      authCorrelationId: response.headers.get("x-correlation-id") ?? undefined,
      code: await safeFailureCode(response),
    });
    return { ok: false, status: response.status, retryAfter: response.headers.get("retry-after") };
  }
  try {
    return { ok: true, data: await parse(response) };
  } catch (error) {
    logAuthFailure({
      path,
      url,
      status: response.status,
      authCorrelationId: response.headers.get("x-correlation-id") ?? undefined,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    return { ok: false, status: 502 };
  }
}

function jsonBody(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export function login(email: string, password: string): Promise<AuthResult<SessionTokens>> {
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
