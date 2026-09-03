import { randomBytes } from "node:crypto";
import { ulid } from "ulid";

export abstract class SecretGenerator {
  abstract randomId(): string;
  abstract randomBytes(byteLength: number): Buffer;
}

export class CryptoSecretGenerator extends SecretGenerator {
  randomId(): string {
    return ulid();
  }

  randomBytes(byteLength: number): Buffer {
    return randomBytes(byteLength);
  }
}
