import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { RuntimeEnv } from "../config/env";
import { RUNTIME_ENV } from "../config/tokens";
import { authenticateBearer } from "../auth-core/security/access-token-authentication";
import { setActor, type ActorCarrier } from "../auth-core/security/request-actor";
import { SigningKeyService } from "../auth-core/security/signing-key.service";

/**
 * Adaptador temporario do servidor Nest: a regra de autenticacao vive em
 * `auth-core/security/access-token-authentication.ts`, sem framework. Esta
 * classe so le a request do Nest e guarda o ator nela.
 *
 * @UseGuards(BearerAuthGuard) instancia a classe por um caminho de DI separado
 * do `providers` de app.module.ts (o mapa interno de "injectables" do Nest),
 * que reflete os tipos do construtor. O transform do Vitest (esbuild) nao emite
 * `design:paramtypes`, entao `@Inject` e explicito em cada parametro.
 */
@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(
    @Inject(SigningKeyService) private readonly keys: SigningKeyService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>() as Request & ActorCarrier;
    setActor(
      request,
      await authenticateBearer(request, { keys: this.keys, issuer: this.env.issuer, audience: this.env.audience }),
    );
    return true;
  }
}
