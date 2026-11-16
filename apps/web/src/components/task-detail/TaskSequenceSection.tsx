"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgentTaskStatus, TaskDto, HumanTaskStatus } from "@repo/contracts";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { TaskKindMark } from "@/components/tasks/task-kind-mark";
import { TaskStatusGlyph } from "@/components/tasks/task-status-glyph";
import { getEvent } from "@/lib/api/events";
import { cardWhenLabel } from "@/lib/tasks/card-text";
import { useNow } from "@/lib/tasks/use-now";
import styles from "./task-relations.module.css";

interface TaskSequenceSectionProps {
  userId: string;
  task: TaskDto;
}

/**
 * A seção Sequência do detalhe, nos dois lados: "Segue-se de" (os eventos que vêm
 * antes deste) e "Da sequência a" (os que se seguem a este). É informativa: não
 * bloqueia nada nem muda status. O evento traz só os ids; nome, tipo e quando
 * vêm de `getEvent`, e as duas pontas podem ser evento de pessoa ou de agente.
 * Cada linha leva ao detalhe do outro evento. Evento fora de qualquer sequência
 * não mostra a seção; com um lado só, só esse lado aparece.
 */
export function TaskSequenceSection({ userId, task }: TaskSequenceSectionProps) {
  const now = useNow();
  const previousKey = task.previousTaskIds.join(",");
  const nextKey = task.nextTaskIds.join(",");
  const [previous, setPrevious] = useState<TaskDto[] | null>(null);
  const [next, setNext] = useState<TaskDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void Promise.allSettled(task.previousTaskIds.map((id) => getEvent(id))).then((results) => {
      if (cancelled) return;
      setPrevious(loaded(results));
      if (results.some((result) => result.status === "rejected")) setFailed(true);
    });
    void Promise.allSettled(task.nextTaskIds.map((id) => getEvent(id))).then((results) => {
      if (cancelled) return;
      setNext(loaded(results));
      if (results.some((result) => result.status === "rejected")) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
    // Recarrega quando as listas de ids mudam; os ids vêm das chaves acima.
  }, [previousKey, nextKey]);

  // Evento fora de qualquer sequência não mostra a seção.
  if (task.previousTaskIds.length === 0 && task.nextTaskIds.length === 0) return null;

  return (
    <DetailSection title="Sequência" labelId="task-sequence">
      {failed ? <DetailMessage alert>Alguns eventos da sequência não carregaram.</DetailMessage> : null}
      {!previous || !next ? <DetailMessage>Carregando sequência…</DetailMessage> : null}
      {previous && next && now ? (
        <>
          {previous.length > 0 ? <SequenceGroup id="previous" label="Segue-se de" userId={userId} cards={previous} now={now} /> : null}
          {next.length > 0 ? <SequenceGroup id="next" label="Da sequência a" userId={userId} cards={next} now={now} /> : null}
        </>
      ) : null}
    </DetailSection>
  );
}

/** Os eventos que carregaram; o que falhou (apagado, de outro dono) some da lista e aparece no aviso. */
function loaded(results: PromiseSettledResult<TaskDto>[]): TaskDto[] {
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

function SequenceGroup({ id, label, userId, cards, now }: { id: string; label: string; userId: string; cards: TaskDto[]; now: Date }) {
  const headingId = `sequence-${id}`;
  return (
    <div className={styles.group}>
      <h3 className={styles.groupLabel} id={headingId}>{label}</h3>
      <ul className={styles.list} aria-labelledby={headingId}>
        {cards.map((card) => (
          <li key={card.id} className={styles.sequenceRow}>
            <SequenceGlyph card={card} />
            <Link href={`/${userId}/eventos/${card.id}`} className={styles.sequenceBody}>
              <span className={styles.sequenceName}>{card.name}</span>
              <span className={styles.sequenceMeta}>
                <TaskKindMark kind={card.kind} />
                <span>{cardWhenLabel(card, now)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O glifo só mostra o status; não é botão, porque a sequência não muda status daqui. */
function SequenceGlyph({ card }: { card: TaskDto }) {
  if (card.actor === "agent") {
    return <TaskStatusGlyph actor="agent" status={card.status as AgentTaskStatus} size={20} />;
  }
  const status = (card.status ?? null) as HumanTaskStatus | null;
  return <TaskStatusGlyph actor="human" status={status} size={20} />;
}
