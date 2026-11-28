import type { RuntimeEnv } from "../../config/env";
import { AuthenticationFailedError } from "../../common/errors";
import type { AuthenticatedActor } from "../../domain/users/user";
import { InvalidTokenError, verifyJwt } from "./jwt";
import type { SigningKeyService } from "./signing-key.service";

/**
 * Quem entrega a credencial e qualquer coisa com `header(name)`. O Express
 * satisfaz a interface, mas a regra de autenticação não conhece o transporte.
 */
export interface HeaderCarrier {
  header(name: string): string | undefined;
}

export interface BearerAuthenticationDependencies {
  readonly keys: Pick<SigningKeyService, "publicKeyFor">;
  readonly issuer: RuntimeEnv["issuer"];
  readonly audience: RuntimeEnv["audience"];
  readonly now?: () => Date;
}

/**
 * Lê `Authorization: Bearer <token>` e devolve o ator da sessão. Toda recusa é
 * `AuthenticationFailedError` — o filtro traduz para 401 vazio, sem revelar se
 * o problema foi assinatura, expiração ou chave desconhecida.
 */
export async function authenticateBearer(
  request: HeaderCarrier,
  dependencies: BearerAuthenticationDependencies,
): Promise<AuthenticatedActor> {
  const value = request.header("authorization");
  if (!value || !/^Bearer [^\s]+$/.test(value)) throw new AuthenticationFailedError("missing bearer");
  const token = value.slice(7);
  return authenticateAccessToken(token, dependencies);
}

export async function authenticateAccessToken(
  token: string,
  dependencies: BearerAuthenticationDependencies,
): Promise<AuthenticatedActor> {
  const kid = keyIdOf(token);
  const key = typeof kid === "string" ? await dependencies.keys.publicKeyFor(kid) : null;
  if (!key) throw new AuthenticationFailedError("unknown kid");

  let claims: ReturnType<typeof verifyJwt>;
  try {
    claims = verifyJwt(token, [key], dependencies.issuer, dependencies.audience, dependencies.now?.() ?? new Date());
  } catch (error) {
    if (error instanceof InvalidTokenError) throw new AuthenticationFailedError(error.message);
    throw error;
  }

  return {
    userId: claims.sub,
    sessionId: claims.sid,
    roles: claims.roles,
    permissions: claims.perms,
    denies: claims.denies,
    amr: claims.amr,
    authTime: claims.auth_time,
  };
}

function keyIdOf(token: string): unknown {
  try {
    return JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString()).kid;
  } catch {
    throw new AuthenticationFailedError("malformed bearer");
  }
}
