import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Restrito a src/: diretorios de tooling (.agents, .claude/skills) trazem
    // seus proprios *.test.mjs baseados em node:test, que poluem a saida.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
