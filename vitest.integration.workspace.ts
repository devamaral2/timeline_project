import { defineWorkspace } from "vitest/config";
import { fileURLToPath } from "node:url";

const resolve = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url));

/**
 * Como no workspace unitario, os packages sao resolvidos direto do fonte. As
 * linhas de base HTTP da API e do Auth sobem os apps de verdade e importam os
 * contratos em runtime, entao nao podem depender de um `dist/` ja construido.
 */
const packageAliases = {
  "@repo/contracts/schemas": resolve("./packages/contracts/src/schemas.ts"),
  "@repo/contracts/device-key": resolve("./packages/contracts/src/device-key.ts"),
  "@repo/contracts/youtube": resolve("./packages/contracts/src/youtube.ts"),
  "@repo/contracts/artifact-types": resolve("./packages/contracts/src/artifact-types.ts"),
  "@repo/contracts": resolve("./packages/contracts/src/index.ts"),
  "@repo/theme": resolve("./packages/theme/src/index.ts"),
  "@repo/timeline": resolve("./packages/timeline/src/index.ts"),
};

export default defineWorkspace([
  {
    resolve: { alias: packageAliases },
    test: {
      name: "api-integration",
      root: "./apps/api",
      environment: "node",
      include: ["src/**/*.integration.test.ts"],
      globalSetup: ["../../test/integration/api.global-setup.ts"],
      setupFiles: ["../../test/integration/network-guard.ts"],
      hookTimeout: 120_000,
      testTimeout: 120_000,
    },
  },
  {
    resolve: { alias: packageAliases },
    test: {
      name: "auth-integration",
      root: "./apps/auth",
      environment: "node",
      include: ["src/**/*.integration.test.ts"],
      globalSetup: ["../../test/integration/auth.global-setup.ts"],
      setupFiles: ["../../test/integration/network-guard.ts"],
      hookTimeout: 120_000,
      testTimeout: 120_000,
    },
  },
]);
