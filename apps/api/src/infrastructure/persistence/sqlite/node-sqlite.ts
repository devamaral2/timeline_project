import type * as NodeSqlite from "node:sqlite";

/**
 * O `node:sqlite` pelo `process.getBuiltinModule`, e nao por `import`: o Vite 5 dos testes nao conhece o modulo (so
 * existe com o prefixo `node:`), tira o prefixo e falha procurando um pacote `sqlite`. O tipo continua o do Node.
 */
const nodeSqlite = process.getBuiltinModule("node:sqlite") as typeof NodeSqlite;

export const DatabaseSync = nodeSqlite.DatabaseSync;
export type DatabaseSync = NodeSqlite.DatabaseSync;
export type StatementSync = NodeSqlite.StatementSync;
