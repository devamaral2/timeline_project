import { Module } from "@nestjs/common";
import {
  DAILY_OVERVIEW_QUERY,
  EVENT_REPOSITORY,
  PersistenceModule,
  TAG_REPOSITORY,
  TIMELINE_EVENT_QUERY,
  WORKOUT_CATALOG,
} from "@repo/persistence";
import type {
  DailyOverviewQuery,
  EventRepository,
  TagRepository,
  TimelineEventQuery,
  WorkoutCatalog,
} from "@repo/entities/ports";
import { OpenRouterEventAgentGateway } from "./gateways/openrouter-event-agent.gateway";
import { OpenRouterEventCommandParsingGateway } from "./gateways/openrouter-event-command-parsing.gateway";
import { OpenRouterMealParsingGateway } from "./gateways/openrouter-meal-parsing.gateway";
import { EventsController } from "./http/events.controller";
import { TagsController } from "./http/tags.controller";
import { CreateEventFromTextUseCase } from "./usecases/create-event-from-text.usecase";
import { CreateEventFromTranscriptUseCase } from "./usecases/create-event-from-transcript.usecase";
import { CreateEventUseCase } from "./usecases/create-event.usecase";
import { DeleteEventUseCase } from "./usecases/delete-event.usecase";
import { GetDailyOverviewUseCase } from "./usecases/get-daily-overview.usecase";
import { GetEventUseCase } from "./usecases/get-event.usecase";
import { ListTimelineEventsUseCase } from "./usecases/list-timeline-events.usecase";
import { SuggestTagsUseCase } from "./usecases/suggest-tags.usecase";
import { UpdateEventUseCase } from "./usecases/update-event.usecase";

/**
 * Substitui as antigas `make-*-controller` factories. Os usecases sao providos
 * por `useFactory` — e nao por `useClass` — porque suas dependencias sao
 * interfaces (portas) e classes com parametros opcionais, que o Nest nao
 * consegue resolver por metadata de tipo.
 */
@Module({
  imports: [PersistenceModule],
  controllers: [EventsController, TagsController],
  providers: [
    {
      provide: OpenRouterMealParsingGateway,
      useFactory: () => new OpenRouterMealParsingGateway(),
    },
    {
      provide: OpenRouterEventAgentGateway,
      useFactory: () => new OpenRouterEventAgentGateway(),
    },
    {
      provide: OpenRouterEventCommandParsingGateway,
      useFactory: () => new OpenRouterEventCommandParsingGateway(),
    },
    {
      provide: CreateEventUseCase,
      inject: [EVENT_REPOSITORY, OpenRouterMealParsingGateway, WORKOUT_CATALOG],
      useFactory: (
        events: EventRepository,
        mealParsing: OpenRouterMealParsingGateway,
        workoutCatalog: WorkoutCatalog,
      ) => new CreateEventUseCase(events, mealParsing, workoutCatalog),
    },
    {
      provide: UpdateEventUseCase,
      inject: [EVENT_REPOSITORY, WORKOUT_CATALOG],
      useFactory: (events: EventRepository, workoutCatalog: WorkoutCatalog) =>
        new UpdateEventUseCase(events, workoutCatalog),
    },
    {
      provide: ListTimelineEventsUseCase,
      inject: [TIMELINE_EVENT_QUERY],
      useFactory: (timelineEventQuery: TimelineEventQuery) =>
        new ListTimelineEventsUseCase(timelineEventQuery),
    },
    {
      provide: GetEventUseCase,
      inject: [EVENT_REPOSITORY],
      useFactory: (events: EventRepository) => new GetEventUseCase(events),
    },
    {
      provide: DeleteEventUseCase,
      inject: [EVENT_REPOSITORY],
      useFactory: (events: EventRepository) => new DeleteEventUseCase(events),
    },
    {
      provide: GetDailyOverviewUseCase,
      inject: [DAILY_OVERVIEW_QUERY],
      useFactory: (dailyOverviewQuery: DailyOverviewQuery) =>
        new GetDailyOverviewUseCase(dailyOverviewQuery),
    },
    {
      provide: SuggestTagsUseCase,
      inject: [TAG_REPOSITORY],
      useFactory: (tags: TagRepository) => new SuggestTagsUseCase(tags),
    },
    {
      provide: CreateEventFromTextUseCase,
      inject: [OpenRouterEventAgentGateway, CreateEventUseCase],
      useFactory: (agent: OpenRouterEventAgentGateway, createEvent: CreateEventUseCase) =>
        new CreateEventFromTextUseCase(agent, createEvent),
    },
    {
      provide: CreateEventFromTranscriptUseCase,
      inject: [OpenRouterEventCommandParsingGateway, CreateEventUseCase],
      useFactory: (
        parsing: OpenRouterEventCommandParsingGateway,
        createEvent: CreateEventUseCase,
      ) => new CreateEventFromTranscriptUseCase(parsing, createEvent),
    },
  ],
})
export class EventsModule {}
