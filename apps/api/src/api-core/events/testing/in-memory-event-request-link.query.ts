import type { EventRequestLink, EventRequestLinkQuery } from "../../../domain/ports";

/** Os pedidos de cada evento, informados pelo teste, com a ordem de `PostgresEventRequestLinkQuery` (do mais antigo ao mais novo). */
export class InMemoryEventRequestLinkQuery implements EventRequestLinkQuery {
  private readonly byEvent = new Map<string, EventRequestLink[]>();

  link(eventId: string, link: EventRequestLink): this {
    this.byEvent.set(eventId, [...(this.byEvent.get(eventId) ?? []), link]);
    return this;
  }

  async linksOf(eventId: string): Promise<EventRequestLink[]> {
    return [...(this.byEvent.get(eventId) ?? [])].sort((left, right) => left.at.getTime() - right.at.getTime());
  }
}
