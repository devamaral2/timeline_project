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
