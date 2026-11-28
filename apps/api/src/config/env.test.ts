import { resolve } from "node:path";
import { expect, test, vi } from "vitest";
import { getDatabaseEnv, getJobsEnv, getServerEnv, isLoopbackHost } from "./env";

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

test("recognizes the hosts that keep the API off the network", () => {
  expect(isLoopbackHost("127.0.0.1")).toBe(true);
  expect(isLoopbackHost("localhost")).toBe(true);
  expect(isLoopbackHost("::1")).toBe(true);
  expect(isLoopbackHost("0.0.0.0")).toBe(false);
  expect(isLoopbackHost("192.168.0.10")).toBe(false);
});

test("puts the SQLite file of the API under the monorepo root unless told otherwise", () => {
  const root = resolve(__dirname, "../../../..");
  expect(getDatabaseEnv({}).API_DATABASE_PATH).toBe(resolve(root, ".data/api.sqlite"));
  expect(getDatabaseEnv({ API_DATABASE_PATH: "" }).API_DATABASE_PATH).toBe(resolve(root, ".data/api.sqlite"));
  expect(getDatabaseEnv({ API_DATABASE_PATH: "/data/api.sqlite" }).API_DATABASE_PATH).toBe("/data/api.sqlite");
  expect(getDatabaseEnv({ API_DATABASE_PATH: "tmp/x.sqlite" }).API_DATABASE_PATH).toBe(resolve(root, "tmp/x.sqlite"));
});

test("queue config has defaults and bounds concurrency", () => {
  expect(getJobsEnv({}).AI_JOBS_CONCURRENCY).toBe(4);
  expect(getJobsEnv({}).AI_JOBS_POLL_MS).toBe(500);
  expect(() => getJobsEnv({ AI_JOBS_CONCURRENCY: "0" })).toThrow();
});
