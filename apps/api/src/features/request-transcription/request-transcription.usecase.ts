import type { TranscriptionRequestInput, TranscriptionRequestResult } from "@repo/contracts";
import { youtubeVideoLinkOf } from "@repo/contracts/youtube";
import type { TranscriptionRequestData, TranscriptionRequests } from "../../api-core/transcription/transcription-requests";
import { Task, TaskValidationError } from "../../domain";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { composeReadingArticle } from "../save-daily-reading/daily-reading-article";
import type { DailyReadingGate } from "../save-daily-reading/daily-reading.gate";

/** O que o documento diz até a transcrição chegar. */
export const TRANSCRIPTION_QUEUED_TEXT = "Transcrição na fila";

/**
 * Pede a transcrição de um vídeo do YouTube (spec #39). Numa gravação só nascem
 * a tarefa de agente `save_content_with_transcription` em `awaiting_transcription`,
 * o documento "Transcrição na fila" e a ligação com a Leitura diária do dia, que
 * nasce a fazer às 18h ou volta para a fazer (pela porta `DailyReadingGate`); o
 * job do serviço local entra na fila na mesma transação.
 *
 * O mesmo vídeo no mesmo dia, com o pedido ainda esperando ou rodando, devolve
 * esse pedido sem gravar nada. Com o pedido já `done` ou `failed`, nasce outro
 * que atualiza o mesmo documento, como uma página guardada de novo.
 */
export class RequestTranscriptionUseCase {
  constructor(
    private readonly gate: Pick<DailyReadingGate, "exclusive" | "now" | "today">,
    private readonly requests: TranscriptionRequests,
  ) {}

  async execute(input: TranscriptionRequestInput, actor: AuthenticatedUser): Promise<TranscriptionRequestResult> {
    const video = youtubeVideoLinkOf(input.url);
    if (!video) throw new TaskValidationError("O endereço não é de um vídeo do YouTube");
    const article = composeReadingArticle({
      url: video.canonical,
      title: `Vídeo do YouTube (${video.id})`,
      markdown: TRANSCRIPTION_QUEUED_TEXT,
      siteName: "YouTube",
    });
    if (!article) throw new TaskValidationError("O endereço não é de um vídeo do YouTube");
    const day = this.gate.today();

    // O olhar e a gravação ocupam a mesma vez da pessoa: dois cliques no mesmo vídeo dão um pedido só.
    return this.gate.exclusive(actor.userId, async (place) => {
      const open = await this.requests.findOpen(actor.userId, video.canonical, day);
      if (open) {
        return { requestId: open.requestId, taskId: open.readingTaskId, artifactId: open.artifactId, created: false };
      }

      let requestId = "";
      const placed = await place({
        actor,
        article,
        day,
        companion: (where) => {
          const data: TranscriptionRequestData = {
            url: video.canonical,
            day,
            videoId: video.id,
            readingTaskId: where.readingTaskId,
            artifactId: where.artifactId,
          };
          const request = Task.create({
            userId: actor.userId,
            actor: "agent",
            kind: "save_content_with_transcription",
            status: "awaiting_transcription",
            name: `Transcrição do vídeo ${video.id}`,
            startedAt: this.gate.now(),
            data: { ...data },
            artifactLinks: [{ artifactId: where.artifactId, relation: where.artifactCreated ? "creates" : "updates", fromRecurrence: false }],
          });
          requestId = request.id;
          return {
            tasks: [{ op: "create", entity: request }],
            afterWrite: (tx) =>
              this.requests.record(tx, {
                requestId: request.id,
                userId: actor.userId,
                readingTaskId: where.readingTaskId,
                relation: where.readingCreated ? "generates" : "updates",
              }),
          };
        },
      });
      return { requestId, taskId: placed.readingTaskId, artifactId: placed.artifactId, created: true };
    });
  }
}
