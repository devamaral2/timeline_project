import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { textNote } from "@/components/notes/note-fixtures";
import { NoteContent, noteTitleOf } from "./event-detail-parts";

test("o conteúdo da nota no evento aparece inteiro, sem seção, link ou botão de recolher", () => {
  const note = textNote({ id: "nota-7", name: "Ideias" });
  render(<NoteContent note={note} title={noteTitleOf(note, "Reunião", "Segunda, 14 de setembro")} agendaMinutes={null} />);

  expect(screen.getByRole("heading", { name: "Ideias" })).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByText("Notas")).not.toBeInTheDocument();
});
