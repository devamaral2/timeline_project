import { existsSync, readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authRoot = resolve(process.cwd(), "apps/auth");
const srcRoot = resolve(authRoot, "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}

function productionFiles(): string[] {
  return sourceFiles(srcRoot)
    .filter((file) => file.endsWith(".ts"))
    .filter((file) => !file.endsWith(".test.ts") && !file.endsWith(".spec.ts"));
}

const coreDirectories = [
  "src/domain",
  "src/common",
  "src/config",
  "src/audit",
  "src/bootstrap",
  "src/db",
  "src/auth-core/persistence",
  "src/auth-core/security",
  "src/auth-core/password",
];

function isCoreFile(file: string): boolean {
  const path = relative(authRoot, file);
  if (coreDirectories.some((directory) => path.startsWith(`${directory}/`))) return true;
  if (/^src\/features\/.*\/(usecases|services)\//.test(path)) return true;
  return /\.repository\.ts$/.test(path);
}

function isAllowedNestConsumer(file: string): boolean {
  const path = relative(authRoot, file);
  if (path.startsWith("src/nest/")) return true;
  if (path.startsWith("src/http/")) return true;
  if (path.startsWith("src/testing/")) return true;
  if (path === "src/app.module.ts" || path === "src/main.ts") return true;
  if (path === "src/composition-root.ts") return true;
  if (path.endsWith(".module.ts")) return true;
  return false;
}

describe("auth core without Nest", () => {
  it("keeps domain, application and infrastructure free of Nest, reflection and Express", () => {
    const markers = ["@nestjs/", "reflect-metadata", 'from "express"', "from 'express'"];

    for (const file of productionFiles().filter(isCoreFile)) {
      const contents = readFileSync(file, "utf8");
      for (const marker of markers) {
        expect(contents, `framework marker ${marker} in ${relative(authRoot, file)}`).not.toContain(marker);
      }
    }
  });

  it("confines Nest consumers to the temporary adapters, modules, controllers and HTTP shell", () => {
    for (const file of productionFiles()) {
      const contents = readFileSync(file, "utf8");
      if (!contents.includes("@nestjs/")) continue;
      expect(isAllowedNestConsumer(file), `unexpected Nest consumer ${relative(authRoot, file)}`).toBe(true);
    }
  });

  it("keeps every Nest adapter the running server still needs", () => {
    const adapters = [
      "src/nest/bearer-auth.guard.ts",
      "src/nest/device-key-auth.guard.ts",
      "src/nest/current-actor.decorator.ts",
      "src/nest/auth-exception.filter.ts",
      "src/nest/http-shell.ts",
      "src/composition-root.ts",
      "src/server/auth-server.ts",
      "src/server/guards.ts",
    ];

    for (const adapter of adapters) {
      expect(existsSync(resolve(authRoot, adapter)), `missing adapter ${adapter}`).toBe(true);
    }
  });

  it("does not keep the Nest adapters already replaced by the composition root", () => {
    const removed = [
      "src/nest/api-documentation.ts",
      "src/nest/api-gateway.lifecycle.ts",
      "src/nest/database.module.ts",
      "src/nest/require-super-admin.guard.ts",
      "src/http/health.controller.ts",
      "src/http/jwks.controller.ts",
      "src/http/http.module.ts",
      "src/features/login-with-password/http/login-with-password.controller.ts",
      "src/features/refresh-token/http/refresh-token.controller.ts",
      "src/features/logout/http/logout.controller.ts",
      "src/features/logout-all/http/logout-all.controller.ts",
      "src/features/current-user/http/current-user.controller.ts",
      "src/features/inspect-invite/http/inspect-invite.controller.ts",
      "src/features/accept-invite/http/accept-invite.controller.ts",
      "src/features/create-invite/http/create-invite.controller.ts",
      "src/features/login-with-password/login-with-password.module.ts",
      "src/features/refresh-token/refresh-token.module.ts",
      "src/features/logout/logout.module.ts",
      "src/features/logout-all/logout-all.module.ts",
      "src/features/current-user/current-user.module.ts",
      "src/features/inspect-invite/inspect-invite.module.ts",
      "src/features/accept-invite/accept-invite.module.ts",
      "src/features/create-invite/create-invite.module.ts",
      "src/http/api-proxy/api-proxy.module.ts",
      "src/http/api-proxy/api-gateway.controller.ts",
      "src/http/api-proxy/device-gateway.controller.ts",
    ];

    for (const file of removed) {
      expect(existsSync(resolve(authRoot, file)), `stale adapter ${file}`).toBe(false);
    }
  });

  it("does not leave guard, filter, middleware or decorator adapters inside the core", () => {
    const stale = [
      "src/auth-core/security/bearer-auth.guard.ts",
      "src/auth-core/security/device-key-auth.guard.ts",
      "src/auth-core/security/require-super-admin.guard.ts",
      "src/auth-core/security/current-actor.decorator.ts",
      "src/http/auth-exception.filter.ts",
      "src/http/request-context.middleware.ts",
      "src/db/db.module.ts",
      "src/http/api-proxy/api-gateway.proxy.ts",
    ];

    for (const file of stale) {
      expect(existsSync(resolve(authRoot, file)), `stale adapter ${file}`).toBe(false);
    }
  });
});
