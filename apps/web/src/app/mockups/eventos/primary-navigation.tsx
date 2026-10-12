"use client";

import { CalendarDays, NotepadText, SquareCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./mockup.module.css";

/** A navegação principal do cabeçalho no desktop; no celular quem navega é a barra inferior. */
export function PrimaryNavigation({ userId }: { userId?: string }) {
  const pathname = usePathname();
  const base = userId ? `/${userId}` : "/mockups/eventos";
  const notesHref = `${base}/notas`;
  const tasksHref = `${base}/tarefas`;
  const onNotes = pathname === notesHref || pathname.startsWith(`${notesHref}/`);
  const onTasks = pathname === tasksHref || pathname.startsWith(`${tasksHref}/`);

  return (
    <nav className={styles.primaryNav} aria-label="Principal">
      <Link href={base} className={onNotes || onTasks ? undefined : styles.navActive} aria-current={onNotes || onTasks ? undefined : "page"}>
        <CalendarDays aria-hidden />Agenda
      </Link>
      <Link href={tasksHref} className={onTasks ? styles.navActive : undefined} aria-current={onTasks ? "page" : undefined}>
        <SquareCheck aria-hidden />Tarefas
      </Link>
      <Link href={notesHref} className={onNotes ? styles.navActive : undefined} aria-current={onNotes ? "page" : undefined}>
        <NotepadText aria-hidden />Notas
      </Link>
    </nav>
  );
}
