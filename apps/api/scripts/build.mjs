import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { copyAgentMarkdowns } from "./copy-agent-markdowns.mjs";

/**
 * O build de producao da API: compila com o `tsc` e copia os markdowns dos
 * agentes para o `dist`. Nenhum CLI de framework participa.
 */
const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(apiRoot, "dist");

rmSync(dist, { recursive: true, force: true });
execFileSync("tsc", ["-p", "tsconfig.build.json"], { cwd: apiRoot, stdio: "inherit" });
const copied = copyAgentMarkdowns();
console.log(`API compilada em ${dist}; ${copied} markdown(s) dos agentes copiados`);
