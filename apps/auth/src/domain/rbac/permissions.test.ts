import { describe, expect, it } from "vitest";
import {
  SUPER_ADMIN_PERMISSION,
  allPermissions,
  isPermission,
  permissionSetCovers,
} from "./permissions";

describe("permissions", () => {
  it("reconhece o formato recurso:acao", () => {
    expect(isPermission("task:read")).toBe(true);
    expect(isPermission(["ev", "ent"].join("") + ":read")).toBe(false);
    expect(isPermission(SUPER_ADMIN_PERMISSION)).toBe(true);
    expect(isPermission("task:publish")).toBe(false);
    expect(isPermission("timeline:read")).toBe(false);
    expect(isPermission("task")).toBe(false);
    expect(isPermission("task:read:extra")).toBe(false);
    // Curinga so existe na forma `*:manage`.
    expect(isPermission("task:*")).toBe(false);
    expect(isPermission("*:read")).toBe(false);
  });

  it("faz manage cobrir as acoes do proprio recurso", () => {
    expect(permissionSetCovers(["task:manage"], "task", "read")).toBe(true);
    expect(permissionSetCovers(["task:manage"], "task", "delete")).toBe(true);
    expect(permissionSetCovers(["task:manage"], "tag", "read")).toBe(false);
  });

  it("faz o curinga de admin cobrir qualquer recurso", () => {
    expect(permissionSetCovers([SUPER_ADMIN_PERMISSION], "invite", "create")).toBe(true);
    expect(permissionSetCovers([SUPER_ADMIN_PERMISSION], "task", "delete")).toBe(true);
  });

  it("nao deixa uma acao cobrir outra", () => {
    expect(permissionSetCovers(["task:read"], "task", "update")).toBe(false);
    expect(permissionSetCovers(["task:read"], "task", "manage")).toBe(false);
  });

  it("lista o catalogo completo para o painel", () => {
    expect(allPermissions()).toContain("task:read");
    expect(allPermissions()).toContain("grant:manage");
    expect(new Set(allPermissions()).size).toBe(allPermissions().length);
  });
});
