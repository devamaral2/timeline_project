import { sql, type SqlFragment } from "../../sqlite/sql";

export * from "../../../../domain/sets";

/** `'a', 'b', 'c'`, para o lado direito de um `IN` e para os ramos de um `CASE`. */
export function sqlList(values: readonly string[]): SqlFragment {
  return sql.list(values);
}
