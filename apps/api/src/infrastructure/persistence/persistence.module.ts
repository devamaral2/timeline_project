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
import { getDatabaseEnv } from "../../config/env";
import { openApiDatabase } from "./database/api-database";
import type { SqliteDatabase } from "@repo/sqlite";
import { SqliteEntityBatchWriter } from "./agent-batch/sqlite-entity-batch-writer";
import { SqliteProjectQuery } from "./projects/sqlite-project.query";
import { SqliteProjectRepository } from "./projects/sqlite-project.repository";
import { SqliteScopedSqlQuery } from "./agent-sql/sqlite-scoped-sql.query";
import { SqliteWorkoutCatalog } from "./artifacts/sqlite-workout.catalog";
import { SqliteArtifactTaskLinkQuery } from "./artifacts/queries/sqlite-artifact-task-link.query";
import { SqliteArtifactRepository } from "./artifacts/repositories/sqlite-artifact.repository";
import { SqliteTaskCardQuery } from "./tasks/queries/sqlite-task-card.query";
import { SqliteTaskRequestLinkQuery } from "./tasks/queries/sqlite-task-request-link.query";
import { SqliteTaskRepository } from "./tasks/repositories/sqlite-task.repository";
import { SqliteTagRepository } from "./tasks/repositories/sqlite-tag.repository";
import { SqliteIdempotencyStore } from "./idempotency/sqlite-idempotency.store";
import { SqliteRecurrenceRepository } from "./recurrences/repositories/sqlite-recurrence.repository";
import { SqliteTranscriptionRequests } from "./transcription/sqlite-transcription-requests";
import { SqliteTaskRelations } from "./tasks/relations/sqlite-task-relations";
import type { TaskRelations } from "../../api-core/tasks/task-relations";
import type { TranscriptionRequests } from "../../api-core/transcription/transcription-requests";

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
export const TRANSCRIPTION_REQUESTS = "TRANSCRIPTION_REQUESTS";
export const TASK_RELATIONS = "TASK_RELATIONS";

@Module({
  providers: [
    {
      provide: DATABASE,
      useFactory: (): SqliteDatabase => openApiDatabase(getDatabaseEnv().API_DATABASE_PATH),
    },
    {
      provide: TASK_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): TaskRepository => new SqliteTaskRepository(database),
    },
    {
      provide: TASK_CARD_QUERY,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): TaskCardQuery => new SqliteTaskCardQuery(database),
    },
    {
      provide: TASK_REQUEST_LINK_QUERY,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): TaskRequestLinkQuery => new SqliteTaskRequestLinkQuery(database),
    },
    {
      provide: PROJECT_QUERY,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): ProjectQuery => new SqliteProjectQuery(database),
    },
    {
      provide: PROJECT_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): ProjectRepository => new SqliteProjectRepository(database),
    },
    {
      provide: TAG_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): TagRepository => new SqliteTagRepository(database),
    },
    {
      provide: ARTIFACT_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): ArtifactRepository => new SqliteArtifactRepository(database),
    },
    {
      provide: ARTIFACT_TASK_LINK_QUERY,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): ArtifactTaskLinkQuery =>
        new SqliteArtifactTaskLinkQuery(database),
    },
    {
      provide: WORKOUT_CATALOG,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): WorkoutCatalog => new SqliteWorkoutCatalog(database),
    },
    {
      provide: RECURRENCE_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): RecurrenceRepository =>
        new SqliteRecurrenceRepository(database),
    },
    {
      provide: SCOPED_SQL_QUERY,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): ScopedSqlQuery => new SqliteScopedSqlQuery(database),
    },
    {
      provide: ENTITY_BATCH_WRITER,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): EntityBatchWriter => new SqliteEntityBatchWriter(database),
    },
    {
      provide: IDEMPOTENCY_STORE,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): IdempotencyStore => new SqliteIdempotencyStore(database),
    },
    { provide: TASK_RELATIONS, useFactory: (): TaskRelations => new SqliteTaskRelations() },
    {
      provide: TRANSCRIPTION_REQUESTS,
      inject: [DATABASE],
      useFactory: (database: SqliteDatabase): TranscriptionRequests => new SqliteTranscriptionRequests(database),
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
    TRANSCRIPTION_REQUESTS,
    TASK_RELATIONS,
  ],
})
export class PersistenceModule {}
