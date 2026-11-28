import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { TranscriptionDeliveryResult } from "@repo/contracts";
import { transcriptionDeliveryInputSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { ApiCoreModule } from "../../nest/api-core.module";
import { TRANSCRIPTION_WORKER_PROVIDER } from "../../nest/transcription-worker.provider";
import { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { TranscriptionWorkerGuard } from "../../http/request-identity/transcription-worker.guard";
import { SaveDailyReadingModule } from "../save-daily-reading/save-daily-reading.controller";

/**
 * `POST /api/transcription-worker/deliver`: o serviço local entrega o
 * resultado cru da transcrição ou a falha do pedido.
 */
@Controller("api/transcription-worker")
export class DeliverTranscriptionController {
  constructor(@Inject(TranscriptionWorkerUseCase) private readonly worker: TranscriptionWorkerUseCase) {}

  @Post("deliver")
  @UseGuards(TranscriptionWorkerGuard)
  @HttpCode(HttpStatus.OK)
  execute(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<TranscriptionDeliveryResult> {
    const parsed = transcriptionDeliveryInputSchema.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.worker.deliver(parsed.data, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot(), SaveDailyReadingModule],
  controllers: [DeliverTranscriptionController],
  providers: [TRANSCRIPTION_WORKER_PROVIDER],
})
export class DeliverTranscriptionModule {}
