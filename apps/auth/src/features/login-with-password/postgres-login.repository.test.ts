import { describe, expect, it, vi } from "vitest";
import type { AuthDatabase, AuthTransaction } from "../../db/client";
import { ANONYMOUS_CONTEXT } from "../../common/request-context";
import { PostgresLoginRepository } from "./postgres-login.repository";

const now = new Date("2026-09-20T00:00:00.000Z");

describe("PostgresLoginRepository", () => {
  it("maps the stored signing-key column before signing the access token", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT status FROM users")) return { rows: [{ status: "active" }] };
      if (sql.startsWith("SELECT role_key FROM user_roles")) return { rows: [] };
      if (sql.startsWith("SELECT permission, effect FROM user_permissions")) return { rows: [] };
      if (sql.startsWith("SELECT kid,encrypted_private_key FROM signing_keys")) {
        return { rows: [{ kid: "key-1", encrypted_private_key: "ciphertext" }] };
      }
      return { rows: [] };
    });
    const transaction = async <T>(work: (tx: AuthTransaction) => Promise<T>): Promise<T> =>
      work({ query } as unknown as AuthTransaction);
    const database = {
      query,
      transaction,
      close: async () => undefined,
    } as unknown as AuthDatabase;
    const sign = vi.fn().mockReturnValue("signed-access-token");
    const repository = new PostgresLoginRepository(database, "issuer", "audience");

    const result = await repository.completeLogin({
      userId: "user-1",
      newSession: {
        id: "session-1",
        amr: ["pwd"],
        authTime: now,
        issuedAt: now,
        context: ANONYMOUS_CONTEXT,
        refreshToken: { id: "refresh-1", hash: "hash", expiresAt: new Date(now.getTime() + 1000) },
      },
      now,
      auditEvents: [],
    }, sign);

    expect(result).toMatchObject({ accessToken: "signed-access-token" });
    expect(sign).toHaveBeenCalledWith(
      { kid: "key-1", encryptedPrivateKey: "ciphertext" },
      expect.any(Object),
    );
  });
});
