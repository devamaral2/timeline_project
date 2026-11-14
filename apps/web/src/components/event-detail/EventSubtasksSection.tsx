"use client";

import { useCallback, useEffect, useState } from "react";
import type { EventCardDto, EventDto, HumanEventStatus } from "@repo/contracts";
import { agendaRefreshEvent } from "@/components/agenda/agenda-refresh";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { EventRow } from "@/components/events/event-row";
import { ApiRequestError } from "@/lib/api/client-request";
import { listSubtasks, updateEvent } from "@/lib/api/events";
import { statusPatch } from "@/lib/events/event-read-model";
import { useNow } from "@/lib/events/use-now";
import styles from "./event-relations.module.css";

interface EventSubtasksSectionProps {
  userId: string;
  event: EventDto;
}

const STALE_MESSAGE = "Uma subtarefa mudou em outro lugar. Carregamos a versão atual; confira e tente de novo.";
const FAILURE_MESSAGE = "Não foi possível trocar o status da subtarefa. Tente novamente.";

/**
 * A seção Subtarefas do detalhe: os eventos em que este se desdobra, com a
 * linha única das listas e a fração feita ("1/3"). O glifo de pessoa troca o
 * status ali mesmo: concluir envia `finishedAt`, reabrir leva a “a fazer” e envia
 * `finishedAt` nulo, sempre com a revisão lida da subtarefa.
 */
export function EventSubtasksSection({ userId, event }: EventSubtasksSectionProps) {
  const now = useNow();
  const [cards, setCards] = useState<EventCardDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Recarrega quando o pai muda (revisão nova) ou a lista de subtarefas muda.
  const subtaskKey = event.subtaskEventIds.join(",");
  const load = useCallback(async () => {
    try {
      setCards(await listSubtasks(event.id));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [event.id]);

  useEffect(() => {
    void load();
  }, [load, event.revision, subtaskKey]);

  async function toggle(card: EventCardDto) {
    if (busy) return;
    const status: HumanEventStatus = card.status === "done" ? "todo" : "done";
    setBusy(true);
    setError(null);
    try {
      await updateEvent(card.id, statusPatch(card, status, new Date()));
      window.dispatchEvent(new Event(agendaRefreshEvent));
      await load();
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.kind === "stale_revision") {
        await load();
        setError(STALE_MESSAGE);
      } else {
        setError(FAILURE_MESSAGE);
      }
    } finally {
      setBusy(false);
    }
  }

  const done = cards?.filter((card) => card.status === "done").length ?? 0;
  const total = cards?.length ?? 0;

  return (
    <DetailSection
      title="Subtarefas"
      labelId="event-subtasks"
      count={cards && total > 0 ? `${done}/${total}` : undefined}
    >
      {loadFailed && !cards ? <DetailMessage alert>Não foi possível carregar as subtarefas.</DetailMessage> : null}
      {!cards && !loadFailed ? <DetailMessage>Carregando subtarefas…</DetailMessage> : null}
      {cards && total === 0 ? <p className={styles.empty}>nenhuma subtarefa</p> : null}
      {cards && total > 0 && now ? (
        <ul className={styles.list}>
          {cards.map((card) => (
            <EventRow
              key={card.id}
              card={card}
              userId={userId}
              now={now}
              onStatusClick={(target) => void toggle(target)}
            />
          ))}
        </ul>
      ) : null}
      {error ? <DetailMessage alert>{error}</DetailMessage> : null}
    </DetailSection>
  );
}
