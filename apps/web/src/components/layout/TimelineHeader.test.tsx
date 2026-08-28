import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { TimelineHeader } from "./TimelineHeader";

const { useCurrentUser } = vi.hoisted(() => ({ useCurrentUser: vi.fn() }));

vi.mock("@/lib/firebase/use-current-user", () => ({ useCurrentUser }));
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
vi.mock("@/components/events/NewEventButton", () => ({
  NewEventButton: () => <button type="button">Novo</button>,
}));
vi.mock("@/components/auth/GoogleSignInButton", () => ({
  GoogleSignInButton: () => <button type="button">Conta</button>,
}));

beforeEach(() => useCurrentUser.mockReturnValue({ uid: "user-1" }));

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
