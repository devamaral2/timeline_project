"use client";

import type { ArtifactDto, ArtifactType } from "@repo/contracts";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ICON_STROKE_WIDTH } from "@/components/events/event-visuals";
import { OptionsGlyph } from "@/components/ui/options-glyph";
import page from "@/components/ui/page.module.css";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { type ArtifactFilters, listArtifacts } from "@/lib/api/artifacts";
import {
  artifactCountLabel,
  artifactTagsByUse,
  artifactTypeLabel,
  artifactTypesIn,
  artifactVisualType,
} from "@/lib/artifacts/artifact-model";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import { NoteSheet, noteTypeIcon } from "./NoteSheet";
import styles from "./notes.module.css";

function toggle<T>(current: T | null, value: T): T | null {
  return current === value ? null : value;
}

/** Quantas tags a coluna mostra antes de "Mostrar todas". */
const TAGS_SHOWN = 12;
/** Espera depois da última tecla antes de consultar a API pelo texto. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Os artefatos do usuário, do mais recente para o mais antigo. Tipo, tag e
 * texto são parâmetros da consulta à API: a tela não filtra na mão. As opções
 * de tipo e de tag vêm da lista sem filtro, para não sumirem quando um filtro
 * estreita o resultado. No celular, os filtros moram no painel de opções.
 */
export function NotesScreen({ userId }: { userId: string }) {
  const [artifacts, setArtifacts] = useState<ArtifactDto[] | null>(null);
  const [facets, setFacets] = useState<ArtifactDto[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ArtifactType | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => setReloadKey((key) => key + 1);
    window.addEventListener(agendaRefreshEvent, refresh);
    return () => window.removeEventListener(agendaRefreshEvent, refresh);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey força o refetch.
  useEffect(() => {
    let cancelled = false;
    const filters: ArtifactFilters = {
      type: selectedType ?? undefined,
      tag: selectedTag ?? undefined,
      q: search || undefined,
    };
    const unfiltered = !selectedType && !selectedTag && !search;
    setError(false);
    void listArtifacts(filters)
      .then((data) => {
        if (cancelled) return;
        setArtifacts(data);
        if (unfiltered) setFacets(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedType, selectedTag, search, reloadKey]);

  const retry = useCallback(() => {
    setArtifacts(null);
    setReloadKey((key) => key + 1);
  }, []);

  const typeOptions = useMemo(() => artifactTypesIn(facets ?? []), [facets]);
  const typeCounts = useMemo(() => {
    const counts = new Map<ArtifactType, number>();
    for (const artifact of facets ?? []) counts.set(artifact.type, (counts.get(artifact.type) ?? 0) + 1);
    return counts;
  }, [facets]);
  const allTags = useMemo(() => artifactTagsByUse(facets ?? []), [facets]);
  const shownTags = showAllTags ? allTags : allTags.filter((tag, index) => index < TAGS_SHOWN || tag === selectedTag);
  const activeFilters = (selectedType ? 1 : 0) + (selectedTag ? 1 : 0) + (search ? 1 : 0);
  const hasArtifacts = (facets?.length ?? 0) > 0;

  useEffect(() => {
    if (!optionsOpen) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") setOptionsOpen(false);
        return;
      }
      if (!optionsRef.current?.contains(event.target as Node)) setOptionsOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [optionsOpen]);

  function clearFilters() {
    setSelectedType(null);
    setSelectedTag(null);
    setQuery("");
    setSearch("");
  }

  /** Tipo, tag e texto: na coluna esquerda no desktop e, no celular, dentro do painel de opções. */
  const filters = (
    <>
      <input
        type="search"
        className={styles.search}
        aria-label="Buscar notas"
        placeholder="Buscar nas notas"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <fieldset className={styles.typeGroup} aria-label="Tipo de nota">
        <ul className={styles.typeList} data-filtered={selectedType !== null}>
          {typeOptions.map((type) => {
            const Icon = noteTypeIcon(artifactVisualType(type));
            return (
              <li key={type}>
                <button
                  type="button"
                  className={styles.typeToggle}
                  data-note-type={artifactVisualType(type)}
                  aria-pressed={selectedType === type}
                  onClick={() => setSelectedType((current) => toggle(current, type))}
                >
                  <i aria-hidden><Icon strokeWidth={ICON_STROKE_WIDTH} /></i>
                  <span>{artifactTypeLabel(type)}</span>
                  <strong aria-hidden>{typeCounts.get(type) ?? 0}</strong>
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
              <button
                key={tag}
                type="button"
                className={styles.tagChip}
                aria-pressed={selectedTag === tag}
                onClick={() => setSelectedTag((current) => toggle(current, tag))}
              >
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

  return (
    <main id="conteudo" className={page.frame}>
      <section className={`${page.lead} ${styles.lead}`} aria-label="Resumo das notas">
        <div className={styles.headRow}>
          <h1 className={page.eyebrow}>{artifacts ? artifactCountLabel(artifacts.length) : "Notas"}</h1>
          {hasArtifacts ? (
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
        {hasArtifacts && !optionsOpen ? <div className={styles.leadFilters}>{filters}</div> : null}
      </section>

      <section className={`${page.body} ${styles.body}`} aria-label="Lista de notas">
        {error ? (
          <p role="alert" className={styles.message}>Não foi possível carregar as notas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
        ) : !artifacts ? (
          <ListSkeleton label="Carregando notas…" />
        ) : artifacts.length === 0 ? (
          activeFilters > 0 ? (
            <div className={styles.empty}>
              <FileText aria-hidden />
              <h2 className={styles.emptyTitle}>Nenhuma nota encontrada</h2>
              <p className={styles.emptyText}>Nada combina com os filtros escolhidos.</p>
              <button type="button" className={styles.emptyAction} onClick={clearFilters}>Limpar filtros</button>
            </div>
          ) : (
            <div className={styles.empty}>
              <FileText aria-hidden />
              <h2 className={styles.emptyTitle}>Nenhuma nota ainda</h2>
              <p className={styles.emptyText}>As notas aparecem aqui assim que existirem.</p>
            </div>
          )
        ) : (
          <ul className={styles.noteList}>
            {artifacts.map((artifact) => {
              const visual = artifactVisualType(artifact.type);
              return (
                <li key={artifact.id}>
                  <Link href={`/${userId}/notas/${artifact.id}`} className={styles.row} data-note-type={visual}>
                    <NoteSheet type={visual} className={styles.sheet} />
                    <span className={styles.rowText}>
                      <span className={styles.rowTitle}>{artifact.name}</span>
                      <span className={styles.rowMeta}>
                        <span>{artifactTypeLabel(artifact.type)}</span>
                        {artifact.tags.map((tag) => (
                          <span key={tag} style={tagAccentStyle(tag)}>#{tag}</span>
                        ))}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
