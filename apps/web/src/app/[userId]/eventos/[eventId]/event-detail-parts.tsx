"use client";

import { CalendarCheck, CalendarDays, CalendarX } from "lucide-react";
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

/** O título de uma nota anexada: refeição pelo nome, treino pelo evento, sono pela data, texto pelo nome da nota. */
export function noteTitleOf(note: NoteDto, eventName: string, dateTitle: string): string {
  if (note.type === "meal") return note.data.name || eventName;
  if (note.type === "training") return eventName;
  if (note.type === "sleep") return dateTitle;
  return note.name;
}

/** O conteúdo integral de uma nota de refeição, treino ou sono, direto na tela; a nota em si abre pelos vínculos. */
export function NoteContent({ note, title, agendaMinutes }: { note: NoteDto; title: string; agendaMinutes: number | null }) {
  return (
    <article className={styles.note} aria-label={title}>
      <h2 className={styles.noteTitle}>{title}</h2>
      <NoteBody note={note} agendaMinutes={agendaMinutes} />
    </article>
  );
}
