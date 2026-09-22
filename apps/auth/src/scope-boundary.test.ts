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

  it("keeps transport features and repository contracts out of the old feature layout", () => {
    for (const feature of ["user-lookup", "gateway", "manage-session", "basic-login", "invite-user", "authorize-access", "authenticate-user"]) {
      expect(existsSync(resolve(authRoot, "src/features", feature)), `removed feature ${feature}`).toBe(false);
    }

    const repositoryPorts = sourceFiles(resolve(authRoot, "src")).filter((file) => /[\\/]ports[\\/].*repository\.ts$/.test(file));
    expect(repositoryPorts).toEqual([]);
  });

  it("gives each HTTP feature one controller and one operation route", () => {
    const routes = {
      "login-with-password": '@Post("login")',
      "refresh-token": "@Post('token/refresh')",
      logout: "@Post('logout')",
      "logout-all": "@Post('logout-all')",
      "current-user": "@Get('me')",
      "inspect-invite": "@Post('inspect')",
      "accept-invite": "@Post('accept')",
      "create-invite": '@Post("invites")',
    } as const;

    for (const [feature, route] of Object.entries(routes)) {
      const directory = resolve(authRoot, "src/features", feature, "http");
      const controllers = sourceFiles(directory).filter((file) => file.endsWith(".controller.ts"));
      expect(controllers, `controller for ${feature}`).toHaveLength(1);
      const source = readFileSync(controllers[0]!, "utf8");
      expect(source, `route for ${feature}`).toContain(route);
      expect((source.match(/@Controller\(/g) ?? []).length, `single controller for ${feature}`).toBe(1);
    }
  });
});
