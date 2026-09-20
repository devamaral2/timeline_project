import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { TimelineHeader } from "./TimelineHeader";

const { useCurrentUser } = vi.hoisted(() => ({ useCurrentUser: vi.fn() }));

vi.mock("@/lib/session/use-session", () => ({ useCurrentUser }));
vi.mock("@/components/brand/Logo", () => ({
  Logo: () => <span>Logo</span>,
  Wordmark: () => <span>Timeline</span>,
}));
vi.mock("@/components/events/DateNavigator", () => ({
  DateNavigator: () => <span>Hoje</span>,
}));
vi.mock("@/components/events/WeekStrip", () => ({
  WeekStrip: () => <span>Semana</span>,
}));
vi.mock("@/components/events/VoiceEventButton", () => ({
  VoiceEventButton: () => <button type="button">Voz</button>,
}));
vi.mock("@/components/auth/SessionButton", () => ({
  SessionButton: () => <button type="button">Conta</button>,
}));

beforeEach(() => useCurrentUser.mockReturnValue({ userId: "user-1", name: "Ana", email: null }));

test("keeps the voice action available in the narrow header", () => {
  render(
    <TimelineHeader
      userId="user-1"
      selectedDayKey="2026-08-27"
      todayKey="2026-08-27"
      onSelectDay={vi.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "Voz" }).parentElement).not.toHaveClass("hidden");
});
