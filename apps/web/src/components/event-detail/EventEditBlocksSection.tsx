"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AgentEventStatus, EventCardDto, HumanEventStatus } from "@repo/contracts";
import { DetailMessage, DetailSection, detailIcon } from "@/components/detail/detail-parts";
import { EventKindMark } from "@/components/events/event-kind-mark";
import { EventStatusGlyph } from "@/components/events/event-status-glyph";
import { getEvent, listTrackedEvents } from "@/lib/api/events";
import { cardWhenLabel } from "@/lib/events/card-text";
import { useNow } from "@/lib/events/use-now";
import type { EventDraft, EventDraftField } from "./event-draft";
import styles from "./event-edit-blocks.module.css";

interface EventEditBlocksSectionProps {
  /** O evento aberto: não aparece na busca. */
  eventId: string;
  draft: EventDraft;
  onChange: <K extends EventDraftField>(field: K, value: EventDraft[K]) => void;
}

/** Espera depois da última tecla antes de consultar a API pelo nome. Igual à lista de tarefas. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * "Bloqueios" na edição, nos dois sentidos: "Bloqueado por" (os eventos que
 * precisam terminar antes) e "Bloqueia" (os que este libera). Cada lista tem
 * uma busca por nome na lista de tarefas; o evento aberto fica de fora. O
 * rascunho guarda só os ids; nome, tipo e quando de cada um vêm de `getEvent`,
 * ou do próprio resultado da busca quando a pessoa escolheu agora. Remover só
 * tira o id do rascunho: a gravação fica para o Salvar.
 */
export function EventEditBlocksSection({ eventId, draft, onChange }: EventEditBlocksSectionProps) {
  const now = useNow();
  const [cards, setCards] = useState<Record<string, EventCardDto>>({});
  const [loadFailed, setLoadFailed] = useState(false);

  const missing = [...new Set([...draft.blockedByEventIds, ...draft.blocksEventIds])].filter((id) => !cards[id]);
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

  function pick(field: "blockedByEventIds" | "blocksEventIds", card: EventCardDto) {
    setCards((current) => ({ ...current, [card.id]: card }));
    onChange(field, [...draft[field], card.id]);
  }

  function drop(field: "blockedByEventIds" | "blocksEventIds", id: string) {
    onChange(field, draft[field].filter((current) => current !== id));
  }

  return (
    <DetailSection title="Bloqueios" labelId="event-edit-blocks">
      {loadFailed ? <DetailMessage alert>Alguns eventos de bloqueio não carregaram.</DetailMessage> : null}
      <BlockPicker
        id="blocked-by"
        heading="Bloqueado por"
        searchLabel="Buscar evento que bloqueia este"
        removeLabel={(name) => `Deixar de ser bloqueado por “${name}”`}
        ids={draft.blockedByEventIds}
        eventId={eventId}
        cards={cards}
        loadFailed={loadFailed}
        now={now}
        onPick={(card) => pick("blockedByEventIds", card)}
        onDrop={(id) => drop("blockedByEventIds", id)}
      />
      <BlockPicker
        id="blocks"
        heading="Bloqueia"
        searchLabel="Buscar evento para bloquear"
        removeLabel={(name) => `Deixar de bloquear “${name}”`}
        ids={draft.blocksEventIds}
        eventId={eventId}
        cards={cards}
        loadFailed={loadFailed}
        now={now}
        onPick={(card) => pick("blocksEventIds", card)}
        onDrop={(id) => drop("blocksEventIds", id)}
      />
    </DetailSection>
  );
}

interface BlockPickerProps {
  id: string;
  heading: string;
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

/** Uma lista de bloqueios com a sua busca. A busca só consulta depois de uma pausa na digitação. */
function BlockPicker({ id, heading, searchLabel, removeLabel, ids, eventId, cards, loadFailed, now, onPick, onDrop }: BlockPickerProps) {
  const headingId = `event-edit-block-${id}`;
  const [typed, setTyped] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EventCardDto[]>([]);
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(typed.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  useEffect(() => {
    if (!query) {
      setResults([]);
      return;
    }
    let stale = false;
    setSearchFailed(false);
    listTrackedEvents({ q: query })
      .then((list) => {
        if (!stale) setResults(list);
      })
      .catch(() => {
        if (!stale) setSearchFailed(true);
      });
    return () => {
      stale = true;
    };
  }, [query]);

  // O evento aberto e quem já está na lista não são oferecidos de novo.
  const shown = query ? results.filter((card) => card.id !== eventId && !ids.includes(card.id)) : [];

  function choose(card: EventCardDto) {
    onPick(card);
    setTyped("");
    setQuery("");
  }

  return (
    <div role="group" aria-labelledby={headingId} className={styles.group}>
      <h3 id={headingId} className={styles.groupLabel}>{heading}</h3>
      {ids.length === 0 ? <p className={styles.empty}>nenhum evento</p> : null}
      {ids.length > 0 ? (
        <ul className={styles.list}>
          {ids.map((linkedId) => {
            const card = cards[linkedId];
            const name = card ? card.name : loadFailed ? "Evento indisponível" : "Carregando…";
            return (
              <li key={linkedId} className={styles.row}>
                {card ? <BlockGlyph card={card} /> : null}
                <div className={styles.body}>
                  <span className={styles.name}>{name}</span>
                  {card ? (
                    <span className={styles.meta}>
                      <EventKindMark kind={card.kind} />
                      {now ? <span>{cardWhenLabel(card, now)}</span> : null}
                    </span>
                  ) : null}
                </div>
                <button type="button" className={styles.remove} aria-label={removeLabel(card ? card.name : "evento")} onClick={() => onDrop(linkedId)}>
                  <X {...detailIcon} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <input
        type="search"
        className={styles.search}
        aria-label={searchLabel}
        placeholder={searchLabel}
        autoComplete="off"
        value={typed}
        onChange={(change) => setTyped(change.target.value)}
      />
      {shown.length > 0 ? (
        <ul className={styles.results} aria-labelledby={headingId}>
          {shown.map((card) => (
            <li key={card.id}>
              <button type="button" className={styles.result} aria-label={`Escolher “${card.name}”`} onClick={() => choose(card)}>
                <span className={styles.name}>{card.name}</span>
                <span className={styles.meta}>
                  <EventKindMark kind={card.kind} />
                  {now ? <span>{cardWhenLabel(card, now)}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {searchFailed ? <p className={styles.error}>Não foi possível buscar eventos. Tente de novo.</p> : null}
    </div>
  );
}

/** O glifo só mostra o status: escolher bloqueio não muda o status do evento daqui. */
function BlockGlyph({ card }: { card: EventCardDto }) {
  if (card.actor === "agent") {
    return <EventStatusGlyph actor="agent" status={card.status as AgentEventStatus} size={20} />;
  }
  const status = (card.status ?? null) as HumanEventStatus | null;
  return <EventStatusGlyph actor="human" status={status} size={20} />;
}
