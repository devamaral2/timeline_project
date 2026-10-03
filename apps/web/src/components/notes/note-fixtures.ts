import type { NoteDto, NoteLinkDto } from "@/lib/api/contracts";

/**
 * Uma nota de texto de teste: so o que o teste diz, com o resto preenchido.
 * `content` e o corpo; `link`, o unico lugar em que ela aparece.
 */
export function textNote(
  overrides: Partial<Omit<NoteDto, "type" | "data" | "links">> & { content?: string; link?: NoteLinkDto } = {},
): Extract<NoteDto, { type: "text" }> {
  const { content = "Texto", link, ...rest } = overrides;
  return {
    id: "n",
    name: "Nota",
    schemaVersion: 1,
    tags: [],
    revision: 1,
    createdAt: "2026-09-14T08:00:00-03:00",
    updatedAt: "2026-09-14T08:00:00-03:00",
    ...rest,
    type: "text",
    data: { body: content },
    links: link ? [link] : [],
  };
}
