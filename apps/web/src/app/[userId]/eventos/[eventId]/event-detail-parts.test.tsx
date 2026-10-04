import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { textNote } from "@/components/notes/note-fixtures";
import { NoteCard } from "./event-detail-parts";

test("o título do cartão da nota no evento leva à tela da nota", () => {
  render(<NoteCard userId="user-1" note={textNote({ id: "nota-7", name: "Ideias" })} eventName="Reunião" dateTitle="Segunda, 14 de setembro" agendaMinutes={null} />);

  expect(screen.getByRole("link", { name: "Ideias" })).toHaveAttribute("href", "/user-1/notas/nota-7");
  expect(screen.getByRole("button", { name: "Recolher nota" })).toHaveAttribute("aria-expanded", "true");
});
