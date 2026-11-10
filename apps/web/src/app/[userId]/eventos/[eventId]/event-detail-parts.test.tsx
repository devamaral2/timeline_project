import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { textNote } from "@/components/notes/note-fixtures";
import { EventNote, noteKindLabel, noteTitleOf } from "./event-detail-parts";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}));

test("a nota aparece inteira dentro do evento, com o tipo, quando mudou e a seta que a abre", () => {
  const note = textNote({ id: "nota-7", name: "Ideias" });
  render(<EventNote note={note} title={noteTitleOf(note, "Reunião", "Segunda, 14 de setembro")} updated="hoje, 09:20" href="/u/notas/nota-7" agendaMinutes={null} />);

  expect(screen.getByRole("heading", { level: 3, name: "Ideias" })).toBeInTheDocument();
  expect(screen.getByText("Nota · hoje, 09:20")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Abrir a nota Ideias" })).toHaveAttribute("href", "/u/notas/nota-7");
  // Nada recolhe: o conteúdo está sempre à vista.
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("o rótulo diz o tipo da nota estruturada", () => {
  expect(noteKindLabel("sleep")).toBe("Nota de sono");
  expect(noteKindLabel("meal")).toBe("Nota de refeição");
  expect(noteKindLabel("training")).toBe("Nota de treino");
  expect(noteKindLabel("text")).toBe("Nota");
});
