import { Module } from "@nestjs/common";
import type {
  DailyOverviewQuery,
  IdempotencyStore,
  EntityBatchWriter,
  EventRepository,
  NoteLinkQuery,
  NoteRepository,
  RecurrenceRepository,
  ScopedSqlQuery,
  TagRepository,
  TaskRepository,
  TimelineEventQuery,
  WorkoutCatalog,
} from "../../domain/ports";
import { PostgresDatabase } from "./database/postgres-database";
import { PostgresDailyOverviewQuery } from "./events/queries/postgres-daily-overview.query";
import { PostgresTimelineEventQuery } from "./events/queries/postgres-timeline-event.query";
import { PostgresEventRepository } from "./events/repositories/postgres-event.repository";
import { PostgresTagRepository } from "./events/repositories/postgres-tag.repository";
import { PostgresTaskRepository } from "./tasks/repositories/postgres-task.repository";
import { PostgresNoteRepository } from "./notes/repositories/postgres-note.repository";
import { PostgresNoteLinkQuery } from "./notes/queries/postgres-note-link.query";
import { PostgresScopedSqlQuery } from "./agent-sql/postgres-scoped-sql.query";
import { PostgresEntityBatchWriter } from "./agent-batch/postgres-entity-batch-writer";
import { PostgresRecurrenceRepository } from "./recurrences/repositories/postgres-recurrence.repository";
import { PostgresWorkoutCatalog } from "./catalog/postgres-workout.catalog";
import { PostgresIdempotencyStore } from "./idempotency/postgres-idempotency.store";

/**
 * Tokens de injecao. Sao strings, e nao symbols, porque o Nest os imprime tal
 * qual na mensagem de erro quando um provider nao resolve.
 *
 * As portas (`EventRepository`, `TagRepository`, ...) sao interfaces e nao
 * existem em runtime — por isso quem as consome precisa de `@Inject(TOKEN)`
 * explicito.
 */
export const DATABASE = "DATABASE";
export const EVENT_REPOSITORY = "EVENT_REPOSITORY";
export const TAG_REPOSITORY = "TAG_REPOSITORY";
export const TIMELINE_EVENT_QUERY = "TIMELINE_EVENT_QUERY";
export const DAILY_OVERVIEW_QUERY = "DAILY_OVERVIEW_QUERY";
export const WORKOUT_CATALOG = "WORKOUT_CATALOG";
export const TASK_REPOSITORY = "TASK_REPOSITORY";
export const RECURRENCE_REPOSITORY = "RECURRENCE_REPOSITORY";
export const NOTE_REPOSITORY = "NOTE_REPOSITORY";
export const NOTE_LINK_QUERY = "NOTE_LINK_QUERY";
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
      useFactory: (database: PostgresDatabase): EventRepository =>
        new PostgresEventRepository(database.db),
    },
    {
      provide: TAG_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): TagRepository =>
        new PostgresTagRepository(database.db),
    },
    {
      provide: TIMELINE_EVENT_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): TimelineEventQuery =>
        new PostgresTimelineEventQuery(database.db),
    },
    {
      provide: DAILY_OVERVIEW_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): DailyOverviewQuery =>
        new PostgresDailyOverviewQuery(database.db),
    },
    {
      provide: WORKOUT_CATALOG,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): WorkoutCatalog =>
        new PostgresWorkoutCatalog(database.db),
    },
    {
      provide: TASK_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): TaskRepository =>
        new PostgresTaskRepository(database.db),
    },
    {
      provide: RECURRENCE_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): RecurrenceRepository =>
        new PostgresRecurrenceRepository(database.db),
    },
    {
      provide: NOTE_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): NoteRepository =>
        new PostgresNoteRepository(database.db),
    },
    {
      provide: NOTE_LINK_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): NoteLinkQuery => new PostgresNoteLinkQuery(database.db),
    },
    {
      provide: SCOPED_SQL_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): ScopedSqlQuery =>
        new PostgresScopedSqlQuery(database.pool),
    },
    {
      provide: ENTITY_BATCH_WRITER,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): EntityBatchWriter =>
        new PostgresEntityBatchWriter(database.db),
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
    TAG_REPOSITORY,
    TIMELINE_EVENT_QUERY,
    DAILY_OVERVIEW_QUERY,
    WORKOUT_CATALOG,
    TASK_REPOSITORY,
    RECURRENCE_REPOSITORY,
    NOTE_REPOSITORY,
    NOTE_LINK_QUERY,
    SCOPED_SQL_QUERY,
    ENTITY_BATCH_WRITER,
    IDEMPOTENCY_STORE,
  ],
})
export class PersistenceModule {}
