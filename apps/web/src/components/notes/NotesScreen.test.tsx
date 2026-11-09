import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { NoteDto } from "@/lib/api/contracts";
import { textNote } from "./note-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const authedFetch = vi.fn();
vi.mock("@/lib/api/authed-fetch", () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock("@/components/events/new-event-forms/TagInput", () => ({
  TagInput: ({ tags, onTagsChange }: { tags: string[]; onTagsChange: (tags: string[]) => void }) => (
    <input
      aria-label="Tags"
      data-tags={tags.join(",")}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        onTagsChange([...tags, event.currentTarget.value]);
        event.currentTarget.value = "";
      }}
    />
  ),
}));

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

test("agrupa só por tipo, sem divisão por tag, busca, filtros nem botão de criar", async () => {
  const agent = { ...note({ id: "revisor", name: "revisor", tags: ["agent", "review"] }), type: "agent", data: { path: "hermes/agents/revisor.md", hash: "a".repeat(64), missing: false } } as unknown as NoteDto;
  authedFetch.mockResolvedValue([...notes, agent]);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("4 notas");

  const text = screen.getByRole("region", { name: "Notas de texto" });
  expect(within(text).getByRole("link", { name: /Treino A/ })).toHaveAttribute("href", "/user-1/notas/treino");
  expect(within(text).getByText("Livros para ler")).toBeInTheDocument();
  const agents = screen.getByRole("region", { name: "Agentes" });
  expect(within(agents).getByText("revisor")).toBeInTheDocument();
  expect(within(agents).queryByText("Livros para ler")).not.toBeInTheDocument();

  expect(screen.getAllByRole("region")).toHaveLength(2);
  expect(screen.queryByText("Sem tag")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Nova nota" })).not.toBeInTheDocument();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
});

test("recolhe e expande um tipo", async () => {
  authedFetch.mockResolvedValue(notes);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("3 notas");
  const toggle = within(screen.getByRole("region", { name: "Notas de texto" })).getByRole("button");
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("link", { name: /Treino A/ })).not.toBeInTheDocument();
  fireEvent.click(toggle);
  expect(screen.getByRole("link", { name: /Treino A/ })).toBeInTheDocument();
});

test("convida a escrever a primeira nota quando não há nenhuma", async () => {
  authedFetch.mockResolvedValue([]);
  render(<NotesScreen userId="user-1" />);

  expect(await screen.findByRole("heading", { name: "Nenhuma nota ainda" })).toBeInTheDocument();
});

test("oferece tentar de novo quando a leitura falha", async () => {
  authedFetch.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(notes);
  render(<NotesScreen userId="user-1" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar as notas.");
  fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

  expect(await screen.findByText("3 notas")).toBeInTheDocument();
});

test("o ícone de opções filtra por tipo e por várias tags, e limpa os filtros", async () => {
  const agent = { ...note({ id: "revisor", name: "revisor", tags: ["agent", "criacao"] }), type: "agent", data: { path: "hermes/agents/revisor.md", hash: "a".repeat(64), missing: false } } as unknown as NoteDto;
  authedFetch.mockResolvedValue([...notes, agent]);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("4 notas");

  fireEvent.click(screen.getByRole("button", { name: "Opções de visualização" }));
  const panel = within(screen.getByRole("dialog", { name: "Opções de visualização" }));

  fireEvent.click(panel.getByRole("button", { name: "Agentes" }));
  expect(screen.queryByText("Livros para ler")).not.toBeInTheDocument();
  expect(screen.getByText("revisor")).toBeInTheDocument();
  fireEvent.click(panel.getByRole("button", { name: "Agentes" }));

  const tags = panel.getByLabelText("Tags") as HTMLInputElement;
  fireEvent.change(tags, { target: { value: "saúde" } });
  fireEvent.keyDown(tags, { key: "Enter" });
  expect(screen.getByText("Treino A")).toBeInTheDocument();
  expect(screen.queryByText("revisor")).not.toBeInTheDocument();
  fireEvent.change(tags, { target: { value: "agent" } });
  fireEvent.keyDown(tags, { key: "Enter" });
  expect(screen.getByText("Treino A")).toBeInTheDocument();
  expect(screen.getByText("revisor")).toBeInTheDocument();
  expect(screen.queryByText("Livros para ler")).not.toBeInTheDocument();
  expect(screen.getByLabelText("2 filtros ativos")).toBeInTheDocument();

  fireEvent.click(panel.getByRole("button", { name: "Limpar filtros" }));
  expect(screen.getByText("Livros para ler")).toBeInTheDocument();
});

test("avisa quando nenhum filtro combina", async () => {
  authedFetch.mockResolvedValue(notes);
  render(<NotesScreen userId="user-1" />);
  await screen.findByText("3 notas");
  fireEvent.click(screen.getByRole("button", { name: "Opções de visualização" }));
  const tags = screen.getByLabelText("Tags") as HTMLInputElement;
  fireEvent.change(tags, { target: { value: "inexistente" } });
  fireEvent.keyDown(tags, { key: "Enter" });
  expect(await screen.findByRole("heading", { name: "Nenhuma nota encontrada" })).toBeInTheDocument();
});
