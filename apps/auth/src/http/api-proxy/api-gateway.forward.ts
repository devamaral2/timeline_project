import type { FastifyReply, FastifyRequest } from "fastify";
import type { RuntimeEnv } from "../../config/env";

const DROPPED_HEADERS = ["host", "content-length", "authorization", "transfer-encoding", "connection"];

/**
 * Encaminha a requisição para a API com a identidade que o gateway validou.
 * Todo `x-auth-*` que o cliente mandou é descartado: só o gateway fala por si.
 *
 * O corpo chega aqui já validado e limitado pelo parser da rota; a API recebe
 * o mesmo JSON compacto que o Express reenviava, e a resposta volta com status,
 * headers e bytes do upstream.
 */
export async function forwardToApi(
  env: Pick<RuntimeEnv, "apiServiceUrl" | "internalServiceKey">,
  request: FastifyRequest,
  reply: FastifyReply,
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

  const upstreamUrl = new URL(request.url, env.apiServiceUrl);
  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : JSON.stringify(request.body ?? {}),
  });
  reply.code(upstream.status);
  upstream.headers.forEach((value, name) => {
    if (name !== "content-length" && name !== "transfer-encoding") reply.header(name, value);
  });
  reply.send(Buffer.from(await upstream.arrayBuffer()));
}
