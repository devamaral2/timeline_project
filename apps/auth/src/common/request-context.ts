/** De onde veio a requisicao. Vai para a sessao e para a auditoria. */
export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
}

export const ANONYMOUS_CONTEXT: RequestContext = { ipAddress: null, userAgent: null };
