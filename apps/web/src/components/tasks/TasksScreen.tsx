"use client";

import { ChevronDown, ListChecks } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventCardDto } from "@repo/contracts";
import { EventRow } from "@/components/events/event-row";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import page from "@/components/ui/page.module.css";
import { listTrackedEvents } from "@/lib/api/events";
import { useNow } from "@/lib/events/use-now";
import {
  groupTrackedEvents,
  oneRowPerSeries,
  showsSeriesRule,
  subtaskProgress,
  type TaskGroupKey,
} from "@/lib/events/task-groups";
import { useMotionRouter } from "@/components/shell/navigation-motion";
import styles from "./tasks.module.css";

function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** "9 tarefas abertas": a legenda em mono no topo da tela. */
function openTasksLabel(open: number): string {
  if (open === 0) return "Nenhuma tarefa aberta";
  return open === 1 ? "1 tarefa aberta" : `${open} tarefas abertas`;
}

/**
 * A lista de tarefas: os eventos com status (de pessoa e de agente) da rota
 * `tracked`, nos grupos do canvas. Feitas e Encerradas vêm recolhidos. Cada
 * linha é a `EventRow`. Concluir, filtrar e recarregar sozinha ficam para
 * outros tickets.
 */
export function TasksScreen({ userId }: { userId: string }) {
  const now = useNow();
  const [cards, setCards] = useState<EventCardDto[] | null>(null);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState<TaskGroupKey[]>([]);
  const router = useMotionRouter();

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey força o refetch.
  useEffect(() => {
    let cancelled = false;
    setError(false);
    listTrackedEvents()
      .then((data) => { if (!cancelled) setCards(data); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const retry = useCallback(() => {
    setCards(null);
    setReloadKey((key) => key + 1);
  }, []);

  // Uma série aparece uma vez; a fração de subtarefas conta só as linhas da lista.
  const rows = useMemo(() => oneRowPerSeries(cards ?? []), [cards]);
  const groups = useMemo(() => groupTrackedEvents(rows), [rows]);
  const open = groups
    .filter((group) => !group.collapsedByDefault)
    .reduce((total, group) => total + group.cards.length, 0);

  return (
    <main id="conteudo" className={page.frame}>
      <section className={`${page.lead} ${styles.lead}`} aria-label="Resumo das tarefas">
        <div className={styles.headRow}>
          <h1 className={page.eyebrow}>{cards && now ? openTasksLabel(open) : "Tarefas"}</h1>
        </div>
      </section>

      <section className={`${page.body} ${styles.body}`} aria-label="Lista de tarefas">
        {error ? (
          <p role="alert" className={styles.message}>Não foi possível carregar as tarefas.<button type="button" className={styles.retry} onClick={retry}>Tentar de novo</button></p>
        ) : !cards || !now ? (
          <ListSkeleton label="Carregando tarefas…" />
        ) : groups.length === 0 ? (
          <div className={styles.empty}>
            <ListChecks aria-hidden />
            <h2 className={styles.emptyTitle}>Nenhuma tarefa por aqui</h2>
            <p className={styles.emptyText}>Crie a primeira tarefa para começar a organizar o seu dia.</p>
            <button type="button" className={styles.emptyAction} onClick={() => router.push(`/${userId}/eventos/novo`)}>Novo evento</button>
          </div>
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
