import type { Request, Response } from "express";
import type { RuntimeEnv } from "../../config/env";

const DROPPED_HEADERS = ["host", "content-length", "authorization", "transfer-encoding", "connection"];

/**
 * Encaminha a requisicao para a API com a identidade que o gateway validou.
 * Todo `x-auth-*` que o cliente mandou e descartado: so o gateway fala por si.
 */
export async function forwardToApi(
  env: Pick<RuntimeEnv, "apiServiceUrl" | "internalServiceKey">,
  request: Request,
  response: Response,
  body: unknown,
  identity: Readonly<Record<string, string>>,
): Promise<void> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (DROPPED_HEADERS.includes(name) || name.startsWith("x-auth-")) continue;
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(", "));
  }
  const gatewayKey = env.internalServiceKey;
  if (!gatewayKey) throw new Error("AUTH_INTERNAL_SERVICE_KEY is not configured");
  headers.set("x-auth-gateway-key", gatewayKey);
  for (const [name, value] of Object.entries(identity)) headers.set(name, value);

  const upstreamUrl = new URL(request.originalUrl, env.apiServiceUrl);
  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : JSON.stringify(body ?? {}),
  });
  response.status(upstream.status);
  upstream.headers.forEach((value, name) => {
    if (name !== "content-length" && name !== "transfer-encoding") response.setHeader(name, value);
  });
  response.send(Buffer.from(await upstream.arrayBuffer()));
}
