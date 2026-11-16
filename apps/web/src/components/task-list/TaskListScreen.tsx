"use client";

import { ChevronDown, Hash, ListChecks } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TaskCardDto, TaskPriority, HumanTaskStatus } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskStatusPicker } from "@/components/tasks/task-status-picker";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import page from "@/components/ui/page.module.css";
import { ApiRequestError } from "@/lib/api/client-request";
import { listTrackedEvents, updateEvent } from "@/lib/api/events";
import { hasOpenAgentTask } from "@/lib/tasks/agent-request-model";
import { statusPatch } from "@/lib/tasks/task-read-model";
import { taskPriorityLabels } from "@/components/tasks/task-priority-mark";
import { PRIORITY_ORDER, taskFilterCount, tagsByUse, trackedFilters } from "@/lib/tasks/task-filters";
import { usePublishSectionMenu } from "@/lib/navigation/section-menu";
import { useNow } from "@/lib/tasks/use-now";
import { useOpenAgentRefresh } from "@/lib/tasks/use-open-agent-refresh";
import { useViewMode } from "@/lib/tasks/view-mode";
import {
  groupTrackedTasks,
  oneRowPerSeries,
  showsSeriesRule,
  type TaskGroupKey,
} from "@/lib/tasks/task-groups";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { TaskFilters } from "./TaskFilters";
import styles from "./tasks.module.css";

function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
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
 * linha é a `EventRow`; o glifo de um evento de pessoa abre a escolha dos
 * status, e a linha muda de grupo com o status escolhido. Tag, prioridade e texto são parâmetros da consulta: a
 * tela não filtra na mão. As opções de tag vêm da lista sem filtro. No celular os
 * filtros moram no menu de opções da barra inferior (tocar na aba Tarefas já
 * selecionada): cada tag é uma lista, a prioridade fica na engrenagem. Recarregar
 * sozinha, sem o estado de carregando, enquanto houver evento de agente em aberto.
 */
export function TaskListScreen({ userId }: { userId: string }) {
  const now = useNow();
  const [cards, setCards] = useState<TaskCardDto[] | null>(null);
  const [facets, setFacets] = useState<TaskCardDto[] | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<TaskGroupKey[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** A tarefa cujo glifo foi tocado: a escolha de status fica aberta para ela. */
  const [statusCard, setStatusCard] = useState<TaskCardDto | null>(null);
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<TaskPriority[]>([]);
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
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
  useOpenAgentRefresh(hasOpenAgentTask(cards ?? []), () => refresh(true));

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

  /** O glifo de um evento de pessoa abre a escolha de status. Evento de agente não muda status. */
  function openStatusPicker(card: TaskCardDto, anchor: HTMLElement) {
    if (saving || card.actor !== "human") return;
    setStatusAnchor(anchor);
    setStatusCard(card);
  }

  /**
   * Grava o status escolhido com a revisão lida; revisão velha relê a lista e
   * avisa. Escolher o status que a tarefa já tem só fecha a escolha.
   */
  async function changeStatus(card: TaskCardDto, status: HumanTaskStatus) {
    setStatusCard(null);
    if (saving || status === card.status) return;
    setSaving(true);
    setNotice(null);
    try {
      await updateEvent(card.id, statusPatch(card, status, new Date()));
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

  // Uma série aparece uma vez; todo cartão com status é uma linha.
  const rows = useMemo(() => oneRowPerSeries(cards ?? []), [cards]);
  const groups = useMemo(() => groupTrackedTasks(rows), [rows]);
  const open = groups
    .filter((group) => !group.collapsedByDefault)
    .reduce((total, group) => total + group.cards.length, 0);
  const tags = useMemo(() => tagsByUse(facets ?? []), [facets]);
  const hasTasks = (facets?.length ?? 0) > 0;

  // O menu da barra inferior: uma lista por tag, a busca e, na engrenagem, a prioridade.
  const tagCounts = new Map<string, number>();
  for (const card of facets ?? []) for (const name of card.tags) tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
  usePublishSectionMenu("tasks", {
    count: cards && now ? open : undefined,
    lists: tags.map((name) => ({
      id: `tag:${name}`,
      name,
      desc: `#${name}`,
      Icon: Hash,
      count: tagCounts.get(name) ?? 0,
      selected: tag === name,
      onPick: () => setTag((current) => (current === name ? null : name)),
    })),
    search: { label: "Buscar nas tarefas", value: typed, onChange: setTyped },
    settings: [{
      kind: "toggles",
      label: "Prioridade",
      options: PRIORITY_ORDER.map((level) => ({
        label: taskPriorityLabels[level],
        selected: priorities.includes(level),
        onPick: () => setPriorities((current) => toggleIn(current, level)),
      })),
    }],
    filtered: activeFilters > 0,
    onClear: clearFilters,
  });

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
        </div>
        {hasTasks ? <div className={styles.leadFilters}>{filterControls}</div> : null}
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
                        <TaskRow
                          key={card.id}
                          card={card}
                          userId={userId}
                          now={now}
                          ruleInPlaceOfTime={showsSeriesRule(card)}
                          onStatusClick={openStatusPicker}
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
      {statusCard ? (
        <TaskStatusPicker
          card={statusCard}
          anchor={statusAnchor}
          onPick={(status) => void changeStatus(statusCard, status)}
          onClose={() => setStatusCard(null)}
        />
      ) : null}
    </main>
  );
}
