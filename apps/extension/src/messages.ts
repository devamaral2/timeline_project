import type { DailyReadingResult, TranscriptionRequestResult } from "@repo/contracts";
import { ApiError, SignedOutError } from "./api";
import type { CapturedPage } from "./capture/page";
import type { ContentKind } from "./save";
import type { Toast } from "./toast";

/** O aviso de uma página guardada: o que foi guardado e onde, com o caminho para abrir. */
export function savedToast(page: CapturedPage, result: DailyReadingResult, taskUrl: string | undefined): Toast {
  // "Página" pede o feminino; "Link", o masculino.
  const what = page.kind === "link" ? "Link" : "Página";
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

/** O aviso de um vídeo do YouTube que entrou na fila de transcrição, com o caminho para a Leitura diária. */
export function transcriptionToast(result: TranscriptionRequestResult, taskUrl: string | undefined): Toast {
  const link = taskUrl ? { link: { href: taskUrl, label: "Abrir a Leitura diária" } } : {};
  if (!result.created) {
    return {
      tone: "success",
      title: "Este vídeo já está na fila",
      detail: "A transcrição de hoje ainda não terminou: o pedido que existia foi mantido.",
      ...link,
    };
  }
  return {
    tone: "success",
    title: "Vídeo na fila de transcrição",
    detail: "O texto aparece no documento da Leitura diária quando o seu computador terminar.",
    ...link,
  };
}

/** O aviso de uma falha, dizendo o que a pessoa pode fazer. `content` é o que o clique tentava guardar. */
export function failureToast(error: unknown, baseUrl: string, content: ContentKind = "page"): Toast {
  const transcription = content === "transcription";
  if (error instanceof SignedOutError) {
    return {
      tone: "error",
      title: "Entre no Candeia para guardar",
      detail: "Sua sessão não está aberta neste navegador. Entre e clique no ícone de novo.",
      link: { href: baseUrl, label: "Abrir o Candeia" },
    };
  }
  if (error instanceof ApiError && error.status === 413 && !transcription) {
    return { tone: "error", title: "Página grande demais", detail: "O texto desta página passa do tamanho que o Candeia guarda." };
  }
  if (error instanceof ApiError && error.status === 403) {
    return { tone: "error", title: transcription ? "Sem permissão para pedir a transcrição" : "Sem permissão para guardar", detail: "Sua conta não pode criar tarefas no Candeia." };
  }
  if (error instanceof ApiError) {
    return { tone: "error", title: transcription ? "Não foi possível pedir a transcrição" : "Não foi possível guardar a página",
      detail: `O Candeia respondeu com o erro ${error.status}. Tente de novo.` };
  }
  return {
    tone: "error",
    title: "Não foi possível falar com o Candeia",
    detail: "Confira sua conexão e o endereço nas opções da extensão.",
  };
}
