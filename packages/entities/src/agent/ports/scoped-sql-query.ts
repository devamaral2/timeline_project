export type ScopedSqlOutcome =
  | { ok: true; columns: string[]; rows: unknown[][]; truncated: boolean }
  | { ok: false; error: string };

/**
 * O que a consulta enxerga alem dos registros do usuario.
 *
 * `includeChat` existe por causa de uma assimetria: eventos, tarefas e notas
 * sao dados que o usuario descreve, enquanto as mensagens de chat sao texto
 * livre que ele escreve sabendo que um modelo vai le-lo. Quando o ator e o
 * proprio dono, o raio de uma instrucao plantada ali e ele mesmo. Quando um
 * super admin age sobre outro usuario (`assertCanActFor`), nao e: o texto
 * daquele usuario voltaria ao modelo no run do admin. Por isso a tabela sai do
 * escopo — some dos CTEs, do validador e da descricao do prompt ao mesmo tempo.
 */
export interface ScopedSqlScope {
  includeChat: boolean;
}

/**
 * SELECT escrito pelo agente, executado so sobre os dados de um usuario. Quem
 * garante o escopo e a implementacao (validacao pela AST + CTEs que ja filtram
 * o usuario), nunca o texto da query.
 */
export interface ScopedSqlQuery {
  /** As tabelas e colunas que a query enxerga, para o prompt do agente. */
  describeSchema(scope: ScopedSqlScope): string;
  run(input: { userId: string; sql: string; scope: ScopedSqlScope }): Promise<ScopedSqlOutcome>;
}
