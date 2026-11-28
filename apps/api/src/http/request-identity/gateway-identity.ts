import { timingSafeEqual } from "node:crypto";
import { DEVICE_PERMISSIONS_HEADER, TRANSCRIPTION_WORK_PERMISSION } from "@repo/contracts/device-key";
import { HttpError } from "../../common/http-errors";
import type { ApiAuthentication } from "../api-route";
import type { AuthenticatedUser } from "./authenticated-user";

/** Um valor de header como o Node o entrega: string, lista (repetido) ou ausente. */
export type HeaderValue = string | string[] | undefined;

function first(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Le um header pelo nome, sem depender do framework (Fastify ja entrega minusculo). */
export function headerReader(headers: Readonly<Record<string, HeaderValue>>) {
  return (name: string): string | undefined => first(headers[name.toLowerCase()]);
}

/**
 * Confere que a requisicao veio do gateway Auth interno e devolve a identidade
 * encaminhada. Independente do transporte: o registrador declarativo do Fastify
 * chama esta regra e recebe o mesmo erro.
 */
export function authenticateGateway(
  headers: Readonly<Record<string, HeaderValue>>,
  internalServiceKey: string | undefined,
): AuthenticatedUser {
  const read = headerReader(headers);
  const presentedKey = read("x-auth-gateway-key");
  if (!internalServiceKey || !presentedKey) throw new HttpError(401, "Unauthorized");

  const expected = Buffer.from(internalServiceKey);
  const received = Buffer.from(presentedKey);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new HttpError(403, "Forbidden");
  }

  const userId = read("x-auth-user-id");
  if (!userId) throw new HttpError(401, "Unauthorized");
  return { userId, sessionId: read("x-auth-session-id") || undefined };
}

/** O servico local de transcricao: a identidade do gateway com a permissao exclusiva dele. */
export function authenticateTranscriptionDevice(
  headers: Readonly<Record<string, HeaderValue>>,
  internalServiceKey: string | undefined,
): AuthenticatedUser {
  const actor = authenticateGateway(headers, internalServiceKey);
  const permissions = (headerReader(headers)(DEVICE_PERMISSIONS_HEADER) ?? "").split(",").map((value) => value.trim());
  if (!permissions.includes(TRANSCRIPTION_WORK_PERMISSION)) throw new HttpError(403, "Forbidden");
  return { ...actor, permissions: [TRANSCRIPTION_WORK_PERMISSION] };
}

/**
 * Aplica a politica declarada pela rota. Uma sessao do gateway recusa a chave de
 * dispositivo: ela so vale nas rotas do servico local.
 */
export function authenticateRequest(
  authentication: ApiAuthentication,
  headers: Readonly<Record<string, HeaderValue>>,
  internalServiceKey: string | undefined,
): AuthenticatedUser {
  if (authentication === "transcription-device-key") {
    return authenticateTranscriptionDevice(headers, internalServiceKey);
  }
  const actor = authenticateGateway(headers, internalServiceKey);
  if (headerReader(headers)(DEVICE_PERMISSIONS_HEADER)) throw new HttpError(403, "Forbidden");
  return actor;
}
