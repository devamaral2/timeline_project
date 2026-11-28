"use client";

import { ChevronDown, Hash, ListChecks } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TaskCardDto, TaskPriority, HumanTaskStatus, TaskSituation } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { TaskRow } from "@/components/tasks/task-row";
import { TaskSituationPicker } from "@/components/tasks/task-situation-picker";
import { TaskStatusPicker } from "@/components/tasks/task-status-picker";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import page from "@/components/ui/page.module.css";
import { ApiRequestError } from "@/lib/api/client-request";
import { listTrackedTasks, setTaskSituation, updateTask } from "@/lib/api/tasks";
import { hasOpenAgentTask } from "@/lib/tasks/agent-request-model";
import { statusPatch } from "@/lib/tasks/task-read-model";
import { taskPriorityLabels } from "@/components/tasks/task-priority-mark";
import { PRIORITY_ORDER, taskFilterCount, tagsByUse, trackedFilters } from "@/lib/tasks/task-filters";
import { usePullRefresh } from "@/lib/navigation/pull-refresh";
import { usePublishSectionMenu } from "@/lib/navigation/section-menu";
import { useNow } from "@/lib/tasks/use-now";
import { useOpenAgentRefresh } from "@/lib/tasks/use-open-agent-refresh";
import { useViewMode } from "@/lib/tasks/view-mode";
import { nestSubtasks, oneRowPerSeries, showsSeriesRule } from "@/lib/tasks/task-groups";
import { drawerOf, drawersOf, listedCards, toNowLabel, type ListDrawerKey } from "@/lib/tasks/task-drawers";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import { SubtaskDrawer } from "./subtask-drawer";
import styles from "./tasks.module.css";

function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

const STALE_MESSAGE = "Esta tarefa mudou em outro lugar. Carregamos a lista atual; confira e tente de novo.";
const FAILURE_MESSAGE = "Não foi possível trocar o status. Tente novamente.";
const SITUATION_FAILURE_MESSAGE = "Não foi possível mudar a situação. Tente novamente.";
const REFRESH_FAILURE_MESSAGE = "Não foi possível atualizar as tarefas. Tente novamente.";
/** Espera depois da última tecla antes de consultar a API pelo texto. Igual à aba Notas. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * A lista de tarefas: as tarefas com status (de pessoa e de agente) da rota
 * `tracked`, em quatro gavetas pela ação que cada uma pede (Para agora, Contínuas,
 * Para depois e Finalizadas; `task-drawers.ts`). Para agora e Contínuas vêm abertas, as
 * outras fechadas. O trabalho que o agente ainda faz não está aqui: mora na gaveta de
 * execução do shell. Cada
 * linha é a `TaskRow`; a subtarefa com a principal na lista não vira linha: fica
 * na gaveta embaixo da principal. O glifo de uma tarefa de pessoa abre a escolha dos
 * status, e a linha muda de gaveta com o status escolhido (a de agente, com a situação). Tag, prioridade e texto são parâmetros da consulta: a
 * tela não filtra na mão. As opções de tag vêm da lista sem filtro. No celular os
 * filtros moram no menu de opções da barra inferior (tocar na aba Tarefas já
 * selecionada): cada tag é uma lista, a prioridade fica na engrenagem. Recarregar
 * sozinha, sem o estado de carregando, enquanto houver tarefa de agente em aberto.
 */
