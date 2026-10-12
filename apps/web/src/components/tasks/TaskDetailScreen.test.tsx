import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { TaskDetailDto, TaskSummaryDto } from "@/lib/api/contracts";
import { detailTask, summaryTask } from "./task-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const authedFetch = vi.fn();
vi.mock("@/lib/api/authed-fetch", () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock("@/components/events/new-event-forms/TagInput", () => ({ TagInput: () => null }));

const { TaskDetailScreen } = await import("./TaskDetailScreen");

const detail: TaskDetailDto = detailTask({
  startedAt: "2026-09-18T00:00:00-03:00",
  dependsOnTaskIds: ["proposta"],
});

const summaries: TaskSummaryDto[] = [
  summaryTask({ id: "t1", name: detail.name, startedAt: detail.startedAt, dependsOnTaskIds: ["proposta"], revision: 3 }),
  summaryTask({ id: "proposta", name: "Revisar proposta", status: "scheduled", startedAt: "2026-09-14T09:00:00-03:00" }),
  summaryTask({ id: "s1", name: "Montar o roteiro", parentTaskId: "t1", revision: 2 }),
  summaryTask({ id: "s2", name: "Fazer os slides", parentTaskId: "t1", status: "done" }),
  summaryTask({ id: "depois", name: "Enviar ao cliente", dependsOnTaskIds: ["t1"], startedAt: "2026-09-19T00:00:00-03:00" }),
];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
  authedFetch.mockReset();
  push.mockReset();
  authedFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method) return Promise.resolve(path === "/api/tasks" ? { taskId: "novo" } : undefined);
    return Promise.resolve(path === "/api/tasks/t1" ? detail : summaries);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

test("mostra o nome, o status, a prioridade, o dia, os lembretes, as tags e a descrição", async () => {
  render(<TaskDetailScreen userId="user-1" taskId="t1" />);

  expect(await screen.findByRole("heading", { level: 1, name: "Preparar apresentação de sexta" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Status: A fazer. Trocar status" })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Prioridade: Alta" })).toBeInTheDocument();
  expect(screen.getByText("Sexta-feira, 18 de setembro")).toBeInTheDocument();
  expect(screen.getByText("Sem horário definido")).toBeInTheDocument();
  expect(screen.getByText("1 dia antes")).toBeInTheDocument();
  expect(screen.getByText("#trabalho")).toBeInTheDocument();
  expect(screen.getByText("Slides com o resumo da proposta.")).toBeInTheDocument();
});

test("lista de quem depende, as subtarefas e o que a tarefa libera", async () => {
  render(<TaskDetailScreen userId="user-1" taskId="t1" />);
  await screen.findByRole("heading", { level: 1 });

  const dependsOn = screen.getByRole("region", { name: "Depende de" });
  expect(within(dependsOn).getByRole("link", { name: /Revisar proposta/ })).toHaveAttribute("href", "/user-1/tarefas/proposta");
  expect(within(dependsOn).getByText("Agendada · hoje, 09:00")).toBeInTheDocument();

  const subtasks = screen.getByRole("region", { name: "Subtarefas" });
  expect(within(subtasks).getByText("1 de 2")).toBeInTheDocument();
  expect(within(subtasks).getByRole("button", { name: /Toque para concluir “Montar o roteiro”/ })).toBeInTheDocument();
  expect(within(subtasks).getByRole("button", { name: /Toque para reabrir “Fazer os slides”/ })).toBeInTheDocument();

  const releases = screen.getByRole("region", { name: "Libera" });
  expect(within(releases).getByText("A fazer · sáb., 19 set.")).toBeInTheDocument();
});

test("troca o status pelo seletor, com a revisão do detalhe", async () => {
  render(<TaskDetailScreen userId="user-1" taskId="t1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Status: A fazer. Trocar status" }));

  const listbox = screen.getByRole("listbox", { name: "Status da tarefa" });
  expect(within(listbox).getAllByRole("option").map((option) => option.textContent)).toEqual([
    "A fazer", "Agendada", "A definir", "Em espera", "Concluída", "Cancelada",
  ]);
  fireEvent.click(within(listbox).getByRole("option", { name: "Em espera" }));

  await waitFor(() =>
    expect(authedFetch).toHaveBeenCalledWith("/api/tasks/t1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ expectedRevision: 3, status: "inHold" }) })),
  );
});

test("conclui uma subtarefa e adiciona outra", async () => {
  render(<TaskDetailScreen userId="user-1" taskId="t1" />);
  fireEvent.click(await screen.findByRole("button", { name: /Toque para concluir “Montar o roteiro”/ }));
  await waitFor(() =>
    expect(authedFetch).toHaveBeenCalledWith("/api/tasks/s1", expect.objectContaining({ body: JSON.stringify({ expectedRevision: 2, status: "done" }) })),
  );

  fireEvent.click(await screen.findByRole("button", { name: "Adicionar subtarefa" }));
  fireEvent.change(screen.getByLabelText("Nome da subtarefa"), { target: { value: "Ensaiar" } });
  fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
  await waitFor(() =>
    expect(authedFetch).toHaveBeenCalledWith("/api/tasks", expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Ensaiar", parentTaskId: "t1" }) })),
  );
});

test("exclui pelo menu e volta para a lista", async () => {
  render(<TaskDetailScreen userId="user-1" taskId="t1" />);
  fireEvent.click(await screen.findByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Excluir" }));
  expect(screen.getByText(/junto com as 2 subtarefas/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

  await waitFor(() => expect(authedFetch).toHaveBeenCalledWith("/api/tasks/t1", { method: "DELETE" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/user-1/tarefas"));
});

test("avisa quando a tarefa não carrega", async () => {
  authedFetch.mockReset();
  authedFetch.mockRejectedValue(new Error("falhou"));
  render(<TaskDetailScreen userId="user-1" taskId="t1" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar a tarefa.");
});
