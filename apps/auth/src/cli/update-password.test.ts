import { describe, expect, it } from "vitest";
import type { AuthDatabase } from "../db/client";
import { updatePassword } from "./update-password";

describe("updatePassword", () => {
  it("updates the hash, revokes sessions, and audits without storing the password", async () => {
    const queries: Array<{ sql: string; args: unknown[] }> = [];
    const database = {
      query: async () => ({ rows: [], rowCount: 0 }),
      transaction: async (work: (tx: never) => Promise<unknown>) => work({
        query: async (sql: string, args: unknown[] = []) => {
          queries.push({ sql, args });
          if (sql.includes("SELECT id, status")) return { rows: [{ id: "user-1", status: "active" }], rowCount: 1 };
          if (sql.includes("UPDATE sessions")) return { rows: [], rowCount: 2 };
          return { rows: [], rowCount: 1 };
        },
      } as never),
      close: async () => undefined,
    } as unknown as AuthDatabase;

    const result = await updatePassword(database, {
      email: " Admin@Example.com ",
      passwordHash: "scrypt$hash",
      now: new Date("2026-09-20T00:00:00Z"),
    });

    expect(result).toEqual({ userId: "user-1", revokedSessions: 2 });
    expect(queries.some(({ sql, args }) => sql.includes("UPDATE users") && args.includes("scrypt$hash"))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes("UPDATE sessions"))).toBe(true);
    const audit = queries.find(({ sql }) => sql.includes("INSERT INTO audit_log"));
    expect(audit?.args).not.toContain("Admin@Example.com");
    expect(audit?.args.join(" ")).not.toContain("scrypt$hash");
  });
});
