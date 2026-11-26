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
 * Quantas vezes o pedido pode ser reservado. Depois da quinta reserva cujo lease venceu sem entrega, o pedido
 * falha com o código `failed` em vez de voltar à fila: um vídeo que derruba o serviço local não o derruba para sempre.
 */
export const TRANSCRIPTION_MAX_ATTEMPTS = 5;

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

/**
 * Onde o documento do pedido ficou ao ser gravado: se a leitura ou o documento do pedido sumiram, nasceram outros, e
 * o pedido passa a apontar para eles (`tasks.data`).
 */
export interface TranscriptionPlace {
  readingTaskId: string;
  artifactId: string;
}

/** O que entra em `tasks.data` de `where`: só os dois ids, mesmo que quem chama passe mais campos. */
export const placeData = (where: TranscriptionPlace): TranscriptionPlace => ({
  readingTaskId: where.readingTaskId,
  artifactId: where.artifactId,
});

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
   * venceu volta para a fila, desde que ainda caiba em `TRANSCRIPTION_MAX_ATTEMPTS`. Sem pedido esperando, nada.
   */
  reserve(userId: string): Promise<ReservedTranscription | undefined>;
  /**
   * Os pedidos da pessoa cuja reserva venceu pela última vez permitida (`TRANSCRIPTION_MAX_ATTEMPTS`), cada um com o
   * lease que o segurava: eles não voltam à fila, e quem chama os leva a `failed` por `reject`.
   */
  abandoned(userId: string): Promise<AbandonedTranscription[]>;
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
  /**
   * A falha entra: leva o pedido a `failed` com o código, grava onde o documento ficou e fecha o job do serviço local.
   * Mesma transação e mesma regra do lease.
   */
  reject(
    tx: unknown,
    input: { requestId: string; userId: string; leaseToken: string; code: TranscriptionFailureCode; at: Date; where: TranscriptionPlace },
  ): Promise<void>;

  /**
   * Os dados do pedido da pessoa que ainda não terminou: esperando o serviço local (`awaiting_transcription`) ou a
   * formatação (`running`). `undefined` em qualquer outro caso.
   */
  open(userId: string, requestId: string): Promise<TranscriptionRequestData | undefined>;
  /**
   * A pessoa cancela o pedido: leva-o a `cancel`, com `errorCode: "cancelled"`, grava onde o documento ficou e cancela o job do serviço local e o
   * de formatação, se houver. Roda na transação do escritor em lote; se o pedido já terminou, desfaz tudo.
   */
  cancel(tx: unknown, input: { requestId: string; userId: string; at: Date; where: TranscriptionPlace }): Promise<void>;

  /**
   * O pedido que espera a formatação (da pessoa, em `running`, com o resultado cru entregue), com o que a formatação
   * lê. `undefined` em qualquer outro caso: cancelado, já terminado, de outra pessoa ou sem resultado.
   */
  awaitingFormat(userId: string, requestId: string): Promise<FormattingInput | undefined>;
  /**
   * A formatação termina o pedido (`done` ou `failed`) e grava onde o documento ficou. Com `failureCode`, ele fica em `tasks.data`; com
   * `commentsSummaryFailed`, o pedido ganha uma entrada dizendo que o resumo dos comentários falhou. Roda na
   * transação do escritor em lote; se o pedido já não está em `running`, desfaz tudo.
   */
  finish(
    tx: unknown,
    input: {
      requestId: string;
      userId: string;
      status: "done" | "failed";
      at: Date;
      failureCode?: TranscriptionFailureCode;
      commentsSummaryFailed?: boolean;
      where: TranscriptionPlace;
    },
  ): Promise<void>;
}

/** O que a formatação lê do pedido: onde o documento está e o resultado cru que o serviço local entregou. */
export interface FormattingInput {
  data: TranscriptionRequestData;
  result: TranscriptionResult;
}

/** O pedido que esgotou as reservas: o lease que o segurava, para fechá-lo, e os dados para o documento dizer o motivo. */
export interface AbandonedTranscription {
  requestId: string;
  leaseToken: string;
  data: TranscriptionRequestData;
}

/** O pedido que o serviço local acabou de reservar. */
export interface ReservedTranscription {
  requestId: string;
  /** O endereço canônico do vídeo. */
  url: string;
  leaseToken: string;
  leaseExpiresAt: Date;
}

/** O pedido deixou de esperar a formatação (foi cancelado ou terminado) entre a leitura e a gravação. */
export class TranscriptionNotRunningError extends Error {
  constructor(message = "O pedido de transcrição não está mais em andamento") {
    super(message);
    this.name = "TranscriptionNotRunningError";
  }
}

/** O lease não é mais de quem o apresenta: venceu, foi trocado, o pedido mudou ou nunca foi dele. */
export class TranscriptionLeaseLostError extends Error {
  constructor(message = "O lease do pedido de transcrição não vale mais") {
    super(message);
    this.name = "TranscriptionLeaseLostError";
  }
}
