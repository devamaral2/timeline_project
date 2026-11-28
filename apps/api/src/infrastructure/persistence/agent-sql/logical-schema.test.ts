import { describe, expect, test } from "vitest";
import { DatabaseSync } from "@repo/sqlite";
import { SQL_DIALECT_DESCRIPTION, createTableSql, describeLogicalSchema, logicalTables } from "./logical-schema";

describe("logical schema", () => {
  test("a descricao lista exatamente as colunas que a copia cria", () => {
    const description = describeLogicalSchema();
    for (const table of logicalTables()) {
      expect(description).toContain(`${table.name}: `);
      for (const column of table.columns) {
        expect(description).toContain(`  - ${column.name} ${column.type}`);
      }
    }
  });

  test("o CREATE TABLE de cada tabela e valido no SQLite e tem as colunas declaradas", () => {
    const db = new DatabaseSync(":memory:");
    for (const table of logicalTables()) {
      db.exec(createTableSql(table));
      const columns = (db.prepare(`PRAGMA table_info(${table.name})`).all() as Array<{ name: string }>).map((c) => c.name);
      expect(columns, table.name).toEqual(table.columns.map((column) => column.name));
    }
    db.close();
  });

  test("todo SELECT de copia filtra pelo usuario com parametro, nunca com texto", () => {
    for (const table of logicalTables()) {
      const select = table.select("user-x");
      expect(select.params, table.name).toContain("user-x");
      expect(select.text, table.name).not.toContain("user-x");
      expect(select.text, table.name).toMatch(/user_id = \?/);
    }
  });

  test("os SELECTs excluem o que foi apagado, menos nas tabelas sem apagado logico", () => {
    // `recurrences` e apagada de verdade (nao ha `deleted_at`); as tags dependem da tarefa ou do artefato pai.
    const HARD_DELETED = new Set(["recurrences"]);
    for (const table of logicalTables()) {
      if (!HARD_DELETED.has(table.name)) expect(table.select("u").text, table.name).toContain("deleted_at IS NULL");
    }
  });

  test("so tarefas de pessoa entram: nenhum SELECT de tarefa deixa passar um pedido ao agente", () => {
    for (const table of logicalTables()) {
      const text = table.select("u").text;
      if (/\bFROM tasks\b|JOIN tasks\b/.test(text)) expect(text, table.name).toContain("actor = 'human'");
    }
  });

  test("nenhum SELECT expoe a tabela de entradas, a fila ou o grafo de relacoes cru como coluna", () => {
    for (const table of logicalTables()) {
      expect(table.columns.map((column) => column.name), table.name).not.toContain("user_id");
      expect(table.columns.map((column) => column.name), table.name).not.toContain("deleted_at");
    }
  });

  test("a descricao do dialeto fala de SQLite e de datas em texto ISO", () => {
    expect(SQL_DIALECT_DESCRIPTION).toContain("SQLite");
    expect(SQL_DIALECT_DESCRIPTION).toContain("ISO-8601");
    expect(SQL_DIALECT_DESCRIPTION).not.toMatch(/jsonb|timestamptz|to_char\(/i);
  });
});
