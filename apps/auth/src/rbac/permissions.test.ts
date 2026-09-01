import { describe, expect, it } from "vitest";
import {
  SUPER_ADMIN_PERMISSION,
  allPermissions,
  isPermission,
  permissionSetCovers,
} from "./permissions";

describe("permissions", () => {
  it("reconhece o formato recurso:acao", () => {
    expect(isPermission("event:read")).toBe(true);
    expect(isPermission(SUPER_ADMIN_PERMISSION)).toBe(true);
    expect(isPermission("event:publish")).toBe(false);
    expect(isPermission("timeline:read")).toBe(false);
    expect(isPermission("event")).toBe(false);
    expect(isPermission("event:read:extra")).toBe(false);
    // Curinga so existe na forma `*:manage`.
    expect(isPermission("event:*")).toBe(false);
    expect(isPermission("*:read")).toBe(false);
  });

  it("faz manage cobrir as acoes do proprio recurso", () => {
    expect(permissionSetCovers(["event:manage"], "event", "read")).toBe(true);
    expect(permissionSetCovers(["event:manage"], "event", "delete")).toBe(true);
    expect(permissionSetCovers(["event:manage"], "tag", "read")).toBe(false);
  });

  it("faz o curinga de admin cobrir qualquer recurso", () => {
    expect(permissionSetCovers([SUPER_ADMIN_PERMISSION], "invite", "create")).toBe(true);
    expect(permissionSetCovers([SUPER_ADMIN_PERMISSION], "event", "delete")).toBe(true);
  });

  it("nao deixa uma acao cobrir outra", () => {
    expect(permissionSetCovers(["event:read"], "event", "update")).toBe(false);
    expect(permissionSetCovers(["event:read"], "event", "manage")).toBe(false);
  });

  it("lista o catalogo completo para o painel", () => {
    expect(allPermissions()).toContain("event:read");
    expect(allPermissions()).toContain("grant:manage");
    expect(new Set(allPermissions()).size).toBe(allPermissions().length);
  });
});
