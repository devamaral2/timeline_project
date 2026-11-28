import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const src = join(__dirname, "..");

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const NEST_IMPORT = /from\s+["']@nestjs\/[^"']+["']|require\(\s*["']@nestjs\/[^"']+["']\s*\)/;
const sourceOf = (path: string) => readFileSync(path, "utf8");
const nestUsersUnder = (directory: string) =>
  filesUnder(directory).filter((path) => path.endsWith(".ts") && NEST_IMPORT.test(sourceOf(path)));

/**
 * O nucleo (dominio, aplicacao, servicos e infraestrutura) nao pode depender do
 * Nest. A borda temporaria — `src/nest`, controllers e modules das features,
 * guards/interceptors em `src/http`, o bootstrap e o helper de testes — ainda
 * hospeda o servidor Nest ate a etapa do Fastify. Quando ela sair, este teste
 * precisa continuar valendo, so que olhando a borda nova.
 */
test("o dominio, os casos de uso, os servicos e a infraestrutura nao importam Nest", () => {
  for (const name of ["domain", "api-core", "infrastructure", "common", "config"]) {
    expect(nestUsersUnder(join(src, name)), name).toEqual([]);
  }
});

test("nas features, so os arquivos de borda (controller/module) falam Nest", () => {
  const leaks = filesUnder(join(src, "features")).filter((path) => {
    if (!path.endsWith(".ts") || !NEST_IMPORT.test(sourceOf(path))) return false;
    return /\.(usecase|service|job|reconciler|worker)\.ts$/.test(path);
  });

  expect(leaks).toEqual([]);
});

test("a borda temporaria do Nest fica isolada em src/nest", () => {
  expect(existsSync(join(src, "nest"))).toBe(true);
});
