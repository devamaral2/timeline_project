import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { TranscriptionRequestResult } from "@repo/contracts";
import { transcriptionRequestInputSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { ApiCoreModule } from "../../api-core/api-core.module";
import type { TranscriptionRequests } from "../../api-core/transcription/transcription-requests";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { GatewayIdentityGuard } from "../../http/request-identity/gateway-identity.guard";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { JobsService } from "../../infrastructure/jobs/jobs.service";
import { TRANSCRIPTION_REQUESTS } from "../../infrastructure/persistence";
import { DailyReadingGate } from "../save-daily-reading/daily-reading.gate";
import { SaveDailyReadingModule } from "../save-daily-reading/save-daily-reading.controller";
import { CancelTranscriptionUseCase } from "./cancel-transcription.usecase";
import { RequestTranscriptionUseCase } from "./request-transcription.usecase";

/**
 * `POST /api/tasks/transcription-requests`: pede a transcrição de um vídeo do
 * YouTube. O pedido fica na fila até o serviço local buscá-lo; o documento do
 * vídeo entra na Leitura diária do dia. Quem chama: a extensão numa aba do
 * YouTube, o chat e o botão "Adicionar vídeo".
 */
@Controller("api/tasks")
export class RequestTranscriptionController {
  constructor(@Inject(RequestTranscriptionUseCase) private readonly requestTranscription: RequestTranscriptionUseCase) {}

  @Post("transcription-requests")
  @UseGuards(GatewayIdentityGuard)
  @HttpCode(HttpStatus.OK)
  execute(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<TranscriptionRequestResult> {
    const parsed = transcriptionRequestInputSchema.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.requestTranscription.execute(parsed.data, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot(), SaveDailyReadingModule],
  controllers: [RequestTranscriptionController],
  providers: [
    {
      provide: RequestTranscriptionUseCase,
      inject: [DailyReadingGate, TRANSCRIPTION_REQUESTS],
      useFactory: (gate: DailyReadingGate, requests: TranscriptionRequests) => new RequestTranscriptionUseCase(gate, requests),
    },
    {
      provide: CancelTranscriptionUseCase,
      inject: [DailyReadingGate, TRANSCRIPTION_REQUESTS, JobsService],
      useFactory: (gate: DailyReadingGate, requests: TranscriptionRequests, jobs: JobsService) =>
        new CancelTranscriptionUseCase(gate, requests, jobs),
    },
  ],
  exports: [CancelTranscriptionUseCase],
})
export class RequestTranscriptionModule {}
