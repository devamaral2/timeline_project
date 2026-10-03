import { expect, test } from "vitest";
import type { NoteDto } from "@/lib/api/contracts";
import { textNote } from "@/components/notes/note-fixtures";
import {
  filterNotes,
  groupNotes,
  noteDatesLine,
  noteSnippet,
  noteStamp,
  noteOriginLabel,
  parseNoteContent,
  whenLabel,
} from "./notes-model";

/** Segunda, 14 de setembro de 2026, 10:00 no fuso da timeline. */
const now = new Date("2026-09-14T10:00:00-03:00");

function note(overrides: Parameters<typeof textNote>[0] = {}): NoteDto {
  return textNote({
    id: "nota-1",
    name: "Livros para ler",
    content: "Torto arado e A hora da estrela.",
    createdAt: "2026-09-11T09:00:00-03:00",
    updatedAt: "2026-09-11T09:00:00-03:00",
    ...overrides,
  });
}

test("agrupa pelo dia da última edição: hoje, ontem, esta semana, este mês e meses antigos", () => {
  const groups = groupNotes(
    [
      note({ id: "a", updatedAt: "2026-09-14T08:05:00-03:00" }),
      note({ id: "b", updatedAt: "2026-09-13T21:12:00-03:00" }),
      note({ id: "c", updatedAt: "2026-09-11T09:00:00-03:00" }),
      note({ id: "d", updatedAt: "2026-09-02T09:00:00-03:00" }),
      note({ id: "e", updatedAt: "2026-08-20T09:00:00-03:00" }),
    ],
    now,
  );

  expect(groups.map((group) => [group.label, group.notes.map((n) => n.id)])).toEqual([
    ["Hoje", ["a"]],
    ["Ontem", ["b"]],
    ["Esta semana", ["c"]],
    ["Este mês", ["d"]],
    ["agosto de 2026", ["e"]],
  ]);
});

test("dentro de um grupo, a mais recente vem primeiro", () => {
  const [group] = groupNotes(
    [
      note({ id: "manha", updatedAt: "2026-09-14T06:45:00-03:00" }),
      note({ id: "tarde", updatedAt: "2026-09-14T09:40:00-03:00" }),
    ],
    now,
  );

  expect(group?.notes.map((n) => n.id)).toEqual(["tarde", "manha"]);
});

test("filtra por origem e busca no título, no texto, na origem e nas tags sem ligar para acento", () => {
  const onEvent = note({ id: "e", link: { kind: "event", id: "ev", name: "Academia" }, tags: ["saúde"] });
  const onTask = note({ id: "t", name: "Ideias", link: { kind: "task", id: "ta", name: "Revisar proposta" } });
  const loose = note({ id: "l" });
  const all = [onEvent, onTask, loose];

  expect(filterNotes(all, "event").map((n) => n.id)).toEqual(["e"]);
  expect(filterNotes(all, "task").map((n) => n.id)).toEqual(["t"]);
  expect(filterNotes(all, "loose").map((n) => n.id)).toEqual(["l"]);
  expect(filterNotes(all, "all", "SAUDE").map((n) => n.id)).toEqual(["e"]);
  expect(filterNotes(all, "all", "proposta").map((n) => n.id)).toEqual(["t"]);
  expect(filterNotes(all, "task", "livros")).toEqual([]);
});

test("a hora da lista é HH:mm hoje e ontem, e dia curto depois", () => {
  expect(noteStamp("2026-09-14T09:40:00-03:00", now)).toBe("09:40");
  expect(noteStamp("2026-09-13T21:12:00-03:00", now)).toBe("21:12");
  expect(noteStamp("2026-09-11T09:00:00-03:00", now)).toBe("sex., 11 set.");
  expect(noteStamp("2025-12-24T09:00:00-03:00", now)).toBe("qua., 24 dez. 2025");
});

test("rotula quando o alvo acontece", () => {
  expect(whenLabel("2026-09-14T09:00:00-03:00", now)).toBe("hoje, 09:00");
  expect(whenLabel("2026-09-13T09:00:00-03:00", now)).toBe("ontem, 09:00");
  expect(whenLabel("2026-09-15T08:00:00-03:00", now)).toBe("amanhã, 08:00");
  expect(whenLabel("2026-09-02T09:00:00-03:00", now)).toBe("2 set., 09:00");
});

test("a linha de datas mostra a edição só quando houve uma", () => {
  expect(noteDatesLine(note({ createdAt: "2026-09-14T08:05:00-03:00", updatedAt: "2026-09-14T08:05:00-03:00" }), now)).toBe(
    "Criada hoje, 08:05",
  );
  expect(
    noteDatesLine(
      note({ createdAt: "2026-09-12T09:00:00-03:00", updatedAt: "2026-09-13T21:12:00-03:00", revision: 3 }),
      now,
    ),
  ).toBe("Criada em 12 set. · editada ontem, 21:12");
});

test("o rótulo da origem", () => {
  expect(noteOriginLabel(note())).toBe("Nota solta");
  expect(noteOriginLabel(note({ link: { kind: "event", id: "e", name: "Almoço" } }))).toBe("Evento · Almoço");
  expect(noteOriginLabel(note({ link: { kind: "task", id: "t", name: "Revisar proposta" } }))).toBe(
    "Tarefa · Revisar proposta",
  );
});

test("o trecho da lista tira o título repetido, os marcadores e as quebras", () => {
  expect(
    noteSnippet(textNote({ name: "Lista do mercado", content: "Lista do mercado\n- Arroz integral\n- Frango\n\n## Café\nAveia" })),
  ).toBe("Arroz integral Frango Café Aveia");
  expect(noteSnippet(textNote({ name: "Outro nome", content: "Primeira linha\nSegunda" }))).toBe("Primeira linha Segunda");
});

test("o texto vira parágrafos, subtítulos e listas", () => {
  const blocks = parseNoteContent(textNote({
    name: "Ideias para a proposta",
    content: [
      "Ideias para a proposta",
      "Começar pelo problema.",
      "Eles reclamaram do prazo.",
      "",
      "## Pontos para a reunião",
      "- Mostrar o cronograma",
      "* Separar o preço",
      "",
      "## Dúvida",
      "O desconto vale para o ano todo?",
    ].join("\n"),
  }));

  expect(blocks).toEqual([
    { type: "paragraph", text: "Começar pelo problema.\nEles reclamaram do prazo." },
    { type: "heading", text: "Pontos para a reunião" },
    { type: "list", items: ["Mostrar o cronograma", "Separar o preço"] },
    { type: "heading", text: "Dúvida" },
    { type: "paragraph", text: "O desconto vale para o ano todo?" },
  ]);
});
