import { currentUser } from "./api";
import { youtubeLinkOf } from "./capture/youtube";
import type { CapturedPage } from "./capture/page";
import { failureToast, savedToast, transcriptionToast } from "./messages";
import { saveFromTab, type Saved } from "./save";
import { hostPermissionOf, readSettings } from "./settings";
import { showToast, type Toast } from "./toast";

/**
 * O service worker da extensão. Um clique no ícone (ou o atalho) lê a página
 * da aba, manda para `POST /api/tasks/daily-reading` e avisa o resultado na
 * própria página.
 *
 * Numa aba de vídeo do YouTube o clique pede a transcrição
 * (`POST /api/tasks/transcription-requests`), sem ler a página.
 *
 * A extensão só enxerga a aba em que a pessoa clicou (`activeTab`): não lê
 * histórico nem outras abas, e não roda em página nenhuma sem o clique.
 */

const USER_KEY = "userId";

/** O emblema do ícone: a resposta que aparece mesmo quando o aviso não cabe na página. */
const BADGES = {
  busy: { text: "…", color: "#586a70" },
  ok: { text: "✓", color: "#2e8a7a" },
  error: { text: "!", color: "#aa474f" },
} as const;

/** O emblema vale só para a aba e some sozinho quando ela vai para outra página. */
async function setBadge(tabId: number, state: keyof typeof BADGES, title: string): Promise<void> {
  const badge = BADGES[state];
  await Promise.all([
    chrome.action.setBadgeText({ tabId, text: badge.text }),
    chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color }),
    chrome.action.setTitle({ tabId, title }),
  ]).catch(() => undefined); // A aba pode ter fechado no meio do caminho.
}

/** Lê a página da aba: injeta o leitor e pede o resultado. Falha em páginas que o Chrome protege (`chrome://`, a loja, PDFs). */
async function capture(tabId: number): Promise<CapturedPage> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["capture.js"] });
  const [injection] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => globalThis.__candeiaCapture?.(),
  });
  const page = injection?.result as CapturedPage | undefined;
  if (!page) throw new Error("capture returned nothing");
  return page;
}

async function toast(tabId: number, message: Toast): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, func: showToast, args: [message] }).catch(() => undefined);
}

/** O endereço da tarefa no app, que leva o id de quem está com a sessão aberta. */
async function taskUrl(baseUrl: string, taskId: string): Promise<string | undefined> {
  try {
    const cached = (await chrome.storage.session.get(USER_KEY))[USER_KEY] as { baseUrl: string; userId: string } | undefined;
    let userId = cached?.baseUrl === baseUrl ? cached.userId : undefined;
    if (!userId) {
      userId = (await currentUser(baseUrl))?.userId;
      if (userId) await chrome.storage.session.set({ [USER_KEY]: { baseUrl, userId } });
    }
    return userId ? `${baseUrl}/${encodeURIComponent(userId)}/tarefas/${encodeURIComponent(taskId)}` : undefined;
  } catch {
    // O link e um atalho: sem ele o aviso ainda diz que a pagina foi guardada.
    return undefined;
  }
}

async function saveTab(tab: chrome.tabs.Tab): Promise<void> {
  const tabId = tab.id;
  if (tabId === undefined) return;

  const { baseUrl } = await readSettings();
  if (!baseUrl || !(await chrome.permissions.contains({ origins: [hostPermissionOf(baseUrl)] }))) {
    await chrome.runtime.openOptionsPage();
    return;
  }

  const video = tab.url !== undefined && youtubeLinkOf(tab.url) !== null;
  await setBadge(tabId, "busy", video ? "Pedindo a transcrição…" : "Guardando na Leitura diária…");
  let captureFailed = false;
  const read = async () => {
    try {
      return await capture(tabId);
    } catch (error) {
      captureFailed = true;
      throw error;
    }
  };

  try {
    const saved = await saveFromTab(baseUrl, tab.url, read);
    await setBadge(tabId, "ok", saved.kind === "transcription" ? "Vídeo na fila de transcrição" : "Guardada na Leitura diária");
    await toast(tabId, await savedMessage(baseUrl, saved));
  } catch (error) {
    if (captureFailed) {
      await setBadge(tabId, "error", "O Chrome não deixa extensões lerem esta página.");
      return;
    }
    const message = failureToast(error, baseUrl, video ? "transcription" : "page");
    await setBadge(tabId, "error", message.title);
    await toast(tabId, message);
  }
}

async function savedMessage(baseUrl: string, saved: Saved): Promise<Toast> {
  const link = await taskUrl(baseUrl, saved.result.taskId);
  return saved.kind === "transcription" ? transcriptionToast(saved.result, link) : savedToast(saved.page, saved.result, link);
}

/**
 * Um clique de cada vez: duas páginas guardadas em seguida chegam à API em
 * ordem, e a segunda já encontra a tarefa do dia que a primeira criou.
 */
let queue: Promise<void> = Promise.resolve();

chrome.action.onClicked.addListener((tab) => {
  queue = queue.then(() => saveTab(tab)).catch(() => undefined);
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === "install" && !(await readSettings()).baseUrl) await chrome.runtime.openOptionsPage();
});
