import { Controller, Get, Inject, Module, Param, UseGuards } from "@nestjs/common";
import type { AiJobDto } from "@repo/contracts";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import { toAiJobDto } from "../../api-core/dto/ai-job.dto";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

@Controller("api/ai/jobs")
@UseGuards(GatewayIdentityGuard)
export class GetAiJobController {
  constructor(@Inject(AiJobsService) private readonly jobs: AiJobsService) {}

  @Get(":id")
  async get(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser): Promise<AiJobDto> {
    return toAiJobDto(await this.jobs.get(id, actor.userId));
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [GetAiJobController] })
export class GetAiJobModule {}
