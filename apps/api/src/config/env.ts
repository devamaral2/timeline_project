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
  OPENROUTER_MODEL: z.string().min(1).optional(),
  // Modelo do agente de skills. Precisa suportar tool calling — nem todo modelo
  // do OpenRouter suporta. Sem valor, cai no OPENROUTER_MODEL.
  OPENROUTER_AGENT_MODEL: z.string().min(1).optional(),
  AUDIO_TRANSCRIPTION_ENABLED: z.enum(["true", "false"]).default("false"),
  AUDIO_TRANSCRIPTION_URL: z.url().optional(),
  AUDIO_TRANSCRIPTION_KEY: z.string().min(32).optional(),
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
    OPENROUTER_MODEL: read("OPENROUTER_MODEL"),
    OPENROUTER_AGENT_MODEL: read("OPENROUTER_AGENT_MODEL"),
    AUDIO_TRANSCRIPTION_ENABLED: read("AUDIO_TRANSCRIPTION_ENABLED"),
    AUDIO_TRANSCRIPTION_URL: read("AUDIO_TRANSCRIPTION_URL"),
    AUDIO_TRANSCRIPTION_KEY: read("AUDIO_TRANSCRIPTION_KEY"),
  });
}

/**
 * Um bind de loopback so aceita conexoes da propria maquina. Qualquer outro
 * valor expoe a API na rede, o que muda o que o servidor precisa fazer: e o
 * gatilho para ligar o CORS no `main.ts`.
 */
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

const databaseSchema = z.object({
  DATABASE_URL: z.string().min(1),
});

export type DatabaseEnv = z.infer<typeof databaseSchema>;

export function getDatabaseEnv(source?: Record<string, string | undefined>): DatabaseEnv {
  const read = (key: keyof DatabaseEnv) => orUndefined(source?.[key] ?? process.env[key]);

  return databaseSchema.parse({
    DATABASE_URL: read("DATABASE_URL"),
  });
}
