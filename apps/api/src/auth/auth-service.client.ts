import { getServerEnv } from "../config/env";
import type { AuthenticatedUser } from "./authenticated-user";

const AUTH_ME_TIMEOUT_MS = 5_000;

interface AuthMeResponse {
  userId: string;
  roles: string[];
  permissions: string[];
}

/** Rede indisponivel ou apps/auth respondendo erro — nao e uma credencial invalida. */
export class AuthServiceRequestFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthServiceRequestFailedError";
  }
}

/** apps/auth recusou o token — 401 legitimo, distinto de falha de rede. */
export class AuthServiceUnauthorizedError extends Error {
  constructor(message = "Invalid or expired token") {
    super(message);
    this.name = "AuthServiceUnauthorizedError";
  }
}

/**
 * Client HTTP para GET /auth/me do apps/auth. Repassa o header Authorization
 * recebido pela API e devolve o AuthenticatedUser que o resto do apps/api
 * conhece. Padrao de fetch+timeout+erro segue os gateways do OpenRouter em
 * apps/api/src/events/gateways/.
 */
export class AuthServiceClient {
  constructor(private readonly baseUrl = getServerEnv().AUTH_SERVICE_URL) {}

  async me(authorization: string): Promise<AuthenticatedUser> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/auth/me`, {
        method: "GET",
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(AUTH_ME_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AuthServiceRequestFailedError(
        error instanceof Error ? error.message : "Failed to reach apps/auth",
      );
    }

    if (response.status === 401) {
      throw new AuthServiceUnauthorizedError();
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "<failed to read body>");
      console.error("[AuthServiceClient] GET /auth/me failed", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new AuthServiceRequestFailedError(`apps/auth request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as AuthMeResponse;
    return { userId: payload.userId, roles: payload.roles, permissions: payload.permissions };
  }
}
