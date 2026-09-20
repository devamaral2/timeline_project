import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authRoot = resolve(process.cwd(), "apps/auth");
const forbidden = [
  "mfaEnabled",
  "mfa_enabled",
  "tokenVersion",
  "token_version",
  "access_grants",
  "oauth_states",
  "cookie-parser",
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

describe("stage 1 scope boundary", () => {
  it("removes excluded auth concepts from production source", () => {
    const productionFiles = sourceFiles(resolve(authRoot, "src")).filter(
      (file) => !file.endsWith(".test.ts") && !file.endsWith(".spec.ts"),
    );

    for (const file of productionFiles) {
      const contents = readFileSync(file, "utf8");
      for (const marker of forbidden) {
        expect(contents, `forbidden marker ${marker} in ${file}`).not.toContain(marker);
      }
    }
  });

  it("does not retain the excluded OAuth subtree", () => {
    expect(existsSync(resolve(authRoot, "src/oauth"))).toBe(false);
  });
});
