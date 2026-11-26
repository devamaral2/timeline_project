/**
 * A convenção de âncora dos documentos (a do documento de transcrição de um
 * vídeo, spec #39). Vale igual no web e no Android (`domain/markdown/Anchors.kt`).
 *
 * - O id é `t-<segundos>`: o instante, em segundos inteiros desde o começo.
 * - Um parágrafo que abre com `{#t-<segundos>}` é o trecho daquele instante. A
 *   marca é texto comum de markdown, então sobrevive ao saneamento (HTML cru
 *   nunca é interpretado) e some da tela.
 * - Um link `[tópico](#t-<segundos>)` rola até o trecho, dentro do mesmo documento.
 * - Só essa forma vira âncora: qualquer outro `{#id}` segue como texto, para o
 *   documento não tomar um id da página.
 */
const ANCHOR_ID = /^t-\d+$/;
const MARK = /^\{#(t-\d+)\}[ \t]*/;

/** O id de uma âncora válida, ou `null`. */
export function anchorId(candidate: string): string | null {
  return ANCHOR_ID.test(candidate) ? candidate : null;
}

/** A âncora que abre o texto de um parágrafo e o texto sem a marca. */
export function splitAnchorMark(text: string): { id: string; rest: string } | null {
  const match = MARK.exec(text);
  return match?.[1] ? { id: match[1], rest: text.slice(match[0].length) } : null;
}

/** O id de uma âncora quando o link é interno (`#t-125`), ou `null`. */
export function internalAnchorOf(href: string | null | undefined): string | null {
  return href?.startsWith("#") ? anchorId(href.slice(1)) : null;
}
