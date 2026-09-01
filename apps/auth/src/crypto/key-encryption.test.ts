import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, readKeyEncryptionKey } from "./key-encryption";

const key = randomBytes(32);

describe("key-encryption", () => {
  it("devolve o texto original", () => {
    const encrypted = encryptSecret("-----BEGIN PRIVATE KEY-----", key);

    expect(decryptSecret(encrypted, key)).toBe("-----BEGIN PRIVATE KEY-----");
  });

  it("gera cifras diferentes para o mesmo texto", () => {
    expect(encryptSecret("igual", key)).not.toBe(encryptSecret("igual", key));
  });

  // GCM autentica: mexer num byte do ciphertext derruba a decifragem em vez de
  // devolver bytes corrompidos.
  it("recusa ciphertext adulterado", () => {
    const [iv, tag, ciphertext] = encryptSecret("segredo", key).split(".");
    const flipped = Buffer.from(ciphertext, "base64url");
    flipped[0] ^= 0xff;

    expect(() => decryptSecret([iv, tag, flipped.toString("base64url")].join("."), key)).toThrow();
  });

  it("recusa a chave errada", () => {
    const encrypted = encryptSecret("segredo", key);

    expect(() => decryptSecret(encrypted, randomBytes(32))).toThrow();
  });

  it("exige KEK de 32 bytes", () => {
    expect(() => readKeyEncryptionKey(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
    expect(readKeyEncryptionKey(key.toString("base64"))).toHaveLength(32);
  });
});
