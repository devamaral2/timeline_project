import { Module } from "@nestjs/common";
import type {
  DailyOverviewQuery,
  EventRepository,
  RecurrenceRepository,
  TagRepository,
  TaskRepository,
  TimelineEventQuery,
  WorkoutCatalog,
} from "@repo/entities/ports";
import { PostgresDatabase } from "./database/postgres-database";
import { PostgresDailyOverviewQuery } from "./events/queries/postgres-daily-overview.query";
import { PostgresTimelineEventQuery } from "./events/queries/postgres-timeline-event.query";
import { PostgresEventRepository } from "./events/repositories/postgres-event.repository";
import { PostgresTagRepository } from "./events/repositories/postgres-tag.repository";
import { PostgresTaskRepository } from "./tasks/repositories/postgres-task.repository";
import { PostgresRecurrenceRepository } from "./recurrences/repositories/postgres-recurrence.repository";
import { PostgresWorkoutCatalog } from "./catalog/postgres-workout.catalog";

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
  ],
})
export class PersistenceModule {}
