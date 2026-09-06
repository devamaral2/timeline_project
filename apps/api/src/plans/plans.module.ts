import { Module } from "@nestjs/common";
import { PersistenceModule, PLAN_REPOSITORY } from "@repo/persistence";
import type { PlanRepository } from "@repo/entities/ports";
import { TasksModule } from "../tasks/tasks.module";
import { PlansController } from "./http/plans.controller";
import { CreatePlanUseCase } from "./usecases/create-plan.usecase";
import { GetPlanUseCase } from "./usecases/get-plan.usecase";
import { UpdatePlanUseCase } from "./usecases/update-plan.usecase";
import { DeletePlanUseCase } from "./usecases/delete-plan.usecase";
import { ListPlansUseCase } from "./usecases/list-plans.usecase";

@Module({
  imports: [PersistenceModule, TasksModule],
  controllers: [PlansController],
  providers: [
    {
      provide: CreatePlanUseCase,
      inject: [PLAN_REPOSITORY],
      useFactory: (plans: PlanRepository) => new CreatePlanUseCase(plans),
    },
    {
      provide: GetPlanUseCase,
      inject: [PLAN_REPOSITORY],
      useFactory: (plans: PlanRepository) => new GetPlanUseCase(plans),
    },
    {
      provide: UpdatePlanUseCase,
      inject: [PLAN_REPOSITORY],
      useFactory: (plans: PlanRepository) => new UpdatePlanUseCase(plans),
    },
    {
      provide: DeletePlanUseCase,
      inject: [PLAN_REPOSITORY],
      useFactory: (plans: PlanRepository) => new DeletePlanUseCase(plans),
    },
    {
      provide: ListPlansUseCase,
      inject: [PLAN_REPOSITORY],
      useFactory: (plans: PlanRepository) => new ListPlansUseCase(plans),
    },
  ],
})
export class PlansModule {}
