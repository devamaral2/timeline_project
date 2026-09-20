import { describe, expect, test } from "vitest";
import type { ScopedSqlScope } from "../../../domain/ports";
import { describeLogicalSchema, logicalTables } from "./logical-schema";
import { buildScopedSql } from "./rewrite-agent-sql";
import { validateAgentSql } from "./validate-agent-sql";

/** O escopo normal: o ator e o dono dos dados. */
const OWNER: ScopedSqlScope = { includeChat: true };

async function scoped(sql: string, scope: ScopedSqlScope = OWNER): Promise<string> {
  const validation = await validateAgentSql(sql, scope);
  if (!validation.ok) throw new Error(validation.error);
  return buildScopedSql(sql, validation.statement, 201, scope);
}

describe("buildScopedSql", () => {
  test("wraps the query under one materialized CTE per logical table", async () => {
    const sql = await scoped("SELECT id FROM events");

    for (const table of logicalTables(OWNER)) {
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
    const validation = await validateAgentSql("SELECT id FROM events", OWNER);
    if (!validation.ok) throw new Error(validation.error);

    await expect(buildScopedSql("SELECT name FROM events", validation.statement, 10, OWNER)).rejects.toThrow();
  });
});

describe("logical schema", () => {
  test("the description lists exactly the columns the CTEs expose", () => {
    const description = describeLogicalSchema(OWNER);
    for (const table of logicalTables(OWNER)) {
      expect(description).toContain(`${table.name}: `);
      for (const column of table.columns) {
        expect(description).toContain(`  - ${column.name} ${column.type}`);
      }
    }
  });

  test("every CTE filters by the user parameter", () => {
    for (const table of logicalTables(OWNER)) {
      expect(table.where).toContain("user_id = $1");
      expect(table.where).toContain("deleted_at IS NULL");
    }
  });

  test("o escopo sem chat nao monta o CTE nem descreve a tabela", async () => {
    const withoutChat: ScopedSqlScope = { includeChat: false };

    const sql = await scoped("SELECT id FROM events", withoutChat);
    expect(sql).not.toContain("chat_messages");
    expect(describeLogicalSchema(withoutChat)).not.toContain("chat_messages");

    // As duas metades andam juntas: o que o prompt descreve e o que o CTE monta.
    expect(await scoped("SELECT content FROM chat_messages")).toContain("chat_messages AS MATERIALIZED (");
    expect(describeLogicalSchema(OWNER)).toContain("chat_messages: ");
  });

  test("o CTE do chat herda o filtro do dono pela conversa", () => {
    const names = (scope: ScopedSqlScope) => logicalTables(scope).map((table) => table.name);
    const chat = logicalTables(OWNER).find((table) => table.name === "chat_messages");

    expect(names(OWNER)).toContain("chat_messages");
    expect(names({ includeChat: false })).not.toContain("chat_messages");
    // A mensagem nao tem user_id proprio: quem a prende ao dono e o join.
    expect(chat?.from).toContain("JOIN public.agent_conversations c ON c.id = m.conversation_id");
    expect(chat?.where).toBe("c.user_id = $1 AND c.deleted_at IS NULL");
  });
});
