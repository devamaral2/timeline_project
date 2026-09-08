import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common"; import type { Request } from "express"; import { AuthenticationFailedError } from "../common/errors"; import { verifyJwt } from "../crypto/jwt"; import { SigningKeyService } from "../crypto/signing-key.service"; import type { RuntimeEnv } from "../config/env"; import { RUNTIME_ENV } from "../config/tokens";
// @UseGuards(BearerAuthGuard) instancia esta classe por um caminho de DI
// separado do `providers` de app.module.ts (o mapa interno de "injectables"
// do Nest, nao o de providers), que sempre reflete os tipos do construtor em
// vez de honrar qualquer provider customizado registrado para o mesmo token.
// O transform do Vitest (esbuild) nao emite `design:paramtypes`, entao sem
// @Inject explicito em CADA parametro -- SigningKeyService incluido, mesmo
// sendo uma classe de verdade -- o Nest nao consegue resolver nenhum dos
// dois e derruba a rota com "Nest can't resolve dependencies" assim que o
// teste sobe o AppModule inteiro.
@Injectable() export class BearerAuthGuard implements CanActivate {constructor(@Inject(SigningKeyService) private readonly keys:SigningKeyService,@Inject(RUNTIME_ENV) private readonly env:RuntimeEnv){} async canActivate(context:ExecutionContext){const request=context.switchToHttp().getRequest<Request>();const value=request.header("authorization");if(!value||!/^Bearer [^\s]+$/.test(value))throw new AuthenticationFailedError("missing bearer");const token=value.slice(7);let kid:unknown;try{kid=JSON.parse(Buffer.from(token.split(".")[0]??"","base64url").toString()).kid;}catch{throw new AuthenticationFailedError("malformed bearer");}const key=typeof kid==="string"?await this.keys.publicKeyFor(kid):null;if(!key)throw new AuthenticationFailedError("unknown kid");const c=verifyJwt(token,[key],this.env.issuer,this.env.audience,new Date());(request as Request & {actor:unknown}).actor={userId:c.sub,sessionId:c.sid,roles:c.roles,permissions:c.perms,denies:c.denies,amr:c.amr,authTime:c.auth_time};return true;}}
