import { Module } from "@nestjs/common";
import {
  EVENT_REPOSITORY,
  PersistenceModule,
  TAG_REPOSITORY,
} from "@repo/persistence";
import type { EventRepository, TagRepository } from "@repo/entities/ports";
import { OpenRouterEventAgentGateway } from "./gateways/openrouter-event-agent.gateway";
import { OpenRouterEventCommandParsingGateway } from "./gateways/openrouter-event-command-parsing.gateway";
import { OpenRouterFoodParsingGateway } from "./gateways/openrouter-food-parsing.gateway";
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
      provide: OpenRouterFoodParsingGateway,
      useFactory: () => new OpenRouterFoodParsingGateway(),
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
      inject: [EVENT_REPOSITORY, TAG_REPOSITORY, OpenRouterFoodParsingGateway],
      useFactory: (
        events: EventRepository,
        tags: TagRepository,
        foodParsing: OpenRouterFoodParsingGateway,
      ) => new CreateEventUseCase(events, tags, foodParsing),
    },
    {
      provide: UpdateEventUseCase,
      inject: [EVENT_REPOSITORY, TAG_REPOSITORY, OpenRouterFoodParsingGateway],
      useFactory: (
        events: EventRepository,
        tags: TagRepository,
        foodParsing: OpenRouterFoodParsingGateway,
      ) => new UpdateEventUseCase(events, tags, foodParsing),
    },
    {
      provide: ListTimelineEventsUseCase,
      inject: [EVENT_REPOSITORY],
      useFactory: (events: EventRepository) => new ListTimelineEventsUseCase(events),
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
      inject: [EVENT_REPOSITORY],
      useFactory: (events: EventRepository) => new GetDailyOverviewUseCase(events),
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
