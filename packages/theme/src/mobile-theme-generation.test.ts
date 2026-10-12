import { execFileSync } from "node:child_process";
import { describe, expect, test } from "vitest";

describe("generated Android theme", () => {
  test("keeps versioned Color.kt synchronized with packages/theme", () => {
    const repositoryRoot = process.cwd();
    expect(() => execFileSync("pnpm", ["exec", "tsx", "scripts/mobile/generate-theme.ts", "--check"], {
      cwd: repositoryRoot,
      stdio: "pipe",
    })).not.toThrow();
  });
});
