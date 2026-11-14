import { MAX_EVENT_BLOCK_DAYS, type Event, type Recurrence } from "../../../domain";
import type {
  AgendaPage,
  AgendaQueryParams,
  EventCard,
  EventCardQuery,
  RecurrenceRepository,
  TrackedQueryParams,
} from "../../../domain/ports";
import { decodeAgendaCursor, encodeAgendaCursor } from "../../../infrastructure/persistence/events/queries/agenda-cursor";
import type { InMemoryEventDatabase } from "./in-memory-event-database";

/** Os status de pessoa em que o evento ainda esta em aberto. */
const OPEN_STATUSES: readonly string[] = ["todo", "toDefine", "doing", "inHold"];
const MAX_EVENT_BLOCK_MS = MAX_EVENT_BLOCK_DAYS * 24 * 60 * 60 * 1000;

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** O instante pelo qual a lista de tarefas ordena e filtra: o inicio ou, sem ele, o fim planejado. */
function trackedInstantOf(event: Event): Date | undefined {
  return event.startedAt ?? event.estimatedFinishAt;
}

/**
 * As leituras do cartao sobre o banco em memoria, com a mesma semantica de
 * `PostgresEventCardQuery`. `recurrences` e de onde sai a regra que o cartao de
 * uma ocorrencia mostra; sem ele, o cartao vem sem a serie.
 */
export class InMemoryEventCardQuery implements EventCardQuery {
  constructor(
    private readonly database: InMemoryEventDatabase,
    private readonly recurrences?: Pick<RecurrenceRepository, "findById">,
  ) {}

  async agenda(params: AgendaQueryParams): Promise<AgendaPage> {
    const cursor = params.cursor ? decodeAgendaCursor(params.cursor) : undefined;
    const matching = this.database.events
      .filter((event) => {
        const startedAt = event.startedAt;
        if (event.userId !== params.userId || !startedAt || event.longRunning || event.kind === "step") return false;
        if (params.to && startedAt > params.to) return false;
        if (params.from) {
          // Um bloco dura no maximo 31 dias: quem ainda toca a janela comecou no maximo isso antes dela.
          if (startedAt.getTime() < params.from.getTime() - MAX_EVENT_BLOCK_MS) return false;
          if ((event.estimatedFinishAt ?? event.finishedAt ?? startedAt) < params.from) return false;
        }
        if (params.actor && event.actor !== params.actor) return false;
        if (params.kind && event.kind !== params.kind) return false;
        if (params.tag && !event.tags.includes(params.tag)) return false;
        if (cursor) {
          const difference = startedAt.getTime() - cursor.startedAt.getTime();
          if (difference > 0 || (difference === 0 && event.id >= cursor.id)) return false;
        }
        return true;
      })
      .sort(
        (left, right) =>
          (right.startedAt as Date).getTime() - (left.startedAt as Date).getTime() || compareIds(right.id, left.id),
      );

    const rows = matching.slice(0, params.limit);
    const last = rows.at(-1);
    return {
      items: await this.cardsOf(rows.map((event) => event.id)),
      nextCursor:
        matching.length > params.limit && last
          ? encodeAgendaCursor({ startedAt: last.startedAt as Date, id: last.id })
          : undefined,
    };
  }

  async tracked(params: TrackedQueryParams): Promise<EventCard[]> {
    const matching = this.database.events
      .filter((event) => {
        if (event.userId !== params.userId || event.status === undefined || event.kind === "step") return false;
        // Uma serie aparece uma vez so: pela proxima ocorrencia em aberto. A que alguem editou aparece por si.
        if (event.occurrence && !event.occurrence.detached && this.nextOpenOccurrenceId(event.occurrence.recurrenceId) !== event.id) {
          return false;
        }
        if (params.actor && event.actor !== params.actor) return false;
        if (params.status?.length && !params.status.includes(event.status)) return false;
        if (params.priority?.length && !params.priority.includes(event.priority)) return false;
        if (params.tag && !event.tags.includes(params.tag)) return false;
        if (params.q && !event.name.toLowerCase().includes(params.q)) return false;
        const instant = trackedInstantOf(event);
        if (params.from && !(instant && instant >= params.from)) return false;
        if (params.to && !(instant && instant <= params.to)) return false;
        if (params.longRunning !== undefined && event.longRunning !== params.longRunning) return false;
        return true;
      })
      .sort((left, right) => {
        const leftInstant = trackedInstantOf(left)?.getTime() ?? Number.POSITIVE_INFINITY;
        const rightInstant = trackedInstantOf(right)?.getTime() ?? Number.POSITIVE_INFINITY;
        return leftInstant === rightInstant ? compareIds(left.id, right.id) : leftInstant - rightInstant;
      });

    const rows = params.limit === undefined ? matching : matching.slice(0, params.limit);
    return this.cardsOf(rows.map((event) => event.id));
  }

  async subtasks(params: { userId: string; parentEventId: string }): Promise<EventCard[]> {
    const parent = this.database.events.find((event) => event.id === params.parentEventId);
    if (!parent) return [];
    const owned = parent.subtaskIds.filter((id) =>
      this.database.events.some((event) => event.id === id && event.userId === params.userId),
    );
    return this.cardsOf(owned);
  }

  async cardsOf(eventIds: readonly string[]): Promise<EventCard[]> {
    const cards: EventCard[] = [];
    for (const id of eventIds) {
      const stored = this.database.events.find((event) => event.id === id);
      if (!stored) continue;
      const event = this.database.hydrate(stored);
      const recurrence = event.occurrence ? await this.recurrenceOf(event.occurrence.recurrenceId) : undefined;
      cards.push({
        event,
        artifactTypes: this.database.artifactsOf(event).map((artifact) => artifact.type),
        ...(recurrence ? { recurrence } : {}),
      });
    }
    return cards;
  }

  private nextOpenOccurrenceId(recurrenceId: string): string | undefined {
    return this.database.events
      .filter(
        (event) =>
          event.occurrence?.recurrenceId === recurrenceId &&
          !event.occurrence.detached &&
          event.status !== undefined &&
          OPEN_STATUSES.includes(event.status),
      )
      .sort((left, right) => (left.occurrence?.occurrenceOn ?? "").localeCompare(right.occurrence?.occurrenceOn ?? ""))[0]?.id;
  }

  private async recurrenceOf(recurrenceId: string): Promise<Recurrence | undefined> {
    return (await this.recurrences?.findById(recurrenceId)) ?? undefined;
  }
}
