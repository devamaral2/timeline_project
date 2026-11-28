import { createHash } from "node:crypto";

/** O formato aceito no header `Idempotency-Key`. */
export const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9._:-]{1,128}$/;

/** O corpo canonico da requisicao: a mesma chave com outro corpo e 422. */
export function idempotencyRequestHash(body: unknown): string {
  return createHash("sha256").update(JSON.stringify(body ?? null)).digest("hex");
}
