// `dev` do MCP dentro do `pnpm dev` (turbo). O processo pai ja carregou o escopo
// padrao do 1Password; o MCP precisa do escopo `mcp-runtime` (MCP_TOKEN,
// MCP_OWNER_USER_ID), entao ele passa pelo carregador de novo.
//
// Se o escopo estiver incompleto o MCP nao sobe, mas este processo sai com 0
// para o turbo nao derrubar web, API e auth por causa de um servico opcional.
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const loader = resolve(appDir, "../../scripts/onepassword/exec.mjs");

const child = spawn(process.execPath, [loader, "tsx", "watch", "src/main.ts"], {
  cwd: appDir,
  stdio: "inherit",
  env: {
    ...process.env,
    ONEPASSWORD_SCOPE: "mcp-runtime",
    // O Hermes, num container, alcanca o host por host.docker.internal.
    MCP_HOST: process.env.MCP_HOST ?? "0.0.0.0",
  },
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal || code === 0) process.exit(code ?? 0);
  console.warn(
    "[mcp] nao iniciou; web, API e auth seguem. Veja o erro acima e o runbook docs/runbook/hermes.md (secao 0).",
  );
  process.exit(0);
});
