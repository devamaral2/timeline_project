import { DynamicModule, Module } from "@nestjs/common";
import {
  AGENT_CONVERSATION_QUERY,
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
import { MaterializeRecurrencesUseCase } from "./recurrences/materialize-recurrences.usecase";
import { OpenRouterAgentGateway } from "./agent/gateways/openrouter-agent.gateway";
import { RunAgentUseCase } from "./agent/run-agent.usecase";
import { RunChatTurnUseCase } from "./agent/run-chat-turn.usecase";

@Module({ imports: [PersistenceModule] })
export class ApiCoreModule {
  static forRoot(): DynamicModule {
    return {
      module: ApiCoreModule,
      imports: [PersistenceModule],
      providers: [
        {
          provide: MaterializeRecurrencesUseCase,
          inject: [RECURRENCE_REPOSITORY],
          useFactory: (recurrences: RecurrenceRepository) => new MaterializeRecurrencesUseCase(recurrences),
        },
        { provide: OpenRouterMealParsingGateway, useFactory: () => new OpenRouterMealParsingGateway() },
        { provide: OpenRouterEventCommandParsingGateway, useFactory: () => new OpenRouterEventCommandParsingGateway() },
        {
          provide: CreateEventUseCase,
          inject: [EVENT_REPOSITORY, OpenRouterMealParsingGateway, WORKOUT_CATALOG],
          useFactory: (
            events: EventRepository,
            mealParsing: OpenRouterMealParsingGateway,
            workoutCatalog: WorkoutCatalog,
          ) => new CreateEventUseCase(events, mealParsing, workoutCatalog),
        },
        { provide: OpenRouterAgentGateway, useFactory: () => new OpenRouterAgentGateway() },
        {
          provide: RunAgentUseCase,
          inject: [
            OpenRouterAgentGateway,
            SCOPED_SQL_QUERY,
            ENTITY_BATCH_WRITER,
            EVENT_REPOSITORY,
            TASK_REPOSITORY,
            NOTE_REPOSITORY,
            CreateEventUseCase,
          ],
          useFactory: (
            gateway: OpenRouterAgentGateway,
            query: ScopedSqlQuery,
            batchWriter: EntityBatchWriter,
            events: EventRepository,
            tasks: TaskRepository,
            notes: NoteRepository,
            createEvent: CreateEventUseCase,
          ) => new RunAgentUseCase(gateway, query, batchWriter, { events, tasks, notes }, createEvent),
        },
        {
          provide: RunChatTurnUseCase,
          inject: [RunAgentUseCase, AGENT_CONVERSATION_QUERY],
          useFactory: (runAgent: RunAgentUseCase, conversations: AgentConversationQuery) =>
            new RunChatTurnUseCase(runAgent, conversations),
        },
      ],
      exports: [
        PersistenceModule,
        MaterializeRecurrencesUseCase,
        OpenRouterMealParsingGateway,
        OpenRouterEventCommandParsingGateway,
        CreateEventUseCase,
        OpenRouterAgentGateway,
        RunAgentUseCase,
        RunChatTurnUseCase,
      ],
    };
  }
}
