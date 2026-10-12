import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskSummaryDto } from "@/lib/api/contracts";
import { summaryTask } from "./task-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const authedFetch = vi.fn();
vi.mock("@/lib/api/authed-fetch", () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock("@/components/events/new-event-forms/TagInput", () => ({ TagInput: () => null }));

const { TasksScreen } = await import("./TasksScreen");

const tasks: TaskSummaryDto[] = [
  summaryTask({ id: "luz", name: "Pagar conta de luz", priority: "urgent", tags: ["casa"], startedAt: "2026-09-13T00:00:00-03:00" }),
  summaryTask({ id: "dentista", name: "Marcar consulta no dentista", tags: ["saúde"], startedAt: "2026-09-17T00:00:00-03:00" }),
  summaryTask({ id: "apresentacao", name: "Preparar apresentação", priority: "high", dependsOnTaskIds: ["proposta"], startedAt: "2026-09-18T00:00:00-03:00" }),
  summaryTask({ id: "proposta", name: "Revisar proposta", status: "scheduled", startedAt: "2026-09-14T09:00:00-03:00" }),
  summaryTask({ id: "sub", name: "Ler a proposta", parentTaskId: "proposta", status: "done" }),
  summaryTask({ id: "fotos", name: "Organizar fotos da viagem", status: "toDefine", priority: "low" }),
  summaryTask({ id: "pneu", name: "Trocar o pneu", status: "inHold" }),
  summaryTask({ id: "feita", name: "Enviar relatório", status: "done" }),
  summaryTask({ id: "cancelada", name: "Renovar assinatura", status: "cancel" }),
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
  authedFetch.mockReset();
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

test("agrupa por status, conta abertas e atrasadas e deixa Concluídas e Canceladas recolhidas", async () => {
  authedFetch.mockResolvedValue(tasks);
  render(<TasksScreen userId="user-1" />);

  await screen.findByText("6 abertas");
  expect(screen.getByText("1 atrasada")).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
    "A fazer3",
    "Agendadas1",
    "A definir1",
    "Em espera1",
    "Concluídas1",
    "Canceladas1",
  ]);

  const todo = screen.getByRole("region", { name: /A fazer/ });
  expect(within(todo).getByRole("link", { name: "Pagar conta de luz" })).toHaveAttribute("href", "/user-1/tarefas/luz");
  expect(within(todo).getAllByText("Venceu ontem").length).toBeGreaterThan(0);

  // A subtarefa vive dentro da tarefa: aparece como 1/1 no pai, nao como linha.
  expect(screen.queryByRole("link", { name: "Ler a proposta" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "1 de 1 subtarefas feitas" })).toBeInTheDocument();
  expect(screen.getByText("Aguarda 1 tarefa")).toBeInTheDocument();

  expect(screen.queryByRole("link", { name: "Enviar relatório" })).not.toBeInTheDocument();
  const closed = screen.getByRole("button", { name: /Concluídas/ });
  expect(closed).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(closed);
  expect(closed).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: "Enviar relatório" })).toBeInTheDocument();
});

test("o círculo conclui a tarefa com a revisão da lista", async () => {
  authedFetch.mockImplementation((_path: string, init?: RequestInit) =>
    init?.method === "PATCH" ? Promise.resolve(undefined) : Promise.resolve([summaryTask({ id: "luz", revision: 4 })]),
  );
  render(<TasksScreen userId="user-1" />);

  fireEvent.click(await screen.findByRole("button", { name: /Toque para concluir “Pagar conta de luz”/ }));

  await waitFor(() =>
    expect(authedFetch).toHaveBeenCalledWith("/api/tasks/luz", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ expectedRevision: 4, status: "done" }) })),
  );
  // Concluída vai para o grupo recolhido; abrindo-o, o círculo passa a reabrir.
  const closed = await screen.findByRole("button", { name: /Concluídas/ });
  expect(screen.queryByRole("button", { name: /Toque para concluir “Pagar conta de luz”/ })).not.toBeInTheDocument();
  fireEvent.click(closed);
  expect(screen.getByRole("button", { name: /Toque para reabrir “Pagar conta de luz”/ })).toBeInTheDocument();
});

test("ordena pela prioridade e filtra por tag", async () => {
  authedFetch.mockResolvedValue([
    summaryTask({ id: "a", name: "Alfa", priority: "low", startedAt: "2026-09-15T00:00:00-03:00" }),
    summaryTask({ id: "b", name: "Beta", priority: "urgent", tags: ["casa"], startedAt: "2026-09-20T00:00:00-03:00" }),
  ]);
  render(<TasksScreen userId="user-1" />);
  await screen.findByText("2 abertas");
  const order = () => screen.getAllByRole("link").map((link) => link.textContent);
  expect(order()).toEqual(["Alfa", "Beta"]);

  fireEvent.click(screen.getByLabelText("Filtrar e ordenar"));
  fireEvent.click(screen.getByRole("radio", { name: "Prioridade" }));
  expect(order()).toEqual(["Beta", "Alfa"]);

  fireEvent.click(screen.getByRole("checkbox", { name: "#casa" }));
  expect(screen.queryByRole("link", { name: "Beta" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Alfa" })).toBeInTheDocument();
});

test("convida a criar a primeira tarefa e avisa quando a lista falha", async () => {
  authedFetch.mockResolvedValueOnce([]);
  const { unmount } = render(<TasksScreen userId="user-1" />);
  expect(await screen.findByText(/ainda não tem tarefas/)).toBeInTheDocument();
  unmount();

  authedFetch.mockRejectedValueOnce(new Error("falhou"));
  render(<TasksScreen userId="user-1" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as tarefas.");
});
