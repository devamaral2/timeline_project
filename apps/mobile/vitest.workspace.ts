import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "mobile-contracts",
      root: "./apps/mobile",
      environment: "node",
      include: ["contracts/**/*.test.ts"],
    },
  },
]);
