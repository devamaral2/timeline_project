import { Controller, Get, Inject, Module, UseGuards } from "@nestjs/common";
import type { AiJobDto } from "@repo/contracts";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import { toAiJobDto } from "../../api-core/dto/ai-job.dto";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

@Controller("api/ai/jobs")
@UseGuards(GatewayIdentityGuard)
export class ListAiJobsController {
  constructor(@Inject(AiJobsService) private readonly jobs: AiJobsService) {}

  @Get()
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<AiJobDto[]> {
    return (await this.jobs.list(actor.userId)).map(toAiJobDto);
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [ListAiJobsController] })
export class ListAiJobsModule {}
