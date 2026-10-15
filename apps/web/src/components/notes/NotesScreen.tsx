"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { NoteDto } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { groupNotesByTag } from "@/lib/notes/notes-model";
import { hasPendingMeal } from "@/lib/notes/meal-generation";
import { usePendingMealRefresh } from "@/lib/notes/use-pending-meal-refresh";
import { agendaRefreshEvent } from "@/app/mockups/eventos/agenda-refresh";
import { NoteCard } from "./NoteCard";
import styles from "./notes.module.css";

function countLabel(total: number): string {
  return total === 1 ? "1 nota" : `${total} notas`;
}

/** Notas agrupadas por tag, com grupos recolhíveis e seleção de tags visíveis. */
export function NotesScreen({ userId }: { userId: string }) {
  const now = useNow();
  const [notes, setNotes] = useState<NoteDto[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [hiddenTags, setHiddenTags] = useState<string[]>([]);
  const [collapsedTags, setCollapsedTags] = useState<string[]>([]);
  usePendingMealRefresh(hasPendingMeal(notes ?? []), async () => {
    setNotes(await authedFetch<NoteDto[]>("/api/notes"));
  });
  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1);
    window.addEventListener(agendaRefreshEvent, refresh);
    return () => window.removeEventListener(agendaRefreshEvent, refresh);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey força o refetch.
  useEffect(() => {
    let cancelled = false;
    setError(false);
    void authedFetch<NoteDto[]>("/api/notes")
      .then((data) => { if (!cancelled) setNotes(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const retry = useCallback(() => {
    setNotes(null);
    setReloadKey((key) => key + 1);
  }, []);

  const allGroups = useMemo(() => groupNotesByTag(notes ?? []), [notes]);
  const groups = allGroups.filter((group) => !hiddenTags.includes(group.key));

  return (
    <main id="conteudo" className={styles.screen}>
      <div className={styles.heading}>
        <div className={styles.titleBlock}>
          <p className={styles.count} aria-live="polite">{notes ? countLabel(notes.length) : " "}</p>
          <h1 className={styles.title}>Notas</h1>
        </div>
        <div className={styles.headingActions}>
          <details className={styles.viewOptions} onKeyDown={(event) => {
            if (event.key === "Escape") { event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
          }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
            <summary aria-label="Opções de visualização" title="Opções de visualização"><SlidersHorizontal aria-hidden /></summary>
            <fieldset className={styles.tagOptions}>
              <legend>Tags exibidas</legend>
              {allGroups.length === 0 ? <p>Nenhuma tag disponível.</p> : allGroups.map((group) => (
                <label key={group.key}>
                  <input type="checkbox" checked={!hiddenTags.includes(group.key)} onChange={() => setHiddenTags((current) => current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key])} />
                  <span>{group.label}</span>
                </label>
              ))}
            </fieldset>
          </details>
        </div>
      </div>

      {error ? (
        <p role="alert" className={styles.message}>Não foi possível carregar as notas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
      ) : !notes ? (
        <div className={styles.groups} aria-busy="true"><p role="status" className={styles.message}>Carregando notas…</p></div>
      ) : notes.length === 0 ? (
        <p className={styles.message}>Você ainda não tem notas.</p>
      ) : groups.length === 0 ? (
        <p className={styles.message}>Nenhuma tag selecionada. Escolha as tags no menu de opções.</p>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className={styles.groupTitle}>
                <button type="button" aria-expanded={!collapsedTags.includes(group.key)} onClick={() => setCollapsedTags((current) => current.includes(group.key) ? current.filter((key) => key !== group.key) : [...current, group.key])}>
                  <ChevronDown aria-hidden /><span>{group.label}</span><span className={styles.groupCount}>{group.notes.length}</span>
                </button>
              </h2>
              <div className={styles.grid} hidden={collapsedTags.includes(group.key)}>
                {group.notes.map((note) => <NoteCard key={note.id} note={note} now={now} href={`/${userId}/notas/${note.id}`} />)}
              </div>
            </section>
          ))}
        </div>
      )}

    </main>
  );
}
