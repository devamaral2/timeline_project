import { z } from "zod";

/**
 * O que o `app.config.ts` monta em `extra` a partir do .env da raiz. Separado do
 * `env.ts` de proposito: aqui nao ha nenhum import do Expo, entao o parsing pode
 * ser testado fora do runtime nativo.
 */
const extraSchema = z.object({
  /**
   * Onde a API Nest atende. O celular nao alcanca o loopback da sua maquina,
   * entao aqui precisa ser o IP dela na rede local (ou o host de um deploy).
   */
  apiBaseUrl: z
    .string()
    .min(1)
    .refine((value) => /^https?:\/\//.test(value), "precisa comecar com http:// ou https://")
    .transform((value) => value.replace(/\/+$/, "")),
  /**
   * O OAuth client **web** do projeto Firebase — nao o Android nem o iOS. E ele
   * que o Google Sign-In nativo usa para emitir o ID token que o Firebase
   * aceita, nas duas plataformas.
   */
  googleWebClientId: z.string().min(1),
  firebase: z.object({
    apiKey: z.string().min(1),
    authDomain: z.string().min(1),
    projectId: z.string().min(1),
    storageBucket: z.string().min(1),
    messagingSenderId: z.string().min(1),
    appId: z.string().min(1),
  }),
});

export type MobileEnv = z.infer<typeof extraSchema>;

/** As chaves do .env que alimentam cada campo, para a mensagem de erro. */
const ENV_KEYS: Record<string, string> = {
  apiBaseUrl: "MOBILE_API_URL",
  googleWebClientId: "MOBILE_GOOGLE_WEB_CLIENT_ID",
  firebase: "NEXT_PUBLIC_FIREBASE_*",
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
