import { describe, expect, it } from "vitest";
import { evaluatePassword } from "./password-policy";

const context = { normalizedEmail: "amara@example.com", name: "Amara Silva" };

describe("password policy", () => {
  it.each([
    ["Sen1!", "password_length"],
    ["senha123!", "password_uppercase"],
    ["Senhaabc!", "password_number"],
    ["Senha1234", "password_special"],
  ])("rejects %s with %s", (password, code) => {
    expect(evaluatePassword({ password, ...context })).toEqual({ accepted: false, code });
  });

  it("accepts a normalized password that meets every complexity rule", () => {
    expect(evaluatePassword({ password: "Senha123!", ...context })).toEqual({ accepted: true, passwordNfc: "Senha123!" });
  });

  it("keeps the maximum length protection", () => {
    expect(evaluatePassword({ password: `A1!${"x".repeat(126)}`, ...context })).toEqual({ accepted: false, code: "password_length" });
  });
});
