import { DynamicModule, Module } from "@nestjs/common";
import {
  ENTITY_BATCH_WRITER,
  EVENT_REPOSITORY,
  NOTE_REPOSITORY,
  RECURRENCE_REPOSITORY,
  SCOPED_SQL_QUERY,
  TASK_REPOSITORY,
  WORKOUT_CATALOG,
  PersistenceModule,
} from "../infrastructure/persistence";
import type {
  EntityBatchWriter,
  EventRepository,
  NoteRepository,
  RecurrenceRepository,
  ScopedSqlQuery,
  TaskRepository,
  WorkoutCatalog,
} from "../domain/ports";
import { OpenRouterEventCommandParsingGateway } from "./events/gateways/openrouter-event-command-parsing.gateway";
import { OpenRouterMealParsingGateway } from "./events/gateways/openrouter-meal-parsing.gateway";
import { CreateEventUseCase } from "./events/create-event.usecase";
import { NoteBuilder } from "./notes/services/note-builder.service";
import { MaterializeRecurrencesUseCase } from "./recurrences/materialize-recurrences.usecase";
import { AiJobsModule } from "../infrastructure/ai-jobs/ai-jobs.module";
import { AiJobsService } from "../infrastructure/ai-jobs/ai-jobs.service";
import { QueuedAiOperations } from "./agent/queued-ai-operations";
import { GenerateMealNoteUseCase } from "./notes/generate-meal-note.usecase";
import type { MealNoteGenerationRepository } from "../domain/ports";
import { CreateEventFromTranscriptUseCase } from "./events/create-event-from-transcript.usecase";
import { getCurrentAiJob } from "../infrastructure/ai-jobs/ai-job-context";
import { DATABASE } from "../infrastructure/persistence/persistence.module";
import type { PostgresDatabase } from "../infrastructure/persistence/database/postgres-database";
import { PostgresAiProcessStore } from "../infrastructure/persistence/ai-processes/postgres-ai-process.store";
import { OpenRouterStructuredCompletionGateway } from "./agent/gateways/structured-completion.gateway";
import { getServerEnv } from "../config/env";
import { HermesClient } from "../infrastructure/hermes/hermes.client";
import { JevProcessClient } from "./process/jev-process.client";
import { ProcessAgentRunner } from "./process/process-agent-runner";
import { ProcessDispatcher } from "./process/process-dispatcher";
import { ProcessFallback } from "./process/process-fallback";
import { ProcessFinalizer } from "./process/process-finalizer";
import { ProcessOperations } from "./process/process-operations";
import { ProcessStepWorker } from "./process/process-step-worker";
import { ProcessEditWorker } from "./process/process-edit-worker";
import { ProcessQueryWorker } from "./process/process-query-worker";
import { ProcessEditTargetWorker } from "./process/process-edit-target-worker";
import { ProcessTargetEditWorker } from "./process/process-target-edit-worker";
import { uiConfig } from "./process/process-config";
import { PostgresProcessCandidateQuery } from "../infrastructure/persistence/ai-processes/postgres-process-candidate.query";
import type { ProcessStore } from "./process/process-store";
import { AgentFilesService } from "./agent/config/agent-files.service";
import { RouterNotesReconciler } from "./process/jev-router-notes";
import { AgentFileNotesReconciler } from "./agent/config/agent-file-notes.reconciler";
import { AgentFilesBootstrap } from "../infrastructure/agent-files/agent-files.bootstrap";

/** Queue wait/retry must not change what "today" or "now" meant at submission. */
function requestClock(): Date {
  const submittedAt = getCurrentAiJob()?.createdAt;
  return submittedAt ? new Date(submittedAt) : new Date();
}

@Module({ imports: [PersistenceModule] })
export class ApiCoreModule {
  // Feature modules share one runtime and one handler registry, not a worker per import.
  private static root?: DynamicModule;

