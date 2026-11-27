import { expect, test } from "vitest";
import { ApiError, SignedOutError, currentUser, requestTranscription, saveReading } from "./api";
import { youtubeLinkOf } from "./capture/youtube";
import { failureToast, savedToast, transcriptionToast } from "./messages";
import { saveFromTab } from "./save";
import { hostPermissionOf, normalizeBaseUrl } from "./settings";

const BASE = "https://candeia.example";
const page = { kind: "article" as const, url: "https://jornal.example/a", title: "Título", markdown: "Texto.", siteName: "Jornal" };
const saved = { taskId: "t1", artifactId: "a1", taskCreated: false, artifactCreated: true };

interface Call {
  url: string;
  method: string;
  credentials?: RequestCredentials;
  body?: unknown;
}

/** Um `fetch` que responde na ordem dada e anota o que foi chamado. */
function fakeFetch(...responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({
      url: String(url),
      method: init.method ?? "GET",
      credentials: init.credentials,
      body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected call");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const empty = (status: number) => new Response(null, { status });

test("guarda a página com os cookies da sessão e só os campos do contrato", async () => {
  const { fetchImpl, calls } = fakeFetch(json(saved));

  expect(await saveReading(BASE, page, fetchImpl)).toEqual(saved);

  expect(calls).toEqual([
    {
      url: "https://candeia.example/api/tasks/daily-reading",
      method: "POST",
      credentials: "include",
      body: { url: "https://jornal.example/a", title: "Título", markdown: "Texto.", siteName: "Jornal" },
    },
  ]);
});

test("num 401 renova a sessão uma vez e tenta de novo", async () => {
  const { fetchImpl, calls } = fakeFetch(empty(401), empty(204), json(saved));

  expect(await saveReading(BASE, page, fetchImpl)).toEqual(saved);

  expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual([
    "POST /api/tasks/daily-reading",
    "POST /api/session/refresh",
    "POST /api/tasks/daily-reading",
  ]);
});

test("sem como renovar, ou com 401 de novo, a sessão está encerrada", async () => {
  await expect(saveReading(BASE, page, fakeFetch(empty(401), empty(401)).fetchImpl)).rejects.toBeInstanceOf(SignedOutError);
  await expect(saveReading(BASE, page, fakeFetch(empty(401), empty(204), empty(401)).fetchImpl)).rejects.toBeInstanceOf(SignedOutError);
});

test("as outras falhas da API saem com o status", async () => {
  await expect(saveReading(BASE, page, fakeFetch(empty(413)).fetchImpl)).rejects.toMatchObject({ name: "ApiError", status: 413 });
  await expect(saveReading(BASE, page, fakeFetch(json({ error: "x" }, 500)).fetchImpl)).rejects.toMatchObject({ status: 500 });
});

test("quem está com a sessão aberta, ou ninguém", async () => {
  expect(await currentUser(BASE, fakeFetch(json({ userId: "u1", name: "Ana", email: null })).fetchImpl)).toEqual({ userId: "u1", name: "Ana" });
  expect(await currentUser(BASE, fakeFetch(empty(401), empty(401)).fetchImpl)).toBeNull();
  await expect(currentUser(BASE, fakeFetch(new TypeError("Failed to fetch")).fetchImpl)).rejects.toThrow("Failed to fetch");
});

test("o endereço digitado vira a origem do app", () => {
  expect(normalizeBaseUrl("  candeia.example/ana/tarefas?x=1 ")).toBe("https://candeia.example");
  expect(normalizeBaseUrl("http://localhost:3003/")).toBe("http://localhost:3003");
  expect(normalizeBaseUrl("https://leitura.braid.local:8443")).toBe("https://leitura.braid.local:8443");
  expect(normalizeBaseUrl("ftp://candeia.example")).toBeNull();
  expect(normalizeBaseUrl("")).toBeNull();
  expect(normalizeBaseUrl("não é endereço")).toBeNull();
  expect(hostPermissionOf("https://leitura.braid.local:8443")).toBe("https://leitura.braid.local/*");
});

test("o aviso diz o que foi guardado, se a tarefa nasceu e leva à tarefa", () => {
  expect(savedToast(page, { ...saved, taskCreated: true }, `${BASE}/u1/tarefas/t1`)).toEqual({
    tone: "success",
    title: "Página guardada na Leitura diária",
    detail: "Título A tarefa de hoje foi criada agora.",
    link: { href: "https://candeia.example/u1/tarefas/t1", label: "Abrir a tarefa" },
  });
  expect(savedToast(page, { ...saved, artifactCreated: false }, undefined)).toEqual({
    tone: "success",
    title: "Página atualizada na Leitura diária",
    detail: "Título",
  });
  expect(savedToast({ ...page, kind: "link" }, saved, undefined)).toMatchObject({
    title: "Link guardado na Leitura diária",
    detail: "Não havia um texto principal nesta página: ficou só o endereço.",
  });
});

test("cada falha diz o que a pessoa pode fazer", () => {
  expect(failureToast(new SignedOutError(), BASE)).toMatchObject({
    tone: "error",
    title: "Entre no Candeia para guardar",
    link: { href: BASE, label: "Abrir o Candeia" },
  });
  expect(failureToast(new ApiError(413), BASE).title).toBe("Página grande demais");
  expect(failureToast(new ApiError(500), BASE).detail).toContain("500");
  expect(failureToast(new TypeError("Failed to fetch"), BASE).title).toBe("Não foi possível falar com o Candeia");
});

const queued = { requestId: "p1", taskId: "t1", artifactId: "a1", created: true };

test("pede a transcrição com os cookies da sessão e só o endereço do vídeo", async () => {
  const { fetchImpl, calls } = fakeFetch(json(queued));

  expect(await requestTranscription(BASE, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", fetchImpl)).toEqual(queued);

  expect(calls).toEqual([
    {
      url: "https://candeia.example/api/tasks/transcription-requests",
      method: "POST",
      credentials: "include",
      body: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    },
  ]);
});

test("o pedido de transcrição renova a sessão num 401 e diz o status das outras falhas", async () => {
  const { fetchImpl, calls } = fakeFetch(empty(401), empty(204), json(queued));
  expect(await requestTranscription(BASE, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", fetchImpl)).toEqual(queued);
  expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
    "/api/tasks/transcription-requests",
    "/api/session/refresh",
    "/api/tasks/transcription-requests",
  ]);
  await expect(requestTranscription(BASE, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", fakeFetch(empty(400)).fetchImpl)).rejects.toMatchObject({ status: 400 });
});

const articleOnTab = async () => page;

test("numa aba de vídeo do YouTube o botão pede a transcrição, sem ler a página", async () => {
  const { fetchImpl, calls } = fakeFetch(json(queued));
  let read = false;

  const saved = await saveFromTab(
    BASE,
    youtubeLinkOf("https://youtu.be/dQw4w9WgXcQ?si=abc&t=90"),
    async () => {
      read = true;
      return page;
    },
    fetchImpl,
  );

  expect(saved).toEqual({ kind: "transcription", result: queued });
  expect(read).toBe(false);
  expect(calls.map((call) => `${call.method} ${new URL(call.url).pathname}`)).toEqual(["POST /api/tasks/transcription-requests"]);
  expect(calls[0]?.body).toEqual({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
});

test("em outra página o botão guarda a página na Leitura diária", async () => {
  const { fetchImpl, calls } = fakeFetch(json(saved));

  expect(await saveFromTab(BASE, youtubeLinkOf("https://jornal.example/a"), articleOnTab, fetchImpl)).toEqual({ kind: "page", page, result: saved });
  expect(calls.map((call) => new URL(call.url).pathname)).toEqual(["/api/tasks/daily-reading"]);
});

test("no YouTube fora de um vídeo (canal, busca, início) o botão guarda a página", async () => {
  for (const tabUrl of ["https://www.youtube.com/@canal", "https://www.youtube.com/results?search_query=x", "https://www.youtube.com/"]) {
    const { fetchImpl, calls } = fakeFetch(json(saved));
    expect((await saveFromTab(BASE, youtubeLinkOf(tabUrl), articleOnTab, fetchImpl)).kind).toBe("page");
    expect(new URL(calls[0]?.url ?? "").pathname).toBe("/api/tasks/daily-reading");
  }
});

test("o aviso da transcrição diz que o vídeo entrou na fila e leva à Leitura diária", () => {
  expect(transcriptionToast(queued, `${BASE}/u1/tarefas/t1`)).toEqual({
    tone: "success",
    title: "Vídeo na fila de transcrição",
    detail: "O texto aparece no artefato da Leitura diária quando o seu computador terminar.",
    link: { href: "https://candeia.example/u1/tarefas/t1", label: "Abrir a Leitura diária" },
  });
  expect(transcriptionToast({ ...queued, created: false }, undefined)).toEqual({
    tone: "success",
    title: "Este vídeo já está na fila",
    detail: "A transcrição de hoje ainda não terminou: o pedido que existia foi mantido.",
  });
});

test("a falha do pedido de transcrição fala em transcrição, não em página", () => {
  expect(failureToast(new ApiError(400), BASE, "transcription")).toMatchObject({
    title: "Não foi possível pedir a transcrição",
    detail: expect.stringContaining("400"),
  });
  expect(failureToast(new ApiError(403), BASE, "transcription").title).toBe("Sem permissão para pedir a transcrição");
  expect(failureToast(new SignedOutError(), BASE, "transcription").title).toBe("Entre no Candeia para guardar");
});
