import { DEVICE_PERMISSIONS_HEADER } from "@repo/contracts/device-key";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AuthorizationService } from "../auth-core/security/authorization.service";
import { authenticateBearer, type HeaderCarrier } from "../auth-core/security/access-token-authentication";
import type { DeviceKeyAuthenticator } from "../auth-core/security/device-key-authentication";
import { authenticateDeviceKey } from "../auth-core/security/device-key-authentication";
import type { SigningKeyService } from "../auth-core/security/signing-key.service";
import { SECURITY_POLICY } from "../config/security-policy";
import type { RuntimeEnv } from "../config/env";
import { DEVICE_ROUTE_PREFIX, type DeviceKeyIdentity } from "../domain/device-keys/device-key";
import { forwardToApi } from "../http/api-proxy/api-gateway.forward";
import { policyFor } from "../http/api-proxy/gateway-policy";
import type { AuthRoute } from "./routes";

/**
 * O que o proxy precisa do composition root: a configuração do upstream, o
 * serviço de autorização, a chave que valida o bearer e o autenticador da
 * chave de dispositivo. Nada aqui conhece Nest.
 */
export interface ApiProxyDependencies {
  readonly env: Pick<RuntimeEnv, "apiServiceUrl" | "internalServiceKey" | "issuer" | "audience">;
  readonly authorization: Pick<AuthorizationService, "execute">;
  readonly signingKeyService: Pick<SigningKeyService, "publicKeyFor">;
  readonly deviceKeyAuthenticator: DeviceKeyAuthenticator;
}

/** A porta exclusiva da chave de dispositivo; vence o proxy geral de `/api/*`. */
export const DEVICE_PROXY_PATH = `/${DEVICE_ROUTE_PREFIX}/*`;
/** A porta da Leitura diária, com o teto maior que o das rotas comuns. */
export const DAILY_READING_PROXY_PATH = "/api/tasks/daily-reading";
/** A porta da entrega do serviço local de transcrição. */
export const DELIVERY_PROXY_PATH = "/api/transcription-worker/deliver";
/** O proxy geral das operações de sessão. */
export const API_PROXY_PATH = "/api/*";

const firstHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const headerCarrier = (request: FastifyRequest): HeaderCarrier => ({
  header: (name) => firstHeader(request.headers[name.toLowerCase()]),
});

const pathnameOf = (url: string | undefined): string => (url ?? "/").split("?")[0] ?? "/";

/** O `userId` do corpo só vira alvo do recurso `agent`, como no contrato atual. */
function targetUserIdOf(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const value = (body as { userId?: unknown }).userId;
  return typeof value === "string" && value.length >= 1 && value.length <= 128 ? value : undefined;
}

type ProxyHandler = AuthRoute["handler"];

const bearerForward = (deps: ApiProxyDependencies): ProxyHandler =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const actor = await authenticateBearer(headerCarrier(request), {
      keys: deps.signingKeyService,
      issuer: deps.env.issuer,
      audience: deps.env.audience,
    });
    const policy = policyFor(request.method, pathnameOf(request.url));
    await deps.authorization.execute({
      userId: actor.userId,
      sessionId: actor.sessionId,
      resource: policy.resource,
      action: policy.action,
      targetUserId: policy.resource === "agent" ? targetUserIdOf(request.body) : undefined,
    });

    await forwardToApi(deps.env, request, reply, {
      "x-auth-user-id": actor.userId,
      "x-auth-session-id": actor.sessionId,
    });
  };

const deviceForward = (deps: ApiProxyDependencies): ProxyHandler =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const key: DeviceKeyIdentity = await authenticateDeviceKey(headerCarrier(request), deps.deviceKeyAuthenticator);
    await forwardToApi(deps.env, request, reply, {
      "x-auth-user-id": key.userId,
      [DEVICE_PERMISSIONS_HEADER]: key.permission,
      "x-auth-device-key-id": key.keyId,
    });
  };

/**
 * As rotas do proxy declaradas para o Fastify. A ordem reflete a precedência do
 * contrato: as rotas estáticas de limite especial vêm antes dos wildcards, e a
 * porta da chave de dispositivo existe separada da porta da sessão.
 */
export function apiProxyRoutes(deps: ApiProxyDependencies): AuthRoute[] {
  const bearer = bearerForward(deps);
  const device = deviceForward(deps);
  return [
    {
      method: "ALL",
      path: DAILY_READING_PROXY_PATH,
      bodyLimit: SECURITY_POLICY.maxLargeRequestBodyBytes,
      handler: bearer,
    },
    {
      method: "ALL",
      path: DELIVERY_PROXY_PATH,
      bodyLimit: SECURITY_POLICY.maxDeliveryBodyBytes,
      handler: device,
    },
    {
      method: "ALL",
      path: DEVICE_PROXY_PATH,
      bodyLimit: SECURITY_POLICY.maxRequestBodyBytes,
      handler: device,
    },
    {
      method: "ALL",
      path: API_PROXY_PATH,
      bodyLimit: SECURITY_POLICY.maxRequestBodyBytes,
      handler: bearer,
    },
  ];
}
