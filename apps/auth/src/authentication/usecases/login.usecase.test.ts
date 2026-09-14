import { describe, expect, it, vi } from "vitest";
import { Clock } from "../../common/clock";
import { AuthenticationFailedError, RateLimitedError } from "../../common/errors";
import { SecretGenerator } from "../../common/secret-generator";
import { ScryptPasswordHasher } from "../../credentials/scrypt-password-hasher";
import type { PasswordHasher } from "../../credentials/password-hasher";
import { hashSecretToken } from "../../crypto/secret-token";
import type { RateLimiter } from "../../rate-limit/rate-limiter";
import type { OpenSessionCommand, SessionRepository } from "../../sessions/ports/session-repository";
import { InMemoryRateLimiter } from "../../testing/in-memory-rate-limiter";
import type { UserReader } from "../../users/ports/user-repository";
import type { User, UserStatus } from "../../users/user";
import { LoginCredentialChecker } from "../login-credential-checker";
import { LoginUseCase, type LoginLimits } from "./login.usecase";

const now = new Date("2026-09-13T12:00:00.000Z");
const context = { correlationId: "login-test", ipAddress: "203.0.113.7", userAgent: "vitest" };
const PASSWORD = "Senha-Correta-123";
const limits: LoginLimits = { passwordEmail: { attempts: 5, windowSeconds: 900 }, passwordIp: { attempts: 30, windowSeconds: 900 } };

class FixedClock extends Clock { now(): Date { return now; } }
class FixedSecrets extends SecretGenerator { private id = 0; randomId(): string { return `id-${++this.id}`; } randomBytes(length: number): Buffer { return Buffer.alloc(length, 9); } }

/** Um hash com a forma exata que o checker aceita como "utilizavel". */
const USABLE_HASH = `scrypt$32768$8$1$${"A".repeat(22)}$${"B".repeat(86)}`;

function userWith(status: UserStatus | "pending_sign_up" | "guest" | "inactive", passwordHash: string | null = USABLE_HASH): User {
  return { id: "user-1", email: "admin@example.test", name: "Admin", passwordHash, status: status as UserStatus, createdAt: now, updatedAt: now };
}
function reader(user: User | null): UserReader { return { findById: vi.fn(), findByEmail: vi.fn().mockResolvedValue(user) }; }

/** Conta cada KDF e aprova so a senha correta contra o hash real do usuario. */
function countingHasher(): PasswordHasher & { verify: ReturnType<typeof vi.fn> } {
  return { hash: vi.fn(), verify: vi.fn(async (password: string, hash: string) => hash === USABLE_HASH && password === PASSWORD) };
}

function sessions(result: Awaited<ReturnType<SessionRepository["openSession"]>> = { sessionId: "id-1", accessToken: "signed.access", access: { roleKeys: ["admin"], permissions: ["*:manage"], denies: [] }, refreshTokenExpiresAt: new Date(now.getTime() + 30 * 86400_000) }) {
  const openSession = vi.fn().mockResolvedValue(result);
  const repository = { openSession, rotateRefreshToken: vi.fn(), revokeByRefreshToken: vi.fn(), revokeAllOfUser: vi.fn(), revokeAllOfTargetUser: vi.fn(), findActiveSession: vi.fn() } as unknown as SessionRepository;
  return { repository, openSession };
}

function usecase(options: { user?: User | null; hasher?: PasswordHasher; limiter?: RateLimiter; sessions?: SessionRepository } = {}) {
  const hasher = options.hasher ?? countingHasher();
  return new LoginUseCase(
    reader(options.user === undefined ? userWith("active") : options.user),
    new LoginCredentialChecker(hasher, "dummy-hash"),
    options.limiter ?? new InMemoryRateLimiter(),
    options.sessions ?? sessions().repository,
    () => "unused-sign",
    new FixedClock(),
    new FixedSecrets(),
    limits,
  );
}

