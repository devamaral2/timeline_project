import { flushSync } from "react-dom";

/**
 * O movimento entre telas e dentro das listas, sobre a View Transitions API:
 * o navegador fotografa a tela antes e depois de uma mudança e anima uma foto
 * contra a outra. As curvas e os tempos moram no `globals.css`
 * (`html[data-nav]`); aqui fica só quando ligar e o que marcar.
 *
 * Onde a API não existe (navegador antigo, testes) a mudança acontece na hora.
 */
export type NavKind = "next" | "prev" | "open" | "close";

type ViewTransitionHandle = { finished: Promise<void> };
type TransitionDocument = Document & { startViewTransition?: (update: () => void | Promise<void>) => ViewTransitionHandle };

/** Quanto se espera a tela nova chegar antes de soltar a foto da antiga. */
const NAV_TIMEOUT_MS = 800;
/**
 * O navegador só tira a foto da tela antiga no próximo quadro. Numa aba em
 * segundo plano esse quadro não vem; passado este tempo a mudança acontece
 * mesmo assim, sem a transição.
 */
const FRAME_TIMEOUT_MS = 300;
const ORIGIN_PROPERTIES = ["--nav-top", "--nav-right", "--nav-bottom", "--nav-left"] as const;

export function canTransition(): boolean {
  return typeof document !== "undefined" && typeof (document as TransitionDocument).startViewTransition === "function";
}

/** Falso para quem pediu menos movimento: sobra a troca de opacidade. */
export function motionAllowed(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function startViewTransition(update: () => void | Promise<void>): ViewTransitionHandle {
  // biome-ignore lint/style/noNonNullAssertion: quem chama já passou por `canTransition`.
  return (document as TransitionDocument).startViewTransition!(update);
}

/** Onde um caminho fica no app: a seção e quantos níveis abaixo da lista dela. */
function placeOf(pathname: string): { section: string; depth: number } {
  const parts = pathname.split("/").filter(Boolean);
  // "/mockups/eventos/…" é a prévia sem sessão; "/<userId>/…" é o app.
  const rest = parts[0] === "mockups" ? parts.slice(2) : parts.slice(1);
  const head = rest[0];
  if (head === "tarefas" || head === "notas") return { section: head, depth: rest.length - 1 };
  if (head === "eventos") return { section: "agenda", depth: rest.length - 1 };
  // Na prévia o evento mora logo abaixo da agenda ("/mockups/eventos/almoco").
  return { section: "agenda", depth: rest.length };
}

/** A ordem das seções na tela: a do cabeçalho no desktop e a da barra inferior no celular. */
const SECTION_ORDER = { desktop: ["agenda", "tarefas", "notas"], phone: ["tarefas", "agenda", "notas"] } as const;

/**
 * O sentido de uma navegação: para dentro de um registro (`open`), de volta
 * (`close`) ou para o lado, entre as seções (`next`, `prev`).
 */
export function navKind(from: string, to: string, phone = false): NavKind {
  const source = placeOf(from);
  const target = placeOf(to);
  if (target.depth > source.depth) return "open";
  if (target.depth < source.depth) return "close";
  const order: readonly string[] = phone ? SECTION_ORDER.phone : SECTION_ORDER.desktop;
  return order.indexOf(target.section) < order.indexOf(source.section) ? "prev" : "next";
}

/** O caminho de um destino, sem busca nem âncora. */
export function pathOf(href: string): string {
  return href.split(/[?#]/)[0] ?? href;
}

export function isPhone(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 720px)").matches;
}

let settle: (() => void) | null = null;
let navigationToken = 0;

/** A tela nova chegou: solta a transição que estava esperando por ela. */
export function navigationSettled() {
  settle?.();
}

/**
 * Navega dentro de uma transição. `origin` é de onde a tela nova cresce num
 * `open` — a linha tocada.
 */
export function startNavigationTransition(kind: NavKind, navigate: () => void, origin?: Element | null) {
  if (!canTransition()) {
    navigate();
    return;
  }
  const root = document.documentElement;
  const token = ++navigationToken;
  if (motionAllowed()) {
    root.dataset.nav = kind;
    const box = kind === "open" ? origin?.getBoundingClientRect() : null;
    if (box && box.width > 0 && box.height > 0) {
      const inset = (value: number) => `${Math.max(0, Math.round(value))}px`;
      root.style.setProperty("--nav-top", inset(box.top));
      root.style.setProperty("--nav-right", inset(window.innerWidth - box.right));
      root.style.setProperty("--nav-bottom", inset(window.innerHeight - box.bottom));
      root.style.setProperty("--nav-left", inset(box.left));
    }
  }
  let navigated = false;
  const go = () => {
    if (navigated) return false;
    navigated = true;
    navigate();
    return true;
  };
  const stalled = window.setTimeout(go, FRAME_TIMEOUT_MS);
  const transition = startViewTransition(() => new Promise<void>((resolve) => {
    window.clearTimeout(stalled);
    // A navegação já saiu sem esperar a foto: não há o que animar.
    if (!go()) {
      resolve();
      return;
    }
    const timer = window.setTimeout(done, NAV_TIMEOUT_MS);
    function done() {
      window.clearTimeout(timer);
      if (settle === done) settle = null;
      resolve();
    }
    settle = done;
  }));
  const clear = () => {
    if (token !== navigationToken) return;
    delete root.dataset.nav;
    for (const property of ORIGIN_PROPERTIES) root.style.removeProperty(property);
  };
  transition.finished.then(clear, clear);
}

/**
 * Muda uma lista deixando cada linha deslizar para o lugar novo: enquanto
 * dura, `scope` leva `data-reflow`, e é sob ele que o CSS dá um
 * `view-transition-name` a cada linha (`--vt`, ver `vtName`).
 */
export function reflow(scope: HTMLElement | null | undefined, update: () => void) {
  if (!scope || !canTransition() || !motionAllowed()) {
    update();
    return;
  }
  scope.dataset.reflow = "";
  let updated = false;
  const apply = () => {
    if (updated) return;
    updated = true;
    flushSync(update);
  };
  const stalled = window.setTimeout(apply, FRAME_TIMEOUT_MS);
  const transition = startViewTransition(() => {
    window.clearTimeout(stalled);
    apply();
  });
  const clear = () => { delete scope.dataset.reflow; };
  transition.finished.then(clear, clear);
}

/** Um nome de transição válido em CSS para a linha de um registro. */
export function vtName(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}
