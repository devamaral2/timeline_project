import { Body, Controller, HttpCode, HttpException, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { AiJobDto } from "@repo/contracts";
import { z } from "zod";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { QueuedAiOperations } from "../../api-core/agent/queued-ai-operations";
import { AiJobsService } from "../../infrastructure/ai-jobs/ai-jobs.service";
import { toAiJobDto } from "../../api-core/dto/ai-job.dto";
import { MAX_TRANSCRIPT_LENGTH } from "../../api-core/events/create-event-from-transcript.usecase";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

@Controller("api/events/voice/jobs")
@UseGuards(GatewayIdentityGuard)
export class SubmitTranscriptJobController {
  constructor(
    @Inject(QueuedAiOperations) private readonly operations: QueuedAiOperations,
    @Inject(AiJobsService) private readonly jobs: AiJobsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async submit(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<AiJobDto> {
    const parsed = z.object({
      transcript: z.string().trim().min(1).max(MAX_TRANSCRIPT_LENGTH),
      requestId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    }).safeParse(body);
    if (!parsed.success) throw new HttpException("Invalid transcript request", HttpStatus.BAD_REQUEST);
    const id = await this.operations.submitTranscript(parsed.data.transcript, actor, parsed.data.requestId);
    return toAiJobDto(await this.jobs.get(id, actor.userId));
  }
}

@Module({ imports: [ApiCoreModule.forRoot()], controllers: [SubmitTranscriptJobController] })
export class SubmitTranscriptJobModule {}
