import { Module } from "@nestjs/common";
import { TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { MaterializeRecurrencesUseCase } from "../../api-core/recurrences/materialize-recurrences.usecase";
import { ListTasksController } from "./list-tasks.controller";
import { ListTasksUseCase } from "./list-tasks.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListTasksController],
  providers: [{
    provide: ListTasksUseCase,
    inject: [TASK_REPOSITORY, MaterializeRecurrencesUseCase],
    useFactory: (tasks: TaskRepository, materializer: MaterializeRecurrencesUseCase) =>
      new ListTasksUseCase(tasks, materializer),
  }],
})
export class ListTasksModule {}
