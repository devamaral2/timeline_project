import { Module } from "@nestjs/common";
import { TASK_CARD_QUERY } from "../../infrastructure/persistence/index";
import type { TaskCardQuery } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { MaterializeRecurrencesUseCase } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { ListTrackedTasksController } from "./list-tracked-tasks.controller";
import { ListTrackedTasksUseCase } from "./list-tracked-tasks.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListTrackedTasksController],
  providers: [{
    provide: ListTrackedTasksUseCase,
    inject: [TASK_CARD_QUERY, MaterializeRecurrencesUseCase],
    useFactory: (query: TaskCardQuery, materializer: MaterializeRecurrencesUseCase) =>
      new ListTrackedTasksUseCase(query, materializer),
  }],
})
export class ListTrackedTasksModule {}
