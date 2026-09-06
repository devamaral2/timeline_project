import { Module } from "@nestjs/common";
import { PersistenceModule, PLAN_REPOSITORY, TASK_REPOSITORY } from "@repo/persistence";
import type { PlanRepository, TaskRepository } from "@repo/entities/ports";
import { TasksController } from "./http/tasks.controller";
import { CreateTaskUseCase } from "./usecases/create-task.usecase";
import { GetTaskUseCase } from "./usecases/get-task.usecase";
import { UpdateTaskUseCase } from "./usecases/update-task.usecase";
import { DeleteTaskUseCase } from "./usecases/delete-task.usecase";
import { ListTasksUseCase } from "./usecases/list-tasks.usecase";
import { ListTasksByPlanUseCase } from "./usecases/list-tasks-by-plan.usecase";

@Module({
  imports: [PersistenceModule],
  controllers: [TasksController],
  providers: [
    {
      provide: CreateTaskUseCase,
      inject: [TASK_REPOSITORY, PLAN_REPOSITORY],
      useFactory: (tasks: TaskRepository, plans: PlanRepository) => new CreateTaskUseCase(tasks, plans),
    },
    {
      provide: GetTaskUseCase,
      inject: [TASK_REPOSITORY],
      useFactory: (tasks: TaskRepository) => new GetTaskUseCase(tasks),
    },
    {
      provide: UpdateTaskUseCase,
      inject: [TASK_REPOSITORY, PLAN_REPOSITORY],
      useFactory: (tasks: TaskRepository, plans: PlanRepository) => new UpdateTaskUseCase(tasks, plans),
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
      provide: ListTasksByPlanUseCase,
      inject: [TASK_REPOSITORY, PLAN_REPOSITORY],
      useFactory: (tasks: TaskRepository, plans: PlanRepository) =>
        new ListTasksByPlanUseCase(tasks, plans),
    },
  ],
  exports: [ListTasksByPlanUseCase],
})
export class TasksModule {}
