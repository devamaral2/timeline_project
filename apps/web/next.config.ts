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
  /**
   * `standalone` faz o next build emitir .next/standalone: um server.js mais
   * apenas o node_modules que o tracing provou necessario. E o que deixa o
   * estagio final da imagem do web sem nenhum pnpm install.
   *
   * Num monorepo o tracing precisa saber onde a raiz fica. Sem isso ele para
   * em apps/web e deixa @repo/timeline e @repo/theme de fora do bundle.
   */
  output: "standalone",
  outputFileTracingRoot: resolve(__dirname, "../.."),
  rewrites: () => [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }],
};

export default nextConfig;
