/**
 * Mesma razao de `pgIntegerArrayLiteral`: o drizzle espalha um array JS como
 * `(a, b)`. Cada elemento vai entre aspas, com `\` e `"` escapados.
 */
export function pgTextArrayLiteral(values: readonly string[]): string {
  return `{${values.map((value) => `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`).join(",")}}`;
}
