import { Module } from "@nestjs/common";
import { PersistenceModule, TASK_REPOSITORY } from "@repo/persistence";
import type { TaskRepository } from "@repo/entities/ports";
import { TasksController } from "./http/tasks.controller";
import { CreateTaskUseCase } from "./usecases/create-task.usecase";
import { GetTaskUseCase } from "./usecases/get-task.usecase";
import { UpdateTaskUseCase } from "./usecases/update-task.usecase";
import { DeleteTaskUseCase } from "./usecases/delete-task.usecase";
import { ListTasksUseCase } from "./usecases/list-tasks.usecase";
import { ListSubtasksUseCase } from "./usecases/list-subtasks.usecase";

@Module({
  imports: [PersistenceModule],
  controllers: [TasksController],
  providers: [
    {
      provide: CreateTaskUseCase,
      inject: [TASK_REPOSITORY],
      useFactory: (tasks: TaskRepository) => new CreateTaskUseCase(tasks),
    },
    {
      provide: GetTaskUseCase,
      inject: [TASK_REPOSITORY],
      useFactory: (tasks: TaskRepository) => new GetTaskUseCase(tasks),
    },
    {
      provide: UpdateTaskUseCase,
      inject: [TASK_REPOSITORY],
      useFactory: (tasks: TaskRepository) => new UpdateTaskUseCase(tasks),
    },
    {
      provide: DeleteTaskUseCase,
      inject: [TASK_REPOSITORY],
      useFactory: (tasks: TaskRepository) => new DeleteTaskUseCase(tasks),
    },
    {
      provide: ListTasksUseCase,
      inject: [TASK_REPOSITORY],
      useFactory: (tasks: TaskRepository) => new ListTasksUseCase(tasks),
    },
    {
      provide: ListSubtasksUseCase,
      inject: [TASK_REPOSITORY],
      useFactory: (tasks: TaskRepository) => new ListSubtasksUseCase(tasks),
    },
  ],
})
export class TasksModule {}
