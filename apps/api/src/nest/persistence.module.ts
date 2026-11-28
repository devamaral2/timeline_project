import { Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
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
} from "../domain/ports";
import type { TaskRelations } from "../api-core/tasks/task-relations";
import type { TranscriptionRequests } from "../api-core/transcription/transcription-requests";
import { PostgresDatabase } from "../infrastructure/persistence/database/postgres-database";
import { PostgresEntityBatchWriter } from "../infrastructure/persistence/agent-batch/postgres-entity-batch-writer";
import { PostgresProjectQuery } from "../infrastructure/persistence/projects/postgres-project.query";
import { PostgresProjectRepository } from "../infrastructure/persistence/projects/postgres-project.repository";
import { PostgresScopedSqlQuery } from "../infrastructure/persistence/agent-sql/postgres-scoped-sql.query";
import { PostgresWorkoutCatalog } from "../infrastructure/persistence/artifacts/postgres-workout.catalog";
import { PostgresArtifactTaskLinkQuery } from "../infrastructure/persistence/artifacts/queries/postgres-artifact-task-link.query";
import { PostgresArtifactRepository } from "../infrastructure/persistence/artifacts/repositories/postgres-artifact.repository";
import { PostgresTaskCardQuery } from "../infrastructure/persistence/tasks/queries/postgres-task-card.query";
import { PostgresTaskRequestLinkQuery } from "../infrastructure/persistence/tasks/queries/postgres-task-request-link.query";
import { PostgresTaskRepository } from "../infrastructure/persistence/tasks/repositories/postgres-task.repository";
import { PostgresTagRepository } from "../infrastructure/persistence/tasks/repositories/postgres-tag.repository";
import { PostgresIdempotencyStore } from "../infrastructure/persistence/idempotency/postgres-idempotency.store";
import { PostgresRecurrenceRepository } from "../infrastructure/persistence/recurrences/repositories/postgres-recurrence.repository";
import { PostgresTranscriptionRequests } from "../infrastructure/persistence/transcription/postgres-transcription-requests";
import { PostgresTaskRelations } from "../infrastructure/persistence/tasks/relations/postgres-task-relations";
import {
  ARTIFACT_REPOSITORY,
  ARTIFACT_TASK_LINK_QUERY,
  DATABASE,
  ENTITY_BATCH_WRITER,
  IDEMPOTENCY_STORE,
  PROJECT_QUERY,
  PROJECT_REPOSITORY,
  RECURRENCE_REPOSITORY,
  SCOPED_SQL_QUERY,
  TAG_REPOSITORY,
  TASK_CARD_QUERY,
  TASK_RELATIONS,
  TASK_REPOSITORY,
  TASK_REQUEST_LINK_QUERY,
  TRANSCRIPTION_REQUESTS,
  WORKOUT_CATALOG,
} from "../infrastructure/persistence/tokens";

/** Adaptador do lifecycle antigo: o banco tem `close` explicito e o Nest chama no shutdown. */
@Injectable()
export class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly database: PostgresDatabase) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.close();
  }
}


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
    { provide: TASK_RELATIONS, useFactory: (): TaskRelations => new PostgresTaskRelations() },
    {
      provide: TRANSCRIPTION_REQUESTS,
      inject: [DATABASE],
      useFactory: (database: PostgresDatabase): TranscriptionRequests => new PostgresTranscriptionRequests(database.db),
    },
    DatabaseLifecycle,
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
