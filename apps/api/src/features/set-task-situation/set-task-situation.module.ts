import { Module } from "@nestjs/common";
import { TASK_CARD_QUERY, TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { TaskCardQuery, TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { SetTaskSituationController } from "./set-task-situation.controller";
import { SetTaskSituationUseCase } from "./set-task-situation.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [SetTaskSituationController],
  providers: [{
    provide: SetTaskSituationUseCase,
    inject: [TASK_REPOSITORY, TASK_CARD_QUERY],
    useFactory: (tasks: TaskRepository, cards: TaskCardQuery) => new SetTaskSituationUseCase(tasks, cards),
  }],
})
export class SetTaskSituationModule {}
