import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
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
  // Valores padrão dos jobs de IA; sobrescrevíveis pelo Environment ou .env.local.
  AI_JOBS_CONCURRENCY: "4",
  AI_JOBS_LEASE_MS: "60000",
  AI_JOBS_MAX_ATTEMPTS: "4",
  AI_JOBS_POLL_MS: "500",
  // Rota do Hermes (ADR 004): desligada, e o Hermes local no loopback.
  AI_AUTOMATION: "off",
  HERMES_URL: "http://127.0.0.1:8642",
  // ADR 0005: pasta de skills e agentes do Hermes, a mesma que o compose do Hermes monta em /opt/agent-files.
  AGENT_FILES_DIR: resolve(homedir(), ".braid", "agent-files"),
};
// Chaves do .env.example que o carregador padrao usa quando existem, mas que nao impedem `pnpm dev` de subir.
// O modo modelo (ADR 0019) liga cada provedor cuja chave existe; o token do MCP liga as ferramentas da agenda dele.
const DEFAULT_SCOPE_OPTIONAL_KEYS = new Set([
  "HERMES_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "MCP_TOKEN", "MCP_OWNER_USER_ID",
  // Servico local de transcricao (apps/transcriber): roda no computador de casa, nao em `pnpm dev`.
  "TRANSCRIBER_API_URL", "TRANSCRIBER_DEVICE_KEY", "HF_TOKEN",
  // API e auth em SQLite (ADR 0024 e 0025): o Postgres antigo so serve a copia unica dos dados do auth e ao teardown
  // de worktree do modelo antigo.
  "POSTGRES_USER", "POSTGRES_PASSWORD", "POSTGRES_DB", "POSTGRES_HOST_PORT",
  "DATABASE_URL", "AUTH_DATABASE_URL", "AUTH_TEST_DATABASE_URL",
]);
const SCOPES = Object.freeze({
  "api-runtime": {
    // A fila de jobs de IA e a tabela `jobs` do proprio banco (ADR 0013): nao
    // ha broker nem prefixo de fila para configurar. O banco e um arquivo SQLite
    // no volume do pod (API_DATABASE_PATH, no manifesto), sem segredo (ADR 0024).
    required: ["AUTH_SERVICE_URL", "AUTH_INTERNAL_SERVICE_KEY"],
    optional: [
      "OPENROUTER_API_KEY",
      "OPENROUTER_MODEL",
      "AI_AUTOMATION",
      "HERMES_URL",
      "HERMES_API_KEY",
      "AGENT_FILES_DIR",
      "AGENT_CONFIG_OWNER_USER_ID",
      "JEV_API_KEY",
      // Modo modelo do chat (ADR 0019): as chaves dos provedores e o MCP da agenda, com o dono que ele representa.
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "MCP_URL",
      "MCP_TOKEN",
      "MCP_OWNER_USER_ID",
      "AI_JOBS_CONCURRENCY",
      "AI_JOBS_LEASE_MS",
      "AI_JOBS_MAX_ATTEMPTS",
      "AI_JOBS_POLL_MS",
    ],
  },
  "auth-runtime": {
    // O banco e um arquivo SQLite no volume do pod (AUTH_DATABASE_PATH, no manifesto), sem segredo (ADR 0025).
    required: [
      "NODE_ENV",
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
  // Container do Hermes (ADR 004): imagem de terceiros, sem o loader dentro.
  // O valor chega por `secrets:exec` (local) ou pelo Secret `hermes-env` (VPS).
  "hermes-runtime": {
    required: ["HERMES_API_KEY", "OPENROUTER_API_KEY", "MCP_TOKEN"],
    optional: [],
  },
  // Servidor MCP que o Hermes usa para criar entidades (ADR 004). Age sempre como
  // MCP_OWNER_USER_ID. Em producao API_SERVICE_URL vem do Environment, porque o
  // fallback do loader aponta para 127.0.0.1.
  "mcp-runtime": {
    required: ["MCP_TOKEN", "AUTH_INTERNAL_SERVICE_KEY", "MCP_OWNER_USER_ID"],
    optional: ["API_SERVICE_URL"],
  },
  // Servico local de transcricao (apps/transcriber, spec #39): so a chave de dispositivo e o endereco do
  // gateway. A chave so serve em /api/transcription-worker/*. HF_TOKEN e do pyannote (Hugging Face).
  "transcriber-runtime": {
    required: ["TRANSCRIBER_API_URL", "TRANSCRIBER_DEVICE_KEY"],
    optional: [
      "HF_TOKEN",
      "TRANSCRIBER_MAX_DURATION_HOURS",
      "TRANSCRIBER_MAX_AUDIO_MB",
      "TRANSCRIBER_CACHE_DIR",
      "TRANSCRIBER_CACHE_DAYS",
      "TRANSCRIBER_POLL_SECONDS",
    ],
  },
  "web-build": {
    required: ["BACKEND_URL", "AUTH_SERVICE_URL"],
    optional: ["NODE_ENV"],
  },
});
const LOCAL_OVERRIDE_KEYS = new Set([
  // Marca o .env.local de uma worktree: com ele, as URLs entre os servicos saem das portas dela.
  "WORKTREE_SLUG",
  "AGENT_CONFIG_OWNER_USER_ID",
  "WEB_PORT",
  "API_PORT",
  "API_HOST",
  "AUTH_PORT",
  "AUTH_HOST",
  // Por worktree: a porta do MCP e o id do admin da base dessa worktree.
  "MCP_PORT",
  "MCP_OWNER_USER_ID",
  // Liga a rota do Hermes so nesta worktree, sem mexer no 1Password.
  "AI_AUTOMATION",
  "HERMES_URL",
  "POSTGRES_HOST_PORT",
  "POSTGRES_DB",
  "AUTH_POSTGRES_DB",
  "BACKEND_URL",
  "AUTH_ISSUER",
  "AUTH_PUBLIC_URL",
  "AUTH_WEB_APP_URL",
  "AUTH_SERVICE_URL",
  "API_SERVICE_URL",
  "AUTH_INTERNAL_SERVICE_KEY",
  "COMPOSE_PROJECT_NAME",
  "AI_JOBS_CONCURRENCY",
  "AI_JOBS_LEASE_MS",
  "AI_JOBS_MAX_ATTEMPTS",
  "AI_JOBS_POLL_MS",
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

export function readLocalOverrides(file = resolve(ROOT, ".env.local")) {
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
  // POSTGRES_HOST_PORT tambem vale: e o que o .env.local da principal, sem WORKTREE_SLUG, usa.
  if (!overrides.WORKTREE_SLUG && !overrides.POSTGRES_HOST_PORT) return env;

  // So para `db:copy-from-postgres`: aponta a URL para o Postgres antigo local.
  if (overrides.POSTGRES_HOST_PORT && env.POSTGRES_USER && env.POSTGRES_PASSWORD && env.POSTGRES_DB) {
    const user = encodeURIComponent(env.POSTGRES_USER);
    const password = encodeURIComponent(env.POSTGRES_PASSWORD);
    const authDatabase = encodeURIComponent(overrides.AUTH_POSTGRES_DB ?? `${env.POSTGRES_DB}_auth`);
    env.AUTH_DATABASE_URL = `postgresql://${user}:${password}@127.0.0.1:${overrides.POSTGRES_HOST_PORT}/${authDatabase}`;
  }
  // O browser fala com o gateway do Auth. A API continua sendo um destino
  // interno, usado somente pelo Auth através de API_SERVICE_URL.
  env.BACKEND_URL = `http://127.0.0.1:${overrides.AUTH_PORT ?? env.AUTH_PORT}`;
  env.API_SERVICE_URL = `http://127.0.0.1:${overrides.API_PORT ?? env.API_PORT}`;
  env.AUTH_ISSUER = `http://127.0.0.1:${overrides.AUTH_PORT ?? env.AUTH_PORT}`;
  env.AUTH_PUBLIC_URL = env.AUTH_ISSUER;
  env.AUTH_SERVICE_URL = env.AUTH_ISSUER;
  // Worktrees expostas pelo Caddy (<slug>.braid.local) gravam a propria origem.
  env.AUTH_WEB_APP_URL = overrides.AUTH_WEB_APP_URL ?? `http://localhost:${overrides.WEB_PORT ?? env.WEB_PORT}`;
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

export function defaultScope() {
  const keys = [...new Set(readEnvKeys())];
  return {
    required: keys.filter((key) => !DEFAULT_SCOPE_OPTIONAL_KEYS.has(key)),
    optional: keys.filter((key) => DEFAULT_SCOPE_OPTIONAL_KEYS.has(key)),
  };
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
  const definition = scope ? scopeKeys(scope) : defaultScope();
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
