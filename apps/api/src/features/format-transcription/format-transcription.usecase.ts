import { Logger } from "../../common/logger";
import type { ModelSelection, TranscriptionResult } from "@repo/contracts";
import { z } from "zod";
import {
  jsonSchemaOf,
  type StructuredCompletionGateway,
} from "../../api-core/agent/gateways/structured-completion.gateway";
import type { FormattingInput, TranscriptionPlace, TranscriptionRequests } from "../../api-core/transcription/transcription-requests";
import type { AuthenticatedUser } from "../../http/request-identity/authenticated-user";
import { composeRequestArticle } from "../../api-core/transcription/video-article";
import type { DailyReadingGate } from "../../api-core/tasks/daily-reading.gate";
import { commentsPrompt, commentsReplySchema, COMMENTS_SYSTEM, formatPrompt, formatReplySchema, FORMAT_SYSTEM } from "./transcription-prompts";
import { bylineOf, composeTranscriptionDocument, paragraphs, type TranscriptionSummary } from "./transcription-document";

/** O Haiku 5.5 no esforço padrão dele (spec #39); nunca o modelo que o usuário escolheu no chat. */
export const FORMAT_MODEL: ModelSelection = { provider: "anthropic", model: "claude-haiku-5-5", effort: "medium" };
/** O orçamento de cada chamada: uma transcrição de horas leva dezenas de milhares de tokens de entrada. */
const CALL_TIMEOUT_MS = 5 * 60 * 1000;

/** A mensagem do documento quando a formatação não sai. O motivo é fechado: nunca o texto de um erro do provedor. */
const FORMAT_FAILED_TEXT = "Transcrição indisponível: a formatação do resultado falhou.";

/**
 * O job interno que fecha o pedido de transcrição (spec #39): o Haiku dá nome
 * aos falantes e escreve o resumo por tópicos (chamada 1) e o resumo dos
 * comentários (chamada 2, independente), e a API monta o documento com o texto
 * das falas exatamente como o serviço local entregou. O pedido termina `completed`
 * ou `failed` e a Leitura diária do dia do pedido volta para a fazer.
 *
 * Falha na chamada 1 ou resposta fora do schema: o pedido termina `failed`.
 * Falha na chamada 2: o documento sai sem a seção e o pedido ganha uma entrada.
 */
export class FormatTranscriptionUseCase {
  private readonly logger = new Logger(FormatTranscriptionUseCase.name);

  constructor(
    private readonly gate: Pick<DailyReadingGate, "place">,
    private readonly requests: TranscriptionRequests,
    private readonly haiku: StructuredCompletionGateway,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Formata o pedido que espera isso; qualquer outro (cancelado, pronto, de outra pessoa) não faz nada. */
  async run(requestId: string, userId: string): Promise<void> {
    const pending = await this.requests.awaitingFormat(userId, requestId);
    if (!pending) return;
    const { result } = pending;
    const segments = result.segments.filter((segment) => segment.text.trim());

    let format: TranscriptionSummary;
    try {
      format = await this.ask(formatReplySchema, "transcription_format", FORMAT_SYSTEM, formatPrompt(result, segments));
    } catch (error) {
      this.logger.warn(`A formatação do pedido ${requestId} falhou: ${errorName(error)}`);
      await this.finishFailed(requestId, userId, pending);
      return;
    }

    const comments = await this.summarizeComments(requestId, result);
    const markdown = composeTranscriptionDocument(pending.data.videoId, result, segments, format, comments.summary);
    await this.place(userId, pending, markdown, (tx, where) =>
      this.requests.finish(tx, {
        requestId, userId, status: "completed", at: this.clock(), where, ...(comments.failed ? { commentsSummaryFailed: true } : {}),
      }));
  }

  /** O job morreu (tentativas esgotadas): o pedido não fica em `running` para sempre. */
  async fail(requestId: string, userId: string): Promise<void> {
    const pending = await this.requests.awaitingFormat(userId, requestId);
    if (pending) await this.finishFailed(requestId, userId, pending);
  }

  private async finishFailed(requestId: string, userId: string, pending: FormattingInput): Promise<void> {
    await this.place(userId, pending, FORMAT_FAILED_TEXT, (tx, where) =>
      this.requests.finish(tx, { requestId, userId, status: "failed", at: this.clock(), failureCode: "failed", where }));
  }

  /** A chamada 2: sem comentários não há o que resumir; se falha, só a seção some. */
  private async summarizeComments(requestId: string, result: TranscriptionResult): Promise<{ summary?: string; failed: boolean }> {
    if (result.comments.length === 0) return { failed: false };
    try {
      const reply = await this.ask(commentsReplySchema, "comments_summary", COMMENTS_SYSTEM, commentsPrompt(result));
      const summary = paragraphs(reply.summary).join("\n\n");
      if (!summary) throw new Error("empty summary");
      return { summary, failed: false };
    } catch (error) {
      this.logger.warn(`O resumo dos comentários do pedido ${requestId} falhou: ${errorName(error)}`);
      return { failed: true };
    }
  }

  private async ask<T>(schema: z.ZodType<T>, schemaName: string, system: string, user: string): Promise<T> {
    const { value } = await this.haiku.complete({
      system, user, schemaName, schema: jsonSchemaOf(schema), timeoutMs: CALL_TIMEOUT_MS, model: FORMAT_MODEL, strictSchema: true,
    });
    return schema.parse(value);
  }

  /** O documento do pedido, com o nome real do vídeo, e a Leitura diária do dia do pedido de volta para a fazer. */
  private async place(
    userId: string,
    pending: FormattingInput,
    markdown: string,
    finish: (tx: unknown, where: TranscriptionPlace) => Promise<void>,
  ): Promise<void> {
    const { data, result } = pending;
    const article = composeRequestArticle(data, markdown, {
      title: result.video.title,
      byline: bylineOf(result.video.channel),
    });
    const actor: AuthenticatedUser = { userId };
    // O documento do pedido é o que se atualiza; se ele (ou a leitura) foi apagado, nasce outro e o pedido aponta para o novo.
    await this.gate.place({
      actor, article, day: data.day, artifactId: data.artifactId,
      companion: (where) => ({ afterWrite: (tx) => finish(tx, where) }),
    });
  }
}

const errorName = (error: unknown): string => (error instanceof Error ? error.name : "Error");
