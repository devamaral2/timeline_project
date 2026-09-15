"use client";

import { refreshSession } from "@/lib/session/refresh-session";

/**
 * O status que a resposta trouxe. Quem chama precisa distinguir "sua sessao
 * acabou" de "o servidor caiu", e a mensagem de erro nao serve para isso.
 */
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
 * Uma chamada a API do Nest com a sessao do navegador.
 *
 * O token nao passa por aqui: ele vive num cookie httpOnly que o proxy do Next
 * (`src/proxy.ts`) transforma em `Authorization`. Quando a API responde 401 —
 * o access token de 15 minutos expirou — a sessao e renovada uma vez e a
 * chamada repetida; so um segundo 401 chega a quem chamou.
 */
export async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await sendWithSession(path, init);

  if (!response.ok) {
    throw new ApiError(response.status, `${init.method ?? "GET"} ${path} -> ${response.status}`);
  }

  // PATCH e DELETE respondem 204: nao ha corpo para ler, e `json()` quebraria.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** O `fetch` cru com a renovacao de sessao, para quem precisa ler a resposta de erro. */
export async function sendWithSession(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => fetch(path, { ...init, credentials: "same-origin" });

  const response = await send();
  if (response.status !== 401) return response;
  if (!(await refreshSession())) return response;
  return send();
}
