"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AgentEventStatus, EventDto, HumanEventStatus } from "@repo/contracts";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { EventKindMark } from "@/components/events/event-kind-mark";
import { EventStatusGlyph } from "@/components/events/event-status-glyph";
import { getEvent } from "@/lib/api/events";
import { cardWhenLabel } from "@/lib/events/card-text";
import { useNow } from "@/lib/events/use-now";
import styles from "./event-relations.module.css";

interface EventSequenceSectionProps {
  userId: string;
  event: EventDto;
}

/**
 * A seção Sequência do detalhe, nos dois lados: "Segue-se de" (os eventos que vêm
 * antes deste) e "Da sequência a" (os que se seguem a este). É informativa: não
 * bloqueia nada nem muda status. O evento traz só os ids; nome, tipo e quando
 * vêm de `getEvent`, e as duas pontas podem ser evento de pessoa ou de agente.
 * Cada linha leva ao detalhe do outro evento. Evento fora de qualquer sequência
 * não mostra a seção; com um lado só, só esse lado aparece.
 */
export function EventSequenceSection({ userId, event }: EventSequenceSectionProps) {
  const now = useNow();
  const previousKey = event.previousEventIds.join(",");
  const nextKey = event.nextEventIds.join(",");
  const [previous, setPrevious] = useState<EventDto[] | null>(null);
  const [next, setNext] = useState<EventDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void Promise.allSettled(event.previousEventIds.map((id) => getEvent(id))).then((results) => {
      if (cancelled) return;
      setPrevious(loaded(results));
      if (results.some((result) => result.status === "rejected")) setFailed(true);
    });
    void Promise.allSettled(event.nextEventIds.map((id) => getEvent(id))).then((results) => {
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
  if (event.previousEventIds.length === 0 && event.nextEventIds.length === 0) return null;

  return (
    <DetailSection title="Sequência" labelId="event-sequence">
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
function loaded(results: PromiseSettledResult<EventDto>[]): EventDto[] {
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

function SequenceGroup({ id, label, userId, cards, now }: { id: string; label: string; userId: string; cards: EventDto[]; now: Date }) {
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
                <EventKindMark kind={card.kind} />
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
function SequenceGlyph({ card }: { card: EventDto }) {
  if (card.actor === "agent") {
    return <EventStatusGlyph actor="agent" status={card.status as AgentEventStatus} size={20} />;
  }
  const status = (card.status ?? null) as HumanEventStatus | null;
  return <EventStatusGlyph actor="human" status={status} size={20} />;
}
