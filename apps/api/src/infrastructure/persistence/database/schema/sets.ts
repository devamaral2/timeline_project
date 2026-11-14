import { sql, type SQL } from "drizzle-orm";

export * from "../../../../domain/sets";

/** `'a', 'b', 'c'`, para o lado direito de um `IN` dentro de um check. */
export function sqlList(values: readonly string[]): SQL {
  return sql.raw(values.map((value) => `'${value}'`).join(", "));
}
