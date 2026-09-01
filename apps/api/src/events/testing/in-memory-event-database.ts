import type { Event } from "@repo/entities";

/**
 * Estado compartilhado entre EventRepository, TagRepository e as query ports em
 * memoria, para que tags gravadas atomicamente com eventos apareçam nas
 * sugestões — espelhando a transação unica do repositório PostgreSQL.
 */
export class InMemoryEventDatabase {
  events: Event[];

  constructor(events: Event[] = []) {
    this.events = [...events];
  }
}
