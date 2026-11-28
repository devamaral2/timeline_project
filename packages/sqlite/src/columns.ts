import { encodeParam, isSqlFragment, sql, type SqlFragment, type SqlParam } from "./sql";

/**
 * Como cada coluna sai do SQLite e volta para ele. O t3code valida cada linha lida com um `Schema`; aqui o papel e
 * destes codecs: a linha crua (texto, numero, nulo) vira a forma do dominio (Date, boolean, objeto) e um tipo
 * inesperado falha com o nome da coluna, em vez de seguir adiante com o valor errado.
 */

export class RowDecodeError extends Error {
  constructor(column: string, expected: string, value: unknown) {
    super(`Column ${column}: expected ${expected}, got ${value === null ? "null" : typeof value}`);
    this.name = "RowDecodeError";
  }
}

export interface Codec<T> {
  readonly decode: (raw: unknown, column: string) => T;
  readonly encode: (value: T) => SqlParam;
}

export interface Column<T> extends Codec<T> {
  /** Aceita `NULL`, que vira `null`. */
  nullable(): Column<T | null>;
  /** O nome no banco, quando nao e o `snake_case` da chave. */
  named(name: string): Column<T>;
  readonly dbName?: string;
}

function column<T>(codec: Codec<T>, dbName?: string): Column<T> {
  return {
    ...codec,
    dbName,
    nullable: () =>
      column<T | null>(
        {
          decode: (raw, name) => (raw === null || raw === undefined ? null : codec.decode(raw, name)),
          encode: (value) => (value === null ? null : codec.encode(value)),
        },
        dbName,
      ),
    named: (name: string) => column(codec, name),
  };
}

const text = column<string>({
  decode: (raw, name) => {
    if (typeof raw !== "string") throw new RowDecodeError(name, "text", raw);
    return raw;
  },
  encode: (value) => value,
});

const integer = column<number>({
  decode: (raw, name) => {
    if (typeof raw === "number" && Number.isInteger(raw)) return raw;
    if (typeof raw === "bigint") return Number(raw);
    throw new RowDecodeError(name, "integer", raw);
  },
  encode: (value) => value,
});

const real = column<number>({
  decode: (raw, name) => {
    if (typeof raw === "number") return raw;
    throw new RowDecodeError(name, "number", raw);
  },
  encode: (value) => value,
});

const boolean = column<boolean>({
  decode: (raw, name) => {
    if (raw === 0 || raw === 1) return raw === 1;
    if (raw === 0n || raw === 1n) return raw === 1n;
    throw new RowDecodeError(name, "0 or 1", raw);
  },
  encode: (value) => (value ? 1 : 0),
});

/** Data e hora: texto ISO-8601 em UTC no banco, `Date` no dominio. */
const timestamp = column<Date>({
  decode: (raw, name) => {
    if (typeof raw !== "string") throw new RowDecodeError(name, "ISO-8601 text", raw);
    const value = new Date(raw);
    if (Number.isNaN(value.getTime())) throw new RowDecodeError(name, "ISO-8601 text", raw);
    return value;
  },
  encode: (value) => encodeParam(value),
});

function json<T = unknown>(): Column<T> {
  return column<T>({
    decode: (raw, name) => {
      if (typeof raw !== "string") throw new RowDecodeError(name, "JSON text", raw);
      return JSON.parse(raw) as T;
    },
    encode: (value) => JSON.stringify(value),
  });
}

/** Texto de uma lista fixa do dominio (o CHECK da tabela tem a mesma lista). */
function oneOf<const T extends string>(values: readonly T[]): Column<T> {
  const allowed = new Set<string>(values);
  return column<T>({
    decode: (raw, name) => {
      if (typeof raw !== "string" || !allowed.has(raw)) throw new RowDecodeError(name, values.join(" | "), raw);
      return raw as T;
    },
    encode: (value) => value,
  });
}

export const c = {
  text,
  oneOf,
  integer,
  real,
  boolean,
  timestamp,
  /** Dia (`YYYY-MM-DD`) e hora do dia (`HH:MM:SS`) ficam em texto, como o dominio ja os usa. */
  day: text,
  timeOfDay: text,
  json,
};

