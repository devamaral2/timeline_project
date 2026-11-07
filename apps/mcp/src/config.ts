import { z } from "zod";

const schema = z.object({
  MCP_PORT: z.coerce.number().int().positive().default(3003),
  // 127.0.0.1 por padrao; no cluster o Deployment define 0.0.0.0 e a NetworkPolicy limita quem chega.
  MCP_HOST: z.string().min(1).default("127.0.0.1"),
  /** Bearer que o Hermes apresenta. Gerado por ambiente; nunca o mesmo da chave do gateway. */
  MCP_TOKEN: z.string().min(32),
  /** Endereco da API (apps/api), sem barra final. */
  API_SERVICE_URL: z.string().url(),
  /** Chave que a API exige do gateway (`x-auth-gateway-key`). */
  AUTH_INTERNAL_SERVICE_KEY: z.string().min(32),
  /** O dono: todas as ferramentas agem sobre os dados deste usuario, e so dele. */
  MCP_OWNER_USER_ID: z.string().min(1),
});

export type McpConfig = z.infer<typeof schema>;

export function readConfig(source: NodeJS.ProcessEnv = process.env): McpConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid MCP configuration: ${fields}`);
  }
  return { ...parsed.data, API_SERVICE_URL: parsed.data.API_SERVICE_URL.replace(/\/+$/, "") };
}
