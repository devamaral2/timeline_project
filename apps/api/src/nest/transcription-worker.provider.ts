import type { Provider } from "@nestjs/common";
import type { EntityBatchWriter } from "../domain/ports";
import { ENTITY_BATCH_WRITER, TRANSCRIPTION_REQUESTS } from "../infrastructure/persistence/tokens";
import { DailyReadingGate } from "../api-core/tasks/daily-reading.gate";
import type { TranscriptionRequests } from "../api-core/transcription/transcription-requests";
import { TranscriptionWorkerUseCase } from "../api-core/transcription/transcription-worker.usecase";

/**
 * O caso de uso das três operações do serviço local (reservar, renovar o lease,
 * entregar): cada módulo de funcionalidade o traz por aqui, em vez de montá-lo
 * três vezes. Quem usa importa o módulo que exporta a porta da Leitura diária.
 */
export const TRANSCRIPTION_WORKER_PROVIDER: Provider = {
  provide: TranscriptionWorkerUseCase,
  inject: [DailyReadingGate, ENTITY_BATCH_WRITER, TRANSCRIPTION_REQUESTS],
  useFactory: (gate: DailyReadingGate, writer: EntityBatchWriter, requests: TranscriptionRequests) =>
    new TranscriptionWorkerUseCase(gate, writer, requests),
};
