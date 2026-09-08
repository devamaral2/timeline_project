import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { EmailOtpService } from "./email-otp.service";

describe("EmailOtpService", () => {
  it("stores only a challenge-bound HMAC and verifies without delivery access", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const key = randomBytes(32);
    const service = new EmailOtpService({send}, key);
    const {codeHash} = await service.start({email:"user@example.test",challengeId:"challenge"});
    const {code} = send.mock.calls[0]![0];
    expect(code).toMatch(/^\d{6}$/);
    expect(codeHash).toMatch(/^[a-f0-9]{64}$/);
    const offline = new EmailOtpService({send:async()=>{throw new Error("offline");}}, key);
    expect(offline.verify({challengeId:"challenge",codeHash,code})).toBe(true);
    expect(offline.verify({challengeId:"different",codeHash,code})).toBe(false);
    expect(new EmailOtpService({send}, randomBytes(32)).verify({challengeId:"challenge",codeHash,code})).toBe(false);
    for(const bad of ["", "12345", "1234567", " 123456", "abcdef"])
      expect(offline.verify({challengeId:"challenge",codeHash,code:bad})).toBe(false);
    expect(offline.verify({challengeId:"challenge",codeHash:"broken",code})).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not return a challenge when delivery fails", async () => {
    const service = new EmailOtpService({send:async()=>{throw new Error("offline");}}, randomBytes(32));
    await expect(service.start({email:"user@example.test",challengeId:"challenge"})).rejects.toThrow("offline");
  });
});
