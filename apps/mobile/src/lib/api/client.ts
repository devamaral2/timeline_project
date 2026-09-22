import { env } from "@/config/env";
import { session } from "@/lib/auth/session";

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

async function send(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(apiUrl(path), init);
  } catch {
    // Fetch so rejeita quando nem chegou a falar com o servidor. Num celular
    // isso quase sempre e a API presa no loopback ou o aparelho em outra rede.
    throw new ApiError(0, "Nao foi possivel falar com a API. Verifique a rede e o MOBILE_API_URL.");
  }
}

async function read<T>(path: string, init: RequestInit, response: Response): Promise<T> {
  if (!response.ok) {
    throw new ApiError(response.status, `${init.method ?? "GET"} ${path} -> ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Chamada sem token, para os endpoints que sao mesmo publicos.
 *
 * Nao ha nenhum na timeline: ler um dia e pedir sugestao de tag passaram as
 * duas a exigir `Authorization`, porque quem responde por autorizacao agora e o
 * token — o `userId` da rota so diz que tela abrir. Isto fica de pe para o
 * proximo endpoint que nao pedir sessao, e nao para reaproveitar nos que pedem.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  return read<T>(path, init, await send(path, init));
}

async function accessToken(renew: boolean): Promise<string> {
  let token: string | null;
  try {
    token = renew ? await session.refresh() : await session.getAccessToken();
  } catch {
    throw new ApiError(0, "Nao foi possivel renovar a sessao. Verifique a rede e o MOBILE_AUTH_URL.");
  }
  if (!token) throw new ApiError(401, "Entre na sua conta para continuar.");
  return token;
}

/**
 * Chamada autenticada com o access token do apps/auth. A sessao entrega o token
 * ja renovado quando o `exp` passou; se a API ainda assim responder 401 (o
 * relogio do aparelho adiantado, a sessao revogada em outro lugar), renova uma
 * vez e repete. So um segundo 401 chega a quem chamou.
 */
export async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const withToken = (token: string): RequestInit => ({
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });

  let response = await send(path, withToken(await accessToken(false)));
  if (response.status === 401) {
    response = await send(path, withToken(await accessToken(true)));
  }
  return read<T>(path, init, response);
}
