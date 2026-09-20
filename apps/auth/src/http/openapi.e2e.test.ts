import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestApp } from "../testing/create-test-app";

let app: TestApp | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("API documentation", () => {
  it("publishes the OpenAPI contract and interactive Scalar reference", async () => {
    app = await createTestApp();

    const document = await fetch(`${app.url}/openapi.json`);
    expect(document.status).toBe(200);
    const openApi = (await document.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(openApi.openapi).toBe("3.1.1");
    expect(openApi.paths).toHaveProperty("/auth/login");
    expect(openApi.paths).toHaveProperty("/auth/admin/invites");
    expect(openApi.paths).toHaveProperty("/auth/internal/authorize");
    expect(openApi.paths).not.toHaveProperty("/auth/admin/users/{userId}/access");

    const reference = await fetch(`${app.url}/docs`);
    expect(reference.status).toBe(200);
    expect(reference.headers.get("content-type")).toContain("text/html");
    expect(await reference.text()).toContain("Braid Auth API");
  });
});
