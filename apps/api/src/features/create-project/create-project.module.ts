import { Module } from "@nestjs/common";
import { PROJECT_REPOSITORY } from "../../infrastructure/persistence";
import type { ProjectRepository } from "../../domain/ports";
import { ApiCoreModule } from "../../nest/api-core.module";
import { CreateProjectController } from "./create-project.controller";
import { CreateProjectUseCase } from "./create-project.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [CreateProjectController],
  providers: [{
    provide: CreateProjectUseCase,
    inject: [PROJECT_REPOSITORY],
    useFactory: (projects: ProjectRepository) => new CreateProjectUseCase(projects),
  }],
})
export class CreateProjectModule {}
