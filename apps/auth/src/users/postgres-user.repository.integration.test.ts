import { afterEach, expect, it } from "vitest";
import { ulid } from "ulid";
import { createAuthDatabase, type AuthDatabase } from "../db/client";
import { createPostgresTestDatabase, describeWithPostgres, type PostgresTestDatabase } from "../testing/postgres-test-database";
import { PostgresUserRepository } from "./postgres-user.repository";

let fixture: PostgresTestDatabase | undefined;
let db: AuthDatabase | undefined;
afterEach(async () => { await db?.close(); db = undefined; await fixture?.close(); fixture = undefined; });

const now = new Date("2026-09-04T12:00:00.000Z");

describeWithPostgres("PostgresUserRepository", () => {
  it("finds a user by id and by normalized email, and answers null otherwise", async () => {
    fixture = await createPostgresTestDatabase(); db = createAuthDatabase({ connectionString: fixture.runtimeUrl });
    const id = ulid();
    await db.query("INSERT INTO users(id,email,name,password_hash,status,created_at,updated_at) VALUES($1,'admin@example.test','Admin','hash','active',$2,$2)", [id, now]);
    const repository = new PostgresUserRepository(db);

    expect(await repository.findById(id)).toMatchObject({ id, email: "admin@example.test", name: "Admin", passwordHash: "hash", status: "active" });
    expect((await repository.findByEmail("admin@example.test"))?.id).toBe(id);
    expect(await repository.findById(ulid())).toBeNull();
    expect(await repository.findByEmail("ninguem@example.test")).toBeNull();
  });
});
