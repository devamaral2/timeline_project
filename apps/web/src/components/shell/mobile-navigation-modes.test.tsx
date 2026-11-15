import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
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
// O chat tem os próprios testes; aqui só interessa a barra e o menu de modos.
vi.mock("@/components/hub/agent-chat-panel", () => ({
  AgentChatPanel: () => null,
  agentEntityHref: () => "#",
  useAgendaChat: () => ({ chat: { startNewConversation: () => {} }, signedOut: true }),
}));

beforeAll(() => {
  // O jsdom não traz o showModal: o menu precisa do atributo `open` e do evento `close`.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

beforeEach(() => {
  nav.pathname = "/user-1";
  nav.push.mockClear();
  window.localStorage.clear();
});

afterEach(cleanup);

const bar = () => screen.getByRole("navigation", { name: "Navegação inferior" });
const tab = (name: string) => within(bar()).getByRole("link", { name, hidden: true });
const menuDialog = () => screen.getByRole("menu", { hidden: true }).closest("dialog") as HTMLDialogElement;
const menuOpen = () => menuDialog().hasAttribute("open");
const option = (name: string) => within(menuDialog()).getByRole("menuitemradio", { name, hidden: true });

test("tocar na aba Agenda, já selecionada, abre o menu de modos e não navega", () => {
  render(<MobileNavigation userId="user-1" />);

  fireEvent.click(tab("Agenda"));

  expect(menuOpen()).toBe(true);
  expect(nav.push).not.toHaveBeenCalled();
  expect(within(menuDialog()).getAllByRole("menuitemradio", { hidden: true })).toHaveLength(3);
});

test("tocar na aba Tarefas, já selecionada, abre o menu; tocar numa aba não selecionada só navega", () => {
  nav.pathname = "/user-1/tarefas";
  render(<MobileNavigation userId="user-1" />);

  fireEvent.click(tab("Tarefas"));
  expect(menuOpen()).toBe(true);

  cleanup();
  nav.pathname = "/user-1";
  render(<MobileNavigation userId="user-1" />);
  fireEvent.click(tab("Tarefas"));
  expect(menuOpen()).toBe(false);
  expect(tab("Tarefas")).toHaveAttribute("href", "/user-1/tarefas");
});

test("a aba Notas não abre o menu de modos", () => {
  nav.pathname = "/user-1/notas";
  render(<MobileNavigation userId="user-1" />);

  fireEvent.click(tab("Notas"));

  expect(screen.queryByRole("menu", { hidden: true })).not.toBeNull();
  expect(menuOpen()).toBe(false);
});

test("cada modo mostra o nome e o símbolo de quem está nele, e o modo em uso fica marcado", () => {
  window.localStorage.setItem("braid-view-mode", "agent");
  render(<MobileNavigation userId="user-1" />);

  fireEvent.click(tab("Agenda"));

  expect(option("Todos os seus eventos")).toHaveAttribute("aria-checked", "false");
  expect(option("Todos os eventos de agentes")).toHaveAttribute("aria-checked", "true");
  expect(option("Todos os eventos")).toHaveAttribute("aria-checked", "false");
});

test("escolher um modo grava a escolha e fecha o menu", () => {
  render(<MobileNavigation userId="user-1" />);
  fireEvent.click(tab("Agenda"));

  fireEvent.click(option("Todos os eventos de agentes"));

  expect(window.localStorage.getItem("braid-view-mode")).toBe("agent");
  expect(menuOpen()).toBe(false);
  expect(nav.push).not.toHaveBeenCalled();

  fireEvent.click(tab("Agenda"));
  expect(option("Todos os eventos de agentes")).toHaveAttribute("aria-checked", "true");
});

test("Esc fecha o menu sem mudar o modo", () => {
  window.localStorage.setItem("braid-view-mode", "human");
  render(<MobileNavigation userId="user-1" />);
  fireEvent.click(tab("Agenda"));

  fireEvent.keyDown(option("Todos os seus eventos"), { key: "Escape" });

  expect(menuOpen()).toBe(false);
  expect(window.localStorage.getItem("braid-view-mode")).toBe("human");
});

test("tocar fora do menu fecha sem mudar o modo", () => {
  window.localStorage.setItem("braid-view-mode", "human");
  render(<MobileNavigation userId="user-1" />);
  fireEvent.click(tab("Agenda"));
  const dialog = menuDialog();
  dialog.getBoundingClientRect = () => ({ left: 16, right: 375, top: 420, bottom: 700, width: 359, height: 280, x: 16, y: 420, toJSON: () => ({}) }) as DOMRect;

  // O jsdom não tem PointerEvent com coordenadas: o `pointerdown` vai como MouseEvent, que leva clientX/clientY.
  fireEvent(dialog, new MouseEvent("pointerdown", { bubbles: true, clientX: 4, clientY: 4 }));

  expect(menuOpen()).toBe(false);
  expect(window.localStorage.getItem("braid-view-mode")).toBe("human");
});

test("ao fechar, o foco volta para a aba que abriu o menu", () => {
  render(<MobileNavigation userId="user-1" />);
  fireEvent.click(tab("Agenda"));

  fireEvent.keyDown(option("Todos os eventos"), { key: "Escape" });

  expect(tab("Agenda")).toHaveFocus();
});

test("as setas movem o foco entre os modos", () => {
  window.localStorage.setItem("braid-view-mode", "human");
  render(<MobileNavigation userId="user-1" />);
  fireEvent.click(tab("Agenda"));
  option("Todos os seus eventos").focus();

  fireEvent.keyDown(option("Todos os seus eventos"), { key: "ArrowDown" });

  expect(option("Todos os eventos de agentes")).toHaveFocus();
});
