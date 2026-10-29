import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * ULID de 26 caracteres no mesmo formato que o banco usa (`char(26)`): 48 bits
 * de tempo + 80 bits aleatorios. Sem dependencia externa para o CLI rodar na
 * raiz sem instalar nada.
 */
export function createUlid(now = Date.now()): string {
  let time = BigInt(now);
  let timePart = "";
  for (let index = 0; index < 10; index += 1) {
    timePart = CROCKFORD[Number(time % 32n)] + timePart;
    time /= 32n;
  }

  const bytes = randomBytes(10);
  let randomPart = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      randomPart += CROCKFORD[(buffer >>> bits) & 31];
    }
  }
  return timePart + randomPart.slice(0, 16);
}

export function isUlid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(value);
}
