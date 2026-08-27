import { env } from "@/config/env";
import { getClientAuth } from "@/lib/firebase/app";

/** Uma resposta de erro da API, com o status preservado para quem chama decidir. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * No web as chamadas usam caminho relativo e o rewrite do Next as encaminha ao
 * Nest. Aqui nao ha rewrite nem origem: o app fala direto com a API, entao todo
 * caminho precisa do host da frente.
 */
export function apiUrl(path: string): string {
  return `${env.apiBaseUrl}${path}`;
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), init);
  } catch {
    // Fetch so rejeita quando nem chegou a falar com o servidor. Num celular
    // isso quase sempre e a API presa no loopback ou o aparelho em outra rede.
    throw new ApiError(0, "Nao foi possivel falar com a API. Verifique a rede e o MOBILE_API_URL.");
  }

  if (!response.ok) {
    throw new ApiError(response.status, `${init.method ?? "GET"} ${path} -> ${response.status}`);
  }
  return (await response.json()) as T;
}

/** Chamada sem token — as leituras de timeline e de tags sao publicas. */
export function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init);
}

/**
 * Chamada autenticada. O ID token e pedido a cada chamada de proposito: o SDK
 * devolve o token em cache enquanto ele vale e renova sozinho quando expira, e
 * guardar uma copia nossa so criaria um jeito de mandar token vencido.
 */
export async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const currentUser = getClientAuth().currentUser;
  if (!currentUser) throw new ApiError(401, "Entre na sua conta para continuar.");

  const token = await currentUser.getIdToken();
  return request<T>(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
}
