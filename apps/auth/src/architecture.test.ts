import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const authRoot = join(__dirname, "..");
const srcRoot = join(authRoot, "src");

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const sources = filesUnder(srcRoot).filter((path) => path.endsWith(".ts"));
const sourceOf = (path: string) => readFileSync(path, "utf8");

/**
 * Tudo o que só existia por causa do Nest e não pode voltar ao código nem aos
 * testes. As regras olham o que atravessa o socket e a declaração de rotas; não
 * inspecionam a estrutura interna do composition root.
 */
const FORBIDDEN = [
  { name: "@nestjs", pattern: /from\s+["']@nestjs\/|require\(\s*["']@nestjs\// },
  { name: "reflect-metadata", pattern: /from\s+["']reflect-metadata["']|require\(\s*["']reflect-metadata["']\s*\)/ },
  { name: "tipos do Express", pattern: /from\s+["']express["']|require\(\s*["']express["']\s*\)/ },
  { name: "decorators", pattern: /^\s*@(Controller|Injectable|Module|Inject|Get|Post|Put|Patch|Delete|UseGuards|Catch|Req|Param)\b/m },
];

describe("auth without Nest", () => {
  it("nem o código nem os testes do Auth importam Nest, reflect-metadata, Express ou decorators", () => {
    for (const forbidden of FORBIDDEN) {
      const users = sources.filter((path) => forbidden.pattern.test(sourceOf(path)));
      expect(users.map((path) => relative(authRoot, path)), forbidden.name).toEqual([]);
    }
  });

  it("o Auth não depende mais do Nest, do Scalar do Nest, do Express nem do RxJS", () => {
    const packageJson = JSON.parse(sourceOf(join(authRoot, "package.json"))) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
      scripts: Record<string, string>;
    };
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

    for (const name of Object.keys(dependencies)) {
      expect(name.startsWith("@nestjs/"), name).toBe(false);
      expect(name, name).not.toBe("reflect-metadata");
      expect(name, name).not.toBe("rxjs");
      expect(name, name).not.toBe("express");
      expect(name, name).not.toBe("@types/express");
      expect(name, name).not.toBe("@scalar/nestjs-api-reference");
    }
  });

  it("o build e o dev não usam Nest CLI e o tsconfig não emite metadata de decorator", () => {
    const packageJson = JSON.parse(sourceOf(join(authRoot, "package.json"))) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.build).not.toContain("nest");
    expect(packageJson.scripts.dev).not.toContain("nest");
    expect(packageJson.scripts.start).not.toContain("nest");
    expect(existsSync(join(authRoot, "nest-cli.json"))).toBe(false);
    expect(sourceOf(join(authRoot, "tsconfig.json"))).not.toMatch(/Decorator/);
    expect(sourceOf(join(authRoot, "tsconfig.build.json"))).not.toMatch(/Decorator/);
  });

  it("a ausência do Nest não deixa pastas nem módulos de composição para trás", () => {
    expect(existsSync(join(srcRoot, "nest"))).toBe(false);
    expect(existsSync(join(srcRoot, "app.module.ts"))).toBe(false);
    expect(existsSync(join(srcRoot, "auth-core/auth-core.module.ts"))).toBe(false);
    expect(existsSync(join(srcRoot, "config/tokens.ts"))).toBe(false);
    expect(existsSync(join(srcRoot, "db/tokens.ts"))).toBe(false);
  });
});
