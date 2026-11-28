import type { FastifyRequest } from "fastify";
import type { RuntimeEnv } from "../config/env";
import { AuthenticationFailedError } from "../common/errors";
import { authenticateBearer, type HeaderCarrier } from "../auth-core/security/access-token-authentication";
import { actorOf, setActor, type ActorCarrier } from "../auth-core/security/request-actor";
import type { AuthorizationService } from "../auth-core/security/authorization.service";
import type { SigningKeyService } from "../auth-core/security/signing-key.service";
import { requireSuperAdmin } from "../auth-core/security/super-admin-authorization";
import type { AuthenticatedActor } from "../domain/users/user";

export interface AuthGuardDependencies {
  readonly signingKeyService: Pick<SigningKeyService, "publicKeyFor">;
  readonly env: Pick<RuntimeEnv, "issuer" | "audience">;
  readonly authorizationService: Pick<AuthorizationService, "currentUser">;
}

/** O contrato mínimo que as preHandlers usam, sem expor o Fastify às features. */
export interface AuthGuards {
  readonly bearer: (request: FastifyRequest) => Promise<void>;
  readonly superAdmin: (request: FastifyRequest) => Promise<void>;
}

const firstHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** A mesma regra de `authenticateBearer`, ligada aos headers do Fastify. */
function headerCarrier(request: FastifyRequest): HeaderCarrier {
  return { header: (name) => firstHeader(request.headers[name.toLowerCase()]) };
}

export function authenticatedActor(request: ActorCarrier): AuthenticatedActor {
  const actor = actorOf(request);
  if (!actor) throw new AuthenticationFailedError("missing authenticated actor");
  return actor;
}

/**
 * Guards como hooks do Fastify. A regra de autenticação e a de superadmin
 * continuam nas funções do núcleo; aqui só ligamos o transporte.
 */
export function createAuthGuards(dependencies: AuthGuardDependencies): AuthGuards {
  return {
    async bearer(request) {
      const actor = await authenticateBearer(headerCarrier(request), {
        keys: dependencies.signingKeyService,
        issuer: dependencies.env.issuer,
        audience: dependencies.env.audience,
      });
      setActor(request, actor);
    },
    async superAdmin(request) {
      await requireSuperAdmin(actorOf(request), dependencies.authorizationService);
    },
  };
}
