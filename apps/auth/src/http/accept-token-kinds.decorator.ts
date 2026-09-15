import { SetMetadata } from "@nestjs/common";
import type { TokenUse } from "../crypto/jwt";

export const ACCEPTED_TOKEN_KINDS = Symbol("ACCEPTED_TOKEN_KINDS");

/**
 * Declara quais tipos de token uma rota protegida por `BearerAuthGuard`
 * aceita. E obrigatorio: o guard recusa a requisicao quando a rota nao declara
 * nada, em vez de aceitar qualquer tipo por omissao.
 */
export const AcceptTokenKinds = (...kinds: [TokenUse, ...TokenUse[]]) => SetMetadata(ACCEPTED_TOKEN_KINDS, kinds);
