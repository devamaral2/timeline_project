import { describe, expect, it } from "vitest";
import { isAllowed, resolveEffectivePermissions } from "./effective-permissions";

describe("resolveEffectivePermissions", () => {
  it("une papel e concessao direta sem repetir", () => {
    const result = resolveEffectivePermissions({
      rolePermissions: ["event:read", "event:create"],
      directPermissions: [{ permission: "event:read", effect: "allow" }],
    });

    expect(result).toEqual({ permissions: ["event:create", "event:read"], denies: [] });
  });

  it("deny explicito derruba o allow do papel", () => {
    const result = resolveEffectivePermissions({
      rolePermissions: ["event:read", "event:delete"],
      directPermissions: [{ permission: "event:delete", effect: "deny" }],
    });

    expect(result).toEqual({
      permissions: ["event:delete", "event:read"],
      denies: ["event:delete"],
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
      rolePermissions: ["event:read", "timeline:hack" as never],
      directPermissions: [],
    });

    expect(result).toEqual({ permissions: ["event:read"], denies: [] });
  });

  // Mesmo usuario tem que gerar sempre o mesmo JWT: a ordem e parte do contrato.
  it("devolve em ordem estavel", () => {
    const result = resolveEffectivePermissions({
      rolePermissions: ["tag:read", "event:read", "event:create"],
      directPermissions: [],
    });

    expect(result).toEqual({ permissions: ["event:create", "event:read", "tag:read"], denies: [] });
  });

  it("nega acao coberta por deny especifico mesmo para superadmin", () => {
    const access = resolveEffectivePermissions({
      rolePermissions: ["*:manage"],
      directPermissions: [{ permission: "event:delete", effect: "deny" }],
    });

    expect(access).toEqual({ permissions: ["*:manage"], denies: ["event:delete"] });
    expect(isAllowed(access, "event", "delete")).toBe(false);
    expect(isAllowed(access, "event", "read")).toBe(true);
  });
});
