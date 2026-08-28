/**
 * A marca de nao realizado.
 *
 * E a unica coisa que o evento guarda sobre ter acontecido ou nao, e ela e uma
 * anotacao do usuario: serve para ele registrar o que perdeu. Nao ha ciclo de
 * vida, nao ha status derivado do relogio, e nao existe o oposto dela — um
 * evento sem a marca nao e "realizado", e so um evento que ninguem anotou.
 *
 * Marcar e desmarcar sao a mesma acao nos dois sentidos: quem anotou por engano
 * desmarca, e o evento volta a ser um evento comum.
 */
export const DEFAULT_EVENT_MISSED = false;

/**
 * A marca lida de um documento do banco.
 *
 * O Firestore nao valida nada: um documento antigo vem sem o campo, e os da
 * versao anterior vem com o `status` que existia antes dela. Daquele ciclo de
 * vida so `missed` dizia alguma coisa sobre o usuario nao ter comparecido — os
 * outros falavam de planejamento, e planejamento nao virou marca nenhuma.
 */
export function readMissedFlag(document: { missed?: unknown; status?: unknown }): boolean {
  if (typeof document.missed === "boolean") return document.missed;
  return document.status === "missed";
}
