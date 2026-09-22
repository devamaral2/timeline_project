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
 * Uma chamada a API do Nest. O cookie httpOnly é convertido em bearer pelo
 * proxy do Next; em caso de expiração, a sessão é renovada uma vez.
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

export async function sendWithSession(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => fetch(path, { ...init, credentials: "same-origin" });
  const response = await send();
  if (response.status !== 401) return response;
  if (!(await refreshSession())) return response;
  return send();
}
