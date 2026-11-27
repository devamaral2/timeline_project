import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDto } from "@repo/contracts";
import { createFakeApi } from "@/test/fake-api";
import { taskFixture, tasksArea } from "@/test/fake-api/tasks";
import { writeViewMode } from "@/lib/tasks/view-mode";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/tasks/new-task-forms/TagInput", () => ({ TagInput: () => null }));

const net = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/api/authed-fetch", async (original) => ({
  ...(await original<typeof import("@/lib/api/authed-fetch")>()),
  authedFetch: net.authedFetch,
}));

const { TaskListScreen } = await import("./TaskListScreen");

const tasks: TaskDto[] = [
  taskFixture({ id: "luz", name: "Pagar conta de luz", status: "todo", startedAt: "2026-09-13T00:00:00-03:00" }),
  taskFixture({ id: "pesquisa", name: "Pesquisar voos", actor: "agent", kind: "request", status: "waiting" }),
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
  net.authedFetch.mockReset();
  push.mockReset();
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

/** Os parâmetros da última leitura da lista de tarefas. */
function lastTrackedQuery(api: ReturnType<typeof serve>): Record<string, string> {
  const calls = api.calls.filter((call) => call.pathname === "/api/tasks/tracked");
  const last = calls.at(-1);
  if (!last) throw new Error("A lista de tarefas não leu a API");
  return last.query;
}

test("sem escolha guardada, a lista pede todas as tarefas, sem executor", async () => {
  const api = serve();
  render(<TaskListScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Pesquisar voos/ });
  expect(lastTrackedQuery(api)).not.toHaveProperty("actor");
});

test("o modo de pessoa vai como executor humano e esconde as tarefas de agente", async () => {
  writeViewMode("human");
  const api = serve();
  render(<TaskListScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Pagar conta de luz/ });
  expect(lastTrackedQuery(api)).toMatchObject({ actor: "human" });
  expect(screen.queryByRole("link", { name: /Pesquisar voos/ })).toBeNull();
});

test("o modo de agentes vai como executor agente, guardado no navegador", async () => {
  writeViewMode("agent");
  const api = serve();
  render(<TaskListScreen userId="user-1" />);

  await screen.findByRole("link", { name: /Pesquisar voos/ });
  expect(lastTrackedQuery(api)).toMatchObject({ actor: "agent" });
  expect(screen.queryByRole("link", { name: /Pagar conta de luz/ })).toBeNull();
  expect(window.localStorage.getItem("braid-view-mode")).toBe("agent");
});

test("trocar o modo na mesma aba refaz a lista com o novo executor", async () => {
  const api = serve();
  render(<TaskListScreen userId="user-1" />);
  await screen.findByRole("link", { name: /Pagar conta de luz/ });

  act(() => writeViewMode("agent"));

  await screen.findByRole("link", { name: /Pesquisar voos/ });
  await waitFor(() => expect(lastTrackedQuery(api)).toMatchObject({ actor: "agent" }));
  expect(screen.queryByRole("link", { name: /Pagar conta de luz/ })).toBeNull();
});
