import type { ArtifactWrites } from "../../artifacts/types/artifact-writes";
import type { Event } from "../entities/event.entity";

/**
 * Cada evento e gravado por si, com o inicio e o fim que o usuario disse: no
 * passado, agora ou no futuro. As relacoes que saem do evento (artefatos,
 * subtarefas, bloqueios) sao gravadas com ele.
 */
export interface EventRepository {
  /** `artifacts`: os artefatos que nascem com o evento, gravados antes e na mesma transacao dele. */
  save(event: Event, artifacts?: ArtifactWrites): Promise<void>;
  update(event: Event, actorUserId: string, expectedRevision: number, artifacts?: ArtifactWrites): Promise<void>;
  delete(eventId: string, actorUserId: string): Promise<void>;
  findById(eventId: string): Promise<Event | null>;
  /** Os eventos que existem e nao foram apagados; ids ausentes ficam de fora, e a ordem nao e a dos ids. */
  findByIds(eventIds: readonly string[]): Promise<Event[]>;
}
