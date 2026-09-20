import { Module } from "@nestjs/common";
import {
  DAILY_OVERVIEW_QUERY,
  EVENT_REPOSITORY,
  PersistenceModule,
  RECURRENCE_REPOSITORY,
  TAG_REPOSITORY,
  TIMELINE_EVENT_QUERY,
  WORKOUT_CATALOG,
} from "../../infrastructure/persistence";
import type {
  DailyOverviewQuery,
  EventRepository,
  RecurrenceRepository,
  TagRepository,
  TimelineEventQuery,
  WorkoutCatalog,
} from "../../domain/ports";
import { OpenRouterEventCommandParsingGateway } from "./gateways/openrouter-event-command-parsing.gateway";
import { OpenRouterMealParsingGateway } from "./gateways/openrouter-meal-parsing.gateway";
import { EventsController } from "./http/events.controller";
import { TagsController } from "./http/tags.controller";
import { CreateEventFromTranscriptUseCase } from "./usecases/create-event-from-transcript.usecase";
import { CreateEventUseCase } from "./usecases/create-event.usecase";
import { DeleteEventUseCase } from "./usecases/delete-event.usecase";
import { GetDailyOverviewUseCase } from "./usecases/get-daily-overview.usecase";
import { GetEventUseCase } from "./usecases/get-event.usecase";
import { ListTimelineEventsUseCase } from "./usecases/list-timeline-events.usecase";
import { SuggestTagsUseCase } from "./usecases/suggest-tags.usecase";
import { UpdateEventUseCase } from "./usecases/update-event.usecase";
import { MaterializeRecurrencesUseCase } from "../recurrences/usecases/materialize-recurrences.usecase";

/**
 * Substitui as antigas `make-*-controller` factories. Os usecases sao providos
 * por `useFactory` — e nao por `useClass` — porque suas dependencias sao
 * interfaces (portas) e classes com parametros opcionais, que o Nest nao
 * consegue resolver por metadata de tipo.
 */
@Module({
  imports: [PersistenceModule],
  controllers: [EventsController, TagsController],
  exports: [CreateEventUseCase],
  providers: [
    {
      provide: MaterializeRecurrencesUseCase,
      inject: [RECURRENCE_REPOSITORY],
      useFactory: (recurrences: RecurrenceRepository) => new MaterializeRecurrencesUseCase(recurrences),
    },
    {
      provide: OpenRouterMealParsingGateway,
      useFactory: () => new OpenRouterMealParsingGateway(),
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
      inject: [TIMELINE_EVENT_QUERY, MaterializeRecurrencesUseCase],
      useFactory: (timelineEventQuery: TimelineEventQuery, materializer: MaterializeRecurrencesUseCase) =>
        new ListTimelineEventsUseCase(timelineEventQuery, materializer),
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
      inject: [DAILY_OVERVIEW_QUERY, MaterializeRecurrencesUseCase],
      useFactory: (dailyOverviewQuery: DailyOverviewQuery, materializer: MaterializeRecurrencesUseCase) =>
        new GetDailyOverviewUseCase(dailyOverviewQuery, materializer),
    },
    {
      provide: SuggestTagsUseCase,
      inject: [TAG_REPOSITORY],
      useFactory: (tags: TagRepository) => new SuggestTagsUseCase(tags),
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
