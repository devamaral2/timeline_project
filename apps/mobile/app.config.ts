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
 * As credenciais do Firebase sao as mesmas do web (`NEXT_PUBLIC_FIREBASE_*`):
 * e o mesmo projeto e o mesmo app client, entao duplicar as chaves no .env so
 * criaria duas coisas para manter em sincronia. O prefixo do Next fica estranho
 * aqui, mas o valor e o mesmo.
 *
 * Tudo que entra em `extra` e embutido no bundle e legivel por quem tiver o
 * app — nao coloque nada aqui que ja nao seja publico. A config do Firebase
 * client e publica por design; quem protege os dados e o guard da API.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "Time Composure",
  slug: config.slug ?? "time-lapse",
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.MOBILE_API_URL,
    googleWebClientId: process.env.MOBILE_GOOGLE_WEB_CLIENT_ID,
    firebase: {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    },
  },
});
