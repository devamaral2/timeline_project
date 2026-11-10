"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ICON_STROKE_WIDTH } from "@/components/events/event-visuals";
import { NoteBody } from "@/components/notes/NoteBody";
import { NoteSheet } from "@/components/notes/NoteSheet";
import type { NoteDto } from "@/lib/api/contracts";
import type { EventPosition } from "@repo/timeline";
import styles from "./event-details.module.css";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

export function statusLabelOf(position: EventPosition, missed: boolean): string {
  if (missed) return "Não realizado";
  if (position === "past") return "Aconteceu";
  return position === "running" ? "Em andamento" : "Vai acontecer";
}

/** O título de uma nota anexada: refeição pelo nome, treino pelo evento, sono pela data, texto pelo nome da nota. */
export function noteTitleOf(note: NoteDto, eventName: string, dateTitle: string): string {
  if (note.type === "meal") return note.data.name || eventName;
  if (note.type === "training") return eventName;
  if (note.type === "sleep") return dateTitle;
  return note.name;
}

const NOTE_KIND_LABELS: Record<string, string> = { meal: "Nota de refeição", training: "Nota de treino", sleep: "Nota de sono" };

/** "Nota de sono", "Nota de refeição"…; texto e o que mais vier são só "Nota". */
export function noteKindLabel(type: string): string {
  return NOTE_KIND_LABELS[type] ?? "Nota";
}

/**
 * Uma nota do evento, inteira dentro dele: o cabeçalho (a folha com o ícone do tipo, nome,
 * "Nota de sono · hoje, 06:42" e a seta que abre a nota) e o corpo — o texto,
 * ou os números da refeição, do treino e do sono. Sem `href` a seta some.
 */
export function EventNote({ note, title, updated, href, agendaMinutes }: { note: NoteDto; title: string; updated?: string; href?: string; agendaMinutes: number | null }) {
  return (
    <article className={styles.note} data-note-type={note.type} aria-label={title}>
      <header className={styles.noteHead}>
        <NoteSheet type={note.type} size="cite" />
        <div className={styles.noteHeadText}>
          <h3 className={styles.noteTitle}>{title}</h3>
          <p className={styles.noteMeta}>{noteKindLabel(note.type)}{updated ? ` · ${updated}` : ""}</p>
        </div>
        {href ? <Link href={href} className={styles.noteOpen} aria-label={`Abrir a nota ${title}`}><ChevronRight {...icon} /></Link> : null}
      </header>
      <NoteBody note={note} agendaMinutes={agendaMinutes} />
    </article>
  );
}
