import { ApiError, authedFetch } from "./authed-fetch";

/**
 * A única função que monta caminho, consulta e cabeçalhos das chamadas da API.
 * Cada área (tarefas, artefatos, …) chama `apiRequest` e não conhece HTTP.
 */

export type ApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

/** O que a tela distingue. Qualquer outro status continua sendo `ApiError`. */
export type ApiFailureKind =
  | "not_found"
  | "stale_revision"
  | "invalid_input"
  | "forbidden"
  | "conflict"
  | "unavailable";

export class ApiRequestError extends Error {
  constructor(
    readonly kind: ApiFailureKind,
    readonly status: number,
    readonly method: ApiMethod,
    readonly path: string,
  ) {
    super(`${method} ${path} -> ${status} (${kind})`);
    this.name = "ApiRequestError";
  }
}

export type QueryValue = string | number | boolean | readonly string[] | undefined;

export interface ApiRequestOptions {
  /** Parâmetros de consulta; listas viram valores separados por vírgula; `undefined` some. */
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Obrigatório em toda criação: a mesma chave devolve a mesma resposta (ver `newIdempotencyKey`). */
  idempotencyKey?: string;
}

/** Chave nova para um formulário. Guarde-a enquanto o formulário estiver aberto. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function buildQuery(query: ApiRequestOptions["query"]): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === "") continue;
    params.set(name, Array.isArray(value) ? value.join(",") : String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/** Traduz o status em erro da tela. Sem correspondência, o erro original segue. */
export function translateFailure(error: unknown, method: ApiMethod, path: string): unknown {
  if (!(error instanceof ApiError)) return error;
  const kind = failureKind(error.status, method);
  return kind ? new ApiRequestError(kind, error.status, method, path) : error;
}

function failureKind(status: number, method: ApiMethod): ApiFailureKind | undefined {
  switch (status) {
    case 404:
      return "not_found";
    case 409:
      // Só edição tem revisão; na criação, 409 é chave de idempotência ainda em uso.
      return method === "PATCH" ? "stale_revision" : "conflict";
    case 400:
    case 422:
      return "invalid_input";
    case 403:
      return "forbidden";
    case 502:
    case 503:
    case 504:
      return "unavailable";
    default:
      return undefined;
  }
}

export async function apiRequest<T>(method: ApiMethod, path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = `${path}${buildQuery(options.query)}`;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.idempotencyKey !== undefined) headers["Idempotency-Key"] = options.idempotencyKey;

  try {
    return await authedFetch<T>(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    throw translateFailure(error, method, path);
  }
}
