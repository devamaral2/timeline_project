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

interface EventBlocksSectionProps {
  userId: string;
  event: EventDto;
}

/**
 * A seção Bloqueios do detalhe, nos dois sentidos: "Bloqueado por" (os eventos
 * que precisam terminar antes deste) e "Bloqueia" (os que este libera). O
 * cartão do evento traz só os ids; nome, tipo e quando vêm de `getEvent`.
 * Cada linha leva ao detalhe do evento de bloqueio. Sem bloqueio num sentido,
 * diz "nenhum evento".
 */
export function EventBlocksSection({ userId, event }: EventBlocksSectionProps) {
  const now = useNow();
  const blockedByKey = event.blockedByEventIds.join(",");
  const blocksKey = event.blocksEventIds.join(",");
  const [blockedBy, setBlockedBy] = useState<EventDto[] | null>(null);
  const [blocks, setBlocks] = useState<EventDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void Promise.allSettled(event.blockedByEventIds.map((id) => getEvent(id))).then((results) => {
      if (cancelled) return;
      setBlockedBy(loaded(results));
      if (results.some((result) => result.status === "rejected")) setFailed(true);
    });
    void Promise.allSettled(event.blocksEventIds.map((id) => getEvent(id))).then((results) => {
      if (cancelled) return;
      setBlocks(loaded(results));
      if (results.some((result) => result.status === "rejected")) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
    // Recarrega quando as listas de ids mudam; os ids vêm das chaves acima.
  }, [blockedByKey, blocksKey]);

  return (
    <DetailSection title="Bloqueios" labelId="event-blocks">
      {failed ? <DetailMessage alert>Alguns eventos de bloqueio não carregaram.</DetailMessage> : null}
      {!blockedBy || !blocks ? <DetailMessage>Carregando bloqueios…</DetailMessage> : null}
      {blockedBy && blocks && now ? (
        <>
          <BlockGroup label="Bloqueado por" userId={userId} cards={blockedBy} now={now} />
          <BlockGroup label="Bloqueia" userId={userId} cards={blocks} now={now} />
        </>
      ) : null}
    </DetailSection>
  );
}

/** Os eventos que carregaram; o que falhou (apagado, de outro dono) some da lista e aparece no aviso. */
function loaded(results: PromiseSettledResult<EventDto>[]): EventDto[] {
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

function BlockGroup({ label, userId, cards, now }: { label: string; userId: string; cards: EventDto[]; now: Date }) {
  const headingId = `block-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className={styles.group}>
      <h3 className={styles.groupLabel} id={headingId}>{label}</h3>
      {cards.length === 0 ? (
        <div role="group" aria-labelledby={headingId} className={styles.empty}>
          <span>nenhum evento</span>
        </div>
      ) : (
        <ul className={styles.list} aria-labelledby={headingId}>
          {cards.map((card) => (
            <li key={card.id} className={styles.blockRow}>
              <BlockGlyph card={card} />
              <Link href={`/${userId}/eventos/${card.id}`} className={styles.blockBody}>
                <span className={styles.blockName}>{card.name}</span>
                <span className={styles.blockMeta}>
                  <EventKindMark kind={card.kind} />
                  <span>{cardWhenLabel(card, now)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** O glifo só mostra o status; não é botão, porque o bloqueio não muda status daqui. */
function BlockGlyph({ card }: { card: EventDto }) {
  if (card.actor === "agent") {
    return <EventStatusGlyph actor="agent" status={card.status as AgentEventStatus} size={20} />;
  }
  const status = (card.status ?? null) as HumanEventStatus | null;
  return <EventStatusGlyph actor="human" status={status} size={20} />;
}
