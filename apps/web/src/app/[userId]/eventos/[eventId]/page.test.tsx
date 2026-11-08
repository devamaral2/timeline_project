import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { textNote } from "@/components/notes/note-fixtures";
import { detailTask } from "@/components/tasks/task-fixtures";
import type { EventDetailDto, NoteDto } from "@/lib/api/contracts";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, back: vi.fn() }) }));

const authedFetch = vi.fn();
vi.mock("@/lib/api/authed-fetch", () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock("@/components/events/new-event-forms/TagInput", () => ({ TagInput: () => null }));

const { default: EventPage } = await import("./page");

const event: EventDetailDto = {
  id: "ev-1",
  name: "Revisão semanal",
  description: "Fechar a agenda da semana.",
  startedAt: "2026-09-14T18:00:00-03:00",
  finishedAt: "2026-09-14T18:45:00-03:00",
  tags: ["planejamento"],
  missed: false,
  priority: "normal",
  notifyOffsetsMinutes: [15],
  interruptions: [],
  revision: 1,
  kind: "routine",
  notes: [textNote({ id: "nota-1", name: "Pauta da revisão semanal", content: "Pauta da revisão semanal\nAgenda e pendências." })],
  taskIds: ["t1"],
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
  authedFetch.mockReset();
  authedFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return Promise.resolve(undefined);
    return Promise.resolve(path === "/api/events/ev-1" ? event : detailTask({ id: "t1", name: "Mover as tarefas atrasadas", startedAt: "2026-09-14T17:30:00-03:00" }));
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPage() {
  return render(<EventPage params={Promise.resolve({ userId: "user-1", eventId: "ev-1" })} />);
}

test("mostra o tipo, o título, as tags, quando acontece e a descrição", async () => {
  renderPage();

  expect(await screen.findByRole("heading", { level: 1, name: "Revisão semanal" })).toBeInTheDocument();
  expect(screen.getByText("Evento · Rotina")).toBeInTheDocument();
  expect(screen.getByText("#planejamento")).toBeInTheDocument();
  expect(screen.getByText("15 minutos antes")).toBeInTheDocument();
  expect(screen.getByText("Fechar a agenda da semana.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/user-1");
  expect(screen.queryByText("Criado pelo Hermes")).not.toBeInTheDocument();
});

test("agrupa em Vínculos as notas e as tarefas, e cada linha abre a tela dela", async () => {
  renderPage();

  const notes = await screen.findByRole("group", { name: /Notas vinculadas/ });
  expect(within(notes).getByRole("link", { name: /Pauta da revisão semanal/ })).toHaveAttribute("href", "/user-1/notas/nota-1");

  const tasks = await screen.findByRole("group", { name: /Tarefas vinculadas/ });
  expect(await within(tasks).findByRole("link", { name: /Mover as tarefas atrasadas/ })).toHaveAttribute("href", "/user-1/tarefas/t1");
  expect(within(tasks).getByText("Tarefa · hoje, 17:30")).toBeInTheDocument();
});

test("troca o status da tarefa vinculada com a revisão dela", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: /Status: A fazer. Trocar status de Mover as tarefas atrasadas/ }));
  fireEvent.click(within(screen.getByRole("listbox", { name: "Status da tarefa" })).getByRole("option", { name: "Concluída" }));

  await waitFor(() =>
    expect(authedFetch).toHaveBeenCalledWith("/api/tasks/t1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ expectedRevision: 3, status: "done" }) })),
  );
  expect(await screen.findByRole("button", { name: /Status: Concluída/ })).toBeInTheDocument();
});

test("devolve o status e avisa quando a troca falha", async () => {
  authedFetch.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return Promise.reject(new Error("409"));
    return Promise.resolve(path === "/api/events/ev-1" ? event : detailTask({ id: "t1", name: "Mover as tarefas atrasadas" }));
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: /Status: A fazer. Trocar status de Mover/ }));
  fireEvent.click(within(screen.getByRole("listbox", { name: "Status da tarefa" })).getByRole("option", { name: "Concluída" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível trocar o status da tarefa.");
  expect(screen.getByRole("button", { name: /Status: A fazer/ })).toBeInTheDocument();
});

test("o menu leva à edição da rotina e à exclusão", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Mais ações" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));

  expect(push).toHaveBeenCalledWith("/user-1/eventos/ev-1/editar");
});

test("mostra a nota de sono inteira, sem a seção Notas, e a lista em Notas vinculadas", async () => {
  const sleepNote = { ...textNote({ id: "sono-1", name: "Sono" }), type: "sleep", data: { trackedSleepTime: 480, score: 83 } } as unknown as NoteDto;
  const sleepEvent: EventDetailDto = { ...event, kind: "sleep", name: "Dormir", description: "", notes: [sleepNote], taskIds: [] };
  authedFetch.mockImplementation(() => Promise.resolve(sleepEvent));
  renderPage();

  expect(await screen.findByText("Pontuação do sono")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Notas" })).not.toBeInTheDocument();
  const notes = screen.getByRole("group", { name: /Notas vinculadas/ });
  expect(within(notes).getByRole("link", { name: /Segunda, 14 de setembro|14 de setembro/ })).toHaveAttribute("href", "/user-1/notas/sono-1");
});
