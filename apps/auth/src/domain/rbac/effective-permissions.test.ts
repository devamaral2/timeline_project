import { describe, expect, it } from "vitest";
import { isAllowed, resolveEffectivePermissions } from "./effective-permissions";

describe("resolveEffectivePermissions", () => {
  it("une papel e concessao direta sem repetir", () => {
    const result = resolveEffectivePermissions({
      rolePermissions: ["task:read", "task:create"],
      directPermissions: [{ permission: "task:read", effect: "allow" }],
    });

    expect(result).toEqual({ permissions: ["task:create", "task:read"], denies: [] });
  });

  it("deny explicito derruba o allow do papel", () => {
    const result = resolveEffectivePermissions({
      rolePermissions: ["task:read", "task:delete"],
      directPermissions: [{ permission: "task:delete", effect: "deny" }],
    });

    expect(result).toEqual({
      permissions: ["task:delete", "task:read"],
      denies: ["task:delete"],
    });
  });

  it("deny ganha mesmo do curinga de admin", () => {
    const result = resolveEffectivePermissions({
      rolePermissions: ["*:manage"],
      directPermissions: [{ permission: "*:manage", effect: "deny" }],
    });

    expect(result).toEqual({ permissions: ["*:manage"], denies: ["*:manage"] });
  });

  it("descarta permissao fora do catalogo", () => {
    const result = resolveEffectivePermissions({
      rolePermissions: ["task:read", "timeline:hack" as never],
      directPermissions: [],
    });

    expect(result).toEqual({ permissions: ["task:read"], denies: [] });
  });

  // Mesmo usuario tem que gerar sempre o mesmo JWT: a ordem e parte do contrato.
  it("devolve em ordem estavel", () => {
    const result = resolveEffectivePermissions({
      rolePermissions: ["tag:read", "task:read", "task:create"],
      directPermissions: [],
    });

    expect(result).toEqual({ permissions: ["tag:read", "task:create", "task:read"], denies: [] });
  });

  it("nega acao coberta por deny especifico mesmo para superadmin", () => {
    const access = resolveEffectivePermissions({
      rolePermissions: ["*:manage"],
      directPermissions: [{ permission: "task:delete", effect: "deny" }],
    });

    expect(access).toEqual({ permissions: ["*:manage"], denies: ["task:delete"] });
    expect(isAllowed(access, "task", "delete")).toBe(false);
    expect(isAllowed(access, "task", "read")).toBe(true);
  });
});
