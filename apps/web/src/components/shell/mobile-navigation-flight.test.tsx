import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { FLIGHT_BACK_MS, FLIGHT_OUT_MS, type HermesDockDetail, hermesDockEvent } from "@/components/ui/hermes-flight";
import { MobileNavigation } from "./mobile-navigation";

const nav = vi.hoisted(() => ({ pathname: "/user-1", push: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/session/use-session", () => ({
  signOut: vi.fn(),
  useCurrentUser: () => null,
}));
// Do chat só interessam o ícone de status (de onde o voo parte) e a linha de um registro, que fecha o painel.
vi.mock("@/components/hub/agent-chat-panel", () => ({
  AgentChatPanel: ({ onClose }: { onClose: () => void }) => (
    <>
      <span data-hermes-mark />
      <button type="button" onClick={onClose}>Evento criado</button>
    </>
  ),
  agentEntityHref: () => "#",
  useAgendaChat: () => ({ chat: { startNewConversation: () => {} }, signedOut: true }),
}));

beforeAll(() => {
  // O jsdom não traz o painel do chat nem mede nada: aqui tudo tem tamanho, como no celular.
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.showModal = HTMLDialogElement.prototype.show;
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
  Element.prototype.getBoundingClientRect = () => ({ left: 10, top: 10, width: 40, height: 40, right: 50, bottom: 50, x: 10, y: 10, toJSON: () => ({}) });
  // Celular, com movimento permitido: o voo existe.
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  nav.pathname = "/user-1";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const panel = () => document.querySelector("dialog") as HTMLDialogElement;

test("abrir um registro pelo chat fecha o painel, mesmo com o detalhe chegando no meio do voo de volta", () => {
  const { rerender } = render(<MobileNavigation userId="user-1" />);
  fireEvent.click(screen.getByRole("button", { name: "Buscar e criar" }));
  act(() => { vi.advanceTimersByTime(FLIGHT_OUT_MS); });
  expect(panel().open).toBe(true);

  // Tocar na linha do registro: o painel começa a fechar e a rota muda para o detalhe.
  fireEvent.click(screen.getByRole("button", { name: "Evento criado", hidden: true }));
  nav.pathname = "/user-1/eventos/evento-1";
  rerender(<MobileNavigation userId="user-1" />);
  // O campo do Hermes do detalhe avisa que chegou, antes de o voo de volta terminar.
  const dock = document.createElement("div");
  document.body.append(dock);
  act(() => { window.dispatchEvent(new CustomEvent<HermesDockDetail>(hermesDockEvent, { detail: { dock } })); });
  act(() => { vi.advanceTimersByTime(FLIGHT_BACK_MS + FLIGHT_OUT_MS); });
  dock.remove();

  expect(panel().open).toBe(false);
  expect(screen.queryByRole("button", { name: "Evento criado", hidden: true })).not.toBeInTheDocument();
});
