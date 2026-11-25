/** O aviso que aparece no canto da página depois de um clique no ícone. */
export interface Toast {
  tone: "success" | "error";
  title: string;
  detail?: string;
  link?: { href: string; label: string };
}

/**
 * Desenha o aviso dentro da página. É injetada pelo service worker e viaja
 * como texto: tudo o que ela usa tem de estar aqui dentro, sem import nem
 * função de fora.
 *
 * O aviso vive numa sombra (shadow DOM), para que o CSS da página não o
 * alcance, e some sozinho.
 */
export function showToast(toast: Toast): void {
  const HOST_ID = "candeia-leitura-diaria-aviso";
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.cssText = "all: initial; position: fixed; top: 16px; right: 16px; z-index: 2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    .card {
      display: flex; align-items: flex-start; gap: 10px; box-sizing: border-box; width: max-content; max-width: min(360px, calc(100vw - 32px));
      padding: 12px 14px; border-radius: 12px; background: #152429; color: #f1f5f6;
      font: 14px/20px system-ui, -apple-system, "Segoe UI", sans-serif;
      box-shadow: 0 8px 24px rgb(21 36 41 / 28%); animation: enter 160ms ease-out;
    }
    .dot { flex-shrink: 0; width: 8px; height: 8px; margin-top: 6px; border-radius: 50%; background: #00b5ab; }
    .card[data-tone="error"] .dot { background: #fda0a3; }
    .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .title { font-weight: 600; overflow-wrap: anywhere; }
    .detail { color: #c3ced1; overflow-wrap: anywhere; }
    a { align-self: flex-start; margin-top: 4px; color: #f1f5f6; font-weight: 600; text-underline-offset: 3px; }
    a:focus-visible { outline: 2px solid #00b5ab; outline-offset: 2px; border-radius: 2px; }
    @keyframes enter { from { opacity: 0; transform: translateY(-6px); } }
    @media (prefers-reduced-motion: reduce) { .card { animation: none; } }
  `;

  const card = document.createElement("div");
  card.className = "card";
  card.dataset.tone = toast.tone;
  card.setAttribute("role", toast.tone === "error" ? "alert" : "status");

  const dot = document.createElement("span");
  dot.className = "dot";
  const text = document.createElement("div");
  text.className = "text";
  const title = document.createElement("span");
  title.className = "title";
  title.textContent = toast.title;
  text.append(title);
  if (toast.detail) {
    const detail = document.createElement("span");
    detail.className = "detail";
    detail.textContent = toast.detail;
    text.append(detail);
  }
  if (toast.link) {
    const link = document.createElement("a");
    link.href = toast.link.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = toast.link.label;
    text.append(link);
  }
  card.append(dot, text);
  shadow.append(style, card);
  document.documentElement.append(host);

  // Um erro fica mais tempo: a pessoa precisa ler o que fazer.
  let timer = setTimeout(() => host.remove(), toast.tone === "error" ? 9000 : 5000);
  card.addEventListener("mouseenter", () => clearTimeout(timer));
  card.addEventListener("mouseleave", () => {
    timer = setTimeout(() => host.remove(), 2000);
  });
}
