import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "./node-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { c, defineTable, RowDecodeError } from "./columns";
import { NestedTransactionError, SqliteDatabase } from "./database";
import { MigrationError, migrateDatabase, type Migration } from "./migrate";
import { jsonMerge, sql } from "./sql";

describe("sql", () => {
  it("separates values from the text and inlines nested fragments", () => {
    const when = new Date("2026-11-27T13:00:00.000Z");
    const query = sql`SELECT * FROM t WHERE a = ${"x"} AND b = ${true} AND c > ${when} ${sql`AND d IN ${sql.in([1, 2])}`}`;
    expect(query.text).toBe("SELECT * FROM t WHERE a = ? AND b = ? AND c > ? AND d IN (?, ?)");
    expect(query.params).toEqual(["x", 1, "2026-11-27T13:00:00.000Z", 1, 2]);
  });

  it("refuses undefined, arrays and objects as parameters", () => {
    expect(() => sql`${undefined as never}`).toThrow(/undefined/);
    expect(() => sql`${[1] as never}`).toThrow(/sql.in/);
    expect(sql`${sql.json({ a: [1] })}`.params).toEqual(['{"a":[1]}']);
  });

  it("writes an empty IN list that never matches", () => {
    expect(sql`x IN ${sql.in([])}`.text).toBe("x IN ()");
  });

  it("quotes the fixed lists of the domain", () => {
    expect(sql`IN (${sql.list(["a", "it's"])})`.text).toBe("IN ('a', 'it''s')");
  });
});

describe("tables", () => {
  const items = defineTable("items", {
    id: c.text,
    userId: c.text,
    done: c.boolean,
    at: c.timestamp.nullable(),
    data: c.json<{ n: number }>(),
    byWeekday: c.integer.nullable().named("byweekday"),
  });

  it("selects with the domain keys as aliases", () => {
    expect(items.select("i", ["id", "userId", "byWeekday"]).text).toBe(
      'i.id AS "id", i.user_id AS "userId", i.byweekday AS "byWeekday"',
    );
  });

  it("decodes a raw row and refuses a value of the wrong type", () => {
    expect(items.decode({ id: "1", userId: "u", done: 1, at: null, data: '{"n":2}', byWeekday: 3 })).toEqual({
      id: "1",
      userId: "u",
      done: true,
      at: null,
      data: { n: 2 },
      byWeekday: 3,
    });
    expect(() => items.decode({ id: "1", userId: "u", done: "yes", at: null, data: "{}", byWeekday: null })).toThrow(
      RowDecodeError,
    );
  });

  it("inserts only the given columns, encoding each one", () => {
    const query = items.insert({ id: "1", userId: "u", done: false, data: { n: 1 }, at: undefined });
    expect(query.text).toBe("INSERT INTO items (id, user_id, done, data) VALUES (?, ?, ?, ?)");
    expect(query.params).toEqual(["1", "u", 0, '{"n":1}']);
  });
});

