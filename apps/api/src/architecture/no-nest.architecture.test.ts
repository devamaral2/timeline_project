import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

const apiRoot = join(__dirname, "../..");
const src = join(apiRoot, "src");

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const sourceOf = (path: string) => readFileSync(path, "utf8");

/** Tudo o que so existia por causa do Nest e nao pode voltar ao codigo nem aos testes. */
const FORBIDDEN = [
  { name: "@nestjs", pattern: /from\s+["']@nestjs\/|require\(\s*["']@nestjs\// },
  { name: "reflect-metadata", pattern: /from\s+["']reflect-metadata["']|require\(\s*["']reflect-metadata["']\s*\)/ },
  { name: "tipos do Express", pattern: /from\s+["']express["']|require\(\s*["']express["']\s*\)/ },
  { name: "decorators", pattern: /^\s*@(Controller|Injectable|Module|Inject|Get|Post|Put|Patch|Delete|UseGuards|Catch)\b/m },
];

const sources = filesUnder(src).filter((path) => path.endsWith(".ts"));

test("nem o codigo nem os testes da API importam Nest, reflect-metadata, Express ou decorators", () => {
  for (const forbidden of FORBIDDEN) {
    const users = sources.filter((path) => forbidden.pattern.test(sourceOf(path)));
    expect(users, forbidden.name).toEqual([]);
  }
});

test("a API nao depende mais do Nest, do Swagger do Nest nem do Scalar do Nest", () => {
  const packageJson = JSON.parse(sourceOf(join(apiRoot, "package.json"))) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    scripts: Record<string, string>;
  };
  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

  for (const name of Object.keys(dependencies)) {
    expect(name.startsWith("@nestjs/"), name).toBe(false);
    expect(name, name).not.toBe("reflect-metadata");
    expect(name, name).not.toBe("rxjs");
    expect(name, name).not.toBe("@types/express");
    expect(name, name).not.toBe("@scalar/nestjs-api-reference");
  }
});

test("a ausencia do Nest nao deixa pastas de composicao para tras", () => {
  expect(existsSync(join(src, "nest"))).toBe(false);
  expect(existsSync(join(src, "app.module.ts"))).toBe(false);
  expect(existsSync(join(src, "server/coexistence.ts"))).toBe(false);
  expect(existsSync(join(src, "http/request-identity/gateway-identity.guard.ts"))).toBe(false);
  expect(existsSync(join(src, "http/idempotency/idempotency.interceptor.ts"))).toBe(false);
});
