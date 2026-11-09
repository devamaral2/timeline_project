import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

test("agrupa por status, conta abertas, atrasadas e de hoje e deixa Concluídas e Canceladas recolhidas", async () => {
  authedFetch.mockResolvedValue(tasks);
  render(<TasksScreen userId="user-1" />);

  await screen.findByText("6 abertas");
  expect(screen.getByText("1 atrasada")).toBeInTheDocument();
  expect(screen.getByText("1 para hoje")).toBeInTheDocument();
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

test("a linha mostra a prioridade e o prazo das abertas, e só o prazo das concluídas", async () => {
  authedFetch.mockResolvedValue(tasks);
  render(<TasksScreen userId="user-1" />);
  await screen.findByText("6 abertas");

  const luz = screen.getByRole("link", { name: "Pagar conta de luz" }).closest("li") as HTMLElement;
  expect(within(luz).getByRole("img", { name: "Prioridade: Urgente" })).toBeInTheDocument();
  expect(within(luz).getByText("Venceu ontem")).toBeInTheDocument();

  const proposta = screen.getByRole("link", { name: "Revisar proposta" }).closest("li") as HTMLElement;
  expect(within(proposta).getByText("Hoje, 09:00")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Concluídas/ }));
  const feita = screen.getByRole("link", { name: "Enviar relatório" }).closest("li") as HTMLElement;
  expect(within(feita).queryByRole("img", { name: /Prioridade/ })).not.toBeInTheDocument();
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

test("avisa ao concluir, desfaz com a revisão seguinte e some sozinho", async () => {
  authedFetch.mockImplementation((_path: string, init?: RequestInit) =>
    init?.method === "PATCH" ? Promise.resolve(undefined) : Promise.resolve([summaryTask({ id: "luz", revision: 4 })]),
  );
  render(<TasksScreen userId="user-1" />);

  fireEvent.click(await screen.findByRole("button", { name: /Toque para concluir “Pagar conta de luz”/ }));
  expect(await screen.findByRole("status")).toHaveTextContent("Concluída: Pagar conta de luz");

  fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
  await waitFor(() =>
    expect(authedFetch).toHaveBeenLastCalledWith("/api/tasks/luz", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ expectedRevision: 5, status: "todo" }) })),
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(await screen.findByRole("button", { name: /Toque para concluir “Pagar conta de luz”/ })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Toque para concluir “Pagar conta de luz”/ }));
  expect(await screen.findByRole("status")).toBeInTheDocument();
  // O relógio do aviso nasce num efeito: deixa o React assentá-lo antes de avançar o tempo.
  await act(async () => {});
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("ordena pela prioridade, depois pela data, e filtra por tag", async () => {
  authedFetch.mockResolvedValue([
    summaryTask({ id: "a", name: "Alfa", priority: "low", startedAt: "2026-09-15T00:00:00-03:00" }),
    summaryTask({ id: "b", name: "Beta", priority: "urgent", tags: ["casa"], startedAt: "2026-09-20T00:00:00-03:00" }),
  ]);
  render(<TasksScreen userId="user-1" />);
  await screen.findByText("2 abertas");
  const order = () => screen.getAllByRole("link").map((link) => link.textContent);
  expect(order()).toEqual(["Beta", "Alfa"]);

  fireEvent.click(screen.getByRole("button", { name: "Opções de visualização" }));
  fireEvent.change(screen.getByLabelText("Ordenar por"), { target: { value: "date" } });
  expect(order()).toEqual(["Alfa", "Beta"]);

  const casa = screen.getByRole("button", { name: "#casa" });
  expect(casa).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(casa);
  expect(casa).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("link", { name: "Alfa" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Beta" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(screen.getByRole("link", { name: "Alfa" })).toBeInTheDocument();
});

test("limpa os filtros quando nenhuma tarefa combina", async () => {
  authedFetch.mockResolvedValue([summaryTask({ id: "a", name: "Alfa", tags: ["casa"] }), summaryTask({ id: "b", name: "Beta", tags: ["rua"] })]);
  render(<TasksScreen userId="user-1" />);
  await screen.findByText("2 abertas");
  fireEvent.click(screen.getByRole("button", { name: "Opções de visualização" }));
  fireEvent.click(screen.getByRole("button", { name: "#casa" }));
  fireEvent.click(screen.getByRole("button", { name: "#rua" }));
  expect(screen.getByRole("link", { name: "Alfa" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(screen.getByRole("link", { name: "Beta" })).toBeInTheDocument();
});

test("convida a criar a primeira tarefa e avisa quando a lista falha", async () => {
  authedFetch.mockResolvedValueOnce([]);
  const { unmount } = render(<TasksScreen userId="user-1" />);
  expect(await screen.findByRole("heading", { name: "Nenhuma tarefa por aqui" })).toBeInTheDocument();
  expect(screen.getByText(/Crie a primeira tarefa/)).toBeInTheDocument();
  unmount();

  authedFetch.mockRejectedValueOnce(new Error("falhou"));
  render(<TasksScreen userId="user-1" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as tarefas.");
});