describe("LoginUseCase", () => {
  it("opens a password session and returns the token pair in one call", async () => {
    const { repository, openSession } = sessions();
    const result = await usecase({ sessions: repository }).execute({ email: "  Admin@Example.TEST ", password: PASSWORD, context });

    expect(result).toEqual({
      accessToken: "signed.access",
      refreshToken: Buffer.alloc(32, 9).toString("base64url"),
      accessTokenExpiresInSeconds: 900,
      refreshTokenExpiresAt: new Date(now.getTime() + 30 * 86400_000).toISOString(),
    });
    const command = openSession.mock.calls[0]![0] as OpenSessionCommand;
    expect(command).toMatchObject({ userId: "user-1", now, context });
    expect(command.refreshToken.hash).toBe(hashSecretToken(result.refreshToken));
    expect(JSON.stringify(command)).not.toContain(result.refreshToken);
    expect(JSON.stringify(command)).not.toContain(PASSWORD);
  });

  it("gives an absent user and a wrong password the same failure, each after exactly one KDF", async () => {
    const absentHasher = countingHasher();
    const wrongHasher = countingHasher();
    const absent = usecase({ user: null, hasher: absentHasher }).execute({ email: "ninguem@example.test", password: PASSWORD, context });
    const wrong = usecase({ hasher: wrongHasher }).execute({ email: "admin@example.test", password: "Senha-Errada-123", context });

    const [absentError, wrongError] = await Promise.all([absent.catch((e: unknown) => e), wrong.catch((e: unknown) => e)]);
    expect(absentError).toBeInstanceOf(AuthenticationFailedError);
    expect(wrongError).toBeInstanceOf(AuthenticationFailedError);
    expect((absentError as Error).message).toBe((wrongError as Error).message);
    expect(absentHasher.verify).toHaveBeenCalledTimes(1);
    expect(absentHasher.verify).toHaveBeenCalledWith(PASSWORD, "dummy-hash");
    expect(wrongHasher.verify).toHaveBeenCalledTimes(1);
  });

  it("takes comparable time for an absent user and a wrong password with the real scrypt", async () => {
    const hasher = new ScryptPasswordHasher();
    const realHash = await hasher.hash(PASSWORD);
    const dummyHash = await hasher.hash("timeline-auth-login-dummy");
    const make = (user: User | null) => new LoginUseCase(reader(user), new LoginCredentialChecker(hasher, dummyHash), new InMemoryRateLimiter(), sessions().repository, () => "", new FixedClock(), new FixedSecrets(), limits);
    const time = async (user: User | null, password: string) => {
      const samples: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const started = performance.now();
        await make(user).execute({ email: "admin@example.test", password, context }).catch(() => undefined);
        samples.push(performance.now() - started);
      }
      return samples.sort((a, b) => a - b)[1]!;
    };

    const absent = await time(null, PASSWORD);
    const wrong = await time(userWith("active", realHash), "Senha-Errada-123");

    // Sem o hash de mentira o caminho "email inexistente" seria ordens de
    // grandeza mais rapido. A folga larga so absorve ruido de CI.
    expect(absent / wrong).toBeGreaterThan(0.5);
    expect(absent / wrong).toBeLessThan(2);
  });

  it.each([
    ["pending_sign_up", USABLE_HASH],
    ["pending_sign_up", null],
    ["guest", null],
    ["inactive", USABLE_HASH],
    ["pending_invite", USABLE_HASH],
    ["suspended", USABLE_HASH],
    ["disabled", USABLE_HASH],
  ] as const)("refuses a %s account (password hash %s) with the generic failure and never opens a session", async (status, passwordHash) => {
    const hasher = countingHasher();
    const { repository, openSession } = sessions();

    await expect(usecase({ user: userWith(status, passwordHash), hasher, sessions: repository }).execute({ email: "admin@example.test", password: PASSWORD, context }))
      .rejects.toBeInstanceOf(AuthenticationFailedError);
    expect(hasher.verify).toHaveBeenCalledTimes(1);
    expect(openSession).not.toHaveBeenCalled();
  });

  it("fails generically when the account stops being active before the session commits", async () => {
    const { repository } = sessions("invalid");
    await expect(usecase({ sessions: repository }).execute({ email: "admin@example.test", password: PASSWORD, context })).rejects.toBeInstanceOf(AuthenticationFailedError);
  });

  it("throttles by email and by IP before reading the user or running any KDF", async () => {
    const limiter = new InMemoryRateLimiter();
    const hasher = countingHasher();
    const login = usecase({ user: null, hasher, limiter });

    for (let attempt = 0; attempt < limits.passwordEmail.attempts; attempt += 1) {
      await expect(login.execute({ email: "alvo@example.test", password: "x", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
    }
    await expect(login.execute({ email: "alvo@example.test", password: "x", context })).rejects.toBeInstanceOf(RateLimitedError);
    expect(hasher.verify).toHaveBeenCalledTimes(limits.passwordEmail.attempts);

    const byIp = usecase({ user: null, limiter: { hit: vi.fn(async (input: Parameters<RateLimiter["hit"]>[0]) => ({ allowed: input.scope !== "password_ip", retryAfterSeconds: 42 })) } });
    await expect(byIp.execute({ email: "outro@example.test", password: "x", context })).rejects.toMatchObject({ retryAfterSeconds: 42 });
  });
});
