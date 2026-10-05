import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => ({ user: null, ready: true }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const { AgendaPreview } = await import("./agenda-preview");

const dayCount = () => document.querySelectorAll("[data-agenda-day]").length;

test("the list never offers the old load-more buttons", () => {
  render(<AgendaPreview />);
  fireEvent.wheel(window, { deltaY: 40 });
  fireEvent.wheel(window, { deltaY: -40 });

  expect(screen.queryByRole("button", { name: /ver eventos/i })).not.toBeInTheDocument();
});

function chooseMode(name: RegExp) {
  fireEvent.click(screen.getByLabelText("Opções de visualização"));
  fireEvent.click(screen.getByRole("button", { name }));
}

test("day mode shows the week selector without repeated day headings", () => {
  render(<AgendaPreview />);
  expect(screen.queryByRole("button", { name: "Rolagem infinita" })).not.toBeInTheDocument();
  expect(document.querySelector('button[aria-current="date"]')).not.toBeNull();
  expect(document.querySelector('[data-agenda-day] h2')).toBeNull();
});

test("infinite mode lives in view options, hides the week and extends at the edge", () => {
  render(<AgendaPreview />);
  const initialCount = dayCount();
  fireEvent.wheel(window, { deltaY: 40 });
  expect(dayCount()).toBe(initialCount);

  chooseMode(/^Lista infinita/);
  expect(document.querySelector('button[aria-current="date"]')).toBeNull();
  expect(document.querySelector('[data-agenda-day] h2')).not.toBeNull();
  expect(screen.getByLabelText("Opções de visualização").closest("details")).not.toHaveAttribute("open");
  const initialInfiniteCount = dayCount();
  vi.useFakeTimers();
  try {
    vi.advanceTimersByTime(1000);
    act(() => { fireEvent.wheel(window, { deltaY: 40 }); });
    expect(dayCount()).toBeGreaterThan(initialInfiniteCount);
  } finally {
    vi.useRealTimers();
  }

  chooseMode(/^Lista por dia/);
  expect(document.querySelector('button[aria-current="date"]')).not.toBeNull();
  expect(document.querySelector('[data-agenda-day] h2')).toBeNull();
  expect(dayCount()).toBe(initialCount);
});
