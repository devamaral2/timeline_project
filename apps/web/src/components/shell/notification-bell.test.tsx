import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { NotificationSource } from "@/lib/notifications/due-notifications";
import { NotificationBell } from "./notification-bell";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const minutes = (value: number) => value * 60_000;

const sources: NotificationSource[] = [
  {
    kind: "event",
    id: "run",
    name: "Corrida",
    startedAt: new Date(NOW.getTime() + minutes(30)).toISOString(),
    notifyOffsetsMinutes: [60], // venceu ha 30 minutos
  },
  {
    kind: "task",
    id: "report",
    name: "Entregar relatório",
    startedAt: new Date(NOW.getTime() + minutes(120)).toISOString(),
    notifyOffsetsMinutes: [15], // vence em 105 minutos
  },
];

vi.mock("@/lib/events/use-now", () => ({ useNow: () => NOW }));
vi.mock("@/lib/notifications/load-notification-sources", () => ({
  loadNotificationSources: vi.fn(async () => sources),
}));

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => Array.from(data.keys())[index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  Object.defineProperty(window, "localStorage", { value: globalThis.localStorage, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("shows an unread badge and lists recent and upcoming notifications", async () => {
  render(<NotificationBell userId="user-1" />);

  const bell = await screen.findByRole("button", { name: "Notificações, 1 não lidas" });
  fireEvent.click(bell);

  const panel = within(screen.getByRole("region", { name: "Notificações" }));
  expect(panel.getByRole("heading", { name: "Recentes" })).toBeTruthy();
  expect(panel.getByRole("link", { name: /Corrida/ }).getAttribute("href")).toBe("/user-1/eventos/run");
  expect(panel.getByRole("heading", { name: "Próximos" })).toBeTruthy();
  expect(panel.getByText("Entregar relatório")).toBeTruthy();

  // O aviso venceu ha 30 minutos e o evento nao comecou: tambem vira toast.
  expect(screen.getByRole("status").textContent).toContain("Corrida — 60 minutos antes");
});

test("marking as read clears the badge and survives a remount", async () => {
  const { unmount } = render(<NotificationBell userId="user-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Notificações, 1 não lidas" }));
  fireEvent.click(screen.getByRole("button", { name: "Marcar como lidas" }));

  await waitFor(() => expect(screen.getByRole("button", { name: "Notificações" })).toBeTruthy());

  unmount();
  render(<NotificationBell userId="user-1" />);
  expect(await screen.findByRole("button", { name: "Notificações" })).toBeTruthy();
});
