import { Body, Controller, HttpCode, HttpException, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import { EMPTY_TRANSCRIPT_ERROR, LONG_TRANSCRIPT_ERROR, MAX_TRANSCRIPT_LENGTH } from "../../api-core/events/create-event-from-transcript.usecase";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { QueuedAiOperations } from "../../api-core/agent/queued-ai-operations";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { EventKind } from "../../domain";

const transcriptBadRequest = new Set([EMPTY_TRANSCRIPT_ERROR, LONG_TRANSCRIPT_ERROR]);

@Controller("api/events")
export class CreateEventFromTranscriptController {
  constructor(
    @Inject(QueuedAiOperations) private readonly operations: QueuedAiOperations,
  ) {}

  @Post("voice")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  async execute(
    @Body() body: { transcript?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ eventId: string; kind: EventKind }> {
    try {
      const transcript = body?.transcript?.trim() ?? "";
      if (!transcript) throw new Error(EMPTY_TRANSCRIPT_ERROR);
      if (transcript.length > MAX_TRANSCRIPT_LENGTH) throw new Error(LONG_TRANSCRIPT_ERROR);
      return await this.operations.executeTranscript(transcript, actor);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      const message = error instanceof Error ? error.message : "Invalid request";
      throw new HttpException(
        message,
        transcriptBadRequest.has(message) ? HttpStatus.BAD_REQUEST : HttpStatus.BAD_GATEWAY,
      );
    }
  }
}

@Module({
  imports: [ApiCoreModule.forRoot()],
  controllers: [CreateEventFromTranscriptController],
})
export class CreateEventFromTranscriptModule {}
