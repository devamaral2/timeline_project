import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
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
