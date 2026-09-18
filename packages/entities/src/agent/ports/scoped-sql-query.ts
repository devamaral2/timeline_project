export type ScopedSqlOutcome =
  | { ok: true; columns: string[]; rows: unknown[][]; truncated: boolean }
  | { ok: false; error: string };

/**
 * SELECT escrito pelo agente, executado so sobre os dados de um usuario. Quem
 * garante o escopo e a implementacao (validacao pela AST + CTEs que ja filtram
 * o usuario), nunca o texto da query.
 */
export interface ScopedSqlQuery {
  /** As tabelas e colunas que a query enxerga, para o prompt do agente. */
  describeSchema(): string;
  run(input: { userId: string; sql: string }): Promise<ScopedSqlOutcome>;
}
