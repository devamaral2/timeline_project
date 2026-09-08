import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import type { OtpDeliveryGateway } from "./otp-delivery.gateway";

/** Challenge-bound HMAC prevents offline guesses from a database-only leak. */
export class EmailOtpService {
  constructor(private readonly delivery: OtpDeliveryGateway, private readonly key: Buffer) {}

  async start(input: { email: string; challengeId: string }): Promise<{ codeHash: string }> {
    const code = randomInt(1_000_000).toString().padStart(6, "0");
    const codeHash = this.hash(input.challengeId, code);
    await this.delivery.send({ email: input.email, code });
    return { codeHash };
  }

  verify(input: { challengeId: string; codeHash: string; code: string }): boolean {
    if (!/^\d{6}$/.test(input.code) || !/^[a-f0-9]{64}$/.test(input.codeHash)) return false;
    return timingSafeEqual(Buffer.from(input.codeHash, "hex"), Buffer.from(this.hash(input.challengeId, input.code), "hex"));
  }

  private hash(challengeId: string, code: string): string {
    return createHmac("sha256", this.key).update(`auth-email-otp\0${challengeId}\0${code}`).digest("hex");
  }
}
