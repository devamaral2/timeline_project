/**
 * As chamadas ao apps/auth. O app fala direto com ele pelo `MOBILE_AUTH_URL` —
 * nao ha Next no meio para guardar cookies, entao os tokens voltam no corpo e
 * quem os guarda e o `token-storage`.
 *
 * Recebe o host por parametro, e nao le o `env`, para que a logica seja testada
 * fora do runtime do Expo.
 */

const AUTH_REQUEST_TIMEOUT_MS = 10_000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  userId: string;
  name: string;
  email: string | null;
}

/** Por que uma chamada ao apps/auth nao deu certo. */
export type AuthFailure = "invalid_credentials" | "rate_limited" | "unavailable";

export class AuthRequestError extends Error {
  constructor(
    readonly reason: AuthFailure,
    readonly status: number,
  ) {
    super(`apps/auth request failed: ${reason} (${status})`);
    this.name = "AuthRequestError";
  }
}

function reasonFor(status: number): AuthFailure {
  if (status === 401 || status === 403) return "invalid_credentials";
  if (status === 429) return "rate_limited";
  // 422 de login (campo invalido) tambem e credencial errada para quem digitou.
  if (status >= 400 && status < 500) return "invalid_credentials";
  return "unavailable";
}

export function createAuthClient(baseUrl: string) {
  async function call(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS) });
    } catch {
      throw new AuthRequestError("unavailable", 0);
    }
    if (!response.ok) throw new AuthRequestError(reasonFor(response.status), response.status);
    return response;
  }

  const post = (path: string, body: unknown) =>
    call(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  return {
    async login(email: string, password: string): Promise<AuthTokens> {
      const body = (await (await post("/auth/login", { email, password })).json()) as AuthTokens;
      return { accessToken: body.accessToken, refreshToken: body.refreshToken };
    },

    async refresh(refreshToken: string): Promise<AuthTokens> {
      const body = (await (await post("/auth/token/refresh", { refreshToken })).json()) as AuthTokens;
      return { accessToken: body.accessToken, refreshToken: body.refreshToken };
    },

    /** Idempotente no apps/auth: um token ja revogado tambem responde 204. */
    async logout(refreshToken: string): Promise<void> {
      await post("/auth/logout", { refreshToken });
    },

    async me(accessToken: string): Promise<AuthUser> {
      const response = await call("/auth/me", { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
      const body = (await response.json()) as AuthUser;
      return { userId: body.userId, name: body.name, email: body.email };
    },
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
