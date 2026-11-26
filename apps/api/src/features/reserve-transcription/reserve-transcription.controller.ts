import { Controller, HttpCode, HttpStatus, Inject, Module, Post, Res, UseGuards } from "@nestjs/common";
import type { TranscriptionReservation } from "@repo/contracts";
import type { Response } from "express";
import { ApiCoreModule } from "../../api-core/api-core.module";
import { TRANSCRIPTION_WORKER_PROVIDER } from "../../api-core/transcription/transcription-worker.provider";
import { TranscriptionWorkerUseCase } from "../../api-core/transcription/transcription-worker.usecase";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { TranscriptionWorkerGuard } from "../../http/request-identity/transcription-worker.guard";
import { SaveDailyReadingModule } from "../save-daily-reading/save-daily-reading.controller";

/**
 * `POST /api/transcription-worker/next`: o serviço local de transcrição
 * (`apps/transcriber`) reserva o próximo pedido; 204 sem corpo quando a fila
 * está vazia. O gateway só abre esse prefixo para a chave de dispositivo, e a
 * guarda recusa quem não traz a permissão de transcrição.
 */
@Controller("api/transcription-worker")
export class ReserveTranscriptionController {
  constructor(@Inject(TranscriptionWorkerUseCase) private readonly worker: TranscriptionWorkerUseCase) {}

  @Post("next")
  @UseGuards(TranscriptionWorkerGuard)
  @HttpCode(HttpStatus.OK)
  async execute(
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TranscriptionReservation | undefined> {
    const reservation = await this.worker.reserve(actor);
    if (!reservation) response.status(HttpStatus.NO_CONTENT);
    return reservation;
  }
}

@Module({
  imports: [ApiCoreModule.forRoot(), SaveDailyReadingModule],
  controllers: [ReserveTranscriptionController],
  providers: [TRANSCRIPTION_WORKER_PROVIDER],
})
export class ReserveTranscriptionModule {}
