import { Module } from "@nestjs/common";
import { PersistenceModule } from "@repo/persistence";
import type { DailyOverviewQuery, EventRepository, TagRepository, TimelineEventQuery, WorkoutCatalog } from "@repo/entities/ports";
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
 * Tokens do agregado PostgreSQL. Ficam com providers-tapa-buraco ate a Task 10
 * ligar o Nest ao banco de verdade (DATABASE_URL, PersistenceModule) — antes
 * disso o aplicativo nao fica executavel, por decisao do plano de migracao.
 */
export const EVENT_REPOSITORY_V2 = "EVENT_REPOSITORY_V2";
export const TAG_REPOSITORY_V2 = "TAG_REPOSITORY_V2";
export const TIMELINE_EVENT_QUERY = "TIMELINE_EVENT_QUERY";
export const DAILY_OVERVIEW_QUERY = "DAILY_OVERVIEW_QUERY";
export const WORKOUT_CATALOG = "WORKOUT_CATALOG";

function notWiredUntilTask10(name: string): never {
  throw new Error(`${name} nao esta ligado ao PostgreSQL: a Task 10 conecta o provider Nest`);
}

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
      provide: EVENT_REPOSITORY_V2,
      useFactory: (): EventRepository => ({
        save: () => notWiredUntilTask10("EventRepository"),
        saveClosingLatestOpen: () => notWiredUntilTask10("EventRepository"),
        update: () => notWiredUntilTask10("EventRepository"),
        delete: () => notWiredUntilTask10("EventRepository"),
        findById: () => notWiredUntilTask10("EventRepository"),
        findLatestOpenByUserId: () => notWiredUntilTask10("EventRepository"),
      }),
    },
    {
      provide: TAG_REPOSITORY_V2,
      useFactory: (): TagRepository => ({
        suggest: () => notWiredUntilTask10("TagRepository"),
      }),
    },
    {
      provide: WORKOUT_CATALOG,
      useFactory: (): WorkoutCatalog => ({
        findActiveByCodes: () => notWiredUntilTask10("WorkoutCatalog"),
      }),
    },
    {
      provide: TIMELINE_EVENT_QUERY,
      useFactory: (): TimelineEventQuery => ({
        list: () => notWiredUntilTask10("TimelineEventQuery"),
      }),
    },
    {
      provide: DAILY_OVERVIEW_QUERY,
      useFactory: (): DailyOverviewQuery => ({
        get: () => notWiredUntilTask10("DailyOverviewQuery"),
      }),
    },
    {
      provide: CreateEventUseCase,
      inject: [EVENT_REPOSITORY_V2, OpenRouterMealParsingGateway, WORKOUT_CATALOG],
      useFactory: (
        events: EventRepository,
        mealParsing: OpenRouterMealParsingGateway,
        workoutCatalog: WorkoutCatalog,
      ) => new CreateEventUseCase(events, mealParsing, workoutCatalog),
    },
    {
      provide: UpdateEventUseCase,
      inject: [EVENT_REPOSITORY_V2, WORKOUT_CATALOG],
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
      inject: [EVENT_REPOSITORY_V2],
      useFactory: (events: EventRepository) => new GetEventUseCase(events),
    },
    {
      provide: DeleteEventUseCase,
      inject: [EVENT_REPOSITORY_V2],
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
      inject: [TAG_REPOSITORY_V2],
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
