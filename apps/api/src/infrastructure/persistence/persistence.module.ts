import { Module } from "@nestjs/common";
import type {
  ArtifactEventLinkQuery,
  ArtifactRepository,
  EntityBatchWriter,
  EventCardQuery,
  EventRepository,
  EventRequestLinkQuery,
  IdempotencyStore,
  RecurrenceRepository,
  ScopedSqlQuery,
  TagRepository,
  WorkoutCatalog,
} from "../../domain/ports";
import { PostgresDatabase } from "./database/postgres-database";
import { PostgresEntityBatchWriter } from "./agent-batch/postgres-entity-batch-writer";
import { PostgresScopedSqlQuery } from "./agent-sql/postgres-scoped-sql.query";
import { PostgresWorkoutCatalog } from "./artifacts/postgres-workout.catalog";
import { PostgresArtifactEventLinkQuery } from "./artifacts/queries/postgres-artifact-event-link.query";
import { PostgresArtifactRepository } from "./artifacts/repositories/postgres-artifact.repository";
import { PostgresEventCardQuery } from "./events/queries/postgres-event-card.query";
import { PostgresEventRequestLinkQuery } from "./events/queries/postgres-event-request-link.query";
import { PostgresEventRepository } from "./events/repositories/postgres-event.repository";
import { PostgresTagRepository } from "./events/repositories/postgres-tag.repository";
import { PostgresIdempotencyStore } from "./idempotency/postgres-idempotency.store";
import { PostgresRecurrenceRepository } from "./recurrences/repositories/postgres-recurrence.repository";

/**
 * Tokens de injecao. Sao strings, e nao symbols, porque o Nest os imprime tal
 * qual na mensagem de erro quando um provider nao resolve.
 *
 * As portas (`EventRepository`, `TagRepository`, ...) sao interfaces e nao
 * existem em runtime: por isso quem as consome precisa de `@Inject(TOKEN)`
 * explicito.
 */
export const DATABASE = "DATABASE";
export const EVENT_REPOSITORY = "EVENT_REPOSITORY";
export const EVENT_CARD_QUERY = "EVENT_CARD_QUERY";
export const EVENT_REQUEST_LINK_QUERY = "EVENT_REQUEST_LINK_QUERY";
export const TAG_REPOSITORY = "TAG_REPOSITORY";
export const ARTIFACT_REPOSITORY = "ARTIFACT_REPOSITORY";
export const ARTIFACT_EVENT_LINK_QUERY = "ARTIFACT_EVENT_LINK_QUERY";
export const WORKOUT_CATALOG = "WORKOUT_CATALOG";
export const RECURRENCE_REPOSITORY = "RECURRENCE_REPOSITORY";
export const SCOPED_SQL_QUERY = "SCOPED_SQL_QUERY";
export const ENTITY_BATCH_WRITER = "ENTITY_BATCH_WRITER";
export const IDEMPOTENCY_STORE = "IDEMPOTENCY_STORE";

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): PostgresDatabase => PostgresDatabase.connect(requireDatabaseUrl()),
    },
    {
      provide: EVENT_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): EventRepository => new PostgresEventRepository(database.db),
    },
    {
      provide: EVENT_CARD_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): EventCardQuery => new PostgresEventCardQuery(database.db),
    },
    {
      provide: EVENT_REQUEST_LINK_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): EventRequestLinkQuery => new PostgresEventRequestLinkQuery(database.db),
    },
    {
      provide: TAG_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): TagRepository => new PostgresTagRepository(database.db),
    },
    {
      provide: ARTIFACT_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): ArtifactRepository => new PostgresArtifactRepository(database.db),
    },
    {
      provide: ARTIFACT_EVENT_LINK_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): ArtifactEventLinkQuery =>
        new PostgresArtifactEventLinkQuery(database.db),
    },
    {
      provide: WORKOUT_CATALOG,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): WorkoutCatalog => new PostgresWorkoutCatalog(database.db),
    },
    {
      provide: RECURRENCE_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): RecurrenceRepository =>
        new PostgresRecurrenceRepository(database.db),
    },
    {
      provide: SCOPED_SQL_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): ScopedSqlQuery => new PostgresScopedSqlQuery(database.pool),
    },
    {
      provide: ENTITY_BATCH_WRITER,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): EntityBatchWriter => new PostgresEntityBatchWriter(database.db),
    },
    {
      provide: IDEMPOTENCY_STORE,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): IdempotencyStore => new PostgresIdempotencyStore(database.db),
    },
  ],
  exports: [
    DATABASE,
    EVENT_REPOSITORY,
    EVENT_CARD_QUERY,
    EVENT_REQUEST_LINK_QUERY,
    TAG_REPOSITORY,
    ARTIFACT_REPOSITORY,
    ARTIFACT_EVENT_LINK_QUERY,
    WORKOUT_CATALOG,
    RECURRENCE_REPOSITORY,
    SCOPED_SQL_QUERY,
    ENTITY_BATCH_WRITER,
    IDEMPOTENCY_STORE,
  ],
})
export class PersistenceModule {}
