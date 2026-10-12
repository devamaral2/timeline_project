import { render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

const session = vi.hoisted(() => ({ value: { user: null as { id: string } | null, ready: false } }));

vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => session.value,
}));
vi.mock("@/lib/api/authed-fetch", () => ({
  authedFetch: async () => ({ items: [], nextCursor: undefined }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const { AgendaPreview } = await import("./agenda-preview");

const clientWidth = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);

afterEach(() => {
  session.value = { user: null, ready: false };
  clientWidth.mockReturnValue(400);
});

test("opens the carousel on today even when the session finishes loading after the first render", () => {
  const todayKey = "2026-10-14"; // quarta: 4º dia da semana de domingo a sábado
  session.value = { user: null, ready: false };
  const { rerender } = render(<AgendaPreview userId="u1" todayKey={todayKey} />);
  expect(screen.getByText("Carregando sua sessão…")).toBeInTheDocument();

  session.value = { user: { id: "u1" }, ready: true };
  rerender(<AgendaPreview userId="u1" todayKey={todayKey} />);

  const strip = screen.getByLabelText("Agenda com dias na horizontal");
  expect(strip.scrollLeft).toBe(3 * 400);
});
