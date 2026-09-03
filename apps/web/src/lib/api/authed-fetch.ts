"use client";

import { getAuth } from "firebase/auth";
import { getClientApp } from "@/lib/firebase/client-app";

/**
 * O status que a resposta trouxe — ou o 401 que este modulo inventa quando nem
 * chega a sair da maquina. Quem chama precisa distinguir "sua sessao acabou" de
 * "o servidor caiu", e a mensagem de erro nao serve para isso.
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
 * Uma chamada a API do Nest com o ID token do Firebase no cabecalho.
 *
 * E por aqui que a timeline le desde que a autorizacao passou a vir do token:
 * nao ha mais fetch anonimo do servidor, porque um Server Component nao tem
 * token nenhum do usuario.
 *
 * Sem `currentUser` a funcao devolve 401 sem tocar na rede. O Firebase resolve
 * o estado de autenticacao de forma assincrona, e sair pedindo sem token so
 * gastaria uma viagem para receber de volta o mesmo 401 — quem chama espera o
 * usuario aparecer antes de pedir.
 */
export async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const currentUser = getAuth(getClientApp()).currentUser;
  if (!currentUser) throw new ApiError(401, "Não autenticado");

  const token = await currentUser.getIdToken();
  const response = await fetch(path, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new ApiError(response.status, `${init.method ?? "GET"} ${path} -> ${response.status}`);
  }

  // PATCH e DELETE respondem 204: nao ha corpo para ler, e `json()` quebraria.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
