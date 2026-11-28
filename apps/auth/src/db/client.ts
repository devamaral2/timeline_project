import { resolve } from "node:path";
import {
  loadMigrations,
  openMigratedDatabase,
  sql,
  type ColumnInfo,
  type Migration,
  type RowDecoder,
  type SqlExecutor,
} from "@repo/sqlite";

/**
 * O banco do auth num arquivo SQLite (ADR 0025), sobre o mesmo cliente da API (`@repo/sqlite`): um escritor com fila
 * de uma vaga e `BEGIN IMMEDIATE` em toda transacao.
 *
 * A interface continua a do `pg` que os repositorios ja usavam: `query(texto, valores)` com `$1`, `$2`... e
 * `{ rows, rowCount }`. Assim o codigo de sessao, convite e chave muda so no dialeto do SQL. Para isso o adaptador:
 *
 * - grava `Date` como texto ISO-8601, booleano como 0/1, e lista ou objeto como JSON, como o `pg` serializava;
 * - devolve cada coluna pelo tipo declarado na migration: `TIMESTAMP_TEXT` vira `Date`, `JSON_TEXT` vira objeto ou
 *   lista e `BOOLEAN` vira `boolean`. Expressao (`count(*)`, `EXISTS(...)`, `json_group_array`) nao tem tipo
 *   declarado e chega crua.
 *
 * Toda consulta, de leitura ou de escrita, vai pelo escritor: o auth e pequeno, e assim uma leitura logo depois de
 * uma escrita do mesmo processo nunca ve o estado de antes.
 */

export interface AuthQueryResult<R> {
  rows: R[];
  rowCount: number;
}

// biome-ignore lint/suspicious/noExplicitAny: as linhas tem a forma que cada consulta pede, como no `pg`.
type AnyRow = Record<string, any>;

export interface AuthTransaction {
  query<R extends AnyRow = AnyRow>(text: string, values?: readonly unknown[]): Promise<AuthQueryResult<R>>;
}

export interface AuthDatabase extends AuthTransaction {
  transaction<T>(work: (tx: AuthTransaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** As migrations do auth, em `apps/auth/migrations` (a partir de `src` ou de `dist`). */
export const AUTH_MIGRATIONS_DIR = resolve(__dirname, "../../migrations");

function encode(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date || typeof value === "boolean") return value;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return value;
}

function decodeValue(type: string | null, value: unknown): unknown {
  if (value === null || type === null) return value;
  switch (type.toUpperCase()) {
    case "TIMESTAMP_TEXT":
      return typeof value === "string" ? new Date(value) : value;
    case "JSON_TEXT":
      return typeof value === "string" ? JSON.parse(value) : value;
    case "BOOLEAN":
      return value === 1 || value === 1n ? true : value === 0 || value === 0n ? false : value;
    default:
      return value;
  }
}

const byDeclaredType: RowDecoder<AnyRow> = {
  decode(row: Record<string, unknown>, columns?: readonly ColumnInfo[]): AnyRow {
    const out: AnyRow = {};
    for (const [key, value] of Object.entries(row)) out[key] = value;
    for (const column of columns ?? []) out[column.name] = decodeValue(column.type, row[column.name]);
    return out;
  },
};

function queryOn(executor: Pick<SqlExecutor, "execute">): AuthTransaction["query"] {
  return async <R extends AnyRow = AnyRow>(text: string, values: readonly unknown[] = []) => {
    const result = await executor.execute(sql.unsafe(text, values.map(encode)), byDeclaredType);
    return { rows: result.rows as R[], rowCount: result.rowCount };
  };
}

export interface OpenAuthDatabaseOptions {
  migrations?: readonly Migration[];
  /** Onde contar a copia e as migrations aplicadas na abertura. */
  log?: (message: string) => void;
}

/**
 * Abre o arquivo do auth e aplica as migrations pendentes antes de devolver o banco. O servidor e os CLIs
 * (`create-admin`, `rotate-signing-key`, `device-key`, ...) abrem o mesmo arquivo: entre processos, o `BEGIN IMMEDIATE`
 * com `busy_timeout` faz uma escrita esperar a outra, como o lock de linha fazia no Postgres.
 */
export function openAuthDatabase(path: string, options: OpenAuthDatabaseOptions = {}): AuthDatabase {
  const database = openMigratedDatabase(path, {
    migrations: options.migrations ?? loadMigrations(AUTH_MIGRATIONS_DIR),
    log: options.log,
  });
  return {
    query: queryOn(database),
    transaction: (work) => database.transaction((tx) => work({ query: queryOn(tx) })),
    close: async () => database.close(),
  };
}
