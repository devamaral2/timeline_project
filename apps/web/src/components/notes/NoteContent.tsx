import type { NoteDto } from "@/lib/api/contracts";
import { noteMarkdownOf } from "@/lib/notes/notes-model";
import { NoteBody } from "./NoteBody";
import styles from "./notes.module.css";

/**
 * O conteúdo da nota aberta: o cartão da nota no evento, sem o cabeçalho que
 * abre e fecha (a tela já tem o título); `title` é o título do próprio
 * cartão, como o dia da noite de sono. Numa
 * nota de texto, o título repetido na primeira linha fica de fora (a tela o
 * mostra); sem mais nada, não há o que exibir.
 */
export function NoteContent({ note, title, agendaMinutes = null }: { note: NoteDto; title?: string; agendaMinutes?: number | null }) {
  const body = note.type === "text" ? noteMarkdownOf(note) : null;
  if (body === "") return null;
  return (
    <article className={styles.noteCard} aria-label="Conteúdo da nota">
      {title ? <h2 className={styles.noteTitle}>{title}</h2> : null}
      <NoteBody note={note.type === "text" ? { ...note, data: { body: body ?? "" } } : note} agendaMinutes={agendaMinutes} />
    </article>
  );
}
