"use client";

import { ChevronDown, FileText, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TagInput } from "@/components/events/new-event-forms/TagInput";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { NoteDto } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { groupNotesByType } from "@/lib/notes/notes-model";
import { hasPendingMeal } from "@/lib/notes/meal-generation";
import { usePendingMealRefresh } from "@/lib/notes/use-pending-meal-refresh";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { NoteCard } from "./NoteCard";
import styles from "./notes.module.css";

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Notas com pelo menos uma das tags (qualquer uma) e de um dos tipos escolhidos; sem escolha, todas. */
function matchesFilters(note: NoteDto, types: string[], tags: string[]): boolean {
  if (types.length > 0 && !types.includes(note.type)) return false;
  return tags.length === 0 || note.tags.some((tag) => tags.includes(tag));
}

/**
 * Notas agrupadas por tipo (texto, refeição, treino, sono, skill, agente); cada grupo recolhe.
 */
export function NotesScreen({ userId }: { userId: string }) {
  const now = useNow();
  const [notes, setNotes] = useState<NoteDto[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const optionsRef = useRef<HTMLDivElement>(null);
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

  // As opções de tipo vêm de todas as notas, para não sumirem enquanto o filtro estreita a lista.
  const typeOptions = useMemo(() => groupNotesByType(notes ?? []).map(({ key, label }) => ({ key, label })), [notes]);
  const typeGroups = useMemo(
    () => groupNotesByType((notes ?? []).filter((note) => matchesFilters(note, selectedTypes, selectedTags))),
    [notes, selectedTypes, selectedTags],
  );
  const activeFilters = selectedTypes.length + selectedTags.length;

  useEffect(() => {
    if (!optionsOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) { if (event.key === "Escape") setOptionsOpen(false); return; }
      if (!optionsRef.current?.contains(event.target as Node)) setOptionsOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [optionsOpen]);

  function clearFilters() {
    setSelectedTypes([]);
    setSelectedTags([]);
  }

  return (
    <main id="conteudo" className={styles.page}>
      <header className={styles.pageHead}>
        <h1 className={styles.title}>Notas</h1>
        {notes && notes.length > 0 ? (
          <div className={styles.options} ref={optionsRef}>
            <button
              type="button"
              className={styles.optionsButton}
              aria-label="Opções de visualização"
              title="Opções de visualização"
              aria-expanded={optionsOpen}
              aria-haspopup="dialog"
              onClick={() => setOptionsOpen((open) => !open)}
            >
              <SlidersHorizontal aria-hidden />
              {activeFilters > 0 ? <span className={styles.optionsBadge} aria-label={`${activeFilters} filtros ativos`}>{activeFilters}</span> : null}
            </button>
            {optionsOpen ? (
              <div className={styles.optionsPanel} role="dialog" aria-label="Opções de visualização">
                <fieldset className={styles.optionsGroup}>
                  <legend>Tipo de nota</legend>
                  <div className={styles.typeChips}>
                    {typeOptions.map((type) => (
                      <button
                        key={type.key}
                        type="button"
                        className={styles.chip}
                        aria-pressed={selectedTypes.includes(type.key)}
                        onClick={() => setSelectedTypes((current) => toggleIn(current, type.key))}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <TagInput tags={selectedTags} onTagsChange={setSelectedTags} />
                <button type="button" className={styles.optionsClear} onClick={clearFilters} disabled={activeFilters === 0}>Limpar filtros</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <p role="alert" className={styles.message}>Não foi possível carregar as notas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
      ) : !notes ? (
        <div className={styles.groups} aria-busy="true"><p role="status" className={styles.message}>Carregando notas…</p></div>
      ) : notes.length === 0 ? (
        <div className={styles.empty}>
          <FileText aria-hidden />
          <h2 className={styles.emptyTitle}>Nenhuma nota ainda</h2>
          <p className={styles.emptyText}>As notas aparecem aqui assim que existirem.</p>
        </div>
      ) : typeGroups.length === 0 ? (
        <div className={styles.empty}>
          <FileText aria-hidden />
          <h2 className={styles.emptyTitle}>Nenhuma nota encontrada</h2>
          <p className={styles.emptyText}>Nada combina com o tipo e as tags escolhidos.</p>
          <button type="button" className={styles.emptyAction} onClick={clearFilters}>Limpar filtros</button>
        </div>
      ) : (
        <div className={styles.groups}>
          {typeGroups.map((type) => {
            const typeCollapsed = collapsed.includes(type.key);
            return (
              <section key={type.key} aria-label={type.label} className={styles.group}>
                <h2 className={styles.groupHead}>
                  <button type="button" className={styles.groupToggle} aria-expanded={!typeCollapsed} onClick={() => setCollapsed((current) => toggleIn(current, type.key))}>
                    <ChevronDown className={styles.chevron} aria-hidden />
                    <span className={styles.groupTitle}>{type.label}</span>
                    <span className={styles.groupCount}>{type.notes.length}</span>
                  </button>
                </h2>
                <ul className={styles.noteGrid} hidden={typeCollapsed}>
                  {type.notes.map((note) => (
                    <li key={note.id}><NoteCard note={note} now={now} href={`/${userId}/notas/${note.id}`} /></li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
