import type { AuthenticatedUser } from "./request-identity/authenticated-user";

/** O metodo HTTP de uma rota declarada. */
export type ApiHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** Quem a rota aceita: a sessao encaminhada pelo gateway ou a chave de dispositivo do servico local. */
export type ApiAuthentication = "gateway-session" | "transcription-device-key";

/** Os status de sucesso que uma rota declarada pode devolver. */
export type ApiSuccessStatus = 200 | 201 | 202 | 204;

/**
 * O que uma requisicao entrega ao handler declarado, ja validado pelo
 * registrador: parametros do caminho, query, corpo, headers e a identidade.
 */
export interface ApiRequest {
  params: Readonly<Record<string, string | undefined>>;
  query: Readonly<Record<string, string | string[] | undefined>>;
  body: unknown;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  actor: AuthenticatedUser;
}

/**
 * O contrato HTTP de uma operacao: metodo, caminho, status de sucesso, quem
 * pode chamar e, quando aplicavel, idempotencia. Nao conhece Fastify: qualquer
 * registrador pequeno converte isto para o servidor.
 */
export interface ApiRouteOperation {
  method: ApiHttpMethod;
  /** O caminho no formato do registrador (`/api/tasks/:taskId`). */
  path: string;
  status: ApiSuccessStatus;
  authentication: ApiAuthentication;
  /** A criacao aceita `Idempotency-Key`; nas demais o header e ignorado. */
  idempotent?: boolean;
}

/** Uma operacao declarada mais o handler que a executa. */
export interface ApiRoute extends ApiRouteOperation {
  handler(request: ApiRequest): Promise<unknown> | unknown;
}
