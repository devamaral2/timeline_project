import type {
  TranscriptionDeliveryInput,
  TranscriptionDeliveryResult,
  TranscriptionFailureCode,
  TranscriptionLeaseInput,
  TranscriptionLeaseResult,
  TranscriptionReservation,
} from "@repo/contracts";
import {
  TRANSCRIPTION_DELIVERY_MAX_BYTES,
  TranscriptionLeaseLostError,
  type TranscriptionRequestData,
  type TranscriptionRequests,
} from "../../api-core/transcription/transcription-requests";
import type { EntityBatchWriter } from "../../domain/ports";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { composeReadingArticle } from "../save-daily-reading/daily-reading-article";
import type { DailyReadingGate } from "../save-daily-reading/daily-reading.gate";

/** O que o documento diz de cada falha, em palavras de quem lê. O motivo é o código fechado, nunca a mensagem do `yt-dlp`. */
const FAILURE_TEXT: Record<TranscriptionFailureCode, string> = {
  too_large: "o vídeo é grande demais para transcrever.",
  private: "o vídeo é privado.",
  unavailable: "o vídeo não está disponível.",
  no_audio: "o vídeo não tem áudio para transcrever.",
  failed: "a transcrição falhou.",
};

/**
 * O lado da API das três operações do serviço local (spec #39): reservar o
 * próximo pedido, renovar o lease com o progresso e entregar o resultado ou a
 * falha. Quem chama é a chave de dispositivo do dono do pedido (a guarda da
 * rota); aqui só vale o pedido dele.
 *
 * O pedido (`save_content_with_transcription`) é a fonte de verdade; o job do
 * serviço local é descartável e só prende o lease. Entregar o resultado o leva a
 * `running` e enfileira a formatação (#46); entregar a falha, ou um resultado
 * grande demais, o leva a `failed`, o documento diz o motivo e a Leitura diária
 * do dia do pedido volta para a fazer.
 */
export class TranscriptionWorkerUseCase {
  constructor(
    private readonly gate: Pick<DailyReadingGate, "place">,
    private readonly batchWriter: EntityBatchWriter,
    private readonly requests: TranscriptionRequests,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** O próximo pedido da pessoa que espera o serviço local, ou nada. */
  async reserve(actor: AuthenticatedUser): Promise<TranscriptionReservation | undefined> {
    // O pedido que já gastou as reservas falha antes de a fila procurar o próximo: ele não volta mais.
    for (const abandoned of await this.requests.abandoned(actor.userId)) {
      await this.fail(abandoned, abandoned.data, "failed", actor);
    }
    const reserved = await this.requests.reserve(actor.userId);
    if (!reserved) return undefined;
    return {
      requestId: reserved.requestId,
      url: reserved.url,
      leaseToken: reserved.leaseToken,
      leaseExpiresAt: reserved.leaseExpiresAt.toISOString(),
    };
  }

  async renew(input: TranscriptionLeaseInput, actor: AuthenticatedUser): Promise<TranscriptionLeaseResult> {
    const renewed = await this.requests.renew(actor.userId, {
      requestId: input.requestId,
      leaseToken: input.leaseToken,
      progress: { stage: input.stage, percent: input.percent },
    });
    if (!renewed) throw new TranscriptionLeaseLostError();
    return { leaseExpiresAt: renewed.leaseExpiresAt.toISOString() };
  }

  async deliver(input: TranscriptionDeliveryInput, actor: AuthenticatedUser): Promise<TranscriptionDeliveryResult> {
    const data = await this.requests.holding(actor.userId, input.requestId, input.leaseToken);
    if (!data) throw new TranscriptionLeaseLostError();

    if (input.outcome === "failed") return this.fail(input, data, input.code, actor);
    if (Buffer.byteLength(JSON.stringify(input.result)) > TRANSCRIPTION_DELIVERY_MAX_BYTES) {
      return this.fail(input, data, "too_large", actor);
    }

    // Só o pedido muda: o documento continua "na fila" até a formatação o montar.
    await this.batchWriter.commit({
      userId: actor.userId,
      tasks: [],
      artifacts: [],
      afterWrite: (tx) =>
        this.requests.accept(tx, {
          requestId: input.requestId,
          userId: actor.userId,
          leaseToken: input.leaseToken,
          result: input.result,
        }),
    });
    return { requestId: input.requestId, status: "running" };
  }

  /** O pedido falha, o documento diz por quê e a leitura do dia do pedido volta para a fazer, numa gravação só. */
  private async fail(
    input: { requestId: string; leaseToken: string },
    data: TranscriptionRequestData,
    code: TranscriptionFailureCode,
    actor: AuthenticatedUser,
  ): Promise<TranscriptionDeliveryResult> {
    const article = composeReadingArticle({
      url: data.url,
      title: `Vídeo do YouTube (${data.videoId})`,
      markdown: `Transcrição indisponível: ${FAILURE_TEXT[code]}`,
      siteName: "YouTube",
    });
    if (!article) throw new Error("O endereço do pedido de transcrição deixou de ser um endereço");

    await this.gate.place({
      actor,
      article,
      day: data.day,
      artifactId: data.artifactId,
      companion: (where) => ({
        afterWrite: (tx) =>
          this.requests.reject(tx, {
            requestId: input.requestId,
            userId: actor.userId,
            leaseToken: input.leaseToken,
            code,
            at: this.clock(),
            where,
          }),
      }),
    });
    return { requestId: input.requestId, status: "failed", code };
  }
}
