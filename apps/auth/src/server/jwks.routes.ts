import { createHash } from "node:crypto";
import type { SigningKeyService } from "../auth-core/security/signing-key.service";
import type { AuthRoute } from "./routes";

export interface JwksRouteDependencies {
  readonly signingKeyService: Pick<SigningKeyService, "publicJwks">;
}

const firstHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/**
 * Publica o JWKS com o mesmo ETag determinístico do contrato atual: o hash do
 * corpo permite ao cliente revalidar com `If-None-Match` e receber 304 vazio.
 */
export function jwksRoutes(deps: JwksRouteDependencies): AuthRoute[] {
  return [
    {
      method: "GET",
      path: "/.well-known/jwks.json",
      handler: async (request, reply) => {
        const body = JSON.stringify(deps.signingKeyService.publicJwks());
        const etag = `"sha256-${createHash("sha256").update(body).digest("base64url")}"`;
        reply.header("Cache-Control", "public, max-age=300, stale-if-error=3600");
        reply.header("ETag", etag);
        if (firstHeader(request.headers["if-none-match"]) === etag) {
          return reply.code(304).send();
        }
        return reply.type("application/json").send(body);
      },
    },
  ];
}
