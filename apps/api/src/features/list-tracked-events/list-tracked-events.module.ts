import { Module } from "@nestjs/common";
import { EVENT_CARD_QUERY } from "../../infrastructure/persistence";
import type { EventCardQuery } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { MaterializeRecurrencesUseCase } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { ListTrackedEventsController } from "./list-tracked-events.controller";
import { ListTrackedEventsUseCase } from "./list-tracked-events.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListTrackedEventsController],
  providers: [{
    provide: ListTrackedEventsUseCase,
    inject: [EVENT_CARD_QUERY, MaterializeRecurrencesUseCase],
    useFactory: (query: EventCardQuery, materializer: MaterializeRecurrencesUseCase) =>
      new ListTrackedEventsUseCase(query, materializer),
  }],
})
export class ListTrackedEventsModule {}
