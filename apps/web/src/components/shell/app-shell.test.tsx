import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
import { requestHubOpen } from "@/components/hub/hub-open";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/mockups/eventos",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/lib/session/use-session", () => ({
  signOut: vi.fn(),
  useCurrentUser: () => null,
}));
// O chat tem os proprios testes; aqui so interessa quem abre e fecha o painel.
vi.mock("@/components/hub/agent-chat-panel", () => ({
  AgentChatPanel: ({ listenOnOpen, onCommand }: { listenOnOpen?: boolean; onCommand?: (command: string, argument: string) => void }) => (
    <div>
      <textarea aria-label="Mensagem para a IA" data-listen={String(Boolean(listenOnOpen))} />
      <button type="button" onClick={() => onCommand?.("search", "")}>comando buscar</button>
    </div>
  ),
  agentEntityHref: () => "#",
  useAgendaChat: () => ({ chat: { ready: true, startNewConversation: () => {} }, signedOut: true }),
}));

beforeAll(() => {
  // O jsdom nem sempre traz o <dialog> modal: o que o painel precisa dele e so
  // do atributo `open` e do evento `close`.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
});

afterEach(cleanup);

/** O campo do cabecalho, e nao o botao da barra inferior, que tem o mesmo nome. */
function headerTrigger(): HTMLElement {
  const trigger = screen.getAllByRole("button", { name: "Buscar e criar" }).find((button) => button.hasAttribute("aria-keyshortcuts"));
  if (!trigger) throw new Error("header hub trigger not found");
  return trigger;
}

// A barra inferior tem o botão do Hermes, que controla o painel do chat. Há outros diálogos (o menu de modos),
// então o painel é achado por esse vínculo, e não pelo papel "dialog".
const hubDialog = () => {
  const controller = screen.getAllByRole("button", { hidden: true, name: /Buscar e criar|Fechar chat com IA/ }).find((button) => button.hasAttribute("aria-controls"));
  const dialog = controller ? document.getElementById(controller.getAttribute("aria-controls") ?? "") : null;
  if (!(dialog instanceof HTMLDialogElement)) throw new Error("hub dialog not found");
  return dialog;
};

test("the header field opens the Buscar e criar panel and reports it as expanded", async () => {
  render(<AppShell>conteúdo</AppShell>);
  expect(headerTrigger().getAttribute("aria-expanded")).toBe("false");

  fireEvent.click(headerTrigger());

  expect(hubDialog().hasAttribute("open")).toBe(true);
  await waitFor(() => expect(headerTrigger().getAttribute("aria-expanded")).toBe("true"));
});

test("Ctrl+K and ⌘K toggle the panel from anywhere on the page", async () => {
  render(<AppShell>conteúdo</AppShell>);

  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(hubDialog().hasAttribute("open")).toBe(true);
  await waitFor(() => expect(headerTrigger().getAttribute("aria-expanded")).toBe("true"));

  fireEvent.keyDown(window, { key: "K", metaKey: true });
  expect(hubDialog().hasAttribute("open")).toBe(false);
  await waitFor(() => expect(headerTrigger().getAttribute("aria-expanded")).toBe("false"));
});

test("a plain K, or K with another modifier, is left to the page", () => {
  render(<AppShell>conteúdo</AppShell>);

  fireEvent.keyDown(window, { key: "k" });
  fireEvent.keyDown(window, { key: "k", ctrlKey: true, shiftKey: true });

  expect(hubDialog().hasAttribute("open")).toBe(false);
});

const chatField = () => screen.getByRole("textbox", { name: "Mensagem para a IA", hidden: true });

test("opening the chat puts the cursor on the field and asks it to listen; coming back from a command does not", () => {
  render(<AppShell>conteúdo</AppShell>);

  fireEvent.click(headerTrigger());
  expect(chatField()).toHaveFocus();
  expect(chatField().dataset.listen).toBe("true");

  fireEvent.click(screen.getByRole("button", { name: "comando buscar", hidden: true }));
  fireEvent.click(screen.getByRole("button", { name: "Voltar para o chat", hidden: true }));
  expect(chatField().dataset.listen).toBe("false");
});

test("a free window from the agenda opens the chat listening too", () => {
  render(<AppShell>conteúdo</AppShell>);

  act(() => requestHubOpen({ freeWindow: { dayKey: "2026-09-14", startMs: 0, endMs: 3_600_000, minutes: 60, endsAtMidnight: false } }));

  expect(hubDialog().hasAttribute("open")).toBe(true);
  expect(chatField()).toHaveFocus();
  expect(chatField().dataset.listen).toBe("true");
});

test("closing the chat ends the listening request: the next opening asks again", async () => {
  render(<AppShell>conteúdo</AppShell>);

  fireEvent.click(headerTrigger());
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  expect(hubDialog().hasAttribute("open")).toBe(false);

  fireEvent.click(headerTrigger());
  expect(chatField().dataset.listen).toBe("true");
});
