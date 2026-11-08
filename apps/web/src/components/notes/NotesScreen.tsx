"use client";

import { ChevronDown, FileText, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { NoteDto } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { filterNotes, groupNotesByTag } from "@/lib/notes/notes-model";
import { hasPendingMeal } from "@/lib/notes/meal-generation";
import { usePendingMealRefresh } from "@/lib/notes/use-pending-meal-refresh";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import { agendaRefreshEvent } from "@/app/mockups/eventos/agenda-refresh";
import { NoteCard } from "./NoteCard";
import { NoteEditorDialog } from "./NoteEditorDialog";
import styles from "./notes.module.css";

function countLabel(total: number): string {
  return total === 1 ? "1 nota" : `${total} notas`;
}

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * Notas agrupadas por tag, com grupos recolhíveis. Busca pelo texto e filtro por
 * tags em chips; uma nota com várias tags aparece em cada grupo.
 */
export function NotesScreen({ userId }: { userId: string }) {
  const now = useNow();
  const [notes, setNotes] = useState<NoteDto[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [collapsedTags, setCollapsedTags] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
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

  // Os chips vêm de todas as notas, para não sumirem enquanto a busca estreita a lista.
  const allGroups = useMemo(() => groupNotesByTag(notes ?? []), [notes]);
  const groups = useMemo(
    () => groupNotesByTag(filterNotes(notes ?? [], "all", query)).filter((group) => selectedTags.length === 0 || selectedTags.includes(group.key)),
    [notes, query, selectedTags],
  );
  const filtered = query.trim() !== "" || selectedTags.length > 0;

  function clearFilters() {
    setQuery("");
    setSelectedTags([]);
  }

  return (
    <main id="conteudo" className={styles.page}>
      <header className={styles.pageHead}>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow} aria-live="polite">{notes ? countLabel(notes.length) : " "}</p>
          <h1 className={styles.title}>Notas</h1>
          <p className={styles.sub}>Registros curtos de treino, refeições, sono e rotina.</p>
        </div>
        <div className={styles.headingActions}>
          <label className={styles.search}>
            <Search aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar notas"
              aria-label="Buscar notas"
              autoComplete="off"
            />
          </label>
          <button type="button" className={styles.createButton} onClick={() => setCreating(true)}><Plus aria-hidden />Nova nota</button>
        </div>
      </header>

      {notes && notes.length > 0 ? (
        <fieldset className={styles.chips} aria-label="Filtrar por tag">
          {allGroups.map((group) => (
            <button
              key={group.key}
              type="button"
              className={styles.chip}
              aria-pressed={selectedTags.includes(group.key)}
              onClick={() => setSelectedTags((current) => toggleIn(current, group.key))}
            >
              <span className={styles.dot} style={group.key ? tagAccentStyle(group.key) : undefined} aria-hidden="true" />
              {group.label}
            </button>
          ))}
          {selectedTags.length > 0 ? <button type="button" className={styles.chip} onClick={() => setSelectedTags([])}>Limpar tags</button> : null}
        </fieldset>
      ) : null}

      {error ? (
        <p role="alert" className={styles.message}>Não foi possível carregar as notas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
      ) : !notes ? (
        <div className={styles.groups} aria-busy="true"><p role="status" className={styles.message}>Carregando notas…</p></div>
      ) : notes.length === 0 ? (
        <div className={styles.empty}>
          <FileText aria-hidden />
          <h2 className={styles.emptyTitle}>Nenhuma nota ainda</h2>
          <p className={styles.emptyText}>Escreva a primeira nota para guardar o que vale lembrar.</p>
          <button type="button" className={styles.emptyAction} onClick={() => setCreating(true)}>Nova nota</button>
        </div>
      ) : groups.length === 0 ? (
        <div className={styles.empty}>
          <FileText aria-hidden />
          <h2 className={styles.emptyTitle}>Nenhuma nota encontrada</h2>
          <p className={styles.emptyText}>
            {filtered
              ? "Nada combina com a busca e as tags escolhidas. Tente outra palavra ou remova um filtro."
              : "Não há notas para mostrar."}
          </p>
          <button type="button" className={styles.emptyAction} onClick={clearFilters}>Limpar filtros</button>
        </div>
      ) : (
        <div className={styles.groups}>
          {groups.map((group) => {
            const collapsed = collapsedTags.includes(group.key);
            return (
              <section key={group.key} aria-label={group.label} className={styles.group}>
                <h2 className={styles.groupHead}>
                  <button type="button" className={styles.groupToggle} aria-expanded={!collapsed} onClick={() => setCollapsedTags((current) => toggleIn(current, group.key))}>
                    <ChevronDown className={styles.chevron} aria-hidden />
                    <span className={styles.dot} style={group.key ? tagAccentStyle(group.key) : undefined} aria-hidden="true" />
                    <span className={styles.groupTitle}>{group.label}</span>
                    <span className={styles.groupCount}>{group.notes.length}</span>
                  </button>
                </h2>
                <ul className={styles.noteGrid} hidden={collapsed}>
                  {group.notes.map((note) => (
                    <li key={note.id}><NoteCard note={note} now={now} href={`/${userId}/notas/${note.id}`} /></li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {creating ? (
        <NoteEditorDialog
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); retry(); }}
        />
      ) : null}
    </main>
  );
}
