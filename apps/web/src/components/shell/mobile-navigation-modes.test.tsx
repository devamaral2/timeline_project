import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Hash } from "lucide-react";
import { afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { type SectionMenuModel, usePublishSectionMenu } from "@/lib/navigation/section-menu";
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
// O chat tem os próprios testes; aqui só interessa a barra e o menu de opções.
vi.mock("@/components/hub/agent-chat-panel", () => ({
  AgentChatPanel: () => null,
  agentEntityHref: () => "#",
  useAgendaChat: () => ({ chat: { startNewConversation: () => {} }, signedOut: true }),
}));

beforeAll(() => {
  // O jsdom não traz o showModal do painel do chat.
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
const menu = (section: string) => bar().querySelector(`section[aria-label="Opções de ${section}"]`) as HTMLElement;
const menuOpen = (section: string) => menu(section).hasAttribute("data-open");
const list = (section: string, name: RegExp | string) => within(menu(section)).getByRole("button", { name, hidden: true });

/** Uma tela de mentira que publica o menu dela, como as telas de verdade fazem. */
function Screen({ section, model }: { section: "tasks" | "agenda" | "notes"; model: SectionMenuModel }) {
  usePublishSectionMenu(section, model);
  return null;
}

test("a barra não mostra os nomes das telas: só os ícones, com o nome no rótulo acessível", () => {
  render(<MobileNavigation userId="user-1" />);

  for (const name of ["Tarefas", "Agenda", "Notas"]) {
    expect(tab(name)).toBeInTheDocument();
    expect(tab(name)).not.toHaveTextContent(name);
  }
  expect(tab("Agenda")).toHaveAttribute("aria-current", "page");
});

test("tocar na aba Agenda, já selecionada, abre o menu de opções e não navega; tocar de novo fecha", () => {
  render(<MobileNavigation userId="user-1" />);

  fireEvent.click(tab("Agenda"));

  expect(menuOpen("agenda")).toBe(true);
  expect(tab("Agenda")).toHaveAttribute("aria-expanded", "true");
  expect(nav.push).not.toHaveBeenCalled();
  expect(within(menu("agenda")).getByRole("heading", { name: "Agenda", hidden: true })).toBeInTheDocument();

  fireEvent.click(tab("Agenda"));
  expect(menuOpen("agenda")).toBe(false);
});

test("tocar numa aba não selecionada só navega", () => {
  nav.pathname = "/user-1/tarefas";
  render(<MobileNavigation userId="user-1" />);

  fireEvent.click(tab("Agenda"));

  expect(menuOpen("tarefas")).toBe(false);
});

test("Agenda e Tarefas abrem com as listas de quem, e a do modo em uso fica marcada", () => {
  window.localStorage.setItem("braid-view-mode", "agent");
  nav.pathname = "/user-1/tarefas";
  render(<MobileNavigation userId="user-1" />);

  fireEvent.click(tab("Tarefas"));

  expect(list("tarefas", /^Todos/)).toHaveAttribute("aria-pressed", "false");
  expect(list("tarefas", /^Você/)).toHaveAttribute("aria-pressed", "false");
  expect(list("tarefas", /^Agentes/)).toHaveAttribute("aria-pressed", "true");
});

test("escolher uma lista de quem grava o modo e fecha o menu", () => {
  vi.useFakeTimers();
  render(<MobileNavigation userId="user-1" />);
  fireEvent.click(tab("Agenda"));

  fireEvent.click(list("agenda", /^Agentes/));
  act(() => { vi.runAllTimers(); });
  vi.useRealTimers();

  expect(window.localStorage.getItem("braid-view-mode")).toBe("agent");
  expect(menuOpen("agenda")).toBe(false);
  expect(bar()).toHaveAttribute("data-list-mode", "agent");
});

test("Notas abre o mesmo menu: as listas de quem, mais as listas e a busca que a tela publica", () => {
  nav.pathname = "/user-1/notas";
  const onPick = vi.fn();
  const onChange = vi.fn();
  render(<>
    <Screen section="notes" model={{ count: 7, lists: [{ id: "tag:saude", name: "saude", desc: "#saude", Icon: Hash, count: 3, selected: false, onPick }], search: { label: "Buscar nas notas", value: "", onChange }, filtered: false }} />
    <MobileNavigation userId="user-1" />
  </>);

  fireEvent.click(tab("Notas"));

  expect(menuOpen("notas")).toBe(true);
  expect(list("notas", /^Todos/)).toHaveAttribute("aria-pressed", "true");
  expect(list("notas", /^Você/)).toBeInTheDocument();
  expect(list("notas", /^Agentes/)).toBeInTheDocument();
  fireEvent.click(list("notas", /saude/));
  expect(onPick).toHaveBeenCalledTimes(1);
  fireEvent.change(within(menu("notas")).getByRole("searchbox", { name: "Buscar nas notas", hidden: true }), { target: { value: "bowl" } });
  expect(onChange).toHaveBeenCalledWith("bowl");
});

test("a engrenagem troca as listas pela configuração da tela", () => {
  const onToggle = vi.fn();
  render(<>
    <Screen section="agenda" model={{ lists: [], settings: [{ kind: "switch", label: "Tempo livre", on: true, onToggle }], filtered: false }} />
    <MobileNavigation userId="user-1" />
  </>);
  fireEvent.click(tab("Agenda"));

  fireEvent.click(within(menu("agenda")).getByRole("button", { name: "Configurar agenda", hidden: true }));
  fireEvent.click(within(menu("agenda")).getByRole("switch", { name: /Tempo livre/, hidden: true }));

  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(within(menu("agenda")).queryByRole("button", { name: /^Agentes/, hidden: true })).toBeNull();
});

test("com filtro ativo na tela, a aba selecionada ganha o ponto", () => {
  nav.pathname = "/user-1/notas";
  render(<>
    <Screen section="notes" model={{ lists: [], filtered: true }} />
    <MobileNavigation userId="user-1" />
  </>);

  expect(tab("Notas").querySelector("[data-on]")).not.toBeNull();
  expect(tab("Agenda").querySelector("[data-on]")).toBeNull();
});

test("Esc fecha o menu sem mudar o modo e devolve o foco à aba", () => {
  window.localStorage.setItem("braid-view-mode", "human");
  render(<MobileNavigation userId="user-1" />);
  fireEvent.click(tab("Agenda"));

  fireEvent.keyDown(list("agenda", /^Você/), { key: "Escape" });

  expect(menuOpen("agenda")).toBe(false);
  expect(window.localStorage.getItem("braid-view-mode")).toBe("human");
  expect(tab("Agenda")).toHaveFocus();
});

test("tocar fora do menu fecha sem mudar o modo", () => {
  window.localStorage.setItem("braid-view-mode", "human");
  render(<MobileNavigation userId="user-1" />);
  fireEvent.click(tab("Agenda"));

  fireEvent.click(screen.getByRole("button", { name: "Fechar menu", hidden: true }));

  expect(menuOpen("agenda")).toBe(false);
  expect(window.localStorage.getItem("braid-view-mode")).toBe("human");
});
