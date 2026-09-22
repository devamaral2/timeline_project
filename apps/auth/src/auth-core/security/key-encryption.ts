import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM sobre a chave privada de assinatura, com uma KEK que vive so no
 * ambiente (`AUTH_KEY_ENCRYPTION_KEY`). O objetivo e que um dump do banco —
 * backup vazado, replica lida por engano — nao baste para forjar um JWT: sem a
 * KEK o campo e ruido.
 *
 * Formato: `iv.tag.ciphertext`, todos em base64url. O IV vai junto porque
 * precisa ser unico por operacao, nao secreto.
 */
const IV_BYTES = 12;

export function readKeyEncryptionKey(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) {
    throw new Error("AUTH_KEY_ENCRYPTION_KEY must be 32 bytes encoded in base64");
  }
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext]
    .map((part) => part.toString("base64url"))
    .join(".");
}

export function decryptSecret(encoded: string, key: Buffer): string {
  const parts = encoded.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted secret");

  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
