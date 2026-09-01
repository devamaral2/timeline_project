import { z } from "zod";

/**
 * Toda a configuracao do servico de autenticacao. O `.env` continua sendo um so,
 * na raiz do monorepo — este schema descreve apenas a fatia que o auth le.
 *
 * Nada aqui tem prefixo publico: nenhum destes valores pode ser embutido em
 * bundle de cliente. As chaves do OAuth que o browser precisa ver (o client_id)
 * nunca saem daqui — quem monta a URL de autorizacao e o proprio servidor.
 */
const authSchema = z.object({
  AUTH_PORT: z.coerce.number().int().positive().default(3002),
  // Mesma politica de apps/api: loopback em producao, porque quem fala com o
  // auth e o Next (rewrite) e o Nest (chamadas internas), na mesma maquina.
  AUTH_HOST: z.string().min(1).default("127.0.0.1"),

  // Banco proprio, apartado do banco de eventos. Nao ha FK entre os dois: o
  // `events.user_id` la e texto solto, e a identidade mora aqui.
  AUTH_DATABASE_URL: z.string().min(1),

  /** `iss` dos tokens. Precisa bater com o que apps/api valida. */
  AUTH_ISSUER: z.string().min(1).default("https://auth.timeline.local"),
  /** `aud` dos access tokens: quem tem direito de aceitar o token. */
  AUTH_AUDIENCE: z.string().min(1).default("timeline-api"),
  /** URL por onde os outros servicos alcancam o auth (JWKS e rotas internas). */
  AUTH_PUBLIC_URL: z.string().min(1).default("http://127.0.0.1:3002"),

  /**
   * KEK: 32 bytes em base64. Criptografa a chave privada de assinatura antes de
   * ela ir para o banco. Um dump do banco sozinho nao permite forjar token.
   */
  AUTH_KEY_ENCRYPTION_KEY: z.string().min(1),

  /**
   * 15 minutos. O access token e validado localmente pelos outros servicos
   * (sem ida ao auth a cada request), entao a expiracao **e** a janela de
   * revogacao: cortar acesso demora ate um TTL. 15 min e o ponto em que essa
   * janela ainda e curta e o trafego de refresh ainda e baixo (~4 req/h/sessao).
   */
  AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  /** 30 dias, deslizante e com rotacao a cada uso. */
  AUTH_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Convite expira em 7 dias e vale uma unica vez. */
  AUTH_INVITE_TTL_HOURS: z.coerce.number().int().positive().default(168),
  /** Codigo de 2FA: 5 minutos e no maximo 5 tentativas. */
  AUTH_OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  AUTH_OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  /** Token intermediario entre "senha/OAuth ok" e "codigo ok". */
  AUTH_MFA_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(600),

  /** Onde o usuario volta depois do OAuth, e origem permitida no CORS. */
  AUTH_WEB_APP_URL: z.string().min(1).default("http://localhost:3000"),
  /** `Secure` nos cookies. Sempre true em producao; false so em http local. */
  AUTH_SECURE_COOKIES: z
    .union([z.boolean(), z.enum(["true", "false"]).transform((value) => value === "true")])
    .default(true),
  AUTH_COOKIE_DOMAIN: z.string().min(1).optional(),

  /**
   * Segredo compartilhado das rotas `/internal/*`. Defesa em profundidade: as
   * rotas ja estao em loopback, mas um SSRF em qualquer processo da maquina
   * alcancaria o loopback sem ele.
   */
  AUTH_INTERNAL_TOKEN: z.string().min(32),

  GOOGLE_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  FACEBOOK_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  FACEBOOK_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_OAUTH_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_OAUTH_CLIENT_SECRET: z.string().min(1).optional(),
  /** `common` aceita qualquer conta Microsoft; um GUID restringe ao tenant. */
  MICROSOFT_OAUTH_TENANT: z.string().min(1).default("common"),

  /** `console` imprime o codigo no log — so para desenvolvimento. */
  AUTH_OTP_PROVIDER: z.enum(["console", "twilio", "meta"]).default("console"),
  TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
  TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
  TWILIO_SMS_FROM: z.string().min(1).optional(),
  TWILIO_WHATSAPP_FROM: z.string().min(1).optional(),
  META_WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  META_WHATSAPP_TOKEN: z.string().min(1).optional(),
  META_WHATSAPP_TEMPLATE: z.string().min(1).default("login_code"),
});

export type AuthEnv = z.infer<typeof authSchema>;

/** Em arquivo .env, `CHAVE=` chega como string vazia, e nao como ausente. */
function orUndefined(value: string | undefined): string | undefined {
  return value === "" ? undefined : value;
}

export function getAuthEnv(source?: Record<string, string | undefined>): AuthEnv {
  const raw: Record<string, string | undefined> = {};
  for (const key of Object.keys(authSchema.shape)) {
    raw[key] = orUndefined(source?.[key] ?? process.env[key]);
  }
  return authSchema.parse(raw);
}

/** Mesmo criterio de apps/api: loopback nao precisa de CORS. */
export function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}
