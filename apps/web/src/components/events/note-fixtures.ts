import type { NoteDto } from "@/lib/api/contracts";

/**
 * Uma note de teste: so o que o teste diz, com o resto preenchido. O `data` nao
 * e conferido contra o tipo — quem escreve o teste responde por ele.
 */
export function noteOf(note: { id: string; type: string; data: unknown; name?: string; schemaVersion?: number }): NoteDto {
  return {
    name: "Nota",
    schemaVersion: 1,
    tags: [],
    revision: 1,
    createdAt: "2026-08-19T12:00:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
    ...note,
  } as NoteDto;
}
