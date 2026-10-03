"use client";

import { Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { NoteDto } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { filterNotes, groupNotes, noteFilters, type NoteFilter } from "@/lib/notes/notes-model";
import { NoteCard } from "./NoteCard";
import { NoteEditorDialog } from "./NoteEditorDialog";
import styles from "./notes.module.css";

function countLabel(total: number): string {
  return total === 1 ? "1 nota" : `${total} notas`;
}

/** A lista de notas: filtros por origem, busca e grupos por dia. */
export function NotesScreen({ userId }: { userId: string }) {
  const router = useRouter();
  const now = useNow();
  const [notes, setNotes] = useState<NoteDto[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey força o refetch.
  useEffect(() => {
    let cancelled = false;
    setError(false);
    void authedFetch<NoteDto[]>("/api/notes")
      .then((data) => { if (!cancelled) setNotes(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const retry = useCallback(() => {
    setNotes(null);
    setReloadKey((key) => key + 1);
  }, []);

  const visible = useMemo(() => (notes ? filterNotes(notes, filter, query) : []), [notes, filter, query]);
  // Sem relogio (antes de hidratar) nao ha "hoje": um grupo so, na ordem da API.
  const groups = useMemo(() => (now ? groupNotes(visible, now) : []), [visible, now]);

  return (
    <main id="conteudo" className={styles.screen}>
      <div className={styles.heading}>
        <div className={styles.titleBlock}>
          <p className={styles.count} aria-live="polite">{notes ? countLabel(notes.length) : " "}</p>
          <h1 className={styles.title}>Notas</h1>
        </div>
        <div className={styles.headingActions}>
          <button type="button" className={styles.roundButton} aria-label="Buscar notas" aria-pressed={searching}
            onClick={() => { setSearching((open) => !open); setQuery(""); }}><Search aria-hidden /></button>
          <button type="button" className={styles.createButton} aria-label="Nova nota" onClick={() => setCreating(true)}>
            <Plus aria-hidden /><span className={styles.createLabel}>Nova nota</span>
          </button>
        </div>
      </div>

      {searching ? (
        <label className={styles.search}>
          <Search aria-hidden />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar em título, texto e tags" aria-label="Buscar notas" ref={searchRef} />
        </label>
      ) : null}

      <fieldset aria-label="Filtrar notas" className={styles.filters}>
        {noteFilters.map(({ key, label }) => (
          <button key={key} type="button" className={styles.filter} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </fieldset>

      {error ? (
        <p role="alert" className={styles.message}>Não foi possível carregar as notas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
      ) : !notes ? (
        <div className={styles.groups} aria-busy="true"><p role="status" className={styles.message}>Carregando notas…</p></div>
      ) : notes.length === 0 ? (
        <p className={styles.message}>Você ainda não tem notas. Toque em “Nova nota” para escrever a primeira.</p>
      ) : visible.length === 0 ? (
        <p className={styles.message}>Nenhuma nota encontrada.</p>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className={styles.groupTitle}>{group.label}<span className={styles.groupCount}>{group.notes.length}</span></h2>
              <div className={styles.grid}>
                {group.notes.map((note) => <NoteCard key={note.id} note={note} now={now} href={`/${userId}/notas/${note.id}`} />)}
              </div>
            </section>
          ))}
        </div>
      )}

      {creating ? (
        <NoteEditorDialog
          onClose={() => setCreating(false)}
          onSaved={(noteId) => {
            setCreating(false);
            if (noteId) router.push(`/${userId}/notas/${noteId}`);
            else retry();
          }}
        />
      ) : null}
    </main>
  );
}