export function TaskListScreen({ userId }: { userId: string }) {
  const now = useNow();
  const [cards, setCards] = useState<TaskCardDto[] | null>(null);
  const [facets, setFacets] = useState<TaskCardDto[] | null>(null);
  const [error, setError] = useState(false);
  /** As gavetas que a pessoa virou: cada toque inverte o estado de partida da gaveta (aberta ou fechada). */
  const [flipped, setFlipped] = useState<ListDrawerKey[]>([]);
  /** As tarefas com a gaveta das subtarefas fechada. Começam todas abertas. */
  const [closedSubtasks, setClosedSubtasks] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** A tarefa cujo glifo foi tocado: a escolha de status fica aberta para ela. */
  const [statusCard, setStatusCard] = useState<TaskCardDto | null>(null);
  const [statusAnchor, setStatusAnchor] = useState<HTMLElement | null>(null);
  const [situationCard, setSituationCard] = useState<TaskCardDto | null>(null);
  const [situationAnchor, setSituationAnchor] = useState<HTMLElement | null>(null);
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
   * silenciosa (`quiet`, a da tarefa de agente em aberto e a de quem puxa a tela) troca os dados sem o estado
   * de carregando e, se falhar, mantém a lista que já está na tela. Devolve `false` só quando esta leitura
   * falhou; a que foi atropelada por uma mais nova não conta.
   */
  const refresh = useCallback(async (quiet = false): Promise<boolean> => {
    const request = ++latestRequest.current;
    try {
      const list = await listTrackedTasks({ ...trackedFilters(filters), actor: viewMode.actor });
      if (request !== latestRequest.current) return true;
      setCards(list);
      setError(false);
      // Sem filtro, a lista inteira é também a fonte das opções de tag.
      if (taskFilterCount(filters) === 0) setFacets(list);
      return true;
    } catch {
      if (request !== latestRequest.current) return true;
      if (!quiet) setError(true);
      return false;
    }
  }, [filters, viewMode.actor]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Enquanto houver tarefa de agente em aberto nesta lista, ela se relê sozinha; sem ele, não há recarga.
  useOpenAgentRefresh(hasOpenAgentTask(cards ?? []), async () => {
    await refresh(true);
  });

  // Puxar a tela para baixo relê a lista em silêncio; se a leitura falhar, a lista fica e o aviso diz.
  usePullRefresh(async () => {
    setNotice(null);
    if (!(await refresh(true))) setNotice(REFRESH_FAILURE_MESSAGE);
  });

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

  /** O glifo de uma tarefa de pessoa abre a escolha de status. Tarefa de agente não muda status. */
  function openStatusPicker(card: TaskCardDto, anchor: HTMLElement) {
    if (saving || card.actor !== "human") return;
    setStatusAnchor(anchor);
    setStatusCard(card);
  }

  /** O glifo da esquerda de um pedido de agente que terminou abre a escolha da situação. */
  function openSituationPicker(card: TaskCardDto, anchor: HTMLElement) {
    setSituationAnchor(anchor);
    setSituationCard(card);
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
      await updateTask(card.id, statusPatch(card, status, new Date()));
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

  /** Troca a situação de uma tarefa de agente na própria lista, sem reler: a mudança aparece na hora. */
  function showSituation(taskId: string, situation: TaskSituation | undefined, onlyIf?: TaskSituation | undefined) {
    const apply = (list: TaskCardDto[] | null) =>
      list?.map((item) => (item.id === taskId && (onlyIf === undefined || item.situation === onlyIf) ? { ...item, situation } : item)) ?? null;
    setCards(apply);
    setFacets(apply);
  }

  /**
   * A mudança aparece na hora e é desfeita se a gravação falhar. Vale a última gravação, sem revisão: não há
   * conflito a tratar, só a falha.
   */
  async function changeSituation(card: TaskCardDto, situation: TaskSituation) {
    setSituationCard(null);
    if (situation === card.situation) return;
    setNotice(null);
    showSituation(card.id, situation);
    try {
      await setTaskSituation(card.id, situation);
    } catch {
      // Só desfaz se a linha ainda mostra a escolha que falhou: uma escolha mais nova não é apagada por esta.
      showSituation(card.id, card.situation, situation);
      setNotice(SITUATION_FAILURE_MESSAGE);
    }
  }

  // Uma série aparece uma vez; a subtarefa com a principal na lista vai para a gaveta dela.
  // O que o agente ainda faz sai antes: a subtarefa dele, com a principal fora, continua linha.
  const rows = useMemo(() => listedCards(oneRowPerSeries(cards ?? [])), [cards]);
  const tree = useMemo(() => nestSubtasks(rows), [rows]);
  const drawers = useMemo(() => drawersOf(tree.roots), [tree]);
  const toggleSubtasks = (taskId: string) => setClosedSubtasks((current) => toggleIn(current, taskId));
  /** Nada na lista, mas o agente ainda trabalha: a tela não convida a criar a primeira tarefa. */
  const onlyAgentWork = (cards ?? []).some((card) => drawerOf(card) === "execution");
  const toNow = drawers.find((drawer) => drawer.key === "now")?.cards.length ?? 0;
  const tags = useMemo(() => tagsByUse(facets ?? []), [facets]);

  // O menu da barra inferior: uma lista por tag, a busca e, na engrenagem, a prioridade.
  const tagCounts = new Map<string, number>();
  for (const card of facets ?? []) for (const name of card.tags) tagCounts.set(name, (tagCounts.get(name) ?? 0) + 1);
  usePublishSectionMenu("tasks", {
    count: cards && now ? toNow : undefined,
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

  return (
    <main id="conteudo" className={page.frame}>
      <section className={`${page.lead} ${styles.lead}`} aria-label="Resumo das tarefas">
        <div className={styles.headRow}>
          <h1 className={page.eyebrow}>{cards && now ? toNowLabel(toNow) : "Tarefas"}</h1>
        </div>
      </section>

      <section className={`${page.body} ${styles.body}`} aria-label="Lista de tarefas">
        {notice && !error ? <p role="alert" className={styles.message}>{notice}</p> : null}
        {error ? (
          <p role="alert" className={styles.message}>Não foi possível carregar as tarefas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
        ) : !cards || !now ? (
          <ListSkeleton label="Carregando tarefas…" />
        ) : drawers.length === 0 ? (
          activeFilters > 0 ? (
            <div className={styles.empty}>
              <ListChecks aria-hidden />
              <h2 className={styles.emptyTitle}>Nenhuma tarefa passou no filtro</h2>
              <p className={styles.emptyText}>Nada combina com os filtros escolhidos.</p>
              <button type="button" className={styles.emptyAction} onClick={clearFilters}>Limpar filtros</button>
            </div>
          ) : onlyAgentWork ? (
            <p className={styles.quiet}>Nada pede a sua atenção agora.</p>
          ) : (
            <div className={styles.empty}>
              <ListChecks aria-hidden />
              <h2 className={styles.emptyTitle}>Nenhuma tarefa por aqui</h2>
              <p className={styles.emptyText}>Crie a primeira tarefa para começar a organizar o seu dia.</p>
              <button type="button" className={styles.emptyAction} onClick={() => router.push(`/${userId}/tarefas/nova`)}>Nova tarefa</button>
            </div>
          )
        ) : (
          <div className={styles.groups}>
            {drawers.map((drawer) => {
              const labelId = `tarefas-${drawer.key}`;
              const isOpen = drawer.collapsedByDefault === flipped.includes(drawer.key);
              return (
                <section key={drawer.key} id={labelId} aria-labelledby={`${labelId}-titulo`} className={styles.group}>
                  <h2 id={`${labelId}-titulo`} className={styles.groupHead} data-collapsible="true">
                    <button type="button" className={styles.groupToggle} aria-expanded={isOpen} onClick={() => setFlipped((current) => toggleIn(current, drawer.key))}>
                      <ChevronDown aria-hidden />{drawer.title}<span>{drawer.cards.length}</span>
                    </button>
                  </h2>
                  {isOpen ? (
                    <ul className={styles.list}>
                      {drawer.cards.map((card) => {
                        const subtasks = tree.subtasksOf(card.id);
                        return (
                          <TaskRow
                            key={card.id}
                            card={card}
                            userId={userId}
                            now={now}
                            ruleInPlaceOfTime={showsSeriesRule(card)}
                            onStatusClick={openStatusPicker}
                            onSituationClick={openSituationPicker}
                          >
                            {subtasks.length > 0 ? (
                              <SubtaskDrawer
                                parent={card}
                                tree={tree}
                                userId={userId}
                                now={now}
                                closedIds={closedSubtasks}
                                onToggle={toggleSubtasks}
                                onStatusClick={openStatusPicker}
                              />
                            ) : null}
                          </TaskRow>
                        );
                      })}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </section>
      {situationCard ? (
        <TaskSituationPicker
          card={situationCard}
          anchor={situationAnchor}
          onPick={(situation) => void changeSituation(situationCard, situation)}
          onClose={() => setSituationCard(null)}
        />
      ) : null}
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
