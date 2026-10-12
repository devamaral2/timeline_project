/**
 * As regras de digitação do editor de markdown das notas, como no Obsidian:
 * Enter continua a lista (ou a encerra, se o item está vazio) e Ctrl+B/Ctrl+I
 * envolvem a seleção. Funções puras sobre texto e seleção: o componente só
 * aplica o resultado no textarea.
 */

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const LIST_LINE = /^(\s*)(?:([-*+])\s+(\[[ xX]\]\s+)?|(\d+)([.)])\s+|(>)\s?)(.*)$/;

function lineBounds(value: string, position: number): { start: number; end: number } {
  const start = value.lastIndexOf("\n", position - 1) + 1;
  const next = value.indexOf("\n", position);
  return { start, end: next === -1 ? value.length : next };
}

/**
 * Enter dentro de um item de lista, tarefa, lista numerada ou citação: abre o
 * próximo item com o mesmo marcador. Em um item vazio, tira o marcador. Devolve
 * `null` quando a linha não é uma lista e o Enter deve seguir o caminho normal.
 */
export function continueMarkdownList(value: string, selectionStart: number, selectionEnd: number): TextEdit | null {
  if (selectionStart !== selectionEnd) return null;
  const { start, end } = lineBounds(value, selectionStart);
  const line = value.slice(start, end);
  const match = LIST_LINE.exec(line);
  if (!match) return null;

  const [, indent = "", bullet, task, ordinal, delimiter, quote, rest = ""] = match;
  const markerLength = line.length - rest.length;
  // O cursor antes do fim do marcador é edição do marcador, não continuação.
  if (selectionStart - start < markerLength) return null;

  if (rest.trim() === "") {
    const cleared = `${value.slice(0, start)}${value.slice(end)}`;
    return { value: cleared, selectionStart: start, selectionEnd: start };
  }

  let marker: string;
  if (quote) marker = "> ";
  else if (ordinal) marker = `${Number(ordinal) + 1}${delimiter} `;
  else marker = `${bullet} ${task ? "[ ] " : ""}`;

  const insertion = `\n${indent}${marker}`;
  const cursor = selectionStart + insertion.length;
  return {
    value: `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionStart)}`,
    selectionStart: cursor,
    selectionEnd: cursor,
  };
}

/** Envolve a seleção com `mark` (`**`, `*`, `` ` ``) ou desfaz, se ela já estiver envolvida. */
export function toggleWrap(value: string, selectionStart: number, selectionEnd: number, mark: string): TextEdit {
  const before = value.slice(0, selectionStart);
  const selected = value.slice(selectionStart, selectionEnd);
  const after = value.slice(selectionEnd);

  if (before.endsWith(mark) && after.startsWith(mark)) {
    return {
      value: `${before.slice(0, -mark.length)}${selected}${after.slice(mark.length)}`,
      selectionStart: selectionStart - mark.length,
      selectionEnd: selectionEnd - mark.length,
    };
  }
  return {
    value: `${before}${mark}${selected}${mark}${after}`,
    selectionStart: selectionStart + mark.length,
    selectionEnd: selectionEnd + mark.length,
  };
}
