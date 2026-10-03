import Link from "next/link";
import type { NoteDto } from "@/lib/api/contracts";
import { noteSnippet, noteStamp } from "@/lib/notes/notes-model";
import { tagColorStyle } from "@/lib/tags/tag-color";
import { NoteOrigin, originOf } from "./NoteOrigin";
import styles from "./notes.module.css";

export function NoteCard({ note, href, now }: { note: NoteDto; href: string; now: Date | null }) {
  const snippet = noteSnippet(note);
  return (
    <Link href={href} className={styles.card}>
      <div className={styles.cardMeta}>
        <span className={styles.origin} data-origin={originOf(note).origin}><NoteOrigin note={note} /></span>
        {now ? <time className={styles.stamp} dateTime={note.updatedAt}>{noteStamp(note.updatedAt, now)}</time> : null}
      </div>
      <h3 className={styles.cardTitle}>{note.name}</h3>
      {snippet ? <p className={styles.snippet}>{snippet}</p> : null}
      {note.tags.length ? (
        <ul className={styles.tags} aria-label="Tags da nota">
          {note.tags.map((tag) => <li key={tag} style={tagColorStyle(tag)}>#{tag}</li>)}
        </ul>
      ) : null}
    </Link>
  );
}
