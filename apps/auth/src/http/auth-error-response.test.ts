import { describe, expect, it } from "vitest";
import { RecordingAuthLogger } from "../common/logger";
import {
  AccessDeniedError,
  AuthenticationFailedError,
  ConflictError,
  NotFoundError,
  RateLimitedError,
  RequiredDependencyUnavailableError,
  SemanticInputError,
} from "../common/errors";
import { toAuthErrorResponse } from "./auth-error-response";

const CORRELATION_ID = "corr-1";

function map(exception: unknown, status?: number) {
  const logger = new RecordingAuthLogger();
  const response = toAuthErrorResponse(exception, { correlationId: CORRELATION_ID, logger, status });
  return { response, logger };
}

describe("auth error to HTTP response", () => {
  it("always echoes the correlation id", () => {
    expect(map(new AccessDeniedError()).response.headers).toEqual({ "X-Correlation-Id": CORRELATION_ID });
  });

  it("translates an authentication failure into an empty 401 and logs only the internal reason", () => {
    const { response, logger } = map(new AuthenticationFailedError("leak-probe: unknown email"));

    expect(response).toEqual({
      status: 401,
      headers: { "X-Correlation-Id": CORRELATION_ID },
      body: undefined,
    });
    expect(logger.events).toEqual([
      {
        correlationId: CORRELATION_ID,
        status: 401,
        error: "AuthenticationFailedError",
        reason: "leak-probe: unknown email",
      },
    ]);
  });

  it("translates an access denial into an empty 403 without logging a secret", () => {
    const { response, logger } = map(new AccessDeniedError("leak-probe: missing permission"));

    expect(response.status).toBe(403);
    expect(response.body).toBeUndefined();
    expect(logger.events).toEqual([]);
  });

  it("translates the rate limit with the Retry-After ceiling", () => {
    const { response, logger } = map(new RateLimitedError(42.3, "leak-probe: too many tries"));

    expect(response.status).toBe(429);
    expect(response.headers["Retry-After"]).toBe("43");
    expect(response.body).toBeUndefined();
    expect(logger.events).toEqual([
      {
        correlationId: CORRELATION_ID,
        status: 429,
        error: "RateLimitedError",
        reason: "leak-probe: too many tries",
      },
    ]);
  });

  it("never sends Retry-After below one second", () => {
    expect(map(new RateLimitedError(0.1, "too many")).response.headers["Retry-After"]).toBe("1");
  });

  it("serializes only the allowlisted semantic input code", () => {
    const { response, logger } = map(new SemanticInputError("password_compromised"));

    expect(response).toMatchObject({ status: 422, body: { code: "password_compromised" } });
    expect(logger.events).toEqual([]);
  });

  it("serializes only the allowlisted conflict code", () => {
    const { response } = map(new ConflictError("would_remove_last_admin"));

    expect(response).toMatchObject({ status: 409, body: { code: "would_remove_last_admin" } });
  });

  it("translates a missing resource into not_found", () => {
    const { response } = map(new NotFoundError("leak-probe: no such user"));

    expect(response).toMatchObject({ status: 404, body: { code: "not_found" } });
  });

  it("translates an unavailable dependency into service_unavailable and logs the reason", () => {
    const { response, logger } = map(new RequiredDependencyUnavailableError("leak-probe: provider down"));

    expect(response).toMatchObject({ status: 503, body: { code: "service_unavailable" } });
    expect(logger.events).toEqual([
      {
        correlationId: CORRELATION_ID,
        status: 503,
        error: "RequiredDependencyUnavailableError",
        reason: "leak-probe: provider down",
      },
    ]);
  });

  it.each([
    [400, 400, { code: "invalid_request" }],
    [413, 413, { code: "payload_too_large" }],
    [401, 401, undefined],
    [403, 403, undefined],
    [404, 404, { code: "not_found" }],
    [503, 503, { code: "service_unavailable" }],
  ])("maps a generic HTTP status %i to %i with its body", (givenStatus, expectedStatus, body) => {
    const { response } = map(new Error("transport failure"), givenStatus);

    expect(response.status).toBe(expectedStatus);
    expect(response.body).toEqual(body);
  });

  it("maps a generic 429 to an empty response with Retry-After one second", () => {
    const { response } = map(new Error("transport rate limit"), 429);

    expect(response.status).toBe(429);
    expect(response.body).toBeUndefined();
    expect(response.headers["Retry-After"]).toBe("1");
  });

  it("maps an unknown 409 to a 500 instead of leaking a code outside the allowlist", () => {
    const { response } = map(new Error("unexpected conflict"), 409);

    expect(response.status).toBe(500);
    expect(response.body).toMatchObject({ code: "internal_error", correlationId: CORRELATION_ID });
  });

  it("turns an unknown failure into a 500 that carries only the correlation id", () => {
    const error = new Error("leak-probe: unexpected");
    error.stack = "leak-probe: stack";
    const { response, logger } = map(error);

    expect(response).toMatchObject({
      status: 500,
      body: { code: "internal_error", correlationId: CORRELATION_ID },
    });
    expect(JSON.stringify(response.body)).not.toContain("leak-probe");
    expect(logger.events).toEqual([
      {
        correlationId: CORRELATION_ID,
        status: 500,
        error: "Error",
        message: "leak-probe: unexpected",
        stack: "leak-probe: stack",
      },
    ]);
  });
});
