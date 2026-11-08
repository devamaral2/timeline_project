import { fireEvent, render, screen, within } from "@testing-library/react";
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

test("agrupa por tag, mantém notas sem tag acessíveis e oferece busca e criação", async () => {
  authedFetch.mockResolvedValue(notes);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("3 notas");
  const health = screen.getByRole("region", { name: "#saúde" });
  expect(within(health).getByRole("link", { name: /Treino A/ })).toHaveAttribute("href", "/user-1/notas/treino");
  const untagged = screen.getByRole("region", { name: "Sem tag" });
  expect(within(untagged).getByText("Livros para ler")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Nova nota" })).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Buscar notas" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Filtrar por tag" })).toBeInTheDocument();
});

test("filtra pelas tags em chips e limpa a seleção", async () => {
  authedFetch.mockResolvedValue(notes);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("3 notas");
  const chips = within(screen.getByRole("group", { name: "Filtrar por tag" }));

  const health = chips.getByRole("button", { name: "#saúde" });
  expect(health).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(health);
  expect(health).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("Treino A")).toBeInTheDocument();
  expect(screen.queryByText("Livros para ler")).not.toBeInTheDocument();

  fireEvent.click(chips.getByRole("button", { name: "Sem tag" }));
  expect(screen.getByText("Livros para ler")).toBeInTheDocument();

  fireEvent.click(chips.getByRole("button", { name: "#saúde" }));
  expect(screen.queryByText("Treino A")).not.toBeInTheDocument();
  expect(screen.getByText("Livros para ler")).toBeInTheDocument();

  fireEvent.click(chips.getByRole("button", { name: "Limpar tags" }));
  expect(screen.getByText("Treino A")).toBeInTheDocument();
  expect(chips.queryByRole("button", { name: "Limpar tags" })).not.toBeInTheDocument();
});

test("busca pelo texto e limpa os filtros quando nada combina", async () => {
  authedFetch.mockResolvedValue(notes);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("3 notas");

  const search = screen.getByRole("searchbox", { name: "Buscar notas" });
  fireEvent.change(search, { target: { value: "torto" } });
  expect(screen.getByText("Livros para ler")).toBeInTheDocument();
  expect(screen.queryByText("Treino A")).not.toBeInTheDocument();
  // Os chips seguem à vista: a busca estreita a lista, não as tags.
  expect(within(screen.getByRole("group", { name: "Filtrar por tag" })).getByRole("button", { name: "#saúde" })).toBeInTheDocument();

  fireEvent.change(search, { target: { value: "zzz" } });
  expect(screen.getByRole("heading", { name: "Nenhuma nota encontrada" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Limpar filtros" }));
  expect(search).toHaveValue("");
  expect(screen.getByText("Treino A")).toBeInTheDocument();
});

test("expande e recolhe cada tag independentemente e repete notas com várias tags", async () => {
  authedFetch.mockResolvedValue([note({ id: "multi", name: "Nota compartilhada", tags: ["saúde", "pessoal"] })]);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("1 nota");
  expect(screen.getAllByRole("link", { name: /Nota compartilhada/ })).toHaveLength(2);
  const toggle = within(screen.getByRole("region", { name: "#saúde" })).getByRole("button", { name: /#saúde/ });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.getAllByRole("link", { name: /Nota compartilhada/ })).toHaveLength(1);
  fireEvent.click(toggle);
  expect(screen.getAllByRole("link", { name: /Nota compartilhada/ })).toHaveLength(2);
});

test("Nova nota abre o formulário de criar", async () => {
  authedFetch.mockResolvedValue(notes);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("3 notas");

  fireEvent.click(screen.getByRole("button", { name: "Nova nota" }));

  expect(await screen.findByRole("dialog", { name: "Nova nota" })).toBeInTheDocument();
});

test("convida a escrever a primeira nota quando não há nenhuma", async () => {
  authedFetch.mockResolvedValue([]);
  render(<NotesScreen userId="user-1" />);

  expect(await screen.findByRole("heading", { name: "Nenhuma nota ainda" })).toBeInTheDocument();
  expect(screen.getByText(/Escreva a primeira nota/)).toBeInTheDocument();
});

test("oferece tentar de novo quando a leitura falha", async () => {
  authedFetch.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(notes);
  render(<NotesScreen userId="user-1" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as notas.");
  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

  expect(await screen.findByText("3 notas")).toBeInTheDocument();
});
