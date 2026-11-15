"use client";

import { ChevronDown, ListChecks } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EventCardDto, EventPriority, EventStatus, HumanEventStatus } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { EventRow } from "@/components/events/event-row";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { OptionsGlyph } from "@/components/ui/options-glyph";
import page from "@/components/ui/page.module.css";
import { ApiRequestError } from "@/lib/api/client-request";
import { listTrackedEvents, updateEvent } from "@/lib/api/events";
import { hasOpenAgentEvent } from "@/lib/events/agent-request-model";
import { statusPatch } from "@/lib/events/event-read-model";
import { taskFilterCount, tagsByUse, trackedFilters } from "@/lib/events/task-filters";
import { useNow } from "@/lib/events/use-now";
import { useOpenAgentRefresh } from "@/lib/events/use-open-agent-refresh";
import { useViewMode } from "@/lib/events/view-mode";
import {
  groupTrackedEvents,
  oneRowPerSeries,
  showsSeriesRule,
  subtaskProgress,
  type TaskGroupKey,
} from "@/lib/events/task-groups";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { TaskFilters } from "./TaskFilters";
import styles from "./tasks.module.css";

function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Estados de pessoa que o glifo reabre: feito, cancelado e não realizado. */
const CLOSED_STATUSES: ReadonlySet<EventStatus> = new Set<EventStatus>(["done", "cancel", "missed"]);

/** Concluir ou reabrir pelo glifo: o que está em aberto vai a `done`; o fechado volta a `todo`. */
function toggledStatus(card: EventCardDto): HumanEventStatus {
  return card.status !== undefined && CLOSED_STATUSES.has(card.status) ? "todo" : "done";
}

const STALE_MESSAGE = "Esta tarefa mudou em outro lugar. Carregamos a lista atual; confira e tente de novo.";
const FAILURE_MESSAGE = "Não foi possível trocar o status. Tente novamente.";
/** Espera depois da última tecla antes de consultar a API pelo texto. Igual à aba Notas. */
const SEARCH_DEBOUNCE_MS = 250;

/** "9 tarefas abertas": a legenda em mono no topo da tela. */
function openTasksLabel(open: number): string {
  if (open === 0) return "Nenhuma tarefa aberta";
  return open === 1 ? "1 tarefa aberta" : `${open} tarefas abertas`;
}

/**
 * A lista de tarefas: os eventos com status (de pessoa e de agente) da rota
 * `tracked`, nos grupos do canvas. Feitas e Encerradas vêm recolhidos. Cada
 * linha é a `EventRow`. Tag, prioridade e texto são parâmetros da consulta: a
 * tela não filtra na mão. As opções de tag vêm da lista sem filtro. Recarregar
 * sozinha, sem o estado de carregando, enquanto houver evento de agente em aberto.
 */
