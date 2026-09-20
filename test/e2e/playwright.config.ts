import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.spec.ts",
  // Files run concurrently; tests sharing a file user run sequentially.
  fullyParallel: false,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  globalSetup: "./global-setup.ts",
  use: { trace: "retain-on-failure" },
  reporter: "list",
});
