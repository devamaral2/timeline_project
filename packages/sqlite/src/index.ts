/**
 * O acesso ao SQLite da API e do auth (ADR 0024): `node:sqlite`, um template `sql` que separa texto e parametros,
 * codecs que validam cada linha lida, um escritor unico com leitor somente leitura e o migrador de arquivos SQL.
 */
export * from "./columns";
export * from "./database";
export * from "./migrate";
export * from "./open";
export { DatabaseSync, type StatementSync } from "./node-sqlite";
export * from "./sql";
