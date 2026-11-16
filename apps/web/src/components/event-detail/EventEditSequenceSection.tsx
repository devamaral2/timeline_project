"use client";

import { useEffect, useState } from "react";
import type { AgentEventStatus, EventCardDto, HumanEventStatus } from "@repo/contracts";
import { DetailMessage, DetailSection } from "@/components/detail/detail-parts";
import { AddButton, RemoveButton, editStyles as edit } from "@/components/edit/edit-parts";
import { EntityPickerDialog } from "@/components/edit/EntityPickerDialog";
import { EventChoiceView, searchTrackedEvents } from "@/components/edit/event-choice";
import { EventKindMark } from "@/components/events/event-kind-mark";
import { EventStatusGlyph } from "@/components/events/event-status-glyph";
import { getEvent } from "@/lib/api/events";
import { cardWhenLabel } from "@/lib/events/card-text";
import { useNow } from "@/lib/events/use-now";
import type { EventDraft, EventDraftField } from "./event-draft";

interface EventEditSequenceSectionProps {
  /** O evento aberto: não aparece na busca. */
  eventId: string;
  draft: EventDraft;
  onChange: <K extends EventDraftField>(field: K, value: EventDraft[K]) => void;
}

/**
 * "Sequência" na edição, nos dois lados: "Segue-se de" (os eventos que vêm antes
 * deste) e "Da sequência a" (os que se seguem a este). Cada lista tem um "+" que
 * abre o modal de seleção, com a busca por nome na lista de tarefas (eventos de
 * pessoa e de agente); o evento aberto fica de fora. O rascunho guarda só os ids; nome, tipo e quando
 * de cada um vêm de `getEvent`, ou do próprio resultado da busca quando a pessoa
 * escolheu agora. Remover só tira o id do rascunho: a gravação fica para o Salvar.
 */
export function EventEditSequenceSection({ eventId, draft, onChange }: EventEditSequenceSectionProps) {
  const now = useNow();
  const [cards, setCards] = useState<Record<string, EventCardDto>>({});
  const [loadFailed, setLoadFailed] = useState(false);

  const missing = [...new Set([...draft.previousEventIds, ...draft.nextEventIds])].filter((id) => !cards[id]);
  const missingKey = missing.join(",");

  useEffect(() => {
    if (!missingKey) return;
    let stale = false;
    for (const id of missingKey.split(",")) {
      getEvent(id)
        .then((event) => {
          if (!stale) setCards((current) => ({ ...current, [id]: event }));
        })
        .catch(() => {
          if (!stale) setLoadFailed(true);
        });
    }
    return () => {
      stale = true;
    };
  }, [missingKey]);

  function pick(field: "previousEventIds" | "nextEventIds", card: EventCardDto) {
    setCards((current) => ({ ...current, [card.id]: card }));
    onChange(field, [...draft[field], card.id]);
  }

  function drop(field: "previousEventIds" | "nextEventIds", id: string) {
    onChange(field, draft[field].filter((current) => current !== id));
  }

  return (
    <DetailSection title="Sequência" labelId="event-edit-sequence">
      {loadFailed ? <DetailMessage alert>Alguns eventos da sequência não carregaram.</DetailMessage> : null}
      <SequencePicker
        id="previous"
        heading="Segue-se de"
        addLabel="Adicionar evento de que este se segue"
        searchLabel="Buscar evento de que este se segue"
        removeLabel={(name) => `Deixar de se seguir de “${name}”`}
        ids={draft.previousEventIds}
        eventId={eventId}
        cards={cards}
        loadFailed={loadFailed}
        now={now}
        onPick={(card) => pick("previousEventIds", card)}
        onDrop={(id) => drop("previousEventIds", id)}
      />
      <SequencePicker
        id="next"
        heading="Da sequência a"
        addLabel="Adicionar evento da sequência"
        searchLabel="Buscar evento da sequência"
        removeLabel={(name) => `Remover “${name}” da sequência`}
        ids={draft.nextEventIds}
        eventId={eventId}
        cards={cards}
        loadFailed={loadFailed}
        now={now}
        onPick={(card) => pick("nextEventIds", card)}
        onDrop={(id) => drop("nextEventIds", id)}
      />
    </DetailSection>
  );
}

interface SequencePickerProps {
  id: string;
  heading: string;
  /** O nome do "+" para o leitor de tela. */
  addLabel: string;
  searchLabel: string;
  removeLabel: (name: string) => string;
  ids: string[];
  eventId: string;
  cards: Record<string, EventCardDto>;
  loadFailed: boolean;
  now: Date | null;
  onPick: (card: EventCardDto) => void;
  onDrop: (id: string) => void;
}

/** Uma lista da sequência com o seu "+": o modal de seleção abre com a busca de eventos. */
function SequencePicker({ id, heading, addLabel, searchLabel, removeLabel, ids, eventId, cards, loadFailed, now, onPick, onDrop }: SequencePickerProps) {
  const headingId = `event-edit-sequence-${id}`;
  const [picking, setPicking] = useState(false);

  return (
    <div role="group" aria-labelledby={headingId}>
      <h3 id={headingId} className={edit.groupLabel}>{heading}</h3>
      {ids.length > 0 ? (
        <ul className={edit.list}>
          {ids.map((linkedId) => {
            const card = cards[linkedId];
            const name = card ? card.name : loadFailed ? "Evento indisponível" : "Carregando…";
            return (
              <li key={linkedId} className={edit.item}>
                <span className={edit.itemLead}>{card ? <SequenceGlyph card={card} /> : null}</span>
                <div className={edit.itemBody}>
                  <span className={edit.itemName}>{name}</span>
                  {card ? (
                    <span className={edit.itemMeta}>
                      <EventKindMark kind={card.kind} />
                      {now ? <span>{cardWhenLabel(card, now)}</span> : null}
                    </span>
                  ) : null}
                </div>
                <RemoveButton label={removeLabel(card ? card.name : "evento")} onClick={() => onDrop(linkedId)} />
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className={edit.addRow}>
        <AddButton label={addLabel} onClick={() => setPicking(true)} />
        {ids.length === 0 ? <p className={edit.empty}>nenhum evento</p> : null}
      </div>
      {picking ? (
        <EntityPickerDialog<EventCardDto>
          title={heading}
          searchLabel={searchLabel}
          search={searchTrackedEvents}
          keyOf={(card) => card.id}
          nameOf={(card) => card.name}
          renderItem={(card) => <EventChoiceView card={card} now={now} />}
          // O evento aberto e quem já está na lista não são oferecidos de novo.
          exclude={(card) => card.id === eventId || ids.includes(card.id)}
          onPick={onPick}
          onClose={() => setPicking(false)}
          failedMessage="Não foi possível buscar eventos. Tente de novo."
        />
      ) : null}
    </div>
  );
}

/** O glifo só mostra o status: escolher um evento da sequência não muda o status do evento daqui. */
function SequenceGlyph({ card }: { card: EventCardDto }) {
  if (card.actor === "agent") {
    return <EventStatusGlyph actor="agent" status={card.status as AgentEventStatus} size={22} />;
  }
  const status = (card.status ?? null) as HumanEventStatus | null;
  return <EventStatusGlyph actor="human" status={status} size={22} />;
}
