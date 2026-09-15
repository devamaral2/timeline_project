/**
 * O link que o operador entrega. O token vai no fragmento (`#token=`), que o
 * navegador nunca envia ao servidor: nao aparece em log de acesso, proxy nem
 * `Referer`.
 */
export function signupLink(webAppUrl: URL, token: string): string {
  const url = new URL("/signup", webAppUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}
