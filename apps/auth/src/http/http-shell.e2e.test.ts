import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/create-test-app";

let testApp: TestApp | undefined;

afterEach(async () => {
  await testApp?.close();
  testApp = undefined;
});

describe("HTTP shell", () => {
  it("serves health, keeps valid correlation IDs, and replaces invalid values", async () => {
    testApp = await createTestApp();

    const live = await fetch(`${testApp.url}/health/live`, {
      headers: { "x-correlation-id": "request.id_01-accepted" },
    });
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "ok" });
    expect(live.headers.get("x-correlation-id")).toBe("request.id_01-accepted");

    const invalid = await fetch(`${testApp.url}/health/live`, {
      headers: { "x-correlation-id": "spaces are not valid" },
    });
    expect(invalid.headers.get("x-correlation-id")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it("uses safe generic JSON for unknown routes and methods", async () => {
    testApp = await createTestApp();

    const unknownRoute = await fetch(`${testApp.url}/not-a-route`);
    const unknownMethod = await fetch(`${testApp.url}/health/live`, { method: "POST" });

    expect(unknownRoute.status).toBe(404);
    expect(await unknownRoute.json()).toEqual({ code: "not_found" });
    expect(unknownMethod.status).toBe(404);
    expect(await unknownMethod.json()).toEqual({ code: "not_found" });
  });

  it("takes the peer IP from the socket instead of X-Forwarded-For", async () => {
    testApp = await createTestApp();

    const response = await fetch(`${testApp.url}/testing/request-context`, {
      headers: { "x-forwarded-for": "203.0.113.77", "user-agent": "auth-shell-test" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      correlationId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
      ipAddress: expect.not.stringMatching(/^203\.0\.113\.77$/),
      userAgent: "auth-shell-test",
    });
  });

  it("rejects an oversized JSON request without exposing parser details", async () => {
    testApp = await createTestApp();

    const response = await fetch(`${testApp.url}/not-a-route`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(32 * 1024) }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ code: "payload_too_large" });
    expect(response.headers.get("x-correlation-id")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
