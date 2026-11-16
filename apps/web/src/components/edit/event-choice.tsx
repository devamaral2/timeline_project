import type { TaskCardDto } from "@repo/contracts";
import { dayKeyOf, shiftDayKey, zonedDayEnd, zonedDayStart } from "@repo/timeline";
import { EventKindMark } from "@/components/events/event-kind-mark";
import { listAgenda, listTrackedEvents } from "@/lib/api/events";
import { cardWhenLabel } from "@/lib/events/card-text";
import styles from "./edit.module.css";

/** Quantos eventos o modal de seleção pede de cada vez. */
const CHOICE_LIMIT = 50;

/**
 * A fonte de eventos do modal de seleção: a lista de tarefas, filtrada pelo nome. Sem texto (o modal acabou de
 * abrir), devolve os primeiros da lista, para a pessoa escolher sem digitar.
 */
export function searchTrackedEvents(query: string): Promise<TaskCardDto[]> {
  return listTrackedEvents(query ? { q: query, limit: CHOICE_LIMIT } : { limit: CHOICE_LIMIT });
}

/** Quantos dias antes e depois de hoje a agenda entra na busca de eventos de pessoa. */
const NEARBY_DAYS = 14;
/** Por quanto tempo a agenda lida vale para as próximas buscas do mesmo modal. */
const NEARBY_TTL_MS = 60_000;

let nearby: { at: number; cards: Promise<TaskCardDto[]> } | null = null;

/** A agenda de pessoa em volta de hoje, lida uma vez e reaproveitada enquanto a pessoa digita. */
function nearbyAgenda(): Promise<TaskCardDto[]> {
  if (nearby && Date.now() - nearby.at < NEARBY_TTL_MS) return nearby.cards;
  const today = dayKeyOf(new Date());
  const cards = listAgenda({
    from: zonedDayStart(shiftDayKey(today, -NEARBY_DAYS)).toISOString(),
    to: zonedDayEnd(shiftDayKey(today, NEARBY_DAYS)).toISOString(),
    actor: "human",
  });
  nearby = { at: Date.now(), cards };
  // Uma leitura que falhou não fica guardada: a próxima busca tenta de novo.
  cards.catch(() => {
    nearby = null;
  });
  return cards;
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");

/**
 * A fonte de eventos de pessoa para ligar a um artefato: a lista de tarefas pelo nome e, depois dela, os
 * compromissos da agenda em volta de hoje (os eventos sem status não estão na lista de tarefas). Se a agenda
 * falhar, a lista de tarefas ainda responde.
 */
export async function searchHumanEvents(query: string): Promise<TaskCardDto[]> {
  const [tracked, agenda] = await Promise.all([
    listTrackedEvents(query ? { actor: "human", q: query, limit: CHOICE_LIMIT } : { actor: "human", limit: CHOICE_LIMIT }),
    nearbyAgenda().catch((): TaskCardDto[] => []),
  ]);
  const text = fold(query);
  const listed = new Set(tracked.map((card) => card.id));
  const fromAgenda = agenda.filter((card) => {
    if (listed.has(card.id)) return false;
    listed.add(card.id);
    return !text || fold(card.name).includes(text);
  });
  return [...tracked, ...fromAgenda];
}

/** Um evento como escolha do modal: o nome e, embaixo, o tipo (código em mono) e quando. */
export function EventChoiceView({ card, now }: { card: TaskCardDto; now: Date | null }) {
  return (
    <>
      <span className={styles.itemName}>{card.name}</span>
      <span className={styles.itemMeta}>
        <EventKindMark kind={card.kind} />
        {now ? <span>{cardWhenLabel(card, now)}</span> : null}
      </span>
    </>
  );
}
