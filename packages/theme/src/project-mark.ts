/**
 * Separa o nome em palavras por espaco, `_`, `-`, `.`, `/` e pela passagem de
 * minuscula para maiuscula (`timelineProject`).
 */
function wordsOf(name: string): string[] {
  return name
    .replace(/(?<=\p{Ll})(?=\p{Lu})/gu, " ")
    .split(/[\s_\-./]+/u)
    .filter((word) => word.length > 0);
}

/**
 * As iniciais da marca, sempre em maiusculas: a inicial das duas primeiras
 * palavras ou, com uma so, os dois primeiros caracteres. `timeline_project` da
 * "TP", `agent-skills` da "AS", `t3code` da "T3" e `personal` da "PE". Um nome de
 * uma letra so tem uma inicial.
 */
export function projectInitials(name: string): string {
  const words = wordsOf(name);
  const letters =
    words.length >= 2
      ? words.slice(0, 2).map((word) => Array.from(word)[0] ?? "")
      : Array.from(words[0] ?? "").slice(0, 2);
  return letters.join("").toUpperCase();
}
