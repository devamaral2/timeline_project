import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const ENV_EXAMPLE = resolve(ROOT, ".env.example");
const TOKEN_ENV = "OP_SERVICE_ACCOUNT_TOKEN";
const ENVIRONMENT_ID_ENV = "OP_ENVIRONMENT_ID";
const INITIAL_VALUES = {
  API_PORT: "3001",
  API_SERVICE_URL: "http://127.0.0.1:3001",
  AUTH_SERVICE_URL: "http://127.0.0.1:3002",
  WEB_PORT: "3000",
};
const SCOPES = Object.freeze({
  "api-runtime": {
    required: ["DATABASE_URL", "AUTH_SERVICE_URL", "AUTH_INTERNAL_SERVICE_KEY"],
    optional: ["OPENROUTER_API_KEY", "OPENROUTER_MODEL", "OPENROUTER_AGENT_MODEL"],
  },
  "auth-runtime": {
    required: [
      "NODE_ENV",
      "AUTH_DATABASE_URL",
      "AUTH_ISSUER",
      "AUTH_AUDIENCE",
      "AUTH_PUBLIC_URL",
      "AUTH_WEB_APP_URL",
      "AUTH_KEY_ENCRYPTION_KEY",
      "AUTH_INTERNAL_SERVICE_KEY",
      "API_SERVICE_URL",
    ],
    optional: [
      "AUTH_PASSWORD_BLOCKLIST_TIMEOUT_MS",
      "AUTH_PASSWORD_EMAIL_LIMIT",
      "AUTH_PASSWORD_IP_LIMIT",
      "AUTH_PASSWORD_WINDOW_SECONDS",
    ],
  },
  "web-build": {
    required: ["BACKEND_URL", "AUTH_SERVICE_URL"],
    optional: ["NODE_ENV"],
  },
});
const LOCAL_OVERRIDE_KEYS = new Set([
  "WEB_PORT",
  "API_PORT",
  "API_HOST",
  "AUTH_PORT",
  "AUTH_HOST",
  "POSTGRES_HOST_PORT",
  "AUTH_POSTGRES_DB",
  "BACKEND_URL",
  "AUTH_ISSUER",
  "AUTH_PUBLIC_URL",
  "AUTH_WEB_APP_URL",
  "AUTH_SERVICE_URL",
  "API_SERVICE_URL",
  "AUTH_INTERNAL_SERVICE_KEY",
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
  if (overrides.API_PORT) {
    env.API_SERVICE_URL = `http://127.0.0.1:${overrides.API_PORT}`;
  }
  if (!overrides.POSTGRES_HOST_PORT) return env;

  const user = encodeURIComponent(env.POSTGRES_USER);
  const password = encodeURIComponent(env.POSTGRES_PASSWORD);
  const host = `127.0.0.1:${overrides.POSTGRES_HOST_PORT}`;
  const database = encodeURIComponent(env.POSTGRES_DB);
  const authDatabase = encodeURIComponent(overrides.AUTH_POSTGRES_DB ?? `${env.POSTGRES_DB}_auth`);
  env.DATABASE_URL = `postgresql://${user}:${password}@${host}/${database}`;
  env.AUTH_DATABASE_URL = `postgresql://${user}:${password}@${host}/${authDatabase}`;
  env.AUTH_DATABASE_MIGRATION_URL = env.AUTH_DATABASE_URL;
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
 * Resolve o contrato solicitado a partir de um 1Password Environment.
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

export function scopeKeys(scope) {
  const definition = SCOPES[scope];
  if (!definition) throw error(`scope desconhecido: '${scope}'`);
  return definition;
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

  const scope = source.ONEPASSWORD_SCOPE;
  const definition = scope ? scopeKeys(scope) : { required: [...new Set(readEnvKeys())], optional: [] };
  const keys = [...new Set([...definition.required, ...definition.optional])];
  const client = await createClient(token);
  const localOverrides = readLocalOverrides();
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
  const missing = definition.required.filter((key) => {
    const value = variables.get(key) || localOverrides[key] || INITIAL_VALUES[key];
    return typeof value !== "string" || value.length === 0;
  });
  if (missing.length > 0) {
    throw error(
      `configuração incompleta no Environment '${environmentId}' para o scope '${scope ?? "default"}'; variável(is) ausente(s):\n- ${missing.join("\n- ")}`,
    );
  }
  const entries = keys.flatMap((key) => {
    const value = variables.get(key) || localOverrides[key] || INITIAL_VALUES[key];
    return typeof value === "string" && value.length > 0 ? [[key, value]] : [];
  });
  const resolved = Object.fromEntries(entries);
  const withFallbacks = {
    ...INITIAL_VALUES,
    API_SERVICE_URL: `http://127.0.0.1:${localOverrides.API_PORT ?? source.API_PORT ?? INITIAL_VALUES.API_PORT}`,
    ...localOverrides,
    ...resolved,
  };

  const environment = { ...source, ...withFallbacks };
  delete environment.ONEPASSWORD_SCOPE;
  return {
    env: applyLocalOverrides(environment, localOverrides),
    keys,
    environmentId,
  };
}

export function rootPath() {
  return ROOT;
}
