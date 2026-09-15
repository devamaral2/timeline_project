import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthenticationFailedError, TokenKindNotAcceptedError } from "../common/errors";
import { InvalidTokenError, TOKEN_USES, verifyJwt, type TokenClaims, type TokenUse } from "../crypto/jwt";
import { SigningKeyService } from "../crypto/signing-key.service";
import type { RuntimeEnv } from "../config/env";
import { RUNTIME_ENV } from "../config/tokens";
import type { TokenActor } from "../users/user";
import { ACCEPTED_TOKEN_KINDS } from "./accept-token-kinds.decorator";

/** Uma rota com `BearerAuthGuard` e sem `@AcceptTokenKinds`: erro de programacao, nunca "aceita tudo". */
export class MissingTokenKindsError extends Error {}

export function actorFromClaims(claims: TokenClaims): TokenActor {
  switch (claims.token_use) {
    case "user": return { kind: "user", userId: claims.sub, sessionId: claims.sid, tokenId: claims.jti, roles: claims.roles, permissions: claims.perms, denies: claims.denies };
    case "signup": return { kind: "signup", userId: claims.sub, tokenId: claims.jti };
    case "guest": return { kind: "guest", userId: claims.sub, observedUserId: claims.subj, tokenId: claims.jti, permissions: claims.perms };
  }
}

// @UseGuards(BearerAuthGuard) instancia esta classe por um caminho de DI
// separado do `providers` de app.module.ts (o mapa interno de "injectables"
// do Nest, nao o de providers), que sempre reflete os tipos do construtor em
// vez de honrar qualquer provider customizado registrado para o mesmo token.
// O transform do Vitest (esbuild) nao emite `design:paramtypes`, entao sem
// @Inject explicito em CADA parametro o Nest nao consegue resolver nenhum
// deles e derruba a rota com "Nest can't resolve dependencies" assim que o
// teste sobe o AppModule inteiro.
@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    @Inject(SigningKeyService) private readonly keys: SigningKeyService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // A declaracao e lida antes do token: uma rota sem declaracao falha para
    // qualquer chamador, com ou sem bearer valido.
    const accepted = this.reflector.getAllAndOverride<readonly TokenUse[] | undefined>(ACCEPTED_TOKEN_KINDS, [context.getHandler(), context.getClass()]);
    if (!accepted?.length) throw new MissingTokenKindsError(`${context.getClass().name}.${context.getHandler().name} declares no accepted token kinds`);

    const request = context.switchToHttp().getRequest<Request>();
    const value = request.header("authorization");
    if (!value || !/^Bearer [^\s]+$/.test(value)) throw new AuthenticationFailedError("missing bearer");
    const token = value.slice(7);
    let kid: unknown;
    try {
      kid = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString()).kid;
    } catch {
      throw new AuthenticationFailedError("malformed bearer");
    }
    const key = typeof kid === "string" ? await this.keys.publicKeyFor(kid) : null;
    if (!key) throw new AuthenticationFailedError("unknown kid");

    let claims: TokenClaims;
    try {
      // Verifica contra os tres tipos para que um token valido do tipo errado
      // vire uma recusa tipada, e nao um 401 incidental de "token invalido".
      claims = verifyJwt(token, [key], this.env.issuer, this.env.audience, new Date(), TOKEN_USES);
    } catch (error) {
      if (error instanceof InvalidTokenError) throw new AuthenticationFailedError(error.message);
      throw error;
    }
    if (!accepted.includes(claims.token_use)) throw new TokenKindNotAcceptedError(claims.token_use);
    (request as Request & { actor: TokenActor }).actor = actorFromClaims(claims);
    return true;
  }
}
