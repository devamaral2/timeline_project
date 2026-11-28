import { Module } from "@nestjs/common";
import { TASK_CARD_QUERY } from "../../infrastructure/persistence/index";
import type { TaskCardQuery } from "../../domain/ports";
import { ApiCoreModule } from "../../nest/api-core.module";
import { MaterializeRecurrencesUseCase } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { ListAgendaTasksController } from "./list-agenda-tasks.controller";
import { ListAgendaTasksUseCase } from "./list-agenda-tasks.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListAgendaTasksController],
  providers: [
    {
      provide: ListAgendaTasksUseCase,
      inject: [TASK_CARD_QUERY, MaterializeRecurrencesUseCase],
      useFactory: (query: TaskCardQuery, materializer: MaterializeRecurrencesUseCase) =>
        new ListAgendaTasksUseCase(query, materializer),
    },
  ],
})
export class ListAgendaTasksModule {}
