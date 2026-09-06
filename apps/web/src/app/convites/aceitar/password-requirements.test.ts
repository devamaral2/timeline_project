import { describe, expect, it } from "vitest";
import { isStrongPassword, passwordRequirements } from "./password-requirements";

describe("password requirements", () => {
  it("accepts a password only when every visible requirement is met", () => {
    expect(isStrongPassword("Senha123!")).toBe(true);
    expect(isStrongPassword("senha123!")).toBe(false);
    expect(isStrongPassword("Senhaabc!")).toBe(false);
    expect(isStrongPassword("Senha1234")).toBe(false);
    expect(isStrongPassword("Sen1!")).toBe(false);
  });

  it("reports each requirement independently for the realtime checklist", () => {
    expect(passwordRequirements("senha1!")).toEqual({
      length: false,
      uppercase: false,
      number: true,
      special: true,
    });
  });
});
