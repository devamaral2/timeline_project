import { types, type Pool, type QueryArrayResult } from "pg";
import type { ScopedSqlOutcome, ScopedSqlQuery } from "@repo/entities/ports";
import { describeLogicalSchema } from "./logical-schema";
import { AgentSqlRewriteError, buildScopedSql } from "./rewrite-agent-sql";
import { validateAgentSql } from "./validate-agent-sql";

export interface ScopedSqlLimits {
  rowCap: number;
  timeoutMs: number;
  maxCellChars: number;
  maxTotalChars: number;
  maxErrorChars: number;
}

const DEFAULT_LIMITS: ScopedSqlLimits = {
  rowCap: 200,
  timeoutMs: 3000,
  maxCellChars: 500,
  maxTotalChars: 20_000,
  maxErrorChars: 300,
};

// date, time, timestamp, timestamptz, interval, timetz: como texto, para que o
// `SET LOCAL TIME ZONE` valha e o node nao converta para o fuso do servidor.
const RAW_TEXT_TYPE_OIDS = new Set([1082, 1083, 1114, 1184, 1186, 1266]);

const typeParsers = {
  getTypeParser: ((oid: number, format?: "text" | "binary") =>
    RAW_TEXT_TYPE_OIDS.has(oid)
      ? (value: string) => value
      : types.getTypeParser(oid, format as "text")) as typeof types.getTypeParser,
};

export class PostgresScopedSqlQuery implements ScopedSqlQuery {
  constructor(
    private readonly pool: Pool,
    private readonly limits: ScopedSqlLimits = DEFAULT_LIMITS,
  ) {}

  describeSchema(): string {
    return describeLogicalSchema();
  }

  async run(input: { userId: string; sql: string }): Promise<ScopedSqlOutcome> {
    const validation = await validateAgentSql(input.sql);
    if (!validation.ok) return validation;

    let scopedSql: string;
    try {
      scopedSql = await buildScopedSql(input.sql, validation.statement, this.limits.rowCap + 1);
    } catch (error) {
      if (error instanceof AgentSqlRewriteError) return { ok: false, error: error.message };
      throw error;
    }

    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query("BEGIN TRANSACTION READ ONLY");
      await client.query(`SET LOCAL statement_timeout = ${Math.trunc(this.limits.timeoutMs)}`);
      await client.query("SET LOCAL TIME ZONE 'America/Sao_Paulo'");
      const result = await client.query({
        text: scopedSql,
        values: [input.userId],
        rowMode: "array",
        types: typeParsers,
      });
      return this.toOutcome(result);
    } catch (error) {
      // So a mensagem, sem detail/hint: o texto volta para o modelo.
      const message = error instanceof Error ? error.message : "Falha ao executar a consulta";
      return { ok: false, error: truncate(message, this.limits.maxErrorChars) };
    } finally {
      try {
        await client.query("ROLLBACK");
      } catch {
        broken = true;
      }
      client.release(broken);
    }
  }

  private toOutcome(result: QueryArrayResult): ScopedSqlOutcome {
    const columns = result.fields.map((field) => field.name);
    const rows: unknown[][] = [];
    let totalChars = JSON.stringify(columns).length;
    let truncated = result.rows.length > this.limits.rowCap;

    for (const row of result.rows.slice(0, this.limits.rowCap)) {
      const cells = row.map((cell) => this.cell(cell));
      totalChars += JSON.stringify(cells).length;
      if (totalChars > this.limits.maxTotalChars) {
        truncated = true;
        break;
      }
      rows.push(cells);
    }

    return { ok: true, columns, rows, truncated };
  }

  private cell(value: unknown): unknown {
    if (value === null || typeof value === "number" || typeof value === "boolean") return value;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (text.length <= this.limits.maxCellChars) return value;
    return `${text.slice(0, this.limits.maxCellChars)}…`;
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
