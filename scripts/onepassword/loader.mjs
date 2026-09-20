import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const ENV_EXAMPLE = resolve(ROOT, ".env.example");
const TOKEN_ENV = "OP_SERVICE_ACCOUNT_TOKEN";
const ENVIRONMENT_ID_ENV = "OP_ENVIRONMENT_ID";
const INITIAL_VALUES = {
  API_PORT: "3001",
  AUTH_SERVICE_URL: "http://127.0.0.1:3002",
  WEB_PORT: "3000",
};
const LOCAL_OVERRIDE_KEYS = new Set([
  "WEB_PORT",
  "API_PORT",
  "API_HOST",
  "AUTH_PORT",
  "AUTH_HOST",
  "METRO_PORT",
  "POSTGRES_HOST_PORT",
  "AUTH_POSTGRES_DB",
  "BACKEND_URL",
  "AUTH_ISSUER",
  "AUTH_PUBLIC_URL",
  "AUTH_WEB_APP_URL",
  "AUTH_SERVICE_URL",
  "API_SERVICE_URL",
  "AUTH_INTERNAL_SERVICE_KEY",
  "MOBILE_API_URL",
  "COMPOSE_PROJECT_NAME",
]);

function error(message) {
  return new Error(`[1Password] ${message}`);
}

export function readEnvKeys(file = ENV_EXAMPLE) {
  if (!existsSync(file)) throw error(`arquivo de contrato não encontrado: ${file}`);

  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.match(/^([A-Z][A-Z0-9_]*)\s*=/)?.[1])
    .filter(Boolean);
}

function readLocalOverrides(file = resolve(ROOT, ".env.local")) {
  if (!existsSync(file)) return {};
  const overrides = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match && LOCAL_OVERRIDE_KEYS.has(match[1])) overrides[match[1]] = match[2];
  }
  return overrides;
}

export function applyLocalOverrides(environment, overrides) {
  const env = { ...environment, ...overrides };
  if (!overrides.POSTGRES_HOST_PORT) return env;

  const user = encodeURIComponent(env.POSTGRES_USER);
  const password = encodeURIComponent(env.POSTGRES_PASSWORD);
  const host = `127.0.0.1:${overrides.POSTGRES_HOST_PORT}`;
  const database = encodeURIComponent(env.POSTGRES_DB);
  const authDatabase = encodeURIComponent(overrides.AUTH_POSTGRES_DB ?? `${env.POSTGRES_DB}_auth`);
  env.DATABASE_URL = `postgresql://${user}:${password}@${host}/${database}`;
  env.AUTH_DATABASE_URL = `postgresql://${user}:${password}@${host}/${authDatabase}`;
  env.AUTH_DATABASE_MIGRATION_URL = env.AUTH_DATABASE_URL;
  env.AUTH_TEST_DATABASE_URL = env.AUTH_DATABASE_URL;
  // O browser fala com o gateway do Auth. A API continua sendo um destino
  // interno, usado somente pelo Auth através de API_SERVICE_URL.
  env.BACKEND_URL = `http://127.0.0.1:${overrides.AUTH_PORT ?? env.AUTH_PORT}`;
  env.API_SERVICE_URL = `http://127.0.0.1:${overrides.API_PORT ?? env.API_PORT}`;
  env.AUTH_ISSUER = `http://127.0.0.1:${overrides.AUTH_PORT ?? env.AUTH_PORT}`;
  env.AUTH_PUBLIC_URL = env.AUTH_ISSUER;
  env.AUTH_SERVICE_URL = env.AUTH_ISSUER;
  env.AUTH_WEB_APP_URL = `http://localhost:${overrides.WEB_PORT ?? env.WEB_PORT}`;
  return env;
}

async function createClient(token) {
  const module = await import("@1password/sdk");
  const sdk = module.default ?? module;
  return sdk.createClient({
    auth: token,
    integrationName: "Braid runtime environment loader",
    integrationVersion: "1.0.0",
  });
}

function readEnvironmentVariables(response, environmentId) {
  if (!response || !Array.isArray(response.variables)) {
    throw error(`o Environment '${environmentId}' retornou uma resposta inválida`);
  }

  return new Map(response.variables.map(({ name, value }) => [name, value]));
}

/**
 * Resolve o contrato inteiro a partir de um 1Password Environment.
 * O SDK retorna todas as variáveis do Environment em uma única consulta.
 */
export async function resolveEnvironmentWithClient(client, environmentId, keys, fallbacks = {}) {
  let variables;
  try {
    variables = readEnvironmentVariables(
      await client.environments.getVariables(environmentId),
      environmentId,
    );
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith("[1Password]")) throw cause;
    throw error(`não foi possível ler o Environment '${environmentId}': ${cause?.message ?? cause}`);
  }

  const failures = keys.flatMap((key) => {
    const value = variables.get(key) || fallbacks[key];
    return typeof value === "string" && value.length > 0 ? [] : [`${key}: variável ausente ou vazia`];
  });

  if (failures.length > 0) {
    throw error(
      `configuração incompleta no Environment '${environmentId}'; ${failures.length} variável(is) não pôde(ram) ser resolvida(s):\n- ${failures.join("\n- ")}`,
    );
  }

  return keys.map((key) => [key, variables.get(key) || fallbacks[key]]);
}

export async function resolveOnePasswordSecret(key, source = process.env) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
    throw error(`nome de variável inválido: '${key}'`);
  }
  if (!readEnvKeys().includes(key)) {
    throw error(`'${key}' não está declarado em .env.example`);
  }

  const token = source[TOKEN_ENV];
  const environmentId = source[ENVIRONMENT_ID_ENV];
  if (!token) throw error(`${TOKEN_ENV} não está definido`);
  if (!environmentId) throw error(`${ENVIRONMENT_ID_ENV} não está definido`);

  const entries = await resolveEnvironmentWithClient(await createClient(token), environmentId, [key], INITIAL_VALUES);
  return entries[0][1];
}

export async function loadOnePasswordEnvironment(source = process.env) {
  const token = source[TOKEN_ENV];
  const environmentId = source[ENVIRONMENT_ID_ENV];
  if (!token) throw error(`${TOKEN_ENV} não está definido`);
  if (!environmentId) throw error(`${ENVIRONMENT_ID_ENV} não está definido`);

  const keys = [...new Set(readEnvKeys())];
  const client = await createClient(token);
  const localOverrides = readLocalOverrides();
  const entries = await resolveEnvironmentWithClient(client, environmentId, keys, {
    ...INITIAL_VALUES,
    ...localOverrides,
  });

  const resolved = { ...source, ...Object.fromEntries(entries) };
  return {
    env: applyLocalOverrides(resolved, localOverrides),
    keys,
    environmentId,
  };
}

export function rootPath() {
  return ROOT;
}
