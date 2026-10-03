import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { NoteDto } from "@/lib/api/contracts";
import { textNote } from "./note-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const authedFetch = vi.fn();
vi.mock("@/lib/api/authed-fetch", () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock("@/components/events/new-event-forms/TagInput", () => ({ TagInput: () => null }));

const { NotesScreen } = await import("./NotesScreen");

const note = textNote;

const notes: NoteDto[] = [
  note({ id: "treino", name: "Treino A", content: "415 kcal gastas.", tags: ["saúde"], link: { kind: "event", id: "e1", name: "Academia", eventKind: "training", at: "2026-09-14T07:00:00-03:00" } }),
  note({ id: "proposta", name: "Ideias para a proposta", content: "Começar pelo problema.", updatedAt: "2026-09-13T21:12:00-03:00", link: { kind: "task", id: "t1", name: "Revisar proposta" } }),
  note({ id: "livros", name: "Livros para ler", content: "Torto arado.", updatedAt: "2026-09-11T09:00:00-03:00" }),
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

test("mostra as notas agrupadas por dia, com origem, contagem e tags", async () => {
  authedFetch.mockResolvedValue(notes);
  render(<NotesScreen userId="user-1" />);

  expect(await screen.findByText("3 notas")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "Notas" })).toBeInTheDocument();
  const today = screen.getByRole("region", { name: "Hoje" });
  expect(within(today).getByRole("link", { name: /Treino A/ })).toHaveAttribute("href", "/user-1/notas/treino");
  expect(within(today).getByText("Evento · Academia")).toBeInTheDocument();
  expect(within(today).getByText("#saúde")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Ontem" })).getByText("Tarefa · Revisar proposta")).toBeInTheDocument();
  expect(within(screen.getByRole("region", { name: "Esta semana" })).getByText("Nota solta")).toBeInTheDocument();
  expect(authedFetch).toHaveBeenCalledWith("/api/notes");
});

test("filtra por origem", async () => {
  authedFetch.mockResolvedValue(notes);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("3 notas");

  fireEvent.click(screen.getByRole("button", { name: "Soltas" }));

  expect(screen.getByRole("button", { name: "Soltas" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Livros para ler")).toBeInTheDocument();
  expect(screen.queryByText("Treino A")).not.toBeInTheDocument();
});

test("busca pelo texto e avisa quando nada combina", async () => {
  authedFetch.mockResolvedValue(notes);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("3 notas");

  fireEvent.click(screen.getByRole("button", { name: "Buscar notas" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar notas" }), { target: { value: "torto" } });
  expect(screen.getByText("Livros para ler")).toBeInTheDocument();
  expect(screen.queryByText("Treino A")).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar notas" }), { target: { value: "inexistente" } });
  expect(screen.getByText("Nenhuma nota encontrada.")).toBeInTheDocument();
});

test("convida a escrever a primeira nota quando não há nenhuma", async () => {
  authedFetch.mockResolvedValue([]);
  render(<NotesScreen userId="user-1" />);

  expect(await screen.findByText(/ainda não tem notas/)).toBeInTheDocument();
});

test("oferece tentar de novo quando a leitura falha", async () => {
  authedFetch.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(notes);
  render(<NotesScreen userId="user-1" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as notas.");
  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

  expect(await screen.findByText("3 notas")).toBeInTheDocument();
});

test("cria uma nota e abre o detalhe dela", async () => {
  authedFetch.mockResolvedValueOnce(notes).mockResolvedValueOnce({ noteId: "nova" });
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("3 notas");

  fireEvent.click(screen.getByRole("button", { name: "Nova nota" }));
  const dialog = await screen.findByRole("dialog", { name: "Nova nota" });
  fireEvent.change(within(dialog).getByLabelText("Texto"), { target: { value: "Pagar o condomínio" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Criar nota" }));

  await waitFor(() => expect(push).toHaveBeenCalledWith("/user-1/notas/nova"));
  expect(authedFetch).toHaveBeenLastCalledWith("/api/notes", expect.objectContaining({ method: "POST" }));
  const [, init] = authedFetch.mock.calls[authedFetch.mock.calls.length - 1] as [string, RequestInit];
  const body = JSON.parse(init.body as string);
  expect(body).toEqual({ type: "text", data: { body: "Pagar o condomínio" }, tags: [] });
});

test("não cria nota sem texto", async () => {
  authedFetch.mockResolvedValue(notes);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("3 notas");

  fireEvent.click(screen.getByRole("button", { name: "Nova nota" }));
  const dialog = await screen.findByRole("dialog", { name: "Nova nota" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Criar nota" }));

  expect(within(dialog).getByRole("alert")).toHaveTextContent("Escreva o texto da nota.");
  expect(authedFetch).toHaveBeenCalledTimes(1);
});