  static forRoot(): DynamicModule {
    if (ApiCoreModule.root) return ApiCoreModule.root;
    ApiCoreModule.root = {
      module: ApiCoreModule,
      imports: [PersistenceModule, AiJobsModule],
      providers: [
        {
          provide: AgentFilesService,
          useFactory: () =>
            new AgentFilesService(getServerEnv().AGENT_FILES_DIR ?? ""),
        },
        {
          provide: AgentFileNotesReconciler,
          inject: [AgentFilesService, NOTE_REPOSITORY],
          useFactory: (files: AgentFilesService, notes: NoteRepository) =>
            new AgentFileNotesReconciler(files, notes, () => getServerEnv().AGENT_CONFIG_OWNER_USER_ID),
        },
        {
          provide: RouterNotesReconciler,
          inject: [NOTE_REPOSITORY],
          useFactory: (notes: NoteRepository) => new RouterNotesReconciler(notes, () => getServerEnv().AGENT_CONFIG_OWNER_USER_ID),
        },
        AgentFilesBootstrap,
        {
          provide: MaterializeRecurrencesUseCase,
          inject: [RECURRENCE_REPOSITORY],
          useFactory: (recurrences: RecurrenceRepository) => new MaterializeRecurrencesUseCase(recurrences),
        },
        { provide: OpenRouterMealParsingGateway, useFactory: () => new OpenRouterMealParsingGateway() },
        { provide: OpenRouterEventCommandParsingGateway, useFactory: () => new OpenRouterEventCommandParsingGateway() },
        {
          provide: NoteBuilder,
          inject: [OpenRouterMealParsingGateway, WORKOUT_CATALOG],
          useFactory: (mealParsing: OpenRouterMealParsingGateway, workoutCatalog: WorkoutCatalog) =>
            new NoteBuilder(mealParsing, workoutCatalog),
        },
        {
          provide: CreateEventUseCase,
          inject: [EVENT_REPOSITORY, NOTE_REPOSITORY, NoteBuilder],
          useFactory: (events: EventRepository, notes: NoteRepository, builder: NoteBuilder) =>
            new CreateEventUseCase(events, notes, builder, requestClock),
        },
        {
          provide: CreateEventFromTranscriptUseCase,
          inject: [OpenRouterEventCommandParsingGateway, CreateEventUseCase],
          useFactory: (parsing: OpenRouterEventCommandParsingGateway, createEvent: CreateEventUseCase) =>
            new CreateEventFromTranscriptUseCase(parsing, createEvent, requestClock),
        },
        {
          provide: GenerateMealNoteUseCase,
          inject: [NOTE_REPOSITORY, OpenRouterMealParsingGateway],
          useFactory: (notes: MealNoteGenerationRepository, parsing: OpenRouterMealParsingGateway) =>
            new GenerateMealNoteUseCase(notes, parsing),
        },
        {
          provide: PostgresAiProcessStore,
          inject: [DATABASE],
          useFactory: (database: PostgresDatabase) => new PostgresAiProcessStore(database),
        },
        {
          provide: ProcessOperations,
          inject: [
            AiJobsService, PostgresAiProcessStore, ENTITY_BATCH_WRITER, EVENT_REPOSITORY, TASK_REPOSITORY,
            NOTE_REPOSITORY, CreateEventUseCase, SCOPED_SQL_QUERY, DATABASE, RECURRENCE_REPOSITORY,
            OpenRouterMealParsingGateway, NoteBuilder, AgentFilesService,
          ],
          useFactory: (
            jobs: AiJobsService, store: ProcessStore, batchWriter: EntityBatchWriter, events: EventRepository,
            tasks: TaskRepository, notes: NoteRepository, createEvent: CreateEventUseCase, sql: ScopedSqlQuery,
            database: PostgresDatabase, recurrenceRepository: RecurrenceRepository,
            mealParsing: OpenRouterMealParsingGateway, noteBuilder: NoteBuilder, files: AgentFilesService,
          ) => {
            const env = getServerEnv();
            const runner = new ProcessAgentRunner(new OpenRouterStructuredCompletionGateway(
              env.OPENROUTER_API_KEY, env.OPENROUTER_PROCESS_MODEL ?? env.OPENROUTER_MODEL,
            ));
            const jev = new JevProcessClient();
            const repositories = { events, tasks, notes, recurrences: recurrenceRepository };
            return new ProcessOperations(
              jobs, store, new ProcessDispatcher(store, jev, new PostgresProcessCandidateQuery(database)),
              new ProcessStepWorker({ store, runner, batchWriter, repositories, createEvent }),
              new ProcessEditWorker({ store, runner, batchWriter, repositories, createEvent, sql }),
              new ProcessQueryWorker({ store, runner, sql }),
              new ProcessFinalizer({ store, jev, batchWriter, repositories, createEvent, runner }),
              new ProcessFallback({ store, runner }),
              new ProcessEditTargetWorker({
                store, repositories, files, failureText: (code) => uiConfig.targetFailed[code],
              }),
              new ProcessTargetEditWorker({
                store, runner, batchWriter, repositories, createEvent, mealParsing, noteBuilder, files,
              }),
            );
          },
        },
        {
          provide: QueuedAiOperations,
          inject: [AiJobsService, CreateEventFromTranscriptUseCase, GenerateMealNoteUseCase],
          useFactory: (
            jobs: AiJobsService, transcript: CreateEventFromTranscriptUseCase, meal: GenerateMealNoteUseCase,
          ) => {
            const env = getServerEnv();
            return new QueuedAiOperations(
              jobs, transcript, meal,
              new HermesClient({ url: env.HERMES_URL, apiKey: env.HERMES_API_KEY }),
            );
          },
        },
      ],
      exports: [
        PersistenceModule,
        MaterializeRecurrencesUseCase,
        OpenRouterMealParsingGateway,
        OpenRouterEventCommandParsingGateway,
        NoteBuilder,
        CreateEventUseCase,
        CreateEventFromTranscriptUseCase,
        QueuedAiOperations,
        ProcessOperations,
        AgentFilesService,
        AiJobsModule,
      ],
    };
    return ApiCoreModule.root;
  }
}
