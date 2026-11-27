import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, UseGuards } from "@nestjs/common";
import type { TranscriptionLeaseResult } from "@repo/contracts";
import { transcriptionLeaseInputSchema } from "@repo/contracts/schemas";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { TRANSCRIPTION_WORKER_PROVIDER } from "../../api-core/transcription/transcription-worker.provider";
import { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { TranscriptionWorkerGuard } from "../../http/request-identity/transcription-worker.guard";
import { SaveDailyReadingModule } from "../save-daily-reading/save-daily-reading.controller";

/**
 * `POST /api/transcription-worker/lease`: o serviço local renova o lease do
 * pedido e informa a etapa e a porcentagem; lease perdido é 409.
 */
@Controller("api/transcription-worker")
export class RenewTranscriptionLeaseController {
  constructor(@Inject(TranscriptionWorkerUseCase) private readonly worker: TranscriptionWorkerUseCase) {}

  @Post("lease")
  @UseGuards(TranscriptionWorkerGuard)
  @HttpCode(HttpStatus.OK)
  execute(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<TranscriptionLeaseResult> {
    const parsed = transcriptionLeaseInputSchema.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.worker.renew(parsed.data, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot(), SaveDailyReadingModule],
  controllers: [RenewTranscriptionLeaseController],
  providers: [TRANSCRIPTION_WORKER_PROVIDER],
})
export class RenewTranscriptionLeaseModule {}
