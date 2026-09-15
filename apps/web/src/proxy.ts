import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/session/session-cookies";

/**
 * O navegador nao enxerga o access token: ele vive num cookie httpOnly. E aqui
 * que o cookie vira `Authorization: Bearer`, antes de o rewrite de `/api/*`
 * levar a requisicao ao Nest — o `AuthServiceGuard` de la continua recebendo
 * um bearer, como sempre recebeu.
 *
 * `/api/session/*` sao route handlers do proprio Next e cuidam dos cookies
 * sozinhos.
 */
export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/session")) return NextResponse.next();

  const headers = new Headers(request.headers);
  // Um Authorization vindo do navegador nunca vale mais que a sessao do cookie.
  headers.delete("authorization");
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/:path*",
};
