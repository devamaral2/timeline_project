/**
 * `sql\`${array}\`` do drizzle-orm nao serializa um array JS como array do
 * Postgres — ele espalha os elementos em `(a, b, c)`, sintaxe de `IN`. Para
 * gravar numa coluna `integer[]` via SQL cru, o literal precisa ser montado
 * a mao e o cast feito explicitamente.
 */
export function pgIntegerArrayLiteral(values: readonly number[]): string {
  return `{${values.join(",")}}`;
}
