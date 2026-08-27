import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

/**
 * O Next so procura arquivos .env dentro do proprio app (apps/web). Como as duas
 * aplicacoes compartilham um unico .env na raiz do monorepo, ele e carregado aqui.
 *
 * `process.loadEnvFile` NAO sobrescreve variaveis ja definidas, entao `.env.local`
 * vem primeiro para ter precedencia sobre `.env` — a mesma convencao do Next.
 */
for (const fileName of [".env.local", ".env"]) {
  const path = resolve(__dirname, "../..", fileName);
  if (existsSync(path)) process.loadEnvFile(path);
}

/**
 * O backend Nest nao e exposto para fora do servidor: o browser fala com o Next,
 * que repassa /api/* para o Nest em loopback. O rewrite encaminha os headers,
 * entao o `Authorization: Bearer <idToken>` chega ao guard sem codigo de proxy
 * nosso no meio.
 */
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

const nextConfig: NextConfig = {
  rewrites: () => [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }],
};

export default nextConfig;
