import { describe, expect, test } from "vitest";
import { describeLogicalSchema, LOGICAL_TABLES } from "./logical-schema";
import { buildScopedSql } from "./rewrite-agent-sql";
import { validateAgentSql } from "./validate-agent-sql";

async function scoped(sql: string): Promise<string> {
  const validation = await validateAgentSql(sql);
  if (!validation.ok) throw new Error(validation.error);
  return buildScopedSql(sql, validation.statement, 201);
}

describe("buildScopedSql", () => {
  test("wraps the query under one materialized CTE per logical table", async () => {
    const sql = await scoped("SELECT id FROM events");

    for (const table of LOGICAL_TABLES) {
      expect(sql).toContain(`${table.name} AS MATERIALIZED (`);
    }
    expect(sql).toMatch(/\) AS agent_q\nLIMIT 201$/);
  });

  test("a trailing line comment cannot swallow the wrapper", async () => {
    const sql = await scoped("SELECT id FROM events -- os ids");
    expect(sql).toContain("-- os ids\n) AS agent_q");
  });

  test("strips trailing semicolons", async () => {
    const sql = await scoped("SELECT id FROM events;;  ");
    expect(sql).toContain("SELECT id FROM events\n) AS agent_q");
  });

  test("refuses a statement that differs from the validated one", async () => {
    const validation = await validateAgentSql("SELECT id FROM events");
    if (!validation.ok) throw new Error(validation.error);

    await expect(buildScopedSql("SELECT name FROM events", validation.statement, 10)).rejects.toThrow();
  });
});

describe("logical schema", () => {
  test("the description lists exactly the columns the CTEs expose", () => {
    const description = describeLogicalSchema();
    for (const table of LOGICAL_TABLES) {
      expect(description).toContain(`${table.name}: `);
      for (const column of table.columns) {
        expect(description).toContain(`  - ${column.name} ${column.type}`);
      }
    }
  });

  test("every CTE filters by the user parameter", () => {
    for (const table of LOGICAL_TABLES) {
      expect(table.where).toContain("user_id = $1");
      expect(table.where).toContain("deleted_at IS NULL");
    }
  });
});
