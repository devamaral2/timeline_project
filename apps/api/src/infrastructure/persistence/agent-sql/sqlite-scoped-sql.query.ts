import type { ScopedSqlOutcome, ScopedSqlQuery } from "../../../domain/ports";
import type { Db } from "../shared/tx";
import { type LogicalTable, SQL_DIALECT_DESCRIPTION, createTableSql, describeLogicalSchema, logicalTables } from "./logical-schema";
import { runInSandbox, type SandboxTable } from "./agent-sql-sandbox";
import { ALLOWED_FUNCTIONS, ALLOWED_TABLE_FUNCTIONS, MAX_AGENT_SQL_LENGTH } from "./sql-policy";

export interface ScopedSqlLimits {
  rowCap: number;
  /** Prazo da consulta inteira, da partida do sandbox a resposta; passado dele o processo e morto. */
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

/**
 * A consulta do agente sobre os dados de um usuario (ver `logical-schema.ts` e
 * `agent-sql-sandbox.ts`). Para cada consulta: le do banco da API so as linhas
 * do usuario, copia para um SQLite em memoria dentro de um processo descartavel
 * e roda o SQL do agente la. O escopo nao e um filtro que a query poderia
 * contornar: as linhas de outro usuario nao existem no banco em que ela roda.
 */
export class SqliteScopedSqlQuery implements ScopedSqlQuery {
  constructor(
    private readonly db: Db,
    private readonly limits: ScopedSqlLimits = DEFAULT_LIMITS,
  ) {}

  describeSchema(): string {
    return `${SQL_DIALECT_DESCRIPTION}\n\n${describeLogicalSchema()}`;
  }

  async run(input: { userId: string; sql: string }): Promise<ScopedSqlOutcome> {
    if (input.sql.length > MAX_AGENT_SQL_LENGTH) {
      return { ok: false, error: `A consulta passa de ${MAX_AGENT_SQL_LENGTH} caracteres.` };
    }

    let tables: SandboxTable[];
    try {
      tables = await this.copyTables(input.userId, input.sql);
    } catch {
      return { ok: false, error: "Falha ao preparar a consulta." };
    }

    const outcome = await runInSandbox(
      {
        tables,
        sql: input.sql,
        rowCap: this.limits.rowCap,
        maxCellChars: this.limits.maxCellChars,
        maxTotalChars: this.limits.maxTotalChars,
        allowedFunctions: [...ALLOWED_FUNCTIONS],
        allowedTableFunctions: [...ALLOWED_TABLE_FUNCTIONS],
      },
      this.limits.timeoutMs,
    );
    // Uma mensagem de erro tambem tem teto: o texto volta para o modelo.
    return outcome.ok ? outcome : { ok: false, error: truncate(outcome.error, this.limits.maxErrorChars) };
  }

  /**
   * As linhas do usuario das tabelas que a consulta menciona. Uma tabela nao
   * mencionada nao e copiada e, se a consulta a usar mesmo assim, "no such
   * table": o SQL nao tem como formar um nome de tabela que nao esteja no texto
   * (nao ha escape de identificador nem SQL dinamico). Poupa ler o que nao serve.
   */
  private async copyTables(userId: string, sql: string): Promise<SandboxTable[]> {
    const text = sql.toLowerCase();
    const wanted = logicalTables().filter((table) => text.includes(table.name));
    return Promise.all(wanted.map((table) => this.copyTable(table, userId)));
  }

  private async copyTable(table: LogicalTable, userId: string): Promise<SandboxTable> {
    const columns = table.columns.map((column) => column.name);
    const found = await this.db.all(table.select(userId));
    return {
      name: table.name,
      createSql: createTableSql(table),
      columns,
      rows: found.map((row) => columns.map((column) => toCell(row[column]))),
    };
  }
}

/** O que o SQLite entrega ao JS e o que volta para ele: numero, texto ou nulo. */
function toCell(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Uint8Array) return Buffer.from(value).toString("utf8");
  return value ?? null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}
