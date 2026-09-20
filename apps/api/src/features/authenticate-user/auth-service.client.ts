import { getServerEnv } from "../../config/env";
import type { AuthenticatedUser } from "./authenticated-user";
import type { AccessAction, AccessResource } from "../authorize-user/access-resource.decorator";

const AUTH_REQUEST_TIMEOUT_MS = 5_000;

interface AuthorizedIdentityResponse {
  userId: string;
  sessionId?: string;
  email?: string;
  name?: string;
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

  async authorize(
    authorization: string,
    resource: AccessResource,
    action: AccessAction,
    targetUserId?: string,
  ): Promise<AuthenticatedUser> {
    return this.authorizeRequest("authorize", { resource, action, targetUserId }, authorization);
  }

  async authorizeSession(
    userId: string,
    sessionId: string,
    resource: AccessResource,
    action: AccessAction,
    targetUserId?: string,
  ): Promise<AuthenticatedUser> {
    return this.authorizeRequest("authorize-session", { userId, sessionId, resource, action, targetUserId });
  }

  private async authorizeRequest(
    path: string,
    body: Record<string, unknown>,
    authorization?: string,
  ): Promise<AuthenticatedUser> {
    const key = getServerEnv().AUTH_INTERNAL_SERVICE_KEY;
    if (!key) throw new AuthServiceRequestFailedError("AUTH_INTERNAL_SERVICE_KEY is not configured");
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/auth/internal/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-service-key": key,
          ...(authorization === undefined ? {} : { Authorization: authorization }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AuthServiceRequestFailedError(error instanceof Error ? error.message : "Failed to reach apps/auth");
    }
    if (response.status === 401) throw new AuthServiceUnauthorizedError();
    if (response.status === 403) throw new AuthServiceForbiddenError();
    if (!response.ok) throw new AuthServiceRequestFailedError(`apps/auth request failed with status ${response.status}`);
    const payload = (await response.json()) as AuthorizedIdentityResponse;
    if (!payload.userId || !payload.sessionId) throw new AuthServiceRequestFailedError("apps/auth returned no session identity");
    return { userId: payload.userId, sessionId: payload.sessionId, email: payload.email, displayName: payload.name };
  }
}