export function TasksScreen({ userId }: { userId: string }) {
  const now = useNow();
  const [cards, setCards] = useState<EventCardDto[] | null>(null);
  const [facets, setFacets] = useState<EventCardDto[] | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<TaskGroupKey[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tag, setTag] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<EventPriority[]>([]);
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef<HTMLDivElement>(null);
  /** Só a resposta da consulta mais recente entra na tela: filtro trocado no meio não deixa lista velha. */
  const latestRequest = useRef(0);
  const router = useMotionRouter();
  // O modo em uso filtra a lista pelo executor; trocá-lo relê a lista.
  const viewMode = useViewMode();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const filters = useMemo(() => ({ tag, priorities, query }), [tag, priorities, query]);
  const activeFilters = taskFilterCount(filters);

  /**
   * Relê a lista com os filtros atuais. Falha vira o aviso de carregamento com "Tentar de novo". Releitura
   * silenciosa (`quiet`, a do evento de agente em aberto) troca os dados sem o estado de carregando e, se
   * falhar, mantém a lista que já está na tela.
   */
  const refresh = useCallback(async (quiet = false) => {
    const request = ++latestRequest.current;
    try {
      const list = await listTrackedEvents({ ...trackedFilters(filters), actor: viewMode.actor });
      if (request !== latestRequest.current) return;
      setCards(list);
      setError(false);
      // Sem filtro, a lista inteira é também a fonte das opções de tag.
      if (taskFilterCount(filters) === 0) setFacets(list);
    } catch {
      if (request === latestRequest.current && !quiet) setError(true);
    }
  }, [filters, viewMode.actor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Enquanto houver evento de agente em aberto nesta lista, ela se relê sozinha; sem ele, não há recarga.
  useOpenAgentRefresh(hasOpenAgentEvent(cards ?? []), () => refresh(true));

  const retry = useCallback(() => {
    setError(false);
    setCards(null);
    void refresh();
  }, [refresh]);

  function clearFilters() {
    setTag(null);
    setPriorities([]);
    setTyped("");
    setQuery("");
  }

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

  /**
   * Troca o status pelo glifo de um evento de pessoa. Manda a revisão lida;
   * revisão velha relê a lista e avisa. Evento de agente não muda status.
   */
  async function toggleStatus(card: EventCardDto) {
    if (saving || card.actor !== "human" || card.status === undefined) return;
    setSaving(true);
    setNotice(null);
    try {
      await updateEvent(card.id, statusPatch(card, toggledStatus(card), new Date()));
      window.dispatchEvent(new Event(agendaRefreshEvent));
      await refresh();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.kind === "stale_revision") {
        await refresh();
        setNotice(STALE_MESSAGE);
      } else {
        setNotice(FAILURE_MESSAGE);
      }
    } finally {
      setSaving(false);
    }
  }

  // Uma série aparece uma vez; a fração de subtarefas conta só as linhas da lista.
  const rows = useMemo(() => oneRowPerSeries(cards ?? []), [cards]);
  const groups = useMemo(() => groupTrackedEvents(rows), [rows]);
  const open = groups
    .filter((group) => !group.collapsedByDefault)
    .reduce((total, group) => total + group.cards.length, 0);
  const tags = useMemo(() => tagsByUse(facets ?? []), [facets]);
  const hasEvents = (facets?.length ?? 0) > 0;

  const filterControls = (
    <TaskFilters
      tags={tags}
      tag={tag}
      onTagToggle={(name) => setTag((current) => (current === name ? null : name))}
      priorities={priorities}
      onPriorityToggle={(level) => setPriorities((current) => toggleIn(current, level))}
      query={typed}
      onQueryChange={setTyped}
      activeFilters={activeFilters}
      onClear={clearFilters}
    />
  );

  return (
    <main id="conteudo" className={page.frame}>
      <section className={`${page.lead} ${styles.lead}`} aria-label="Resumo das tarefas">
        <div className={styles.headRow}>
          <h1 className={page.eyebrow}>{cards && now ? openTasksLabel(open) : "Tarefas"}</h1>
          {hasEvents ? (
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
              {optionsOpen ? <div className={styles.optionsPanel} role="dialog" aria-label="Opções de visualização">{filterControls}</div> : null}
            </div>
          ) : null}
        </div>
        {hasEvents && !optionsOpen ? <div className={styles.leadFilters}>{filterControls}</div> : null}
      </section>

      <section className={`${page.body} ${styles.body}`} aria-label="Lista de tarefas">
        {notice ? <p role="alert" className={styles.message}>{notice}</p> : null}
        {error ? (
          <p role="alert" className={styles.message}>Não foi possível carregar as tarefas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
        ) : !cards || !now ? (
          <ListSkeleton label="Carregando tarefas…" />
        ) : groups.length === 0 ? (
          activeFilters > 0 ? (
            <div className={styles.empty}>
              <ListChecks aria-hidden />
              <h2 className={styles.emptyTitle}>Nenhum evento passou no filtro</h2>
              <p className={styles.emptyText}>Nada combina com os filtros escolhidos.</p>
              <button type="button" className={styles.emptyAction} onClick={clearFilters}>Limpar filtros</button>
            </div>
          ) : (
            <div className={styles.empty}>
              <ListChecks aria-hidden />
              <h2 className={styles.emptyTitle}>Nenhuma tarefa por aqui</h2>
              <p className={styles.emptyText}>Crie a primeira tarefa para começar a organizar o seu dia.</p>
              <button type="button" className={styles.emptyAction} onClick={() => router.push(`/${userId}/eventos/novo`)}>Novo evento</button>
            </div>
          )
        ) : (
          <div className={styles.groups}>
            {groups.map((group) => {
              const labelId = `tarefas-${group.key}`;
              const isOpen = !group.collapsedByDefault || expanded.includes(group.key);
              return (
                <section key={group.key} id={labelId} aria-labelledby={`${labelId}-titulo`} className={styles.group}>
                  {group.collapsedByDefault ? (
                    <h2 id={`${labelId}-titulo`} className={styles.groupHead} data-collapsible="true">
                      <button type="button" className={styles.groupToggle} aria-expanded={isOpen} onClick={() => setExpanded((current) => toggleIn(current, group.key))}>
                        <ChevronDown aria-hidden />{group.title}<span>{group.cards.length}</span>
                      </button>
                    </h2>
                  ) : (
                    <h2 id={`${labelId}-titulo`} className={styles.groupHead}>{group.title}<span>{group.cards.length}</span></h2>
                  )}
                  {isOpen ? (
                    <ul className={styles.list}>
                      {group.cards.map((card) => (
                        <EventRow
                          key={card.id}
                          card={card}
                          userId={userId}
                          now={now}
                          ruleInPlaceOfTime={showsSeriesRule(card)}
                          subtasks={subtaskProgress(rows, card.id)}
                          onStatusClick={(target) => void toggleStatus(target)}
                        />
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
