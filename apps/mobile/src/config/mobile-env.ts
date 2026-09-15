import { z } from "zod";

/**
 * O que o `app.config.ts` monta em `extra` a partir do .env da raiz. Separado do
 * `env.ts` de proposito: aqui nao ha nenhum import do Expo, entao o parsing pode
 * ser testado fora do runtime nativo.
 */
const httpUrl = z
  .string()
  .min(1)
  .refine((value) => /^https?:\/\//.test(value), "precisa comecar com http:// ou https://")
  .transform((value) => value.replace(/\/+$/, ""));

const extraSchema = z.object({
  /**
   * Onde a API Nest atende. O celular nao alcanca o loopback da sua maquina,
   * entao aqui precisa ser o IP dela na rede local (ou o host de um deploy).
   */
  apiBaseUrl: httpUrl,
  /**
   * Onde o apps/auth atende: login, refresh e logout. Mesma regra do
   * `apiBaseUrl` — num aparelho fisico, o IP da maquina na rede local.
   */
  authBaseUrl: httpUrl,
});

export type MobileEnv = z.infer<typeof extraSchema>;

/** As chaves do .env que alimentam cada campo, para a mensagem de erro. */
const ENV_KEYS: Record<string, string> = {
  apiBaseUrl: "MOBILE_API_URL",
  authBaseUrl: "MOBILE_AUTH_URL",
};

/**
 * Um erro de config aqui aparece como tela vermelha no celular, longe do
 * terminal — entao a mensagem diz qual chave do .env da raiz falta, e nao so
 * qual campo do schema quebrou.
 */
export function parseMobileEnv(source: unknown): MobileEnv {
  const result = extraSchema.safeParse(source);
  if (result.success) return result.data;

  const missing = [
    ...new Set(result.error.issues.map((issue) => ENV_KEYS[String(issue.path[0])] ?? issue.path[0])),
  ];
  throw new Error(
    `Configuracao do app incompleta. Defina no .env da raiz do monorepo: ${missing.join(", ")}.`,
  );
}
