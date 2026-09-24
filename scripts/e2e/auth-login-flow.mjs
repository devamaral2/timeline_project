#!/usr/bin/env node
/**
 * Smoke test de ponta a ponta do login pelo apps/auth, contra os tres
 * servidores rodando de verdade (`pnpm dev:auth`, `pnpm dev:api` e
 * `pnpm dev:web`). Nao sobe nada sozinho e nao cria usuario: precisa de uma
 * conta ativa (docs/runbook/auth-bootstrap.md).
 *
 *   E2E_EMAIL=... E2E_PASSWORD=... pnpm e2e:auth
 *
 * As portas vem do `.env.local`/`.env` da raiz (WEB_PORT, PORT, AUTH_PORT) —
 * numa worktree provisionada, as dela. WEB_URL, API_URL e AUTH_URL sobrescrevem.
 *
 * Nao testa senha errada de proposito: cada tentativa conta no rate limit do
 * apps/auth, e rodar o script algumas vezes trancaria a conta de teste.
 *
 * Faz dois logins por execucao, e o apps/auth conta ate os bem-sucedidos no
 * limite por e-mail (AUTH_PASSWORD_EMAIL_LIMIT, padrao 5 por janela): rodar o
 * script mais de duas vezes seguidas devolve 429. As sessoes que ele abre
 * terminam revogadas.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const fileEnv = {};
for (const name of [".env", ".env.local"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) fileEnv[match[1]] = match[2];
  }
}
const env = (key, fallback) => process.env[key] ?? fileEnv[key] ?? fallback;

const WEB = env("WEB_URL", `http://localhost:${env("WEB_PORT", "3000")}`);
const API = env("API_URL", `http://127.0.0.1:${env("PORT", "3001")}`);
const AUTH = env("AUTH_URL", `http://127.0.0.1:${env("AUTH_PORT", "3002")}`);
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Defina E2E_EMAIL e E2E_PASSWORD de uma conta ativa no apps/auth.");
  process.exit(2);
}

const today = new Date();
const from = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 0, 0, 0, -1).toISOString();
const DAY = `/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${actual}${ok ? "" : ` (esperado ${expected})`}`);
}

/** Um navegador minimo: guarda os cookies que o web devolve e os reenvia. */
function browser() {
  const jar = new Map();
  return {
    jar,
    async fetch(path, init = {}) {
      const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
      const response = await fetch(`${WEB}${path}`, {
        ...init,
        redirect: "manual",
        headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
      });
      for (const header of response.headers.getSetCookie()) {
        const [pair, ...attributes] = header.split(";");
        const [name, value] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)];
        const expired = attributes.some((attribute) => /max-age=0/i.test(attribute.trim()));
        if (expired || value === "") jar.delete(name);
        else jar.set(name, value);
      }
      return response;
    },
  };
}

const json = (body) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function webFlow() {
  console.log(`\n# web (${WEB})`);
  const tab = browser();
  check("GET /api/session sem sessao", (await tab.fetch("/api/session")).status, 401);
  check("GET /api/events sem sessao", (await tab.fetch(DAY)).status, 401);

  const login = await tab.fetch("/api/session/login", json({ email: EMAIL, password: PASSWORD }));
  check("POST /api/session/login", login.status, 200);
  const body = await login.json();
  check("login nao devolve token no corpo", "accessToken" in body || "refreshToken" in body, false);
  const cookies = login.headers.getSetCookie().join("\n");
  check("cookies httpOnly", (cookies.match(/HttpOnly/gi) ?? []).length, 2);
  check("refresh restrito a /api/session", /braid_refresh=[^;]+;.*Path=\/api\/session/i.test(cookies), true);

  check("GET /api/session com cookie", (await tab.fetch("/api/session")).status, 200);
  check("GET /api/events pelo proxy", (await tab.fetch(DAY)).status, 200);
  check(
    "Authorization forjado nao substitui o cookie",
    (await tab.fetch(DAY, { headers: { authorization: "Bearer forged" } })).status,
    200,
  );
  check("Authorization forjado sem cookie", (await fetch(`${WEB}${DAY}`, { headers: { authorization: "Bearer forged" } })).status, 401);

  const before = new Map(tab.jar);
  check("POST /api/session/refresh", (await tab.fetch("/api/session/refresh", { method: "POST" })).status, 204);
  check("refresh rotacionou o token", tab.jar.get("braid_refresh") !== before.get("braid_refresh"), true);
  check("GET /api/events depois do refresh", (await tab.fetch(DAY)).status, 200);

  const replay = browser();
  for (const [name, value] of before) replay.jar.set(name, value);
  check("reusar o refresh antigo e recusado", (await replay.fetch("/api/session/refresh", { method: "POST" })).status, 401);
  check("reuso derruba a sessao inteira", (await tab.fetch("/api/session")).status, 401);
}

async function mobileFlow() {
  console.log(`\n# mobile: apps/auth direto (${AUTH}) + API (${API})`);
  const login = await fetch(`${AUTH}/auth/login`, json({ email: EMAIL, password: PASSWORD }));
  check("POST /auth/login", login.status, 200);
  const tokens = await login.json();
  const bearer = (token) => ({ headers: { authorization: `Bearer ${token}` } });

  check("API sem bearer", (await fetch(`${API}${DAY}`)).status, 401);
  check("API com access token", (await fetch(`${API}${DAY}`, bearer(tokens.accessToken))).status, 200);
  check("API com token invalido", (await fetch(`${API}${DAY}`, bearer("abc.def.ghi"))).status, 401);

  const refresh = await fetch(`${AUTH}/auth/token/refresh`, json({ refreshToken: tokens.refreshToken }));
  check("POST /auth/token/refresh", refresh.status, 200);
  const renewed = await refresh.json();
  check("API com token renovado", (await fetch(`${API}${DAY}`, bearer(renewed.accessToken))).status, 200);

  // O logout do web recebe a sessao aberta aqui, em vez de um terceiro login:
  // cada login conta no rate limit por e-mail do apps/auth.
  console.log(`\n# logout pelo web, com a sessao do mobile`);
  const tab = browser();
  tab.jar.set("braid_access", renewed.accessToken);
  tab.jar.set("braid_refresh", renewed.refreshToken);
  check("GET /api/session", (await tab.fetch("/api/session")).status, 200);
  check("POST /api/session/logout", (await tab.fetch("/api/session/logout", { method: "POST" })).status, 204);
  check("cookies limpos", tab.jar.size, 0);
  check(
    "refresh revogado pelo logout",
    (await fetch(`${AUTH}/auth/token/refresh`, json({ refreshToken: renewed.refreshToken }))).status,
    401,
  );
}

try {
  await webFlow();
  await mobileFlow();
} catch (error) {
  failures += 1;
  console.error(`\nFAIL nao foi possivel completar o fluxo: ${error instanceof Error ? error.message : error}`);
  console.error("Os tres servidores estao de pe? (pnpm dev:auth, pnpm dev:api, pnpm dev:web)");
}

console.log(failures ? `\n${failures} verificacao(oes) falharam.` : "\nFluxo de login ok nos tres apps.");
process.exit(failures ? 1 : 0);
