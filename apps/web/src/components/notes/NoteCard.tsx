import { Bot, FileText, Route, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { ICON_STROKE_WIDTH, visualForItemType } from "@/components/events/event-visuals";
import type { NoteDto } from "@/lib/api/contracts";
import { noteFigure, noteOriginLabel, noteSnippet, noteStamp } from "@/lib/notes/notes-model";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import { MealGenerationStatus } from "./MealGenerationStatus";
import styles from "./notes.module.css";

const HERMES_ICONS: Record<string, LucideIcon> = { skill: Wrench, agent: Bot, router: Route };

/** O ícone de um tipo de nota: o do tipo de evento nas estruturadas, o do arquivo nas do Hermes, a folha no texto. */
export function noteTypeIcon(type: string): LucideIcon {
  if (type === "meal" || type === "training" || type === "sleep") return visualForItemType(type).Icon;
  return HERMES_ICONS[type] ?? FileText;
}

/**
 * Uma nota na lista: o quadrado com o ícone do tipo, o nome e quando foi
 * editada, o trecho numa linha, a origem e as tags e, nas estruturadas, o
 * número em destaque na serifa (kcal, minutos).
 */
export function NoteCard({ note, href, now }: { note: NoteDto; href: string; now: Date | null }) {
  const snippet = noteSnippet(note);
  const Icon = noteTypeIcon(note.type);
  const figure = noteFigure(note);
  return (
    <Link href={href} className={styles.row} data-note-type={note.type}>
      <span className={styles.tile} aria-hidden><Icon strokeWidth={ICON_STROKE_WIDTH} /></span>
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
