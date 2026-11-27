import { defineWorkspace } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Os packages são resolvidos direto do fonte TypeScript, igual ao workspace
 * unitário: sem estes aliases o Vite não resolve `@repo/contracts` (o pacote
 * não é publicado e o `package.json` aponta para o fonte) e as suítes de
 * integração do Auth nem carregam.
 */
const resolve = (relativePath: string) => fileURLToPath(new URL(relativePath, import.meta.url));

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
