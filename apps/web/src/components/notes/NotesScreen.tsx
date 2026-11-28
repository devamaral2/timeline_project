"use client";

import type { ArtifactDto } from "@repo/contracts";
import { ChevronDown, FileText } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import page from "@/components/ui/page.module.css";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { AgentStatusIcon } from "@/components/tasks/agent-status-icon";
import { agentStatusNames } from "@/components/tasks/agent-status-names";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { type ArtifactFilters, listArtifacts } from "@/lib/api/artifacts";
import { type ArtifactDrawerKey, artifactDrawersOf, artifactDrawerStartsOpen, artifactRowFacts } from "@/lib/artifacts/artifact-drawers";
import { artifactActor, artifactCountLabel, artifactVisualType } from "@/lib/artifacts/artifact-model";
import { useViewMode } from "@/lib/tasks/view-mode";
import { usePullRefresh } from "@/lib/navigation/pull-refresh";
import { usePublishSectionMenu } from "@/lib/navigation/section-menu";
import { tagAccentStyle } from "@/lib/tags/tag-color";
import { TypeGlyph } from "./NoteSheet";
import styles from "./notes.module.css";

/** Espera depois da última tecla antes de consultar a API pelo texto. */
const SEARCH_DEBOUNCE_MS = 250;
const REFRESH_FAILURE_MESSAGE = "Não foi possível atualizar os artefatos. Tente novamente.";

/** O que a pessoa abriu ou fechou, por gaveta. */
type DrawerChoices = Partial<Record<ArtifactDrawerKey, boolean>>;

function ArtifactRow({ artifact, userId, now }: { artifact: ArtifactDto; userId: string; now: Date }) {
  const visual = artifactVisualType(artifact.type);
  const { support, tags, figure, agentStatus } = artifactRowFacts(artifact, now);
  return (
    <li>
      <Link href={`/${userId}/notas/${artifact.id}`} className={styles.row} data-note-type={visual}>
        <TypeGlyph type={visual} className={styles.glyph} />
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{artifact.name}</span>
          <span className={styles.rowMeta}>
            {support.map((part) => (
              <span key={part.text} data-part={part.style}>{part.text}</span>
            ))}
            {tags.map((tag) => (
              <span key={tag} style={tagAccentStyle(tag)}>#{tag}</span>
            ))}
          </span>
        </span>
        {agentStatus ? (
          <span className={styles.rowStatus} data-status={agentStatus}>
            <span aria-hidden="true">{agentStatusNames[agentStatus]}</span>
            <AgentStatusIcon status={agentStatus} />
          </span>
        ) : figure ? (
          <span className={styles.rowEnd}>{figure}</span>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * Os artefatos do usuário, em uma gaveta por tipo e, dentro dela, do mais recente para o mais antigo. O texto buscado
 * é parâmetro da consulta à API: a tela não filtra na mão. Os filtros moram no
 * menu de opções da barra inferior (tocar na aba Artefatos já selecionada):
 * Todos, Você e Agentes, e a busca.
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
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
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
    const filters: ArtifactFilters = { q: search || undefined };
    const unfiltered = !search;
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
  }, [search, reloadKey]);

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

  const activeFilters = search ? 1 : 0;
  const hasArtifacts = (facets?.length ?? 0) > 0;

  // O que se abre e fecha na lista inteira fica; com busca, vale só para aquela busca.
  const [browsed, setBrowsed] = useState<DrawerChoices>({});
  const [narrowed, setNarrowed] = useState<{ search: string; open: DrawerChoices }>({ search: "", open: {} });
  const choices = search === "" ? browsed : narrowed.search === search ? narrowed.open : {};
  function setDrawerOpen(drawer: ArtifactDrawerKey, open: boolean) {
    if (search === "") setBrowsed((current) => ({ ...current, [drawer]: open }));
    else setNarrowed({ search, open: { ...choices, [drawer]: open } });
  }

  function clearFilters() {
    setQuery("");
    setSearch("");
  }

  // O menu da barra inferior: as listas Todos, Você e Agentes (o mesmo modo da agenda e das tarefas) e a busca.
  // A rota não filtra por dono, então o modo separa aqui os arquivos do Hermes das notas da pessoa.
  const shown = artifacts && viewMode.actor ? artifacts.filter((artifact) => artifactActor(artifact.type) === viewMode.actor) : artifacts;
  const drawers = artifactDrawersOf(shown ?? []);
  const now = new Date();
  usePublishSectionMenu("notes", {
    count: shown?.length,
    lists: [],
    search: hasArtifacts ? { label: "Buscar nos artefatos", value: query, onChange: setQuery } : undefined,
    filtered: activeFilters > 0,
    onClear: clearFilters,
  });

  return (
    <main id="conteudo" className={page.frame}>
      <section className={`${page.lead} ${styles.lead}`} aria-label="Resumo dos artefatos">
        <div className={styles.headRow}>
          <h1 className={page.eyebrow}>{shown ? artifactCountLabel(shown.length) : "Artefatos"}</h1>
        </div>
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
          <div className={styles.groups}>
            {drawers.map((drawer) => {
              const labelId = `artefatos-${drawer.key}`;
              const isOpen = choices[drawer.key] ?? artifactDrawerStartsOpen(drawer.key, drawers.length, activeFilters > 0);
              return (
                <section key={drawer.key} aria-labelledby={`${labelId}-titulo`}>
                  <h2 id={`${labelId}-titulo`} className={styles.groupHead}>
                    <button type="button" className={styles.groupToggle} aria-expanded={isOpen} onClick={() => setDrawerOpen(drawer.key, !isOpen)}>
                      <ChevronDown aria-hidden className={styles.chevron} />{drawer.title}<span>{drawer.artifacts.length}</span>
                    </button>
                  </h2>
                  {isOpen ? (
                    <ul className={styles.noteList}>
                      {drawer.artifacts.map((artifact) => (
                        <ArtifactRow key={artifact.id} artifact={artifact} userId={userId} now={now} />
                      ))}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
