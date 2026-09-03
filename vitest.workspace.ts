import { defineWorkspace } from "vitest/config";
import { fileURLToPath } from "node:url";

const resolve = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Os packages sao resolvidos direto do fonte TypeScript, e nao de `dist/`.
 * Assim `npm run --silent test:ai` continua sendo um unico `vitest run`, sem
 * precisar buildar nada antes — o contrato do AGENTS.md (imprimir exatamente
 * `Tests pass`) depende de a saida ser so a do Vitest.
 */
const packageAliases = {
  "@repo/entities/contracts": resolve("./packages/entities/src/contracts.ts"),
  "@repo/entities/ports": resolve("./packages/entities/src/ports.ts"),
  "@repo/entities": resolve("./packages/entities/src/index.ts"),
  "@repo/persistence": resolve("./packages/persistence/src/index.ts"),
  "@repo/theme": resolve("./packages/theme/src/index.ts"),
  "@repo/timeline": resolve("./packages/timeline/src/index.ts"),
};

export default defineWorkspace([
  {
    resolve: { alias: { ...packageAliases, "@": resolve("./apps/web/src") } },
    test: {
      name: "web",
      root: "./apps/web",
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  },
  {
    resolve: { alias: packageAliases },
    test: {
      name: "api",
      root: "./apps/api",
      environment: "node",
      include: ["src/**/*.{test,spec}.ts"],
    },
  },
  {
    resolve: { alias: packageAliases },
    test: {
      name: "auth",
      root: "./apps/auth",
      environment: "node",
      include: ["src/**/*.{test,spec}.ts"],
    },
  },
  {
    resolve: { alias: packageAliases },
    test: {
      name: "entities",
      root: "./packages/entities",
      environment: "node",
      include: ["src/**/*.{test,spec}.ts"],
    },
  },
  {
    resolve: { alias: packageAliases },
    test: {
      name: "persistence",
      root: "./packages/persistence",
      environment: "node",
      include: ["src/**/*.{test,spec}.ts"],
    },
  },
  {
    resolve: { alias: { ...packageAliases, "@": resolve("./apps/mobile/src") } },
    test: {
      name: "mobile",
      root: "./apps/mobile",
      environment: "node",
      // Só logica pura: renderizar componentes do React Native exigiria o
      // runtime nativo, que nao existe aqui.
      include: ["src/**/*.{test,spec}.ts"],
    },
  },
  {
    resolve: { alias: packageAliases },
    test: {
      name: "theme",
      root: "./packages/theme",
      environment: "node",
      include: ["src/**/*.{test,spec}.ts"],
    },
  },
  {
    resolve: { alias: packageAliases },
    test: {
      name: "timeline",
      root: "./packages/timeline",
      environment: "node",
      include: ["src/**/*.{test,spec}.ts"],
    },
  },
]);
