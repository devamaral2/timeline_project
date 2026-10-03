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

test("the infinite scroll switch sits next to Hoje and starts off", () => {
  render(<AgendaPreview />);

  const toggle = screen.getByRole("button", { name: "Rolagem infinita" });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(toggle.nextElementSibling).toBe(screen.getByRole("button", { name: "Hoje" }));
  expect(dayCount()).toBe(1);
});

test("reaching an edge only loads more days while the infinite scroll is on", () => {
  render(<AgendaPreview />);

  act(() => { fireEvent.wheel(window, { deltaY: 40 }); });
  expect(dayCount()).toBe(1);

  const toggle = screen.getByRole("button", { name: "Rolagem infinita" });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  const afterTurningOn = dayCount();
  expect(afterTurningOn).toBeGreaterThan(1);

  vi.useFakeTimers();
  try {
    vi.advanceTimersByTime(1000);
    act(() => { fireEvent.wheel(window, { deltaY: 40 }); });
    expect(dayCount()).toBeGreaterThan(afterTurningOn);
  } finally {
    vi.useRealTimers();
  }

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(dayCount()).toBe(1);
});

test("the switch is not offered in the one-day-at-a-time view", () => {
  render(<AgendaPreview />);

  fireEvent.click(screen.getByRole("button", { name: /^Dia/ }));

  expect(screen.queryByRole("button", { name: "Rolagem infinita" })).not.toBeInTheDocument();
});
