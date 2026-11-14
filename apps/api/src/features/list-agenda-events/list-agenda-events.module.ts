import { Module } from "@nestjs/common";
import { EVENT_CARD_QUERY } from "../../infrastructure/persistence";
import type { EventCardQuery } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { MaterializeRecurrencesUseCase } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { ListAgendaEventsController } from "./list-agenda-events.controller";
import { ListAgendaEventsUseCase } from "./list-agenda-events.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListAgendaEventsController],
  providers: [
    {
      provide: ListAgendaEventsUseCase,
      inject: [EVENT_CARD_QUERY, MaterializeRecurrencesUseCase],
      useFactory: (query: EventCardQuery, materializer: MaterializeRecurrencesUseCase) =>
        new ListAgendaEventsUseCase(query, materializer),
    },
  ],
})
export class ListAgendaEventsModule {}
