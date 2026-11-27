import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import type { CreateProjectInput, ProjectDto } from "@repo/contracts";
import { assertProjectFields } from "../../api-core/http-input-validation";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CreateProjectUseCase } from "./create-project.usecase";

@Controller("api/projects")
export class CreateProjectController {
  constructor(@Inject(CreateProjectUseCase) private readonly createProject: CreateProjectUseCase) {}

  @Post()
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  execute(@Body() body: CreateProjectInput, @CurrentUser() actor: AuthenticatedUser): Promise<ProjectDto> {
    assertProjectFields(body as unknown as Record<string, unknown>);
    return this.createProject.execute(body, actor);
  }
}
