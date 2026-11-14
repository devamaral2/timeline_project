import type { RequestErrorCode } from "@repo/contracts";

const CODES: readonly RequestErrorCode[] = [
  "invalid_input", "forbidden", "limit_reached", "conflict", "unavailable", "cancelled", "internal",
];

/** O codigo seguro de por que o pedido falhou: nunca a mensagem do provedor. O que nao e conhecido vira `internal`. */
export function requestErrorCode(code: string): RequestErrorCode {
  return (CODES as readonly string[]).includes(code) ? (code as RequestErrorCode) : "internal";
}
