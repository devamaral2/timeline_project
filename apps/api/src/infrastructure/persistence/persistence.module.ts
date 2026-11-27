import { Module } from "@nestjs/common";
import type {
  ArtifactTaskLinkQuery,
  ArtifactRepository,
  EntityBatchWriter,
  TaskCardQuery,
  TaskRepository,
  TaskRequestLinkQuery,
  IdempotencyStore,
  ProjectQuery,
  ProjectRepository,
  RecurrenceRepository,
  ScopedSqlQuery,
  TagRepository,
  WorkoutCatalog,
} from "../../domain/ports";
import { PostgresDatabase } from "./database/postgres-database";
import { PostgresEntityBatchWriter } from "./agent-batch/postgres-entity-batch-writer";
import { PostgresProjectQuery } from "./projects/postgres-project.query";
import { PostgresProjectRepository } from "./projects/postgres-project.repository";
import { PostgresScopedSqlQuery } from "./agent-sql/postgres-scoped-sql.query";
import { PostgresWorkoutCatalog } from "./artifacts/postgres-workout.catalog";
import { PostgresArtifactTaskLinkQuery } from "./artifacts/queries/postgres-artifact-task-link.query";
import { PostgresArtifactRepository } from "./artifacts/repositories/postgres-artifact.repository";
import { PostgresTaskCardQuery } from "./tasks/queries/postgres-task-card.query";
import { PostgresTaskRequestLinkQuery } from "./tasks/queries/postgres-task-request-link.query";
import { PostgresTaskRepository } from "./tasks/repositories/postgres-task.repository";
import { PostgresTagRepository } from "./tasks/repositories/postgres-tag.repository";
import { PostgresIdempotencyStore } from "./idempotency/postgres-idempotency.store";
import { PostgresRecurrenceRepository } from "./recurrences/repositories/postgres-recurrence.repository";

/**
 * Tokens de injecao. Sao strings, e nao symbols, porque o Nest os imprime tal
 * qual na mensagem de erro quando um provider nao resolve.
 *
 * As portas (`TaskRepository`, `TagRepository`, ...) sao interfaces e nao
 * existem em runtime: por isso quem as consome precisa de `@Inject(TOKEN)`
 * explicito.
 */
export const DATABASE = "DATABASE";
export const TASK_REPOSITORY = "TASK_REPOSITORY";
export const TASK_CARD_QUERY = "TASK_CARD_QUERY";
export const TASK_REQUEST_LINK_QUERY = "TASK_REQUEST_LINK_QUERY";
export const PROJECT_QUERY = "PROJECT_QUERY";
export const PROJECT_REPOSITORY = "PROJECT_REPOSITORY";
export const TAG_REPOSITORY = "TAG_REPOSITORY";
export const ARTIFACT_REPOSITORY = "ARTIFACT_REPOSITORY";
export const ARTIFACT_TASK_LINK_QUERY = "ARTIFACT_TASK_LINK_QUERY";
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
      provide: TASK_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): TaskRepository => new PostgresTaskRepository(database.db),
    },
    {
      provide: TASK_CARD_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): TaskCardQuery => new PostgresTaskCardQuery(database.db),
    },
    {
      provide: TASK_REQUEST_LINK_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): TaskRequestLinkQuery => new PostgresTaskRequestLinkQuery(database.db),
    },
    {
      provide: PROJECT_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): ProjectQuery => new PostgresProjectQuery(database.db),
    },
    {
      provide: PROJECT_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): ProjectRepository => new PostgresProjectRepository(database.db),
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
      provide: ARTIFACT_TASK_LINK_QUERY,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): ArtifactTaskLinkQuery =>
        new PostgresArtifactTaskLinkQuery(database.db),
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
    TASK_REPOSITORY,
    TASK_CARD_QUERY,
    TASK_REQUEST_LINK_QUERY,
    PROJECT_QUERY,
    PROJECT_REPOSITORY,
    TAG_REPOSITORY,
    ARTIFACT_REPOSITORY,
    ARTIFACT_TASK_LINK_QUERY,
    WORKOUT_CATALOG,
    RECURRENCE_REPOSITORY,
    SCOPED_SQL_QUERY,
    ENTITY_BATCH_WRITER,
    IDEMPOTENCY_STORE,
  ],
})
export class PersistenceModule {}
