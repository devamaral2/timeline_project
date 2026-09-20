import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_TOKEN_COOKIE } from "@/lib/session/session-cookies";

export function proxy(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/session")) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
