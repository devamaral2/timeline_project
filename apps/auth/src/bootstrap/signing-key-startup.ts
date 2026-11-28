import { ANONYMOUS_CONTEXT } from "../common/request-context";
import type { AuditEventInput } from "../audit/audit-event";
import type { SigningKeyService } from "../auth-core/security/signing-key.service";
import type { StoredSigningKey } from "../auth-core/security/postgres-signing-key.repository";

/** O registro de auditoria da garantia da chave ativa, fora de qualquer servidor. */
export function signingKeyStartupAudit(now: Date): AuditEventInput {
  return {
    correlationId: "startup",
    actorUserId: null,
    action: "key.created",
    targetType: "signing_key",
    targetId: null,
    result: "succeeded",
    reason: null,
    metadata: {},
    context: ANONYMOUS_CONTEXT,
    occurredAt: now,
  };
}

/**
 * Contrato operacional do Auth: a chave ativa existe antes do listen. A regra
 * não conhece Nest nem Fastify; o bootstrap só escolhe onde chamá-la.
 */
export async function ensureSigningKeyActive(
  keys: Pick<SigningKeyService, "ensureActive">,
  now: Date = new Date(),
): Promise<StoredSigningKey> {
  return keys.ensureActive(now, signingKeyStartupAudit(now));
}
