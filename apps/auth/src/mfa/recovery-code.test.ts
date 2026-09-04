import { describe, expect, it } from "vitest";
import { SecretGenerator } from "../common/secret-generator";
import { generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode } from "./recovery-code";

class DeterministicSecrets extends SecretGenerator {
  private sequence = 0;
  randomId(): string { return `id-${++this.sequence}`; }
  randomBytes(length: number): Buffer { return Buffer.from(Array.from({ length }, (_, index) => (this.sequence + index) & 255)); }
}

describe("recovery codes", () => {
  it("generates ten independent RFC 4648 base32 codes without exposing hashes", () => {
    const codes = generateRecoveryCodes(new DeterministicSecrets());
    expect(codes).toHaveLength(10);
    expect(new Set(codes.map((code) => code.plainText)).size).toBe(10);
    for (const code of codes) {
      expect(code.plainText).toMatch(/^[A-Z2-7]{4}(?:-[A-Z2-7]{4}){3}$/);
      expect(code.hash).toBe(hashRecoveryCode(code.plainText.replaceAll("-", "")));
      expect(code.hash).not.toContain(code.plainText);
    }
  });

  it("normalizes only ASCII spaces and hyphens", () => {
    expect(normalizeRecoveryCode("abcd-efgh ijkl-mnop")).toBe("ABCDEFGHIJKLMNOP");
    expect(normalizeRecoveryCode("ABCD_EFGH_IJKL_MNOP")).toBeNull();
    expect(normalizeRecoveryCode("ABCD–EFGH-IJKL-MNOP")).toBeNull();
  });
});
