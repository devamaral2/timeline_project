import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

const apiRoot = resolve(__dirname, "../..");

/**
 * O build de producao da API e o `tsc` mais a copia dos markdowns dos agentes;
 * nenhum CLI de framework participa, e a API compilada le as definicoes do
 * `dist` como lia quando o Nest copiava os assets.
 */
test("o build nao usa Nest CLI e copia os markdowns dos agentes para o dist", () => {
  const packageJson = JSON.parse(readFileSync(join(apiRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  expect(packageJson.scripts.build).not.toContain("nest");
  expect(packageJson.scripts.dev).not.toContain("nest");
  expect(existsSync(join(apiRoot, "nest-cli.json"))).toBe(false);
  expect(readFileSync(join(apiRoot, "tsconfig.json"), "utf8")).not.toMatch(/Decorator/);
});

test("o passo de copia leva so os markdowns, preservando a pasta dos agentes", () => {
  const from = mkdtempSync(join(tmpdir(), "api-agents-src-"));
  const to = mkdtempSync(join(tmpdir(), "api-agents-dist-"));
  mkdirSync(from, { recursive: true });
  writeFileSync(join(from, "entity.md"), "# Papel\n");
  writeFileSync(join(from, "notas.txt"), "nao e definicao de agente");

  execFileSync("node", [join(apiRoot, "scripts/copy-agent-markdowns.mjs"), "--from", from, "--to", join(to, "agents")], {
    stdio: "pipe",
  });

  expect(readdirSync(join(to, "agents"))).toEqual(["entity.md"]);
});
