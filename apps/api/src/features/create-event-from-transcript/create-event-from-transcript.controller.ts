import { Body, Controller, HttpCode, HttpException, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import { EMPTY_TRANSCRIPT_ERROR, LONG_TRANSCRIPT_ERROR, CreateEventFromTranscriptUseCase } from "./create-event-from-transcript.usecase";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { OpenRouterEventCommandParsingGateway } from "../../api-core/events/gateways/openrouter-event-command-parsing.gateway";
import { CreateEventUseCase } from "../../api-core/events/create-event.usecase";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";

const transcriptBadRequest = new Set([EMPTY_TRANSCRIPT_ERROR, LONG_TRANSCRIPT_ERROR]);

@Controller("api/events")
export class CreateEventFromTranscriptController {
  constructor(@Inject(CreateEventFromTranscriptUseCase) private readonly createFromTranscript: CreateEventFromTranscriptUseCase) {}

  @Post("voice")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.CREATED)
  async execute(
    @Body() body: { transcript?: string },
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ eventId: string; primaryItemType: string }> {
    try {
      return await this.createFromTranscript.execute({ transcript: body?.transcript ?? "" }, actor);
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
  providers: [
    {
      provide: CreateEventFromTranscriptUseCase,
      inject: [OpenRouterEventCommandParsingGateway, CreateEventUseCase],
      useFactory: (parsing: OpenRouterEventCommandParsingGateway, createEvent: CreateEventUseCase) =>
        new CreateEventFromTranscriptUseCase(parsing, createEvent),
    },
  ],
})
export class CreateEventFromTranscriptModule {}
