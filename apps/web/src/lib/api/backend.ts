/**
 * Cliente das chamadas server-side ao backend Nest.
 *
 * No browser as chamadas usam caminho relativo (`/api/...`) e o rewrite do
 * next.config encaminha para o Nest. Do servidor nao ha rewrite, entao o host
 * precisa ser explicito — e por isso que esta funcao existe.
 */
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:3001";

export async function fetchFromBackend<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store", ...init });
  if (!response.ok) {
    throw new Error(
      `Backend request failed: ${init?.method ?? "GET"} ${path} -> ${response.status}`,
    );
  }
  return (await response.json()) as T;
}
