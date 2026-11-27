/** Minúsculas e sem acento, para a busca achar "cafe" em "Café" (a `plainText` do Android, em `AgendaSearch.kt`). */
export function plainText(text: string): string {
  return text.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
}
