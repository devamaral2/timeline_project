import { Controller, HttpCode, HttpStatus, Inject, Module, Param, Post, UseGuards } from "@nestjs/common";
import type { AiJobDto } from "@repo/contracts";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import { toAiJobDto } from "../../api-core/dto/ai-job.dto";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

@Controller("api/ai/jobs")
@UseGuards(GatewayIdentityGuard)
export class CancelAiJobController {
  constructor(@Inject(AiJobsService) private readonly jobs: AiJobsService) {}

  @Post(":id/cancel")
  @HttpCode(HttpStatus.OK)
  async cancel(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser): Promise<AiJobDto> {
    await this.jobs.cancel(id, actor.userId);
    return toAiJobDto(await this.jobs.get(id, actor.userId));
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [CancelAiJobController] })
export class CancelAiJobModule {}
