"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgentTaskStatus, TaskDto, HumanTaskStatus } from "@repo/contracts";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { TaskKindMark } from "@/components/tasks/task-kind-mark";
import { TaskStatusGlyph } from "@/components/tasks/task-status-glyph";
import { getTask } from "@/lib/api/tasks";
import { cardWhenLabel } from "@/lib/tasks/card-text";
import { useNow } from "@/lib/tasks/use-now";
import styles from "./task-relations.module.css";

interface TaskHierarchySectionProps {
  userId: string;
  task: TaskDto;
}

/**
 * A hierarquia no detalhe, em duas seções: "Tarefa principal" (a única tarefa
 * de que esta é subtarefa) e "Subtarefas". É informativa: não bloqueia nada,
 * não muda status nem mostra progresso. A tarefa traz só os ids; nome, tipo e
 * quando vêm de `getTask`, e as duas pontas podem ser tarefa de pessoa ou de
 * agente. Cada linha leva ao detalhe da outra tarefa. Seção vazia não aparece.
 */
export function TaskHierarchySection({ userId, task }: TaskHierarchySectionProps) {
  const parentIds = task.parentTaskId ? [task.parentTaskId] : [];
  return (
    <>
      <LinkedTasksSection
        userId={userId}
        ids={parentIds}
        title="Tarefa principal"
        labelId="task-parent"
        loadingMessage="Carregando tarefa principal…"
        failedMessage="A tarefa principal não carregou."
      />
      <LinkedTasksSection
        userId={userId}
        ids={task.subtaskIds}
        title="Subtarefas"
        labelId="task-subtasks"
        loadingMessage="Carregando subtarefas…"
        failedMessage="Algumas subtarefas não carregaram."
      />
    </>
  );
}

interface LinkedTasksSectionProps {
  userId: string;
  ids: string[];
  title: string;
  labelId: string;
  loadingMessage: string;
  failedMessage: string;
}

/** Uma seção da hierarquia: carrega as tarefas pelos ids e mostra uma linha para cada. Sem ids, não aparece. */
function LinkedTasksSection({ userId, ids, title, labelId, loadingMessage, failedMessage }: LinkedTasksSectionProps) {
  const now = useNow();
  const key = ids.join(",");
  const [cards, setCards] = useState<TaskDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setCards(null);
    const wanted = key ? key.split(",") : [];
    void Promise.allSettled(wanted.map((id) => getTask(id))).then((results) => {
      if (cancelled) return;
      setCards(loaded(results));
      if (results.some((result) => result.status === "rejected")) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
    // Recarrega quando a lista de ids muda; os ids vêm da chave acima.
  }, [key]);

  if (ids.length === 0) return null;

  return (
    <DetailSection title={title} labelId={labelId}>
      {failed ? <DetailMessage alert>{failedMessage}</DetailMessage> : null}
      {!cards ? <DetailMessage>{loadingMessage}</DetailMessage> : null}
      {cards && cards.length > 0 && now ? (
        <ul className={styles.list} aria-labelledby={labelId}>
          {cards.map((card) => (
            <li key={card.id} className={styles.taskRow}>
              <LinkedTaskGlyph card={card} />
              <Link href={`/${userId}/tarefas/${card.id}`} className={styles.taskBody}>
                <span className={styles.taskName}>{card.name}</span>
                <span className={styles.taskMeta}>
                  <TaskKindMark kind={card.kind} />
                  <span>{cardWhenLabel(card, now)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </DetailSection>
  );
}

/** As tarefas que carregaram; o que falhou (apagado, de outro dono) some da lista e aparece no aviso. */
function loaded(results: PromiseSettledResult<TaskDto>[]): TaskDto[] {
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

/** O glifo só mostra o status; não é botão, porque a hierarquia não muda status daqui. */
function LinkedTaskGlyph({ card }: { card: TaskDto }) {
  if (card.actor === "agent") {
    return <TaskStatusGlyph actor="agent" status={card.status as AgentTaskStatus} size={20} />;
  }
  const status = (card.status ?? null) as HumanTaskStatus | null;
  return <TaskStatusGlyph actor="human" status={status} size={20} />;
}
