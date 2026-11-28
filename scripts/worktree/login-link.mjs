// Link de login de uso unico para abrir a app ja logada num navegador que o
// script nao controla (o Browser pane do Claude, por exemplo).
//
// Sobe um servidor em 127.0.0.1 numa porta livre e grava em <arquivo> o link
// `http://localhost:<porta>/<nonce>`. Na primeira visita a esse link ele faz o
// login de admin@admin.com (senha ADMIN_PASSWORD, do 1Password) no web desta
// worktree, repassa os cookies httpOnly da sessao e redireciona para a app. Cookie
// nao separa por porta: os de `localhost` valem para `localhost:<WEB_PORT>`.
// Assim nem a senha nem o token passam pelo navegador ou pelo agente.
//
// Atende uma visita e sai; sem visita, sai sozinho em 5 minutos.
//
// Uso: node scripts/onepassword/exec.mjs node scripts/worktree/login-link.mjs <WEB_PORT> <arquivo>
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createServer } from "node:http";

const ADMIN_EMAIL = "admin@admin.com";
const TTL_MS = 5 * 60_000;

const webPort = Number(process.argv[2]);
const linkFile = process.argv[3];
const password = process.env.ADMIN_PASSWORD;
if (!Number.isInteger(webPort) || webPort <= 0 || !linkFile) {
  console.error("Uso: login-link.mjs <WEB_PORT> <arquivo>");
  process.exit(2);
}
if (!password) {
  console.error("ADMIN_PASSWORD precisa vir do 1Password (rode via scripts/onepassword/exec.mjs).");
  process.exit(1);
}

const nonce = randomBytes(24).toString("base64url");
const appUrl = `http://localhost:${webPort}/`;

function page(res, status, message) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(`<!doctype html><meta charset="utf-8"><title>Login</title><p>${message}</p>`);
}

const server = createServer(async (req, res) => {
  if (req.url !== `/${nonce}`) {
    page(res, 404, "Link inválido.");
    return;
  }
  server.close();
  clearTimeout(expiry);
  res.on("finish", () => process.exit(0));
  try {
    const login = await fetch(`http://127.0.0.1:${webPort}/api/session/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: ADMIN_EMAIL, password }),
    });
    if (!login.ok) {
      page(res, 502, `Login de ${ADMIN_EMAIL} devolveu HTTP ${login.status}. <a href="${appUrl}">Abrir a app</a>`);
      return;
    }
    res.writeHead(302, { location: appUrl, "set-cookie": login.headers.getSetCookie(), "cache-control": "no-store" });
    res.end();
  } catch (cause) {
    page(res, 502, `O web em ${appUrl} não respondeu (${cause instanceof Error ? cause.message : cause}).`);
  }
});

const expiry = setTimeout(() => process.exit(0), TTL_MS);

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address();
  writeFileSync(linkFile, `http://localhost:${port}/${nonce}\n`, { mode: 0o600 });
});
