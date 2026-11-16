import { render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { createFakeApi } from "@/test/fake-api";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";
import { writeViewMode } from "@/lib/tasks/view-mode";

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));
vi.mock("@/lib/session/use-session", () => ({
  useSessionState: () => ({ user: { userId: "user-1" }, ready: true }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

const { AgendaScreen } = await import("./agenda-screen");

const TODAY = "2026-09-14";

const tasks: TaskDto[] = [
  taskFixture({ id: "ev-1", name: "Revisar proposta", kind: "common", status: "todo", startedAt: "2026-09-14T09:00:00-03:00", estimatedFinishAt: "2026-09-14T10:30:00-03:00" }),
  taskFixture({ id: "ev-3", name: "Pesquisar voos para novembro", actor: "agent", kind: "request", status: "running", startedAt: "2026-09-14T09:48:00-03:00" }),
];

function dayOf(dayKey: string): HTMLElement {
  const section = document.querySelector<HTMLElement>(`[data-agenda-day="${dayKey}"]`);
  if (!section) throw new Error(`Dia ${dayKey} não está na tela`);
  return section;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
  net.authedFetch.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

function serve() {
  const api = createFakeApi({ areas: [tasksArea], seed: { tasks: tasks } });
  net.authedFetch.mockImplementation(api.authedFetch);
  return api;
}

/** Os parâmetros da última leitura da agenda. */
function lastAgendaQuery(api: ReturnType<typeof serve>): Record<string, string> {
  const last = api.calls.filter((call) => call.pathname === "/api/tasks").at(-1);
  if (!last) throw new Error("A agenda não leu a API");
  return last.query;
}

test("sem escolha guardada, a agenda pede todas as tarefas, sem executor", async () => {
  const api = serve();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);

  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(2));
  expect(lastAgendaQuery(api)).not.toHaveProperty("actor");
});

test("o modo de agentes vai como executor agente e tira as tarefas de pessoa da agenda", async () => {
  writeViewMode("agent");
  const api = serve();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);

  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(1));
  expect(lastAgendaQuery(api)).toMatchObject({ actor: "agent" });
  expect(screen.queryByRole("link", { name: /Revisar proposta/ })).toBeNull();
  expect(within(dayOf(TODAY)).getByRole("link", { name: /Pesquisar voos/ })).toBeInTheDocument();
});

test("o modo de pessoa vai como executor humano", async () => {
  writeViewMode("human");
  const api = serve();
  render(<AgendaScreen userId="user-1" todayKey={TODAY} />);

  await waitFor(() => expect(within(dayOf(TODAY)).getAllByRole("link")).toHaveLength(1));
  expect(lastAgendaQuery(api)).toMatchObject({ actor: "human" });
  expect(screen.queryByRole("link", { name: /Pesquisar voos/ })).toBeNull();
});
