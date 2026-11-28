import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Os `.md` dos agentes sao lidos em runtime por `request-config.ts`, relativo ao
 * `__dirname`. O `tsc` nao copia arquivos que nao sao codigo, entao o build da
 * API copia esta pasta explicitamente — era o que o `nest-cli.json › assets`
 * fazia.
 */
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function copyAgentMarkdowns({
  from = join(apiRoot, "src/api-core/requests/agents"),
  to = join(apiRoot, "dist/api-core/requests/agents"),
} = {}) {
  mkdirSync(to, { recursive: true });
  const files = readdirSync(from).filter((file) => file.endsWith(".md"));
  for (const file of files) copyFileSync(join(from, file), join(to, file));
  return files.length;
}

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const copied = copyAgentMarkdowns({
    from: resolve(argument("from", join(apiRoot, "src/api-core/requests/agents"))),
    to: resolve(argument("to", join(apiRoot, "dist/api-core/requests/agents"))),
  });
  console.log(`${copied} markdown(s) dos agentes copiados para o dist`);
}
