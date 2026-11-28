import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => ({ user: null, ready: true }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const { AgendaScreen } = await import("./agenda-screen");
const { SectionMenu } = await import("@/components/shell/section-menu");

/** A agenda com o menu da barra inferior aberto: o modo e o tempo livre moram na engrenagem dele. */
function renderWithMenu() {
  render(
    <>
      <AgendaScreen />
      <SectionMenu id="menu-agenda" section="agenda" title="Agenda" open onClose={() => {}} />
    </>,
  );
}
const menu = () => within(screen.getByRole("region", { name: "Opções de agenda" }));
function openSettings() {
  fireEvent.click(menu().getByRole("button", { name: "Configurar agenda" }));
}

const dayCount = () => document.querySelectorAll("[data-agenda-day]").length;

test("the list never offers the old load-more buttons", () => {
  render(<AgendaScreen />);
  fireEvent.wheel(window, { deltaY: 40 });
  fireEvent.wheel(window, { deltaY: -40 });

  expect(screen.queryByRole("button", { name: /ver tarefas/i })).not.toBeInTheDocument();
});

function chooseMode(name: string) {
  fireEvent.click(menu().getByRole("button", { name }));
}

test("day mode keeps the week selector, with today's date as the title", () => {
  render(<AgendaScreen />);
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(document.querySelector('button[aria-current="date"]')).not.toBeNull();
  expect(document.querySelector('[data-agenda-day] h2')).toBeNull();
});

test("the sequence mode hides the week and extends at the edge", () => {
  renderWithMenu();
  openSettings();
  const initialCount = dayCount();
  fireEvent.wheel(window, { deltaY: 40 });
  expect(dayCount()).toBe(initialCount);

  chooseMode("Em sequência");
  expect(menu().getByRole("button", { name: "Em sequência" })).toHaveAttribute("aria-pressed", "true");
  expect(document.querySelector('button[aria-current="date"]')).toBeNull();
  expect(document.querySelector('[data-agenda-day] h2')).not.toBeNull();
  const initialInfiniteCount = dayCount();
  vi.useFakeTimers();
  try {
    vi.advanceTimersByTime(1000);
    act(() => { fireEvent.wheel(window, { deltaY: 40 }); });
    expect(dayCount()).toBeGreaterThan(initialInfiniteCount);
  } finally {
    vi.useRealTimers();
  }

  chooseMode("Por dia");
  expect(document.querySelector('button[aria-current="date"]')).not.toBeNull();
  expect(document.querySelector('[data-agenda-day] h2')).toBeNull();
  expect(dayCount()).toBe(initialCount);
});

test("the Tempo livre switch turns the free windows on, off by default, and remembers it", () => {
  const stored = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); } },
  });
  renderWithMenu();
  expect(document.querySelectorAll("[data-free-time]")).toHaveLength(0);

  openSettings();
  fireEvent.click(menu().getByRole("switch", { name: /Tempo livre/ }));

  expect(document.querySelectorAll("[data-free-time]").length).toBeGreaterThan(0);
  expect(stored.get("braid-agenda-free-time")).toBe("on");
  stored.clear();
});

test("the month card moves between months and jumps back to today", () => {
  render(<AgendaScreen />);
  fireEvent.click(screen.getByRole("button", { name: /^setembro/i }));
  fireEvent.click(screen.getByRole("button", { name: "Próximo mês" }));
  expect(screen.getByRole("button", { name: /^outubro 2026/i })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
  expect(screen.queryByRole("button", { name: "Próximo mês" })).not.toBeInTheDocument();
  expect(document.querySelector('button[aria-current="date"]')).toHaveAccessibleName(/14 de setembro.*hoje/i);
});
