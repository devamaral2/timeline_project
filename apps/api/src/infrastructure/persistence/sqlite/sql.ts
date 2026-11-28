/**
 * O SQL escrito a mao, como no t3code: um template `sql\`...\`` que separa o texto dos valores. Cada `${valor}` vira
 * um `?` e o valor vai para a lista de parametros; um `${sql\`...\`}` aninhado entra como pedaco de SQL, com os
 * parametros dele.
 *
 * O que o SQLite guarda, e por isso o que um parametro pode ser:
 * - `Date` vira o texto ISO-8601 em UTC (`toISOString`), a forma de toda coluna de data e hora;
 * - `boolean` vira 0 ou 1;
 * - `undefined` e erro: quase sempre e um campo esquecido, e `NULL` tem de ser escrito como `null`.
 *
 * Array e objeto tambem sao erro, para nada virar JSON ou lista sem querer: use `sql.json(valor)` para gravar JSON
 * e `sql.in(valores)` para o lado direito de um `IN`.
 */

export type SqlParam = string | number | bigint | null | Uint8Array;

const FRAGMENT = Symbol("sql.fragment");

export interface SqlFragment {
  readonly [FRAGMENT]: true;
  readonly text: string;
  readonly params: readonly SqlParam[];
}

export type SqlValue = SqlFragment | string | number | bigint | boolean | Date | null | Uint8Array;

function fragment(text: string, params: readonly SqlParam[]): SqlFragment {
  return { [FRAGMENT]: true, text, params };
}

export function isSqlFragment(value: unknown): value is SqlFragment {
  return typeof value === "object" && value !== null && FRAGMENT in value;
}

/** O valor JS na forma que o SQLite guarda. */
export function encodeParam(value: unknown): SqlParam {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError("sql: invalid Date");
    return value.toISOString();
  }
  if (value instanceof Uint8Array) return value;
  if (value === undefined) throw new TypeError("sql: undefined parameter (write null for NULL)");
  throw new TypeError(`sql: ${Array.isArray(value) ? "array" : typeof value} parameter; use sql.json() or sql.in()`);
}

function build(strings: readonly string[], values: readonly unknown[]): SqlFragment {
  let text = strings[0] ?? "";
  const params: SqlParam[] = [];
  values.forEach((value, index) => {
    if (isSqlFragment(value)) {
      text += value.text;
      params.push(...value.params);
    } else {
      text += "?";
      params.push(encodeParam(value));
    }
    text += strings[index + 1] ?? "";
  });
  return fragment(text, params);
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export interface SqlTag {
  (strings: TemplateStringsArray, ...values: readonly SqlValue[]): SqlFragment;
  /** Texto entrando no SQL sem parametro. So para o que o codigo escreve, nunca para o que vem de fora. */
  raw(text: string): SqlFragment;
  /** Os pedacos separados por `separator` (`, ` por padrao). */
  join(fragments: readonly SqlFragment[], separator?: SqlFragment | string): SqlFragment;
  /** `(?, ?, ?)`, o lado direito de um `IN`. Vazio e `()`, que o SQLite aceita e nunca casa. */
  in(values: readonly SqlValue[]): SqlFragment;
  /** O valor como texto JSON, num parametro. */
  json(value: unknown): SqlFragment;
  /** `'a', 'b'`: literais das listas fixas do dominio, para CHECK, CASE e `IN (...)`. */
  list(values: readonly string[]): SqlFragment;
  /** Um literal de texto, para os mesmos usos de `list`. */
  literal(value: string): SqlFragment;
  /**
   * SQL escrito como texto, com `$1`, `$2`... (ou `?`) no lugar dos valores, como no `pool.query` do `pg`. So para
   * texto que o codigo escreve; prefira o template.
   */
  unsafe(text: string, params?: readonly unknown[]): SqlFragment;
  readonly empty: SqlFragment;
}

export const sql: SqlTag = Object.assign((strings: TemplateStringsArray, ...values: readonly SqlValue[]) => build(strings, values), {
  raw: (text: string) => fragment(text, []),
  join(fragments: readonly SqlFragment[], separator: SqlFragment | string = ", "): SqlFragment {
    const glue = typeof separator === "string" ? fragment(separator, []) : separator;
    const params: SqlParam[] = [];
    const parts: string[] = [];
    fragments.forEach((part, index) => {
      if (index > 0) params.push(...glue.params);
      parts.push(part.text);
      params.push(...part.params);
    });
    return fragment(parts.join(glue.text), params);
  },
  in(values: readonly SqlValue[]): SqlFragment {
    if (values.length === 0) return fragment("()", []);
    return build(["(", ...values.map((_, index) => (index === values.length - 1 ? ")" : ", "))], values);
  },
  json: (value: unknown) => {
    if (value === undefined) throw new TypeError("sql.json: undefined value");
    return fragment("?", [JSON.stringify(value)]);
  },
  list: (values: readonly string[]) => fragment(values.map(quoteLiteral).join(", "), []),
  literal: (value: string) => fragment(quoteLiteral(value), []),
  unsafe: (text: string, params: readonly unknown[] = []) =>
    fragment(text.replace(/\$(\d+)/g, "?$1"), params.map(encodeParam)),
  empty: fragment("", []),
});

/** O instante atual no formato das colunas de data e hora. Avaliado pelo SQLite, uma vez por instrucao. */
export const NOW = sql.raw("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')");

/**
 * `coluna || patch` do jsonb do Postgres: cada chave de primeiro nivel do patch substitui a da coluna, inteira, e
 * `null` grava `null`. O `json_patch` do SQLite nao serve no lugar: ele mescla objetos aninhados e apaga a chave
 * cujo valor e `null` (RFC 7396).
 */
export function jsonMerge(column: SqlFragment, patch: Record<string, unknown>): SqlFragment {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return column;
  const assignments = entries.map(([key, value]) => sql`${`$."${key.replaceAll('"', '\\"')}"`}, json(${sql.json(value)})`);
  return sql`json_set(${column}, ${sql.join(assignments)})`;
}
