import { currentUser } from "../api";
import { hostPermissionOf, normalizeBaseUrl, readSettings, writeSettings } from "../settings";

const form = document.getElementById("form") as HTMLFormElement;
const input = document.getElementById("base-url") as HTMLInputElement;
const button = form.querySelector("button") as HTMLButtonElement;
const status = document.getElementById("status") as HTMLParagraphElement;

function say(tone: "ok" | "error" | "busy", text: string, link?: { href: string; label: string }): void {
  status.dataset.tone = tone;
  status.textContent = text;
  if (link) {
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label;
    status.append(" ", anchor);
  }
}

/** Diz se a extensão já consegue guardar: precisa da sessão aberta no Candeia. */
async function checkSession(baseUrl: string): Promise<void> {
  say("busy", "Conferindo sua sessão…");
  try {
    const user = await currentUser(baseUrl);
    if (user) say("ok", `Pronto. Sessão aberta${user.name ? ` como ${user.name}` : ""}.`);
    else say("error", "Endereço salvo, mas você não está com a sessão aberta.", { href: baseUrl, label: "Entrar no Candeia" });
  } catch {
    say("error", "Não foi possível falar com esse endereço. Confira se ele está certo e no ar.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const baseUrl = normalizeBaseUrl(input.value);
  if (!baseUrl) {
    say("error", "Escreva o endereço completo, como https://candeia.exemplo.dev.");
    input.focus();
    return;
  }
  button.disabled = true;
  try {
    // Precisa vir direto do clique: o Chrome so mostra o pedido de permissao em resposta a um gesto.
    const granted = await chrome.permissions.request({ origins: [hostPermissionOf(baseUrl)] });
    if (!granted) {
      say("error", "Sem a permissão, a extensão não consegue falar com o Candeia. Salve de novo e escolha Permitir.");
      return;
    }
    input.value = baseUrl;
    await writeSettings({ baseUrl });
    await checkSession(baseUrl);
  } finally {
    button.disabled = false;
  }
});

void readSettings().then(async ({ baseUrl }) => {
  if (!baseUrl) return;
  input.value = baseUrl;
  if (await chrome.permissions.contains({ origins: [hostPermissionOf(baseUrl)] })) await checkSession(baseUrl);
});
