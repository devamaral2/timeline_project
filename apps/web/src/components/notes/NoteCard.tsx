import Link from "next/link";
import type { NoteDto } from "@/lib/api/contracts";
import { noteFigure, noteOriginLabel, noteSnippet, noteStamp } from "@/lib/notes/notes-model";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import { MealGenerationStatus } from "./MealGenerationStatus";
import { NoteSheet } from "./NoteSheet";
import styles from "./notes.module.css";

/**
 * Uma nota na lista: a folha com o ícone do tipo, o nome e quando foi
 * editada, o trecho numa linha, a origem e as tags e, nas estruturadas, o
 * número em destaque na serifa (kcal, minutos).
 */
export function NoteCard({ note, href, now }: { note: NoteDto; href: string; now: Date | null }) {
  const snippet = noteSnippet(note);
  const figure = noteFigure(note);
  return (
    <Link href={href} className={styles.row} data-note-type={note.type}>
      <NoteSheet type={note.type} className={styles.sheet} />
      <span className={styles.rowText}>
        <span className={styles.rowHead}>
          <span className={styles.rowTitle}>{note.name}</span>
          {now ? <time className={styles.stamp} dateTime={note.updatedAt}>{noteStamp(note.updatedAt, now)}</time> : null}
        </span>
        {snippet ? <span className={styles.snippet}>{snippet}</span> : null}
        {note.type === "meal" ? <MealGenerationStatus data={note.data} /> : null}
        <span className={styles.rowMeta}>
          <span>{noteOriginLabel(note)}</span>
          {note.tags.map((tag) => <span key={tag} style={tagAccentStyle(tag)}>#{tag}</span>)}
        </span>
      </span>
      <span className={styles.figure}>
        {figure?.kind === "kcal" ? <span><strong>{figure.value}</strong><small>kcal</small></span> : null}
        {figure?.kind === "minutes" ? (
          <span>
            {figure.value >= 60 ? <><strong>{Math.floor(figure.value / 60)}</strong><small>h</small></> : null}
            {figure.value % 60 > 0 ? <><strong>{figure.value % 60}</strong><small>min</small></> : null}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
