import { Module } from "@nestjs/common";
import { TASK_REPOSITORY } from "../../infrastructure/persistence";
import type { TaskRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { GetTaskController } from "./get-task.controller";
import { GetTaskUseCase } from "./get-task.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [GetTaskController],
  providers: [{ provide: GetTaskUseCase, inject: [TASK_REPOSITORY], useFactory: (tasks: TaskRepository) => new GetTaskUseCase(tasks) }],
})
export class GetTaskModule {}
