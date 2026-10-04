"use client";

import { ArrowLeft, CalendarPlus, ChevronRight, Ellipsis, Pencil, Tag, Trash2, Unlink } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ICON_STROKE_WIDTH } from "@/components/events/event-visuals";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { NoteDto } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { noteDates, sleepAgendaOf, whenLabel } from "@/lib/notes/notes-model";
import { tagColorStyle } from "@/lib/tags/tag-color";
import shellStyles from "@/app/mockups/eventos/mockup.module.css";
import { DeleteNoteDialog } from "./DeleteNoteDialog";
import { NoteContent } from "./NoteContent";
import { NoteEditorDialog } from "./NoteEditorDialog";
import { originOfLink } from "./NoteOrigin";
import styles from "./notes.module.css";

const icon = { "aria-hidden": true, strokeWidth: ICON_STROKE_WIDTH } as const;

/** A nota aberta: título, datas, tags, onde ela aparece e o conteúdo — com editar, soltar e excluir no menu. */
export function NoteDetailScreen({ userId, noteId }: { userId: string; noteId: string }) {
  const router = useRouter();
  const now = useNow();
  const [note, setNote] = useState<NoteDto | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listHref = `/${userId}/notas`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey força o refetch após editar.
  useEffect(() => {
    let cancelled = false;
    setError(false);
    void authedFetch<NoteDto>(`/api/notes/${noteId}`)
      .then((data) => { if (!cancelled) setNote(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [noteId, reloadKey]);

  useEffect(() => {
    if (!menuOpen) return;
    function close(event: Event) {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  async function detach() {
    if (!note) return;
    setMenuOpen(false);
    setActionError(null);
    try {
      await authedFetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: note.revision, eventIds: [], taskIds: [] }),
      });
      setReloadKey((key) => key + 1);
    } catch {
      setActionError("Não foi possível soltar a nota. Tente novamente.");
    }
  }

  if (error) {
    return (
      <main id="conteudo" className={shellStyles.detailMain}>
        <div className={styles.detail}>
          <Link href={listHref} className={styles.backLink}><ArrowLeft {...icon} />Notas</Link>
          <p role="alert" className={styles.message}>Não foi possível carregar a nota. Tente novamente.</p>
        </div>
      </main>
    );
  }
  if (!note) {
    return <main id="conteudo" className={shellStyles.detailMain}><p role="status" className={styles.message}>Carregando nota…</p></main>;
  }

  const links = note.links ?? [];
  const dates = now ? noteDates(note, now) : null;
  const sleep = sleepAgendaOf(note);

  return (
    <main id="conteudo" className={shellStyles.detailMain}>
      <div className={styles.detail}>
        <nav className={styles.navigation} aria-label="Nota">
          <Link href={listHref} className={styles.backLink}><ArrowLeft {...icon} />Notas</Link>
          <div className={styles.menuAnchor} ref={menuRef}>
            <button type="button" className={styles.iconButton} aria-label="Mais ações: editar, soltar, excluir" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Ellipsis {...icon} /></button>
            {menuOpen ? (
              <div role="menu" className={styles.menu}>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setEditing(true); }}><Pencil {...icon} />Editar</button>
                {links.length ? <button type="button" role="menuitem" onClick={() => void detach()}><Unlink {...icon} />Soltar da origem</button> : null}
                <button type="button" role="menuitem" data-danger="true" onClick={() => { setMenuOpen(false); setDeleting(true); }}><Trash2 {...icon} />Excluir</button>
              </div>
            ) : null}
          </div>
        </nav>

        <header className={styles.heading}>
          <h1>{note.name}</h1>
        </header>

        {dates || note.tags.length ? (
          <section className={styles.info} aria-label="Informações">
            {dates ? (
              <div><CalendarPlus {...icon} /><span>Criada {dates.created}</span></div>
            ) : null}
            {dates?.edited ? <div><Pencil {...icon} /><span>Editada {dates.edited}</span></div> : null}
            {note.tags.length ? (
              <div>
                <Tag {...icon} />
                <ul aria-label="Tags da nota">
                  {note.tags.map((tag) => <li key={tag} style={tagColorStyle(tag)}>#{tag}</li>)}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {links.length ? (
          <section aria-label="Onde a nota aparece">
            <div className={styles.sectionLabel}><h2>Aparece em</h2><span>{links.length}</span></div>
            <ul className={styles.links}>
              {links.map((link) => {
                const { Icon, origin } = originOfLink(link);
                const href = link.kind === "event" ? `/${userId}/eventos/${link.id}` : null;
                const row = (
                  <>
                    <Icon {...icon} />
                    <span className={styles.linkText}>
                      <span className={styles.linkName}>{link.name}</span>
                      <span className={styles.linkMeta}>{link.kind === "event" ? "Evento" : "Tarefa"}{link.at && now ? ` · ${whenLabel(link.at, now)}` : ""}</span>
                    </span>
                    {href ? <ChevronRight {...icon} /> : null}
                  </>
                );
                return (
                  <li key={`${link.kind}-${link.id}`}>
                    {href ? (
                      <Link href={href} className={styles.linkRow} data-origin={origin}>{row}</Link>
                    ) : (
                      <span className={styles.linkRow} data-origin={origin}>{row}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <NoteContent note={note} title={sleep?.title} agendaMinutes={sleep?.agendaMinutes} />
        {actionError ? <p role="alert" className={styles.message}>{actionError}</p> : null}
      </div>

      {editing ? <NoteEditorDialog note={note} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setReloadKey((key) => key + 1); }} /> : null}
      {deleting ? <DeleteNoteDialog noteId={note.id} noteName={note.name} onClose={() => setDeleting(false)} onDeleted={() => router.push(listHref)} /> : null}
    </main>
  );
}
