import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * O build de producao do Auth: apaga o `dist` anterior e compila com o `tsc`.
 * Nenhum CLI de framework participa, e o `rm` evita que um arquivo removido do
 * fonte continue sendo executado a partir do diretorio de distribuicao.
 */
const authRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(authRoot, "dist");

rmSync(dist, { recursive: true, force: true });
execFileSync("tsc", ["-p", "tsconfig.build.json"], { cwd: authRoot, stdio: "inherit" });
console.log(`Auth compilada em ${dist}`);
