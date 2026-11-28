import { ulid } from "ulid";

/** De onde veio a requisicao. Vai para a sessao e para a auditoria. */
export interface RequestContext {
  readonly correlationId: string;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
}

export const ANONYMOUS_CONTEXT: RequestContext = Object.freeze({
  correlationId: "anonymous",
  ipAddress: null,
  userAgent: null,
});

const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export interface RequestContextInput {
  readonly receivedCorrelationId?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

/**
 * Monta o contexto que acompanha sessão e auditoria. O id enviado pelo cliente
 * só é aceito se couber no formato seguro; fora disso, um id novo é gerado para
 * que nenhuma linha de log ou auditoria carregue texto arbitrário.
 */
export function resolveRequestContext(
  input: RequestContextInput,
  generateCorrelationId: () => string = () => ulid(),
): RequestContext {
  const correlationId =
    input.receivedCorrelationId && CORRELATION_ID_PATTERN.test(input.receivedCorrelationId)
      ? input.receivedCorrelationId
      : generateCorrelationId();
  return Object.freeze({
    correlationId,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent || null,
  });
}
