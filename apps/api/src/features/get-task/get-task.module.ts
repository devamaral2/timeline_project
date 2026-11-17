import { Module } from "@nestjs/common";
import { ARTIFACT_REPOSITORY, TASK_REPOSITORY, TASK_REQUEST_LINK_QUERY, RECURRENCE_REPOSITORY } from "../../infrastructure/persistence/index";
import type { ArtifactRepository, TaskRepository, TaskRequestLinkQuery, RecurrenceRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { GetTaskController } from "./get-task.controller";
import { GetTaskUseCase } from "./get-task.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [GetTaskController],
  providers: [{
    provide: GetTaskUseCase,
    inject: [TASK_REPOSITORY, ARTIFACT_REPOSITORY, RECURRENCE_REPOSITORY, TASK_REQUEST_LINK_QUERY],
    useFactory: (
      tasks: TaskRepository, artifacts: ArtifactRepository, recurrences: RecurrenceRepository, requestLinks: TaskRequestLinkQuery,
    ) => new GetTaskUseCase(tasks, artifacts, recurrences, requestLinks),
  }],
})
export class GetTaskModule {}
