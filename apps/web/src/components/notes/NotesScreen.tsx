"use client";

import type { ArtifactDto, ArtifactType } from "@repo/contracts";
import { FileText } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ICON_STROKE_WIDTH } from "@/components/tasks/task-visuals";
import page from "@/components/ui/page.module.css";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { type ArtifactFilters, listArtifacts } from "@/lib/api/artifacts";
import {
  artifactActor,
  artifactCountLabel,
  artifactTagsByUse,
  artifactTypeLabel,
  artifactTypesIn,
  artifactVisualType,
} from "@/lib/artifacts/artifact-model";
import { useViewMode } from "@/lib/tasks/view-mode";
import { usePullRefresh } from "@/lib/navigation/pull-refresh";
import { usePublishSectionMenu } from "@/lib/navigation/section-menu";
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
const REFRESH_FAILURE_MESSAGE = "Não foi possível atualizar os artefatos. Tente novamente.";

/**
 * Os artefatos do usuário, do mais recente para o mais antigo. Tipo, tag e
 * texto são parâmetros da consulta à API: a tela não filtra na mão. As opções
 * de tipo e de tag vêm da lista sem filtro, para não sumirem quando um filtro
 * estreita o resultado. No celular, os filtros moram no menu de opções da barra
 * inferior (tocar na aba Notas já selecionada): Todos, Você e Agentes, e a busca.
 */
export function NotesScreen({ userId }: { userId: string }) {
  const [artifacts, setArtifacts] = useState<ArtifactDto[] | null>(null);
  const [facets, setFacets] = useState<ArtifactDto[] | null>(null);
  const [error, setError] = useState(false);
  /** O aviso de uma recarga pedida pelo puxão que falhou: a lista fica na tela. */
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // Quem puxou a tela para recarregar espera aqui o fim da leitura que pediu.
  const pullDone = useRef<(() => void) | null>(null);
  const [selectedType, setSelectedType] = useState<ArtifactType | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);
  const viewMode = useViewMode();

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
    // A leitura que um puxão pediu não mexe no que está na tela antes de voltar; se falhar, só avisa.
    const pulled = pullDone.current;
    pullDone.current = null;
    if (!pulled) setError(false);
    void listArtifacts(filters)
      .then((data) => {
        if (cancelled) return;
        setArtifacts(data);
        setError(false);
        setNotice(null);
        if (unfiltered) setFacets(data);
      })
      .catch(() => {
        if (cancelled) return;
        if (pulled) setNotice(REFRESH_FAILURE_MESSAGE);
        else setError(true);
      })
      .finally(() => pulled?.());
    return () => {
      cancelled = true;
      pulled?.();
    };
  }, [selectedType, selectedTag, search, reloadKey]);

  // Puxar a tela para baixo relê a lista com os filtros atuais, sem voltar ao esqueleto.
  usePullRefresh(() => new Promise<void>((resolve) => {
    pullDone.current?.();
    pullDone.current = resolve;
    setReloadKey((key) => key + 1);
  }));

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

  function clearFilters() {
    setSelectedType(null);
    setSelectedTag(null);
    setQuery("");
    setSearch("");
  }

  // O menu da barra inferior: as listas Todos, Você e Agentes (o mesmo modo da agenda e das tarefas) e a busca.
  // A rota não filtra por dono, então o modo separa aqui os arquivos do Hermes das notas da pessoa.
  const shown = artifacts && viewMode.actor ? artifacts.filter((artifact) => artifactActor(artifact.type) === viewMode.actor) : artifacts;
  usePublishSectionMenu("notes", {
    count: shown?.length,
    lists: [],
    search: hasArtifacts ? { label: "Buscar nos artefatos", value: query, onChange: setQuery } : undefined,
    filtered: activeFilters > 0,
    onClear: clearFilters,
  });

  /** Tipo, tag e texto: na coluna esquerda no desktop e, no celular, dentro do painel de opções. */
  const filters = (
    <>
      <input
        type="search"
        className={styles.search}
        aria-label="Buscar artefatos"
        placeholder="Buscar nos artefatos"
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
      <section className={`${page.lead} ${styles.lead}`} aria-label="Resumo dos artefatos">
        <div className={styles.headRow}>
          <h1 className={page.eyebrow}>{shown ? artifactCountLabel(shown.length) : "Artefatos"}</h1>
        </div>
        {hasArtifacts ? <div className={styles.leadFilters}>{filters}</div> : null}
      </section>

      <section className={`${page.body} ${styles.body}`} aria-label="Lista de artefatos">
        {notice && !error ? <p role="alert" className={styles.message}>{notice}</p> : null}
        {error ? (
          <p role="alert" className={styles.message}>Não foi possível carregar os artefatos.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
        ) : !shown ? (
          <ListSkeleton label="Carregando artefatos…" />
        ) : shown.length === 0 ? (
          activeFilters > 0 || (artifacts?.length ?? 0) > 0 ? (
            <div className={styles.empty}>
              <FileText aria-hidden />
              <h2 className={styles.emptyTitle}>Nenhum artefato encontrado</h2>
              <p className={styles.emptyText}>Nada combina com os filtros escolhidos.</p>
              <button type="button" className={styles.emptyAction} onClick={clearFilters}>Limpar filtros</button>
            </div>
          ) : (
            <div className={styles.empty}>
              <FileText aria-hidden />
              <h2 className={styles.emptyTitle}>Nenhum artefato ainda</h2>
              <p className={styles.emptyText}>Os artefatos aparecem aqui assim que existirem.</p>
            </div>
          )
        ) : (
          <ul className={styles.noteList}>
            {shown.map((artifact) => {
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
