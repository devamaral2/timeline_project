import type { NoteDto } from "@/lib/api/contracts";
import { parseNoteContent } from "@/lib/notes/notes-model";
import styles from "./notes.module.css";

/** O texto da nota, em parágrafos, subtítulos e listas. */
export function NoteContent({ note }: { note: Pick<NoteDto, "name" | "content"> }) {
  const blocks = parseNoteContent(note);
  return (
    <article className={styles.article}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === "heading") return <h2 key={key}>{block.text}</h2>;
        if (block.type === "list") {
          return (
            <ul key={key}>
              {/* biome-ignore lint/suspicious/noArrayIndexKey: itens de lista podem se repetir; a lista é estática. */}
              {block.items.map((item, itemIndex) => <li key={`${key}-${itemIndex}`}>{item}</li>)}
            </ul>
          );
        }
        return <p key={key}>{block.text}</p>;
      })}
    </article>
  );
}
