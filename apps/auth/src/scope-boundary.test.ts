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

  it("gives each HTTP feature one declarative route with method, path and status", () => {
    const routes = {
      "login-with-password": { file: "login-with-password.routes.ts", method: 'method: "POST"', path: 'path: "/auth/login"', status: "status: 201" },
      "refresh-token": { file: "refresh-token.routes.ts", method: "method: \"POST\"", path: 'path: "/auth/token/refresh"', status: "status: 200" },
      logout: { file: "logout.routes.ts", method: "method: \"POST\"", path: 'path: "/auth/logout"', status: "status: 204" },
      "logout-all": { file: "logout-all.routes.ts", method: "method: \"POST\"", path: 'path: "/auth/logout-all"', status: "status: 204" },
      "current-user": { file: "current-user.routes.ts", method: "method: \"GET\"", path: 'path: "/auth/me"', status: "status: 200" },
      "inspect-invite": { file: "inspect-invite.routes.ts", method: "method: \"POST\"", path: 'path: "/auth/invites/inspect"', status: "status: 201" },
      "accept-invite": { file: "accept-invite.routes.ts", method: "method: \"POST\"", path: 'path: "/auth/invites/accept"', status: "status: 201" },
      "create-invite": { file: "create-invite.routes.ts", method: "method: \"POST\"", path: 'path: "/auth/admin/invites"', status: "status: 201" },
    } as const;

    for (const [feature, route] of Object.entries(routes)) {
      const directory = resolve(authRoot, "src/features", feature, "http");
      const routeFiles = sourceFiles(directory).filter((file) => file.endsWith(".routes.ts"));
      expect(routeFiles, `route declaration for ${feature}`).toHaveLength(1);
      const routeFile = routeFiles[0];
      if (!routeFile) throw new Error(`route declaration for ${feature} is missing`);
      const source = readFileSync(routeFile, "utf8");
      expect(source, `method for ${feature}`).toContain(route.method);
      expect(source, `path for ${feature}`).toContain(route.path);
      expect(source, `status for ${feature}`).toContain(route.status);
      expect(source, `Nest controller in ${feature}`).not.toContain("@Controller(");
    }
  });
});
