import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => ({ user: null, ready: true }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const { AgendaScreen, daySummary } = await import("./agenda-screen");

const dayCount = () => document.querySelectorAll("[data-agenda-day]").length;

test("the list never offers the old load-more buttons", () => {
  render(<AgendaScreen />);
  fireEvent.wheel(window, { deltaY: 40 });
  fireEvent.wheel(window, { deltaY: -40 });

  expect(screen.queryByRole("button", { name: /ver eventos/i })).not.toBeInTheDocument();
});

function chooseMode(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

test("day mode shows the date, the week selector and the day summary, without repeated day headings", () => {
  render(<AgendaScreen />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/segunda-feira, 14 de setembro/i);
  expect(document.querySelector('button[aria-current="date"]')).not.toBeNull();
  expect(document.querySelector('[data-agenda-day] h2')).toBeNull();
  expect(screen.getByText("5 eventos · 3 h 50 planejadas")).toBeInTheDocument();
});

test("the sequence mode hides the week and extends at the edge", () => {
  render(<AgendaScreen />);
  const initialCount = dayCount();
  fireEvent.wheel(window, { deltaY: 40 });
  expect(dayCount()).toBe(initialCount);

  chooseMode("Em sequência");
  expect(screen.getByRole("button", { name: "Em sequência" })).toHaveAttribute("aria-pressed", "true");
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

test("the view options switch turns the free windows off and remembers it", () => {
  const stored = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); } },
  });
  render(<AgendaScreen />);
  expect(document.querySelectorAll("[data-free-time]").length).toBeGreaterThan(0);

  fireEvent.click(screen.getAllByRole("button", { name: "Opções de visualização" })[0]);
  fireEvent.click(screen.getByRole("switch", { name: /Tempo livre/ }));

  expect(document.querySelectorAll("[data-free-time]")).toHaveLength(0);
  expect(stored.get("braid-agenda-free-time")).toBe("off");
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

test("the day summary adds up the planned time", () => {
  const event = (minutes: number) => ({ name: "x", type: "routine", time: "", minutes, duration: "" });
  expect(daySummary([])).toBe("Nenhum evento");
  expect(daySummary([event(45)])).toBe("1 evento · 45 min planejados");
  expect(daySummary([event(60)])).toBe("1 evento · 1 h planejada");
  expect(daySummary([event(60), event(65)])).toBe("2 eventos · 2 h 05 planejadas");
});
