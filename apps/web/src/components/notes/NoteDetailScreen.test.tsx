import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { NoteDto } from "@/lib/api/contracts";
import { textNote } from "./note-fixtures";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const authedFetch = vi.fn();
vi.mock("@/lib/api/authed-fetch", () => ({ authedFetch: (...args: unknown[]) => authedFetch(...args) }));
vi.mock("@/components/events/new-event-forms/TagInput", () => ({ TagInput: () => null }));

const { NoteDetailScreen } = await import("./NoteDetailScreen");

const proposal: NoteDto = textNote({
  id: "nota-1",
  name: "Ideias para a proposta",
  content: [
    "Ideias para a proposta",
    "Começar pelo problema do cliente.",
    "",
    "## Pontos para a reunião",
    "- Mostrar o cronograma",
    "- Separar o preço",
  ].join("\n"),
  tags: ["trabalho"],
  revision: 2,
  createdAt: "2026-09-12T09:00:00-03:00",
  updatedAt: "2026-09-13T21:12:00-03:00",
  link: { kind: "task", id: "t1", name: "Revisar proposta", at: "2026-09-14T09:00:00-03:00" },
});

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-09-14T10:00:00-03:00"));
  authedFetch.mockReset();
  push.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

test("mostra título, datas, tags, onde aparece e o texto", async () => {
  authedFetch.mockResolvedValue(proposal);
  render(<NoteDetailScreen userId="user-1" noteId="nota-1" />);

  expect(await screen.findByRole("heading", { level: 1, name: "Ideias para a proposta" })).toBeInTheDocument();
  expect(screen.getByText("Revisar proposta")).toBeInTheDocument();
  expect(screen.getByText("Tarefa · hoje, 09:00")).toBeInTheDocument();
  expect(screen.getByText("#trabalho")).toBeInTheDocument();
  expect(screen.getByText("Criada em 12 set.")).toBeInTheDocument();
  expect(screen.getByText("Editada ontem, 21:12")).toBeInTheDocument();
  expect(screen.getByText("Começar pelo problema do cliente.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Pontos para a reunião" })).toBeInTheDocument();
  expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(
    expect.arrayContaining(["Mostrar o cronograma", "Separar o preço"]),
  );
  expect(screen.getByRole("link", { name: "Notas" })).toHaveAttribute("href", "/user-1/notas");
  expect(authedFetch).toHaveBeenCalledWith("/api/notes/nota-1");
});

test("lista todas as entidades que usam a nota e abre o evento", async () => {
  authedFetch.mockResolvedValue({
    ...proposal,
    links: [
      { kind: "event", id: "ev-9", name: "Academia", eventKind: "training", at: "2026-09-14T07:00:00-03:00" },
      { kind: "task", id: "t1", name: "Revisar proposta", at: "2026-09-14T09:00:00-03:00" },
    ],
  });
  render(<NoteDetailScreen userId="user-1" noteId="nota-1" />);

  const link = await screen.findByRole("link", { name: /Academia/ });

  expect(link).toHaveAttribute("href", "/user-1/eventos/ev-9");
  expect(screen.getByText("Revisar proposta").closest("a")).toBeNull();
});

test("uma nota de sono usa o mesmo cartão do evento", async () => {
  authedFetch.mockResolvedValue({
    ...proposal,
    name: "Sono",
    type: "sleep",
    data: { score: 80, trackedSleepTime: 450 },
    links: [{ kind: "event", id: "ev-1", name: "Sono", eventKind: "sleep", at: "2026-10-03T23:30:00-03:00", endsAt: "2026-10-04T07:00:00-03:00" }],
  });
  render(<NoteDetailScreen userId="user-1" noteId="nota-1" />);

  expect(await screen.findByRole("heading", { level: 1, name: "Sono" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 2, name: "Sábado, 3 → domingo, 4 de outubro" })).toBeInTheDocument();
  expect(screen.getByText("Pontuação do sono")).toBeInTheDocument();
  expect(screen.getByText("Registrado pelo app de sono. Na agenda, o evento durou 7 h 30.")).toBeInTheDocument();
  expect(screen.getByText("80")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Tempo registrado: 7 h 30" })).toBeInTheDocument();
});

test("avisa quando a nota não carrega", async () => {
  authedFetch.mockRejectedValue(new Error("404"));
  render(<NoteDetailScreen userId="user-1" noteId="nota-1" />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar a nota.");
});

test("solta a nota da origem com a revisão esperada", async () => {
  authedFetch.mockResolvedValueOnce(proposal).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ ...proposal, links: [], revision: 3 });
  render(<NoteDetailScreen userId="user-1" noteId="nota-1" />);
  await screen.findByRole("heading", { level: 1 });

  fireEvent.click(screen.getByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Soltar da origem" }));

  await waitFor(() => expect(screen.queryByText("Aparece em")).not.toBeInTheDocument());
  expect(authedFetch).toHaveBeenCalledWith(
    "/api/notes/nota-1",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ expectedRevision: 2, eventIds: [], taskIds: [] }) }),
  );
});

test("edita a nota enviando só o que o formulário tem", async () => {
  authedFetch.mockResolvedValueOnce(proposal).mockResolvedValueOnce(undefined).mockResolvedValueOnce({ ...proposal, name: "Nova proposta", revision: 3 });
  render(<NoteDetailScreen userId="user-1" noteId="nota-1" />);
  await screen.findByRole("heading", { level: 1 });

  fireEvent.click(screen.getByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Editar" }));
  const dialog = await screen.findByRole("dialog", { name: "Editar nota" });
  fireEvent.change(within(dialog).getByLabelText("Título"), { target: { value: "Nova proposta" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Salvar" }));

  expect(await screen.findByRole("heading", { level: 1, name: "Nova proposta" })).toBeInTheDocument();
  const [, init] = authedFetch.mock.calls[1] as [string, RequestInit];
  expect(JSON.parse(init.body as string)).toMatchObject({ expectedRevision: 2, name: "Nova proposta", tags: ["trabalho"] });
});

test("exclui a nota depois da confirmação e volta para a lista", async () => {
  authedFetch.mockResolvedValueOnce(proposal).mockResolvedValueOnce(undefined);
  render(<NoteDetailScreen userId="user-1" noteId="nota-1" />);
  await screen.findByRole("heading", { level: 1 });

  fireEvent.click(screen.getByRole("button", { name: /Mais ações/ }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Excluir" }));
  fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Excluir" }));

  await waitFor(() => expect(push).toHaveBeenCalledWith("/user-1/notas"));
  expect(authedFetch).toHaveBeenLastCalledWith("/api/notes/nota-1", { method: "DELETE" });
});

test("a nota de texto é lida como markdown", async () => {
  authedFetch.mockResolvedValue({
    ...proposal,
    data: { body: "Ideias para a proposta\n\nIsto é **importante** e [aqui](https://exemplo.dev).\n\n- [ ] enviar\n- [x] revisar" },
  });
  render(<NoteDetailScreen userId="user-1" noteId="nota-1" />);

  expect((await screen.findByText("importante")).tagName).toBe("STRONG");
  expect(screen.getByRole("link", { name: "aqui" })).toHaveAttribute("href", "https://exemplo.dev");
  expect(screen.getByRole("checkbox", { name: "Feito" })).toBeChecked();
});
