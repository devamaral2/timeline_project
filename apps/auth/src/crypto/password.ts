import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * scrypt do `node:crypto`. Argon2id seria a primeira escolha, mas exige modulo
 * nativo; scrypt e a alternativa memory-hard que ja vem no runtime, o que
 * mantem o build do monorepo sem compilacao C++.
 *
 * N=2^15 com r=8 usa ~32 MB por hash — caro o suficiente para GPU e ainda
 * aceitavel no login. `maxmem` precisa ser subido a mao: o padrao do Node (32MB)
 * fica no limite e faz o scrypt falhar.
 */
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;

const PREFIX = "scrypt";

export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(plainPassword, salt);
  return [PREFIX, COST, BLOCK_SIZE, PARALLELISM, salt.toString("base64url"), derived.toString("base64url")].join(
    "$",
  );
}

/**
 * Nunca lanca por hash malformado: devolve `false`. Um usuario que so entra por
 * OAuth nao tem senha, e o caminho de login precisa gastar o mesmo tempo nos
 * dois casos para nao virar um oraculo de "esse email existe".
 */
export async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;

  const [, cost, blockSize, parallelism, salt, expected] = parts;
  if (cost !== String(COST) || blockSize !== String(BLOCK_SIZE) || parallelism !== String(PARALLELISM)) {
    return false;
  }
  if (!isBase64UrlOfLength(salt, 22) || !isBase64UrlOfLength(expected, 86)) return false;

  const saltBuffer = Buffer.from(salt, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (saltBuffer.length !== 16 || expectedBuffer.length !== KEY_LENGTH) return false;

  try {
    const derived = await derive(plainPassword, saltBuffer);
    return (
      derived.length === expectedBuffer.length && timingSafeEqual(derived, expectedBuffer)
    );
  } catch {
    return false;
  }
}

function isBase64UrlOfLength(value: string, length: number): boolean {
  return value.length === length && /^[A-Za-z0-9_-]+$/.test(value);
}

async function derive(
  password: string,
  salt: Buffer,
): Promise<Buffer> {
  return scryptDerive(password.normalize("NFC"), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
    maxmem: 128 * COST * BLOCK_SIZE * 2,
  });
}

function scryptDerive(
  passwordNfc: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passwordNfc, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}
