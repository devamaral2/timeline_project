import { DynamicModule, Module } from "@nestjs/common";
import {
  AGENT_CONVERSATION_QUERY,
  ENTITY_BATCH_WRITER,
  EVENT_REPOSITORY,
  NOTE_REPOSITORY,
  RECURRENCE_REPOSITORY,
  SCOPED_SQL_QUERY,
  DAY_CONTEXT_QUERY,
  TASK_REPOSITORY,
  WORKOUT_CATALOG,
  PersistenceModule,
} from "../infrastructure/persistence";
import type {
  AgentConversationQuery,
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
import { OpenRouterAgentGateway } from "./agent/gateways/openrouter-agent.gateway";
import { RunAgentUseCase } from "./agent/run-agent.usecase";
import { JevAgentRouter } from "./agent/routing/jev-agent.router";
import type { DayContextQuery } from "./agent/day-context.query";
import { RunChatTurnUseCase } from "./agent/run-chat-turn.usecase";
import { AiJobsModule } from "../infrastructure/ai-jobs/ai-jobs.module";
import { AiJobsService } from "../infrastructure/ai-jobs/ai-jobs.service";
import { QueuedAiOperations } from "./agent/queued-ai-operations";
import { GenerateMealNoteUseCase } from "./notes/generate-meal-note.usecase";
import type { MealNoteGenerationRepository } from "../domain/ports";
import { CreateEventFromTranscriptUseCase } from "./events/create-event-from-transcript.usecase";
import { getCurrentAiJob } from "../infrastructure/ai-jobs/ai-job-context";

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
        { provide: OpenRouterAgentGateway, useFactory: () => new OpenRouterAgentGateway() },
        { provide: JevAgentRouter, useFactory: () => new JevAgentRouter() },
        {
          provide: RunAgentUseCase,
          inject: [
            OpenRouterAgentGateway,
            SCOPED_SQL_QUERY,
            ENTITY_BATCH_WRITER,
            EVENT_REPOSITORY,
            TASK_REPOSITORY,
            NOTE_REPOSITORY,
            RECURRENCE_REPOSITORY,
            CreateEventUseCase,
            JevAgentRouter,
            DAY_CONTEXT_QUERY,
            MaterializeRecurrencesUseCase,
          ],
          useFactory: (
            gateway: OpenRouterAgentGateway,
            query: ScopedSqlQuery,
            batchWriter: EntityBatchWriter,
            events: EventRepository,
            tasks: TaskRepository,
            notes: NoteRepository,
            recurrenceRepository: RecurrenceRepository,
            createEvent: CreateEventUseCase,
            router: JevAgentRouter,
            dayContext: DayContextQuery,
            recurrences: MaterializeRecurrencesUseCase,
          ) => new RunAgentUseCase(
            gateway, query, batchWriter, { events, tasks, notes, recurrences: recurrenceRepository }, createEvent,
            undefined, undefined, requestClock, router, dayContext, recurrences,
          ),
        },
        {
          provide: RunChatTurnUseCase,
          inject: [RunAgentUseCase, AGENT_CONVERSATION_QUERY],
          useFactory: (runAgent: RunAgentUseCase, conversations: AgentConversationQuery) =>
            new RunChatTurnUseCase(runAgent, conversations),
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
          provide: QueuedAiOperations,
          inject: [AiJobsService, RunAgentUseCase, RunChatTurnUseCase, CreateEventFromTranscriptUseCase, GenerateMealNoteUseCase],
          useFactory: (
            jobs: AiJobsService, agent: RunAgentUseCase, chat: RunChatTurnUseCase,
            transcript: CreateEventFromTranscriptUseCase, meal: GenerateMealNoteUseCase,
          ) => new QueuedAiOperations(jobs, agent, chat, transcript, meal),
        },
      ],
      exports: [
        PersistenceModule,
        MaterializeRecurrencesUseCase,
        OpenRouterMealParsingGateway,
        OpenRouterEventCommandParsingGateway,
        NoteBuilder,
        CreateEventUseCase,
        OpenRouterAgentGateway,
        JevAgentRouter,
        RunAgentUseCase,
        RunChatTurnUseCase,
        CreateEventFromTranscriptUseCase,
        QueuedAiOperations,
        AiJobsModule,
      ],
    };
    return ApiCoreModule.root;
  }
}
