import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";
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
  AgentChatPanel: () => <p>chat</p>,
  agentEntityHref: () => "#",
  useAgendaChat: () => ({ chat: {}, signedOut: true }),
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

const hubDialog = () => screen.getByRole("dialog", { hidden: true });

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
