import type { DailyReadingInput, DailyReadingResult, TranscriptionRequestInput, TranscriptionRequestResult } from "@repo/contracts";

/**
 * A extensão fala com o Candeia pela mesma porta do app web: `/api/*` na origem
 * do app, com os cookies de sessão que o navegador já guarda. Ela não vê token
 * nem senha: se a pessoa está com o Candeia aberto neste navegador, está
 * autenticada aqui também.
 */

const TIMEOUT_MS = 30_000;

/** Não há sessão aberta no Candeia neste navegador. */
export class SignedOutError extends Error {
  constructor() {
    super("signed out");
    this.name = "SignedOutError";
  }
}

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API ${status}`);
    this.name = "ApiError";
  }
}

export interface SessionUser {
  userId: string;
  name: string;
}

type Fetch = typeof fetch;

function request(fetchImpl: Fetch, url: string, init: RequestInit = {}): Promise<Response> {
  return fetchImpl(url, { ...init, credentials: "include", cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/**
 * Chama a API e, num 401, renova a sessão uma vez (o token de acesso dura 15
 * minutos; o de renovação, dias) e tenta de novo. Um segundo 401 é sessão
 * encerrada.
 */
async function withSession(fetchImpl: Fetch, baseUrl: string, call: () => Promise<Response>): Promise<Response> {
  const first = await call();
  if (first.status !== 401) return first;
  const refreshed = await request(fetchImpl, `${baseUrl}/api/session/refresh`, { method: "POST" });
  if (!refreshed.ok) throw new SignedOutError();
  const second = await call();
  if (second.status === 401) throw new SignedOutError();
  return second;
}

/** Um `POST` de JSON para a API, com a sessão renovada num 401; devolve a resposta lida ou `ApiError`. */
async function postJson<Result>(fetchImpl: Fetch, baseUrl: string, path: string, body: unknown): Promise<Result> {
  const response = await withSession(fetchImpl, baseUrl, () =>
    request(fetchImpl, `${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    }),
  );
  if (!response.ok) throw new ApiError(response.status);
  return (await response.json()) as Result;
}

/** `POST /api/tasks/daily-reading`: guarda a página na Leitura diária do dia. */
export function saveReading(baseUrl: string, page: DailyReadingInput, fetchImpl: Fetch = fetch): Promise<DailyReadingResult> {
  // So os campos do contrato: a API recusa campo que nao conhece.
  const body: DailyReadingInput = {
    url: page.url,
    title: page.title,
    markdown: page.markdown,
    ...(page.siteName ? { siteName: page.siteName } : {}),
    ...(page.byline ? { byline: page.byline } : {}),
  };
  return postJson(fetchImpl, baseUrl, "/api/tasks/daily-reading", body);
}

/**
 * `POST /api/tasks/transcription-requests`: pede a transcrição de um vídeo do
 * YouTube. O pedido nasce na hora, na fila do serviço local, e o documento do
 * vídeo entra na Leitura diária do dia.
 */
export function requestTranscription(baseUrl: string, videoUrl: string, fetchImpl: Fetch = fetch): Promise<TranscriptionRequestResult> {
  const body: TranscriptionRequestInput = { url: videoUrl };
  return postJson(fetchImpl, baseUrl, "/api/tasks/transcription-requests", body);
}

/** Quem está com a sessão aberta, ou `null` sem sessão. */
export async function currentUser(baseUrl: string, fetchImpl: Fetch = fetch): Promise<SessionUser | null> {
  try {
    const response = await withSession(fetchImpl, baseUrl, () => request(fetchImpl, `${baseUrl}/api/session`));
    if (!response.ok) throw new ApiError(response.status);
    const user = (await response.json()) as Partial<SessionUser>;
    return typeof user.userId === "string" ? { userId: user.userId, name: typeof user.name === "string" ? user.name : "" } : null;
  } catch (error) {
    if (error instanceof SignedOutError) return null;
    throw error;
  }
}
