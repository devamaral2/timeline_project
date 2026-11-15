import type { PreviewNote } from "./EventDetailScreen";

/**
 * Uma nota de teste da prévia: so o que o teste diz, com o resto preenchido. O `data` nao
 * e conferido contra o tipo — quem escreve o teste responde por ele.
 */
export function noteOf(note: { id: string; type: string; data: unknown; name?: string }): PreviewNote {
  return { name: "Nota", ...note } as PreviewNote;
}
