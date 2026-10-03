"use client";

import { CalendarDays, NotepadText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./mockup.module.css";

/** A navegação principal do cabeçalho no desktop; no celular quem navega é a barra inferior. */
export function PrimaryNavigation({ userId }: { userId?: string }) {
  const pathname = usePathname();
  const base = userId ? `/${userId}` : "/mockups/eventos";
  const notesHref = `${base}/notas`;
  const onNotes = pathname === notesHref || pathname.startsWith(`${notesHref}/`);

  return (
    <nav className={styles.primaryNav} aria-label="Principal">
      <Link href={base} className={onNotes ? undefined : styles.navActive} aria-current={onNotes ? undefined : "page"}>
        <CalendarDays aria-hidden />Agenda
      </Link>
      <Link href={notesHref} className={onNotes ? styles.navActive : undefined} aria-current={onNotes ? "page" : undefined}>
        <NotepadText aria-hidden />Notas
      </Link>
    </nav>
  );
}
