"use client";

import type { TaskPriority } from "@repo/contracts";
import { useState } from "react";
import { eventPriorityLabels } from "@/components/events/event-priority-mark";
import { PRIORITY_ORDER } from "@/lib/events/task-filters";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import styles from "./tasks.module.css";

/** Quantas tags a coluna mostra antes de "Mostrar todas". Igual à aba Notas. */
const TAGS_SHOWN = 12;

interface TaskFiltersProps {
  /** Tags da lista sem filtro: as opções não somem quando um filtro estreita a lista. */
  tags: readonly string[];
  tag: string | null;
  onTagToggle: (tag: string) => void;
  priorities: readonly TaskPriority[];
  onPriorityToggle: (priority: TaskPriority) => void;
  /** Texto digitado (ainda sem a espera da busca). */
  query: string;
  onQueryChange: (value: string) => void;
  activeFilters: number;
  onClear: () => void;
}

/** Texto, prioridade e tag, como na aba Notas. A tela decide onde os controles aparecem. */
export function TaskFilters({
  tags,
  tag,
  onTagToggle,
  priorities,
  onPriorityToggle,
  query,
  onQueryChange,
  activeFilters,
  onClear,
}: TaskFiltersProps) {
  const [showAllTags, setShowAllTags] = useState(false);
  const shownTags = showAllTags ? tags : tags.filter((name, index) => index < TAGS_SHOWN || name === tag);

  return (
    <>
      <input
        type="search"
        className={styles.search}
        aria-label="Buscar tarefas"
        placeholder="Buscar nas tarefas"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      <div className={styles.tagFilter}>
        <p className={styles.tagLabel}>Prioridade</p>
        <fieldset className={styles.tagChips} aria-label="Filtrar por prioridade">
          {PRIORITY_ORDER.map((level) => (
            <button
              key={level}
              type="button"
              className={styles.tagChip}
              aria-pressed={priorities.includes(level)}
              onClick={() => onPriorityToggle(level)}
            >
              {eventPriorityLabels[level]}
            </button>
          ))}
        </fieldset>
      </div>
      {tags.length > 0 ? (
        <div className={styles.tagFilter}>
          <p className={styles.tagLabel}>Filtrar por tag</p>
          <fieldset className={styles.tagChips} aria-label="Filtrar por tag">
            {shownTags.map((name) => (
              <button
                key={name}
                type="button"
                className={styles.tagChip}
                aria-pressed={tag === name}
                onClick={() => onTagToggle(name)}
              >
                <i style={tagAccentStyle(name)} aria-hidden="true" />#{name}
              </button>
            ))}
          </fieldset>
          {tags.length > TAGS_SHOWN ? (
            <button type="button" className={styles.clear} aria-expanded={showAllTags} onClick={() => setShowAllTags((shown) => !shown)}>
              {showAllTags ? "Mostrar menos" : `Mostrar todas as ${tags.length} tags`}
            </button>
          ) : null}
        </div>
      ) : null}
      {activeFilters > 0 ? <button type="button" className={styles.clear} onClick={onClear}>Limpar filtros</button> : null}
    </>
  );
}
