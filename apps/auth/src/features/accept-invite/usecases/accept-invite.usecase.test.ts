import { describe, expect, it, vi } from "vitest";
import { AuthenticationFailedError, SemanticInputError } from "../../../common/errors";
import { Clock } from "../../../common/clock";
import { PreparePassword } from "../../../auth-core/password/prepare-password";
import type { InviteRepository } from "../../../auth-core/persistence/postgres-invite.repository";
import { AcceptInviteUseCase } from "./accept-invite.usecase";

const now = new Date("2026-09-05T12:00:00.000Z");
const context = { correlationId: "test", ipAddress: "127.0.0.1", userAgent: "vitest" };
class FixedClock extends Clock { now(): Date { return now; } }

function fixture(overrides: Partial<InviteRepository> = {}) {
  const invites = {
    inspectByTokenHash: vi.fn().mockResolvedValue({ inviteId: "invite", userId: "user", name: "Amara", email: "amara@example.com", expiresAt: new Date(now.getTime() + 60_000) }),
    acceptInvite: vi.fn().mockResolvedValue("accepted"),
    ...overrides,
  } as unknown as InviteRepository;
  const hasher = { hash: vi.fn().mockResolvedValue("scrypt$hash"), verify: vi.fn() };
  const prepare = new PreparePassword({ isCompromised: vi.fn().mockResolvedValue(false) }, hasher);
  return { usecase: new AcceptInviteUseCase(invites, prepare, new FixedClock()), invites, hasher };
}

describe("AcceptInviteUseCase", () => {
  it("hashes a valid password before atomically accepting the invite", async () => {
    const { usecase, invites, hasher } = fixture();

    await expect(usecase.execute({ inviteToken: "opaque", password: "SenhaSegura123!", context })).resolves.toEqual({ accepted: true });
    expect(hasher.hash).toHaveBeenCalledWith("SenhaSegura123!");
    expect(invites.acceptInvite).toHaveBeenCalledWith(expect.objectContaining({
      inviteId: "invite",
      userId: "user",
      passwordHash: "scrypt$hash",
      auditEvents: [expect.objectContaining({ action: "invite.accepted" })],
    }));
    const [firstCall] = vi.mocked(invites.acceptInvite).mock.calls;
    if (!firstCall) throw new Error("acceptInvite was not called");
    expect(JSON.stringify(firstCall[0])).not.toContain("SenhaSegura123!");
  });

  it("rejects weak passwords before writing", async () => {
    const { usecase, invites } = fixture();
    await expect(usecase.execute({ inviteToken: "opaque", password: "senhafraca", context })).rejects.toBeInstanceOf(SemanticInputError);
    expect(invites.acceptInvite).not.toHaveBeenCalled();
  });

  it("fails opaquely when the invite is consumed during password preparation", async () => {
    const { usecase } = fixture({ acceptInvite: vi.fn().mockResolvedValue("invalid") });
    await expect(usecase.execute({ inviteToken: "opaque", password: "SenhaSegura123!", context })).rejects.toBeInstanceOf(AuthenticationFailedError);
  });
});