describe("SqliteDatabase", () => {
  let dir: string;
  let db: SqliteDatabase;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "api-sqlite-"));
    db = SqliteDatabase.open(join(dir, "db.sqlite"));
    db.handle.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL UNIQUE)");
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs in WAL with foreign keys on", async () => {
    expect(await db.get(sql`PRAGMA journal_mode`)).toEqual({ journal_mode: "wal" });
    expect(await db.get(sql`PRAGMA foreign_keys`)).toEqual({ foreign_keys: 1 });
  });

  it("reads through a read-only connection", async () => {
    await expect(db.all(sql`INSERT INTO t (v) VALUES ('a') RETURNING id`)).rejects.toThrow(/readonly/);
    await db.execute(sql`INSERT INTO t (v) VALUES ('a')`);
    expect(await db.all(sql`SELECT v FROM t`)).toEqual([{ v: "a" }]);
  });

  it("reports changed rows and returned rows", async () => {
    expect((await db.execute(sql`INSERT INTO t (v) VALUES ('a'), ('b')`)).rowCount).toBe(2);
    const updated = await db.execute(sql`UPDATE t SET v = v || '!' WHERE v = 'a' RETURNING v`);
    expect(updated).toEqual({ rows: [{ v: "a!" }], rowCount: 1 });
  });

  it("rolls back everything a failed transaction wrote", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`INSERT INTO t (v) VALUES ('a')`);
        await tx.execute(sql`INSERT INTO t (v) VALUES ('a')`);
      }),
    ).rejects.toThrow(/UNIQUE/);
    expect(await db.all(sql`SELECT v FROM t`)).toEqual([]);
  });

  it("keeps a second writer out of an open transaction until it commits", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO t (v) VALUES ('first')`);
      order.push("first wrote");
      await gate;
      order.push("first commits");
    });
    const second = db.execute(sql`INSERT INTO t (v) VALUES ('second')`).then(() => order.push("second wrote"));
    // The reader sees only what was committed.
    await new Promise((resolve) => setImmediate(resolve));
    expect(await db.all(sql`SELECT v FROM t`)).toEqual([]);
    release();
    await Promise.all([first, second]);
    expect(order).toEqual(["first wrote", "first commits", "second wrote"]);
  });

  it("refuses to write on the database from inside an open transaction", async () => {
    await expect(db.transaction(async () => db.execute(sql`INSERT INTO t (v) VALUES ('a')`))).rejects.toThrow(
      NestedTransactionError,
    );
    await expect(db.transaction(async () => db.transaction(async () => 1))).rejects.toThrow(NestedTransactionError);
  });
});

describe("migrateDatabase", () => {
  const first: Migration = { name: "0000_a.sql", sql: "CREATE TABLE a (id INTEGER PRIMARY KEY);" };
  const second: Migration = {
    name: "0001_b.sql",
    sql: "CREATE TABLE b (id INTEGER PRIMARY KEY, a_id INTEGER REFERENCES a (id));",
  };

  it("applies each pending file once", () => {
    const db = new DatabaseSync(":memory:");
    expect(migrateDatabase(db, { migrations: [first] })).toEqual(["0000_a.sql"]);
    expect(migrateDatabase(db, { migrations: [first, second] })).toEqual(["0001_b.sql"]);
    expect(migrateDatabase(db, { migrations: [first, second] })).toEqual([]);
  });

  it("runs a file merged out of order instead of skipping it", () => {
    const db = new DatabaseSync(":memory:");
    migrateDatabase(db, { migrations: [second] });
    expect(migrateDatabase(db, { migrations: [first, second] })).toEqual(["0000_a.sql"]);
  });

  it("refuses a database migrated by a newer build", () => {
    const db = new DatabaseSync(":memory:");
    migrateDatabase(db, { migrations: [first, second] });
    expect(() => migrateDatabase(db, { migrations: [first] })).toThrow(/newer build/);
  });

  it("refuses a migration edited after it was applied", () => {
    const db = new DatabaseSync(":memory:");
    migrateDatabase(db, { migrations: [first] });
    expect(() => migrateDatabase(db, { migrations: [{ ...first, sql: `${first.sql} -- edited` }] })).toThrow(
      /changed after it was applied/,
    );
  });

  it("undoes a failing file and records nothing for it", () => {
    const db = new DatabaseSync(":memory:");
    const broken: Migration = { name: "0001_x.sql", sql: "CREATE TABLE x (id INTEGER); INSERT INTO nope VALUES (1);" };
    expect(() => migrateDatabase(db, { migrations: [first, broken] })).toThrow();
    expect(db.prepare("SELECT name FROM schema_migrations").all()).toEqual([{ name: "0000_a.sql" }]);
    expect(db.prepare("SELECT name FROM sqlite_schema WHERE name = 'x'").all()).toEqual([]);
  });

  it("refuses a migration that leaves broken foreign keys, with foreign keys off while it runs", () => {
    const db = new DatabaseSync(":memory:");
    db.exec("PRAGMA foreign_keys = ON");
    migrateDatabase(db, { migrations: [first, second] });
    const orphan: Migration = { name: "0002_c.sql", sql: "INSERT INTO b (id, a_id) VALUES (1, 99);" };
    expect(() => migrateDatabase(db, { migrations: [first, second, orphan] })).toThrow(MigrationError);
    expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  });
});

describe("jsonMerge", () => {
  it("replaces each top-level key whole and keeps nulls, like jsonb ||", async () => {
    const db = SqliteDatabase.open(":memory:", { memory: true });
    const row = await db.get<{ v: string }>(
      sql`SELECT ${jsonMerge(sql`${'{"a":{"x":1,"y":2},"b":1,"c":"keep"}'}`, { a: { x: 9 }, b: null, "d\"q": [1] })} AS v`,
    );
    expect(JSON.parse(row!.v)).toEqual({ a: { x: 9 }, b: null, c: "keep", 'd"q': [1] });
    db.close();
  });
});
