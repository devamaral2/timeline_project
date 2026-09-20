import { Module } from "@nestjs/common";
import { TIMELINE_EVENT_QUERY } from "../../infrastructure/persistence";
import type { TimelineEventQuery } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { MaterializeRecurrencesUseCase } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { ListTimelineEventsController } from "./list-timeline-events.controller";
import { ListTimelineEventsUseCase } from "./list-timeline-events.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListTimelineEventsController],
  providers: [
    {
      provide: ListTimelineEventsUseCase,
      inject: [TIMELINE_EVENT_QUERY, MaterializeRecurrencesUseCase],
      useFactory: (query: TimelineEventQuery, materializer: MaterializeRecurrencesUseCase) =>
        new ListTimelineEventsUseCase(query, materializer),
    },
  ],
})
export class ListTimelineEventsModule {}
