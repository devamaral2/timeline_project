import type { TranscriptionRequests } from "../../api-core/transcription/transcription-requests";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import type { JobsService } from "../../infrastructure/jobs/jobs.service";
import { composeReadingArticle } from "../save-daily-reading/daily-reading-article";
import type { DailyReadingGate } from "../save-daily-reading/daily-reading.gate";

/** O que o documento diz depois que a pessoa cancela o pedido. */
export const TRANSCRIPTION_CANCELLED_TEXT = "Transcrição cancelada";

/**
 * A pessoa cancela o pedido de transcrição (spec #39), esperando o serviço local ou a formatação. Numa gravação só:
 * o pedido vai a `cancel`, o job do serviço local e o de formatação são cancelados, o documento passa a dizer
 * "Transcrição cancelada" e a Leitura diária do dia do pedido volta para a fazer. O que o serviço local entregar
 * depois, com o lease que tinha, não vale mais.
 */
export class CancelTranscriptionUseCase {
  constructor(
    private readonly gate: Pick<DailyReadingGate, "place">,
    private readonly requests: TranscriptionRequests,
    private readonly jobs: Pick<JobsService, "cancelOfTasks">,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** `false` quando não há o que cancelar: o pedido já terminou ou não é desta pessoa. */
  async execute(requestId: string, actor: AuthenticatedUser): Promise<boolean> {
    const data = await this.requests.open(actor.userId, requestId);
    if (!data) return false;
    const article = composeReadingArticle({
      url: data.url,
      title: `Vídeo do YouTube (${data.videoId})`,
      markdown: TRANSCRIPTION_CANCELLED_TEXT,
      siteName: "YouTube",
    });
    if (!article) throw new Error("O endereço do pedido de transcrição deixou de ser um endereço");

    await this.gate.place({
      actor,
      article,
      day: data.day,
      companion: () => ({
        afterWrite: (tx) => this.requests.cancel(tx, { requestId, userId: actor.userId, at: this.clock() }),
      }),
    });
    // O job de formatação que o worker já está rodando para.
    await this.jobs.cancelOfTasks([requestId], actor.userId);
    return true;
  }
}
