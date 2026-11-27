import { Controller, Get, Inject, UseGuards } from "@nestjs/common";
import type { ProjectDto } from "@repo/contracts";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { ListProjectsUseCase } from "./list-projects.usecase";

@Controller("api/projects")
export class ListProjectsController {
  constructor(@Inject(ListProjectsUseCase) private readonly listProjects: ListProjectsUseCase) {}

  @Get()
  @UseGuards(GatewayIdentityGuard)
  execute(@CurrentUser() actor: AuthenticatedUser): Promise<ProjectDto[]> {
    return this.listProjects.execute(actor);
  }
}
