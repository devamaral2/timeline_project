import type { TranscriptionFailureCode, TranscriptionResult, TranscriptionStage } from "@repo/contracts";

/**
 * O job do pedido de transcrição (ADR 0013). O worker interno da API só pega
 * os tipos que tem handler, e este não tem: quem o reserva é o serviço local,
 * por HTTP, com lease.
 */
export const TRANSCRIPTION_JOB = "video-transcription";

/**
 * O job interno que formata o resultado entregue (spec #39, #46): o Haiku dá
 * nome aos falantes e escreve os resumos, e a API monta o documento. Ao contrário
 * do job acima, este o worker interno pega.
 */
export const TRANSCRIPTION_FORMAT_JOB = "video-transcription-format";

/** Quanto o serviço local segura o pedido sem renovar o lease. */
export const TRANSCRIPTION_LEASE_MS = 5 * 60 * 1000;

/**
 * O teto da entrega, medido no JSON do resultado. Acima dele o pedido falha com
 * `too_large`. O corpo da rota aceita mais que isto (`TRANSCRIPTION_DELIVERY_BODY_LIMIT_BYTES`)
 * para que a recusa seja uma resposta, e não um corte da conexão.
 */
export const TRANSCRIPTION_DELIVERY_MAX_BYTES = 2 * 1024 * 1024;

/** O que o pedido guarda em `tasks.data`: o suficiente para reconhecê-lo e para a entrega achar o documento. */
export interface TranscriptionRequestData {
  /** O endereço canônico do vídeo (`https://www.youtube.com/watch?v=ID`). */
  url: string;
  /** O dia do pedido (`AAAA-MM-DD` no fuso das tarefas): é a Leitura diária dele que a entrega devolve para a fazer. */
  day: string;
  videoId: string;
  readingTaskId: string;
  artifactId: string;
}

/** Um pedido que ainda espera o serviço local ou está sendo formatado. */
export interface OpenTranscriptionRequest {
  requestId: string;
  readingTaskId: string;
  artifactId: string;
}

/**
 * Persistência do pedido de transcrição que o lote de entidades não cobre: a
 * relação entre tarefas e o job. `record` roda na transação do escritor em lote
 * (`EntityBatch.afterWrite`), para que o pedido, o documento, a ligação com a
 * leitura e o job existam se e somente se existem juntos.
 */
export interface TranscriptionRequests {
  /** O pedido do mesmo vídeo, no mesmo dia, que ainda está em `awaiting_transcription` ou `running`. */
  findOpen(userId: string, url: string, day: string): Promise<OpenTranscriptionRequest | undefined>;
  /** A relação do pedido com a Leitura diária (`generates` quando ele a criou, `updates` quando a alterou) e o job. */
  record(
    tx: unknown,
    input: { requestId: string; userId: string; readingTaskId: string; relation: "generates" | "updates" },
  ): Promise<void>;

  /**
   * O pedido mais antigo da pessoa que espera o serviço local, com o lease novo. Antes, o job cujo lease
   * venceu volta para a fila. Sem pedido esperando, nada.
   */
  reserve(userId: string): Promise<ReservedTranscription | undefined>;
  /** Estende o lease do pedido e guarda o progresso. `undefined` quando o lease não vale mais (vencido, trocado ou cancelado). */
  renew(
    userId: string,
    input: { requestId: string; leaseToken: string; progress: { stage: TranscriptionStage; percent: number } },
  ): Promise<{ leaseExpiresAt: Date } | undefined>;
  /**
   * Os dados do pedido que `leaseToken` tem reservado: da pessoa, ainda em `awaiting_transcription` e sem que outro
   * serviço tenha ficado com o lease. `undefined` em qualquer outro caso.
   */
  holding(userId: string, requestId: string, leaseToken: string): Promise<TranscriptionRequestData | undefined>;
  /**
   * O resultado entra: grava-o cru numa entrada do pedido, leva o pedido a `running`, fecha o job do serviço local
   * e enfileira o job de formatação. Roda na transação do escritor em lote; sem o lease, desfaz tudo.
   */
  accept(tx: unknown, input: { requestId: string; userId: string; leaseToken: string; result: TranscriptionResult }): Promise<void>;
  /** A falha entra: leva o pedido a `failed` com o código e fecha o job do serviço local. Mesma transação e mesma regra do lease. */
  reject(tx: unknown, input: { requestId: string; userId: string; leaseToken: string; code: TranscriptionFailureCode; at: Date }): Promise<void>;
}

/** O pedido que o serviço local acabou de reservar. */
export interface ReservedTranscription {
  requestId: string;
  /** O endereço canônico do vídeo. */
  url: string;
  leaseToken: string;
  leaseExpiresAt: Date;
}

/** O lease não é mais de quem o apresenta: venceu, foi trocado, o pedido mudou ou nunca foi dele. */
export class TranscriptionLeaseLostError extends Error {
  constructor(message = "O lease do pedido de transcrição não vale mais") {
    super(message);
    this.name = "TranscriptionLeaseLostError";
  }
}
