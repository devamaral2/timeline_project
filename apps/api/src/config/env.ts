import { resolve } from "node:path";
import { z } from "zod";

const serverSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3001),
  // Interface em que o Nest escuta. O padrao — e o unico valor de producao — e
  // o loopback: quem fala com o backend e o Next, na mesma maquina. Em
  // desenvolvimento, `0.0.0.0` deixa o app mobile rodando no celular alcancar a
  // API pela rede local.
  API_HOST: z.string().min(1).default("127.0.0.1"),
  AUTH_INTERNAL_SERVICE_KEY: z.string().min(32).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  JEV_API_KEY: z.string().min(1).optional(),
  OPENROUTER_MODEL: z.string().min(1).optional(),
  // Modelo dos agentes de entidade (ADR 003), em chamadas estruturadas. Sem valor, cai no OPENROUTER_MODEL.
  OPENROUTER_PROCESS_MODEL: z.string().min(1).optional(),
  // Raciocinio do fallback escolhido (`fallback: <pedido>`), mostrado na aba "Processo" do chat. `off`
  // desliga. Os outros agentes nunca pensam: cada chamada leva ~1 s.
  OPENROUTER_PROCESS_REASONING: z.enum(["off", "low", "medium", "high"]).default("low"),
  // Rota do Hermes (ADR 004): `POST /api/requests/hermes`. Desligada por padrao; ligada exige a chave do Hermes.
  AI_AUTOMATION: z.enum(["off", "on"]).default("off"),
  HERMES_URL: z.string().url().default("http://127.0.0.1:8642"),
  HERMES_API_KEY: z.string().min(1).optional(),
  // Dono da configuracao editavel do agente (ADR 0004). Sem valor, ninguem altera a configuracao.
  AGENT_CONFIG_OWNER_USER_ID: z.string().min(1).optional(),
  // Pasta de skills e agentes compartilhada com o Hermes (ADR 0005). Sem valor, vale o padrao de fabrica.
  AGENT_FILES_DIR: z.string().min(1).optional(),
  // Modo modelo do chat (ADR 0019): `POST /api/requests/model`. Cada chave liga um provedor no seletor (o OpenRouter
  // usa a `OPENROUTER_API_KEY` de cima); sem nenhuma, as rotas do modo respondem 404.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  // O MCP da agenda (apps/mcp), pelo qual o modelo le, cria e edita as entidades do dono. Sem o token, o modelo so
  // conversa. Sem a URL, vale a porta local do MCP (`MCP_PORT`).
  MCP_URL: z.string().url().optional(),
  MCP_TOKEN: z.string().min(32).optional(),
  // O dono que o MCP representa: so ele usa o modo modelo enquanto as ferramentas da agenda estao ligadas.
  MCP_OWNER_USER_ID: z.string().min(1).optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Em arquivos .env uma chave sem valor (`API_PORT=`) chega como string vazia, e
 * nao como ausente. Tratar as duas do mesmo jeito evita que `API_PORT=` vire a
 * porta 0.
 */
function orUndefined(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

export function getServerEnv(source?: Record<string, string | undefined>): ServerEnv {
  const read = (key: keyof ServerEnv) => orUndefined(source?.[key] ?? process.env[key]);

  return serverSchema.parse({
    API_PORT: read("API_PORT"),
    API_HOST: read("API_HOST"),
    AUTH_INTERNAL_SERVICE_KEY: read("AUTH_INTERNAL_SERVICE_KEY"),
    OPENROUTER_API_KEY: read("OPENROUTER_API_KEY"),
    JEV_API_KEY: read("JEV_API_KEY"),
    OPENROUTER_MODEL: read("OPENROUTER_MODEL"),
    OPENROUTER_PROCESS_MODEL: read("OPENROUTER_PROCESS_MODEL"),
    OPENROUTER_PROCESS_REASONING: read("OPENROUTER_PROCESS_REASONING"),
    AI_AUTOMATION: read("AI_AUTOMATION"),
    HERMES_URL: read("HERMES_URL"),
    HERMES_API_KEY: read("HERMES_API_KEY"),
    AGENT_CONFIG_OWNER_USER_ID: read("AGENT_CONFIG_OWNER_USER_ID"),
    AGENT_FILES_DIR: read("AGENT_FILES_DIR"),
    ANTHROPIC_API_KEY: read("ANTHROPIC_API_KEY"),
    OPENAI_API_KEY: read("OPENAI_API_KEY"),
    MCP_URL: read("MCP_URL") ?? localMcpUrl(orUndefined(source?.MCP_PORT ?? process.env.MCP_PORT)),
    MCP_TOKEN: read("MCP_TOKEN"),
    MCP_OWNER_USER_ID: read("MCP_OWNER_USER_ID"),
  });
}

/** Em desenvolvimento o MCP sobe no loopback, na porta da worktree (`MCP_PORT`, 3003 por padrao). */
function localMcpUrl(port: string | undefined): string {
  return `http://127.0.0.1:${port ?? "3003"}/mcp`;
}

/**
 * Um bind de loopback so aceita conexoes da propria maquina. Qualquer outro
 * valor expoe a API na rede, o que muda o que o servidor precisa fazer: e o
 * gatilho para ligar o CORS no `main.ts`.
 */
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

/** A raiz do monorepo, a partir de `src/config` ou de `dist/config`. */
const MONOREPO_ROOT = resolve(__dirname, "../../../..");

const databaseSchema = z.object({
  // O arquivo SQLite da API (ADR 0024). Sem valor, `.data/api.sqlite` na raiz do monorepo: cada worktree tem o seu.
  API_DATABASE_PATH: z.string().min(1).default(resolve(MONOREPO_ROOT, ".data/api.sqlite")),
});

export type DatabaseEnv = z.infer<typeof databaseSchema>;

export function getDatabaseEnv(source?: Record<string, string | undefined>): DatabaseEnv {
  const read = (key: keyof DatabaseEnv) => orUndefined(source?.[key] ?? process.env[key]);
  const env = databaseSchema.parse({ API_DATABASE_PATH: read("API_DATABASE_PATH") });
  return { API_DATABASE_PATH: resolve(MONOREPO_ROOT, env.API_DATABASE_PATH) };
}

const jobsSchema = z.object({
  AI_JOBS_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  AI_JOBS_LEASE_MS: z.coerce.number().int().min(3000).max(3600000).default(60000),
  AI_JOBS_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(4),
  // De quanto em quanto tempo o worker olha a fila no banco.
  AI_JOBS_POLL_MS: z.coerce.number().int().min(50).max(60000).default(500),
});
export type JobsEnv = z.infer<typeof jobsSchema>;
export function getJobsEnv(source: Record<string, string | undefined> = process.env): JobsEnv {
  return jobsSchema.parse(Object.fromEntries(
    Object.keys(jobsSchema.shape).map((key) => [key, orUndefined(source[key])]),
  ));
}
