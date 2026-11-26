import { Body, Controller, HttpCode, HttpStatus, Inject, Module, Post, Res, UseGuards } from "@nestjs/common";
import type { TranscriptionDeliveryResult, TranscriptionLeaseResult, TranscriptionReservation } from "@repo/contracts";
import { transcriptionDeliveryInputSchema, transcriptionLeaseInputSchema } from "@repo/contracts/schemas";
import type { Response } from "express";
import { z } from "zod";
import { InvalidInputError } from "../../api-core/agent/errors/agent.errors";
import { ApiCoreModule } from "../../api-core/api-core.module";
import type { TranscriptionRequests } from "../../api-core/transcription/transcription-requests";
import type { EntityBatchWriter } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { CurrentUser } from "../../http/request-identity/current-user.decorator";
import { TranscriptionWorkerGuard } from "../../http/request-identity/transcription-worker.guard";
import { ENTITY_BATCH_WRITER, TRANSCRIPTION_REQUESTS } from "../../infrastructure/persistence";
import { DailyReadingGate } from "../save-daily-reading/daily-reading.gate";
import { SaveDailyReadingModule } from "../save-daily-reading/save-daily-reading.controller";
import { TranscriptionWorkerUseCase } from "./transcription-worker.usecase";

/**
 * O corpo da entrega: a transcrição de um vídeo de horas, com as falas
 * separadas, passa dos 100 kB padrão do Express e do 1 MB da Leitura diária. O
 * teto da entrega (`TRANSCRIPTION_DELIVERY_MAX_BYTES`) fica abaixo deste, para a
 * recusa por tamanho ser uma resposta do pedido. O gateway usa o mesmo valor
 * (`SECURITY_POLICY.maxDeliveryBodyBytes`).
 */
export const TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * As três operações do serviço local de transcrição (`apps/transcriber`),
 * sob `/api/transcription-worker`: o gateway só abre esse prefixo para a chave
 * de dispositivo, e a guarda recusa quem não traz a permissão de transcrição.
 */
@Controller("api/transcription-worker")
export class TranscriptionWorkerController {
  constructor(@Inject(TranscriptionWorkerUseCase) private readonly worker: TranscriptionWorkerUseCase) {}

  /** Reserva o próximo pedido; 204 sem corpo quando a fila está vazia. */
  @Post("next")
  @UseGuards(TranscriptionWorkerGuard)
  @HttpCode(HttpStatus.OK)
  async next(
    @CurrentUser() actor: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TranscriptionReservation | undefined> {
    const reservation = await this.worker.reserve(actor);
    if (!reservation) response.status(HttpStatus.NO_CONTENT);
    return reservation;
  }

  @Post("lease")
  @UseGuards(TranscriptionWorkerGuard)
  @HttpCode(HttpStatus.OK)
  lease(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<TranscriptionLeaseResult> {
    const parsed = transcriptionLeaseInputSchema.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.worker.renew(parsed.data, actor);
  }

  @Post("deliver")
  @UseGuards(TranscriptionWorkerGuard)
  @HttpCode(HttpStatus.OK)
  deliver(@Body() body: unknown, @CurrentUser() actor: AuthenticatedUser): Promise<TranscriptionDeliveryResult> {
    const parsed = transcriptionDeliveryInputSchema.safeParse(body);
    if (!parsed.success) throw new InvalidInputError(z.prettifyError(parsed.error));
    return this.worker.deliver(parsed.data, actor);
  }
}

@Module({
  imports: [ApiCoreModule.forRoot(), SaveDailyReadingModule],
  controllers: [TranscriptionWorkerController],
  providers: [
    {
      provide: TranscriptionWorkerUseCase,
      inject: [DailyReadingGate, ENTITY_BATCH_WRITER, TRANSCRIPTION_REQUESTS],
      useFactory: (gate: DailyReadingGate, writer: EntityBatchWriter, requests: TranscriptionRequests) =>
        new TranscriptionWorkerUseCase(gate, writer, requests),
    },
  ],
})
export class TranscriptionWorkerModule {}
