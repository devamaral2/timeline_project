"use client";

import { ChevronDown, FileText } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ICON_STROKE_WIDTH } from "@/components/events/event-visuals";
import { OptionsGlyph } from "@/components/ui/options-glyph";
import page from "@/components/ui/page.module.css";
import { authedFetch } from "@/lib/api/authed-fetch";
import type { NoteDto } from "@/lib/api/contracts";
import { useNow } from "@/lib/events/use-now";
import { groupNotesByType, noteCountLabel } from "@/lib/notes/notes-model";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import { hasPendingMeal } from "@/lib/notes/meal-generation";
import { usePendingMealRefresh } from "@/lib/notes/use-pending-meal-refresh";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { NoteCard } from "./NoteCard";
import { noteTypeIcon } from "./NoteSheet";
import styles from "./notes.module.css";

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Notas com pelo menos uma das tags (qualquer uma) e de um dos tipos escolhidos; sem escolha, todas. */
function matchesFilters(note: NoteDto, types: string[], tags: string[]): boolean {
  if (types.length > 0 && !types.includes(note.type)) return false;
  return tags.length === 0 || note.tags.some((tag) => tags.includes(tag));
}

/** Quantas tags a coluna mostra antes de "Mostrar todas". */
const TAGS_SHOWN = 12;

/**
 * Notas agrupadas por tipo (texto, refeição, treino, sono, skill, agente); cada
 * grupo recolhe. Os tipos e as tags filtram: na coluna esquerda no desktop, no
 * painel de opções no celular.
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
  const [showAllTags, setShowAllTags] = useState(false);
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
  // As tags mais usadas primeiro: com muitas, a coluna mostra só as primeiras e o resto abre sob pedido.
  const allTags = useMemo(() => {
    const uses = new Map<string, number>();
    for (const tag of (notes ?? []).flatMap((note) => note.tags)) uses.set(tag, (uses.get(tag) ?? 0) + 1);
    return [...uses.keys()].sort((a, b) => (uses.get(b) ?? 0) - (uses.get(a) ?? 0) || a.localeCompare(b, "pt-BR"));
  }, [notes]);
  const shownTags = showAllTags ? allTags : allTags.filter((tag, index) => index < TAGS_SHOWN || selectedTags.includes(tag));
  const typeCounts = useMemo(() => new Map(groupNotesByType(notes ?? []).map(({ key, notes: typed }) => [key, typed.length])), [notes]);
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

  /** Os tipos (que filtram) e as tags: na coluna esquerda no desktop e, no celular, dentro do painel de opções. */
  const filters = (
    <>
      <fieldset className={styles.typeGroup} aria-label="Tipo de nota">
        <ul className={styles.typeList} data-filtered={selectedTypes.length > 0}>
          {typeOptions.map((type) => {
            const Icon = noteTypeIcon(type.key);
            return (
              <li key={type.key}>
                <button type="button" className={styles.typeToggle} data-note-type={type.key} aria-pressed={selectedTypes.includes(type.key)} onClick={() => setSelectedTypes((current) => toggleIn(current, type.key))}>
                  <i aria-hidden><Icon strokeWidth={ICON_STROKE_WIDTH} /></i>
                  <span>{type.label}</span>
                  <strong aria-hidden>{typeCounts.get(type.key) ?? 0}</strong>
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>
      {allTags.length > 0 ? (
        <div className={styles.tagFilter}>
          <p className={styles.tagLabel}>Filtrar por tag</p>
          <fieldset className={styles.tagChips} aria-label="Filtrar por tag">
            {shownTags.map((tag) => (
              <button key={tag} type="button" className={styles.tagChip} aria-pressed={selectedTags.includes(tag)} onClick={() => setSelectedTags((current) => toggleIn(current, tag))}>
                <i style={tagAccentStyle(tag)} aria-hidden="true" />#{tag}
              </button>
            ))}
          </fieldset>
          {allTags.length > TAGS_SHOWN ? (
            <button type="button" className={styles.clear} aria-expanded={showAllTags} onClick={() => setShowAllTags((shown) => !shown)}>
              {showAllTags ? "Mostrar menos" : `Mostrar todas as ${allTags.length} tags`}
            </button>
          ) : null}
        </div>
      ) : null}
      {activeFilters > 0 ? <button type="button" className={styles.clear} onClick={clearFilters}>Limpar filtros</button> : null}
    </>
  );
  const hasNotes = Boolean(notes && notes.length > 0);

  return (
    <main id="conteudo" className={page.frame}>
      <section className={`${page.lead} ${styles.lead}`} aria-label="Resumo das notas">
        <div className={styles.headRow}>
          <h1 className={page.eyebrow}>{notes ? noteCountLabel(notes.length) : "Notas"}</h1>
          {hasNotes ? (
            <div className={styles.phoneOptions} ref={optionsRef}>
              <button
                type="button"
                className={styles.optionsButton}
                aria-label={activeFilters > 0 ? `Opções de visualização, ${activeFilters} filtros ativos` : "Opções de visualização"}
                title="Opções de visualização"
                aria-expanded={optionsOpen}
                aria-haspopup="dialog"
                onClick={() => setOptionsOpen((open) => !open)}
              >
                <OptionsGlyph />
                {activeFilters > 0 ? <span className={styles.optionsBadge} aria-hidden="true">{activeFilters}</span> : null}
              </button>
              {optionsOpen ? <div className={styles.optionsPanel} role="dialog" aria-label="Opções de visualização">{filters}</div> : null}
            </div>
          ) : null}
        </div>
        {hasNotes && !optionsOpen ? <div className={styles.leadFilters}>{filters}</div> : null}
      </section>

      <section className={`${page.body} ${styles.body}`} aria-label="Lista de notas">
        {error ? (
          <p role="alert" className={styles.message}>Não foi possível carregar as notas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
        ) : !notes ? (
          <ListSkeleton label="Carregando notas…" />
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
                <section key={type.key} aria-label={type.label}>
                  <h2 className={styles.groupHead}>
                    <button type="button" className={styles.groupToggle} aria-expanded={!typeCollapsed} onClick={() => setCollapsed((current) => toggleIn(current, type.key))}>
                      <ChevronDown className={styles.chevron} aria-hidden />{type.label}<span>{type.notes.length}</span>
                    </button>
                  </h2>
                  <ul className={styles.noteList} hidden={typeCollapsed}>
                    {type.notes.map((note) => (
                      <li key={note.id}><NoteCard note={note} now={now} href={`/${userId}/notas/${note.id}`} /></li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
