import { expect, test, vi } from "vitest";
import { getDatabaseEnv, getServerEnv, isLoopbackHost } from "./env";

test("reads server env from process env by key", () => {
  vi.stubEnv("OPENROUTER_API_KEY", "test-openrouter-key");
  vi.stubEnv("OPENROUTER_MODEL", "openai/gpt-4o-mini");

  expect(getServerEnv()).toMatchObject({
    OPENROUTER_API_KEY: "test-openrouter-key",
    OPENROUTER_MODEL: "openai/gpt-4o-mini",
  });
});

test("falls back to port 3001 when API_PORT is unset", () => {
  vi.stubEnv("API_PORT", "");

  expect(getServerEnv({ API_PORT: undefined }).API_PORT).toBe(3001);
});

test("binds to loopback unless API_HOST says otherwise", () => {
  vi.stubEnv("API_HOST", "");

  expect(getServerEnv({ API_HOST: undefined }).API_HOST).toBe("127.0.0.1");
  expect(getServerEnv({ API_HOST: "0.0.0.0" }).API_HOST).toBe("0.0.0.0");
});

test("defaults AUTH_SERVICE_URL to the apps/auth local port", () => {
  vi.stubEnv("AUTH_SERVICE_URL", "");

  expect(getServerEnv({ AUTH_SERVICE_URL: undefined }).AUTH_SERVICE_URL).toBe("http://127.0.0.1:3002");
  expect(getServerEnv({ AUTH_SERVICE_URL: "http://127.0.0.1:4002" }).AUTH_SERVICE_URL).toBe(
    "http://127.0.0.1:4002",
  );
});

test("recognizes the hosts that keep the API off the network", () => {
  expect(isLoopbackHost("127.0.0.1")).toBe(true);
  expect(isLoopbackHost("localhost")).toBe(true);
  expect(isLoopbackHost("::1")).toBe(true);
  expect(isLoopbackHost("0.0.0.0")).toBe(false);
  expect(isLoopbackHost("192.168.0.10")).toBe(false);
});

test("requires a PostgreSQL connection string", () => {
  expect(
    getDatabaseEnv({
      DATABASE_URL: "postgresql://timeline:timeline@127.0.0.1:5432/timeline",
    }).DATABASE_URL,
  ).toBe("postgresql://timeline:timeline@127.0.0.1:5432/timeline");
  expect(() => getDatabaseEnv({ DATABASE_URL: "" })).toThrow();
});