export type ColumnMap = Record<string, Column<any>>;
export type RowOf<C extends ColumnMap> = { [K in keyof C]: C[K] extends Column<infer T> ? T : never };

/** O nome e o tipo declarado (no `CREATE TABLE`) de uma coluna do resultado; nulo quando ela e uma expressao. */
export interface ColumnInfo {
  readonly name: string;
  readonly type: string | null;
}

export interface RowDecoder<T> {
  decode(row: Record<string, unknown>, columns?: readonly ColumnInfo[]): T;
}

/** O decodificador de uma linha cujas chaves sao os apelidos (`AS "chave"`) da consulta. */
export function rowDecoder<C extends ColumnMap>(columns: C): RowDecoder<RowOf<C>> {
  const entries = Object.entries(columns);
  return {
    decode(row) {
      const out: Record<string, unknown> = {};
      for (const [key, codec] of entries) out[key] = codec.decode(row[key], key);
      return out as RowOf<C>;
    },
  };
}

export function snakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

type InsertValue<T> = T | SqlFragment | undefined;
export type InsertOf<C extends ColumnMap> = { [K in keyof C]?: InsertValue<RowOf<C>[K]> };

export interface Table<C extends ColumnMap> extends RowDecoder<RowOf<C>> {
  readonly name: string;
  readonly columns: C;
  /** O nome da coluna no banco, com o apelido da tabela quando ha. */
  col(key: keyof C & string, alias?: string): SqlFragment;
  /** `t.user_id AS "userId", ...`: todas as colunas, ou so as pedidas, com a chave do dominio como apelido. */
  select(alias?: string, keys?: readonly (keyof C & string)[]): SqlFragment;
  /** `INSERT INTO t (...) VALUES (...)`. Chave ausente ou `undefined` fica com o DEFAULT da coluna. */
  insert(values: InsertOf<C> | readonly InsertOf<C>[]): SqlFragment;
  /** `a = ?, b = ?`, para o `SET` de um UPDATE. Chave `undefined` fica de fora. */
  set(values: InsertOf<C>): SqlFragment;
}

export function defineTable<C extends ColumnMap>(name: string, columns: C): Table<C> {
  const decoder = rowDecoder(columns);
  const dbName = (key: string) => columns[key]?.dbName ?? snakeCase(key);
  const encoded = (key: string, value: unknown): SqlFragment =>
    isSqlFragment(value) ? value : sql`${columns[key]!.encode(value) as SqlParam}`;

  return {
    name,
    columns,
    decode: decoder.decode,
    col: (key, alias) => sql.raw(alias ? `${alias}.${dbName(key)}` : dbName(key)),
    select(alias, keys) {
      const prefix = alias ? `${alias}.` : "";
      const chosen = keys ?? Object.keys(columns);
      return sql.raw(chosen.map((key) => `${prefix}${dbName(key)} AS "${key}"`).join(", "));
    },
    insert(values) {
      const rows = (Array.isArray(values) ? values : [values]) as readonly Record<string, unknown>[];
      if (rows.length === 0) throw new Error(`insert into ${name}: no rows`);
      const keys = Object.keys(columns).filter((key) => rows.some((row) => row[key] !== undefined));
      // O SQLite nao aceita `DEFAULT` dentro de VALUES: num insert de varias linhas, todas trazem as mesmas colunas.
      if (rows.some((row) => keys.some((key) => row[key] === undefined))) {
        throw new Error(`insert into ${name}: every row of a multi-row insert needs the same columns`);
      }
      const tuples = rows.map((row) => sql`(${sql.join(keys.map((key) => encoded(key, row[key])))})`);
      return sql`INSERT INTO ${sql.raw(name)} (${sql.raw(keys.map(dbName).join(", "))}) VALUES ${sql.join(tuples)}`;
    },
    set(values) {
      const parts = Object.entries(values as Record<string, unknown>)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => sql`${sql.raw(dbName(key))} = ${encoded(key, value)}`);
      if (parts.length === 0) throw new Error(`update ${name}: nothing to set`);
      return sql.join(parts);
    },
  };
}
