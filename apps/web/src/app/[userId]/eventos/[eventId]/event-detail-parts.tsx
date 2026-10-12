"use client";

import { CalendarCheck, CalendarDays, CalendarX, ChevronDown, ChevronUp, StickyNote } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ICON_STROKE_WIDTH } from "@/components/events/event-visuals";
import { NoteBody } from "@/components/notes/NoteBody";
import type { NoteDto } from "@/lib/api/contracts";
import type { EventPosition } from "@repo/timeline";
import styles from "./event-details.module.css";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/** Só o ícone, sem texto: agendado, em andamento, aconteceu ou não realizado. */
export function StatusIcon({ position, missed }: { position: EventPosition; missed: boolean }) {
  if (missed) return <CalendarX {...icon} className={styles.statusMissed} />;
  if (position === "past") return <CalendarCheck {...icon} className={styles.statusDone} />;
  if (position === "running") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={styles.statusRunning}>
        <path d="M8 2v4M16 2v4M3 10h18" /><rect width="18" height="18" x="3" y="4" rx="2" /><circle cx="12" cy="16" r="2.4" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return <CalendarDays {...icon} className={styles.statusUpcoming} />;
}

export function statusLabelOf(position: EventPosition, missed: boolean): string {
  if (missed) return "Não realizado";
  if (position === "past") return "Aconteceu";
  return position === "running" ? "Em andamento" : "Vai acontecer";
}

/** O cartão de nota anexada: número principal, uma linha, detalhes — e o título, que abre a nota. */
export function NoteCard({ userId, note, eventName, dateTitle, agendaMinutes }: {
  userId: string; note: NoteDto; eventName: string; dateTitle: string; agendaMinutes: number | null;
}) {
  const [open, setOpen] = useState(true);
  let title: string;
  if (note.type === "meal") title = note.data.name || eventName;
  else if (note.type === "training") title = eventName;
  else if (note.type === "sleep") title = dateTitle;
  else if (note.type === "text") title = note.name;
  else return null;
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <section aria-label="Notas do evento">
      <div className={styles.sectionLabel}><h2>Notas</h2><span>1</span></div>
      <article className={styles.note}>
        <div className={styles.noteTop}>
          <span className={styles.noteHead}>
            <span className={styles.noteKind}><StickyNote {...icon} />Nota</span>
            <Link href={`/${userId}/notas/${note.id}`} className={styles.noteTitle}>{title}</Link>
          </span>
          <button type="button" aria-expanded={open} aria-label={open ? "Recolher nota" : "Expandir nota"} className={styles.noteToggle} onClick={() => setOpen((value) => !value)}>
            <Chevron {...icon} />
          </button>
        </div>
        {open ? <NoteBody note={note} agendaMinutes={agendaMinutes} /> : null}
      </article>
    </section>
  );
}
