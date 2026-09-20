import { describe, expect, it } from "vitest";
import { ANONYMOUS_CONTEXT } from "../../../common/request-context";
import { SECURITY_POLICY } from "../../../config/security-policy";
import { hashSecretToken } from "../../authenticate-user/secret-token";
import { AuthenticationFailedError } from "../../../common/errors";
import type { RotateRefreshTokenCommand, RotateRefreshTokenResult, SessionRepository } from "../ports/session-repository";
import { RefreshSessionUseCase } from "./refresh-session.usecase";

const NOW = new Date("2026-09-04T00:00:00Z");
const clock = { now: () => NOW };
const secrets = {
  randomId: () => "successor-id",
  randomBytes: (length: number) => Buffer.alloc(length, 7),
};

function repositoryReturning(
  result: RotateRefreshTokenResult,
): { repository: SessionRepository; lastCommand: () => RotateRefreshTokenCommand | undefined } {
  let lastCommand: RotateRefreshTokenCommand | undefined;
  const repository: SessionRepository = {
    async rotateRefreshToken(command) {
      lastCommand = command;
      return result;
    },
    revokeByRefreshToken: () => {
      throw new Error("not used in this test");
    },
    revokeAllOfUser: () => {
      throw new Error("not used in this test");
    },
    findActiveSession: () => {
      throw new Error("not used in this test");
    },
  };
  return { repository, lastCommand: () => lastCommand };
}

describe("RefreshSessionUseCase", () => {
  it("rotates the refresh token and returns the new pair on success", async () => {
    const session = {
      id: "session-1",
      userId: "user-1",
      amr: ["pwd" as const],
      authTime: NOW,
      initialIpAddress: null,
      initialUserAgent: null,
      lastUsedAt: NOW,
      revokedAt: null,
      endedAt: null,
      createdAt: NOW,
    };
    const access = { roleKeys: ["member"], permissions: ["event:read" as const], denies: [] };
    const { repository, lastCommand } = repositoryReturning({
      kind: "rotated",
      accessToken: "signed.access.token",
      session,
      access,
      refreshTokenExpiresAt: new Date(NOW.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000),
    });
    const sign = () => "signed.access.token";
    const useCase = new RefreshSessionUseCase(repository, sign, clock, secrets);

    const result = await useCase.execute({ refreshToken: "presented-refresh-token", context: ANONYMOUS_CONTEXT });

    expect(result.accessToken).toBe("signed.access.token");
    expect(result.session).toBe(session);
    expect(result.access).toBe(access);
    expect(result.refreshTokenExpiresAt).toEqual(new Date(NOW.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000));

    const command = lastCommand();
    expect(command?.presentedTokenHash).toBe(hashSecretToken("presented-refresh-token"));
    expect(command?.successor.hash).toBe(hashSecretToken(result.refreshToken));
    expect(command?.successor.issuedAt).toEqual(NOW);
    expect(command?.successor.expiresAt).toEqual(new Date(NOW.getTime() + SECURITY_POLICY.refreshTokenTtlSeconds * 1000));
  });

  it("never invents a successor secret for the caller when the token was reused", async () => {
    const { repository } = repositoryReturning({ kind: "reused" });
    const useCase = new RefreshSessionUseCase(repository, () => "unused", clock, secrets);

    await expect(useCase.execute({ refreshToken: "stale-token", context: ANONYMOUS_CONTEXT })).rejects.toBeInstanceOf(
      AuthenticationFailedError,
    );
  });

  it("rejects an invalid presented token without leaking why", async () => {
    const { repository } = repositoryReturning({ kind: "invalid" });
    const useCase = new RefreshSessionUseCase(repository, () => "unused", clock, secrets);

    await expect(useCase.execute({ refreshToken: "garbage", context: ANONYMOUS_CONTEXT })).rejects.toBeInstanceOf(
      AuthenticationFailedError,
    );
  });
});
