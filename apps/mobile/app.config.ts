import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * O Expo so procura arquivos .env dentro do proprio app. Como os tres apps do
 * monorepo compartilham um unico .env na raiz, ele e carregado aqui — a mesma
 * coisa que o `next.config.ts` faz no web e o `load-env.ts` faz na API.
 *
 * `process.loadEnvFile` NAO sobrescreve variaveis ja definidas, entao
 * `.env.local` vem primeiro para ter precedencia sobre `.env`.
 */
for (const fileName of [".env.local", ".env"]) {
  const path = resolve(__dirname, "../..", fileName);
  if (existsSync(path)) process.loadEnvFile(path);
}

/**
 * Tudo que entra em `extra` e embutido no bundle e legivel por quem tiver o
 * app — nao coloque nada aqui que ja nao seja publico. Os dois hosts sao; quem
 * protege os dados e o apps/auth e o guard da API.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "Braid",
  slug: config.slug ?? "braid",
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.MOBILE_API_URL,
    authBaseUrl: process.env.MOBILE_AUTH_URL,
  },
});
