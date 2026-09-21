import test from "node:test";
import assert from "node:assert/strict";
import { readEnvKeys, resolveEnvironmentWithClient, applyLocalOverrides, scopeKeys } from "./loader.mjs";

test("uses the env example as the complete allowlist", () => {
  const keys = readEnvKeys();
  assert.ok(keys.includes("DATABASE_URL"));
  assert.ok(keys.includes("AUTH_KEY_ENCRYPTION_KEY"));
  assert.equal(keys.includes("METRO_PORT"), false);
  assert.equal(keys.includes("AUTH_POSTGRES_DB"), false);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.every((key) => /^[A-Z][A-Z0-9_]*$/.test(key)));
});

test("does not treat loader credentials as application variables", () => {
  const keys = readEnvKeys();
  assert.equal(keys.includes("OP_SERVICE_ACCOUNT_TOKEN"), false);
  assert.equal(keys.includes("OP_ENVIRONMENT_ID"), false);
});

test("resolves the complete contract before returning an environment", async () => {
  const client = {
    environments: {
      getVariables: async (environmentId) => ({
        variables: [
          { name: "DATABASE_URL", value: `value-for-${environmentId}-DATABASE_URL` },
          { name: "AUTH_KEY_ENCRYPTION_KEY", value: `value-for-${environmentId}-AUTH_KEY_ENCRYPTION_KEY` },
        ],
      }),
    },
  };

  await assert.doesNotReject(
    resolveEnvironmentWithClient(client, "timeline-local", ["DATABASE_URL", "AUTH_KEY_ENCRYPTION_KEY"]),
  );
});

test("throws before startup and reports every unresolved variable", async () => {
  const client = {
    environments: {
      getVariables: async () => ({
        variables: [{ name: "DATABASE_URL", value: "" }],
      }),
    },
  };

  await assert.rejects(
    resolveEnvironmentWithClient(client, "timeline-local", ["DATABASE_URL", "AUTH_KEY_ENCRYPTION_KEY"]),
    (cause) => {
      assert.match(cause.message, /configuração incompleta/);
      assert.match(cause.message, /DATABASE_URL/);
      assert.match(cause.message, /AUTH_KEY_ENCRYPTION_KEY/);
      return true;
    },
  );
});

test("uses safe initial values for non-secret local defaults", async () => {
  const client = {
    environments: {
      getVariables: async () => ({ variables: [] }),
    },
  };

  const entries = await resolveEnvironmentWithClient(client, "timeline-local", ["AUTH_SERVICE_URL", "WEB_PORT"], {
    AUTH_SERVICE_URL: "http://127.0.0.1:3002",
    WEB_PORT: "3000",
  });

  assert.deepEqual(entries, [
    ["AUTH_SERVICE_URL", "http://127.0.0.1:3002"],
    ["WEB_PORT", "3000"],
  ]);
});

test("allows a local override for the shared API/Auth service key", async () => {
  const client = {
    environments: {
      getVariables: async () => ({ variables: [] }),
    },
  };

  const entries = await resolveEnvironmentWithClient(
    client,
    "timeline-local",
    ["AUTH_INTERNAL_SERVICE_KEY"],
    { AUTH_INTERNAL_SERVICE_KEY: "timeline-local-internal-service-key-20260920" },
  );

  assert.deepEqual(entries, [
    ["AUTH_INTERNAL_SERVICE_KEY", "timeline-local-internal-service-key-20260920"],
  ]);
});

test("keeps the browser backend on Auth and the API service internal", () => {
  const environment = applyLocalOverrides(
    {
      API_PORT: "3101",
      AUTH_PORT: "3102",
      POSTGRES_USER: "timeline",
      POSTGRES_PASSWORD: "password",
      POSTGRES_DB: "timeline",
      WEB_PORT: "3100",
    },
    { POSTGRES_HOST_PORT: "55432", API_PORT: "3101", AUTH_PORT: "3102" },
  );

  assert.equal(environment.BACKEND_URL, "http://127.0.0.1:3102");
  assert.equal(environment.API_SERVICE_URL, "http://127.0.0.1:3101");
});

test("reports Environment API failures without starting the application", async () => {
  const client = {
    environments: {
      getVariables: async () => {
        throw new Error("permission denied");
      },
    },
  };

  await assert.rejects(
    resolveEnvironmentWithClient(client, "timeline-local", ["DATABASE_URL"]),
    /não foi possível ler o Environment 'timeline-local': permission denied/,
  );
});

test("defines minimal production scopes without requiring mobile or test variables", () => {
  assert.deepEqual(scopeKeys("api-runtime").required, ["DATABASE_URL", "AUTH_SERVICE_URL", "AUTH_INTERNAL_SERVICE_KEY"]);
  assert.ok(scopeKeys("auth-runtime").required.includes("AUTH_KEY_ENCRYPTION_KEY"));
  assert.deepEqual(scopeKeys("web-build").required, ["BACKEND_URL", "AUTH_SERVICE_URL"]);
});
