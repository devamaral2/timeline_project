import { Module } from "@nestjs/common";
import { PROJECT_QUERY } from "../../infrastructure/persistence";
import type { ProjectQuery } from "../../domain/ports";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { ListProjectsController } from "./list-projects.controller";
import { ListProjectsUseCase } from "./list-projects.usecase";

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [ListProjectsController],
  providers: [{
    provide: ListProjectsUseCase,
    inject: [PROJECT_QUERY],
    useFactory: (projects: ProjectQuery) => new ListProjectsUseCase(projects),
  }],
})
export class ListProjectsModule {}
