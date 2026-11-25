import type { DailyReadingResult } from "@repo/contracts";
import { ApiError, SignedOutError } from "./api";
import type { CapturedPage } from "./capture/page";
import type { Toast } from "./toast";

/** O aviso de uma página guardada: o que foi guardado e onde, com o caminho para abrir. */
export function savedToast(page: CapturedPage, result: DailyReadingResult, taskUrl: string | undefined): Toast {
  // "Página" pede o feminino; "Vídeo" e "Link", o masculino.
  const what = page.kind === "video" ? "Vídeo" : page.kind === "link" ? "Link" : "Página";
  const ending = page.kind === "article" ? "a" : "o";
  const title = `${what} ${result.artifactCreated ? "guardad" : "atualizad"}${ending} na Leitura diária`;
  const detail = [
    page.kind === "link" ? "Não havia um texto principal nesta página: ficou só o endereço." : page.title,
    result.taskCreated ? "A tarefa de hoje foi criada agora." : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  return { tone: "success", title, detail, ...(taskUrl ? { link: { href: taskUrl, label: "Abrir a tarefa" } } : {}) };
}

/** O aviso de uma falha, dizendo o que a pessoa pode fazer. */
export function failureToast(error: unknown, baseUrl: string): Toast {
  if (error instanceof SignedOutError) {
    return {
      tone: "error",
      title: "Entre no Candeia para guardar",
      detail: "Sua sessão não está aberta neste navegador. Entre e clique no ícone de novo.",
      link: { href: baseUrl, label: "Abrir o Candeia" },
    };
  }
  if (error instanceof ApiError && error.status === 413) {
    return { tone: "error", title: "Página grande demais", detail: "O texto desta página passa do tamanho que o Candeia guarda." };
  }
  if (error instanceof ApiError && error.status === 403) {
    return { tone: "error", title: "Sem permissão para guardar", detail: "Sua conta não pode criar tarefas no Candeia." };
  }
  if (error instanceof ApiError) {
    return { tone: "error", title: "Não foi possível guardar a página", detail: `O Candeia respondeu com o erro ${error.status}. Tente de novo.` };
  }
  return {
    tone: "error",
    title: "Não foi possível falar com o Candeia",
    detail: "Confira sua conexão e o endereço nas opções da extensão.",
  };
}
