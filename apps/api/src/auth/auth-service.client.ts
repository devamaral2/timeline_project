import { getServerEnv } from "../config/env";
import type { AuthenticatedUser } from "./authenticated-user";

const AUTH_ME_TIMEOUT_MS = 5_000;

interface AuthMeResponse {
  userId: string;
  email?: string;
  name?: string;
  roles?: string[];
  permissions?: string[];
}

export class AuthServiceRequestFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthServiceRequestFailedError";
  }
}

export class AuthServiceUnauthorizedError extends Error {
  constructor(message = "Invalid or expired token") {
    super(message);
    this.name = "AuthServiceUnauthorizedError";
  }
}

export class AuthServiceForbiddenError extends Error {
  constructor(message = "Authenticated user is not allowed") {
    super(message);
    this.name = "AuthServiceForbiddenError";
  }
}

/** Consulta apps/auth sem expor os detalhes do JWT ao restante da API. */
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

    if (response.status === 401) throw new AuthServiceUnauthorizedError();
    if (response.status === 403) throw new AuthServiceForbiddenError();
    if (!response.ok) {
      throw new AuthServiceRequestFailedError(`apps/auth request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as AuthMeResponse;
    if (!payload.userId) throw new AuthServiceRequestFailedError("apps/auth returned no userId");
    return {
      userId: payload.userId,
      email: payload.email,
      displayName: payload.name,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
